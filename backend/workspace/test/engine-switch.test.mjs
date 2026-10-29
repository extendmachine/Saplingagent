import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../store.mjs';
import { createWorkspaceServer } from '../server.mjs';

const codex = { engine: 'codex', providerId: null, modelId: null };
const claude = { engine: 'claude', providerId: 'sapling-fixture', modelId: 'fixture-claude' };
const openCode = { engine: 'opencode', providerId: 'fixture', modelId: 'fixture-model' };
const stamp = '2026-10-23T12:00:00.000Z';
const historicalMessages = [
  { id: 'u-old', role: 'user', text: 'Keep this exact history. 中文', requestId: 'old-request', attachments: [{ id: '815b1296-8234-4566-af2b-2c4e7a5b9e8d', name: 'example.txt', size: 4, kind: 'file', contentType: 'text/plain' }] },
  { id: 'a-old', role: 'assistant', text: 'Synthetic answer', requestId: 'old-request', status: 'completed' },
];
const completed = (id, engineRevision) => ({ id, status: 'completed', startedAt: stamp, completedAt: stamp, ...(engineRevision === undefined ? {} : { engineRevision }) });
const switching = (session, selected) => ({ ...selected, expectedRevision: session.revision, expectedEngineRevision: session.engineRevision });
async function fixture(t) {
  const root = await fs.mkdtemp(fileURLToPath(new URL('../.test-engine-', import.meta.url)));
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await fs.rm(root, { recursive: true, force: true });
  });
  const store = await createStore(root);
  return { root, store, file(id) { return path.join(root, 'data/workspace/sessions', `${id}.json`); }, ownServer(value) { server = value; } };
}
async function conversation(store) {
  const session = await store.createSession({ title: 'One visible conversation' });
  return store.patchSession(session.id, { threadId: 'original-codex-thread', messages: historicalMessages, requests: [completed('old-request')], contextUsage: { usedTokens: 123, contextWindow: 1000, updatedAt: stamp } });
}

test('switches preserve a single conversation and historical content across native bindings', async t => {
  const f = await fixture(t), original = await conversation(f.store);
  const changed = await f.store.switchSessionEngine(original.id, switching(original, claude));
  assert.equal(changed.id, original.id);
  assert.equal(changed.title, original.title);
  assert.equal(changed.createdAt, original.createdAt);
  assert.deepEqual(changed.messages, original.messages);
  assert.deepEqual(changed.requests, original.requests);
  assert.equal(changed.threadId, null);
  assert.equal(changed.contextUsage, null);
  assert.equal(changed.engineRevision, 1);
  assert.deepEqual(changed.engineHistory[0], { ...codex, threadId: original.threadId, engineRevision: 0, closedAt: changed.updatedAt });
  assert.deepEqual(changed.handoff, { id: changed.handoff.id, status: 'pending', bindingRevision: 1, throughMessageId: 'a-old', createdAt: changed.updatedAt });
  const native = await f.store.patchSession(changed.id, { expectedEngineRevision: 1, threadId: 'claude-native-thread' });
  assert.equal(native.handoff.status, 'pending', 'a native identifier is not proof of delivery');
  const back = await f.store.switchSessionEngine(native.id, switching(native, codex));
  assert.equal(back.id, original.id);
  assert.equal(back.engineRevision, 2);
  assert.equal(back.threadId, null, 'returning to Codex never resumes its older native thread');
  assert.equal(back.engineHistory[1].threadId, 'claude-native-thread');
  assert.notEqual(back.handoff.id, changed.handoff.id);
  assert.deepEqual(back.messages, original.messages);
  const reloaded = await (await createStore(f.root)).getSession(back.id);
  assert.deepEqual(reloaded, back);
  const list = await f.store.listSessions();
  assert.equal(list.length, 1);
  assert.equal(list[0].engineRevision, 2);
});

test('same selection does not write, and empty history never gains a synthetic handoff message', async t => {
  const f = await fixture(t), session = await f.store.createSession();
  const before = await fs.readFile(f.file(session.id));
  assert.deepEqual(await f.store.switchSessionEngine(session.id, switching(session, codex)), session);
  assert.deepEqual(await fs.readFile(f.file(session.id)), before);
  const changed = await f.store.switchSessionEngine(session.id, switching(session, openCode));
  assert.equal(changed.handoff, null);
  assert.deepEqual(changed.messages, []);
  assert.equal(changed.engineHistory.length, 1);
});

test('legacy reads normalize defaults without rewriting, then an explicit switch persists them', async t => {
  const f = await fixture(t), session = await conversation(f.store);
  const legacy = { ...session };
  for (const key of ['engine', 'providerId', 'modelId', 'engineRevision', 'engineHistory', 'handoff']) delete legacy[key];
  await fs.writeFile(f.file(session.id), JSON.stringify(legacy));
  const before = await fs.readFile(f.file(session.id));
  const restored = await (await createStore(f.root)).getSession(session.id);
  assert.deepEqual({ engine: restored.engine, providerId: restored.providerId, modelId: restored.modelId }, codex);
  assert.equal(restored.engineRevision, 0);
  assert.deepEqual(restored.engineHistory, []);
  assert.equal(restored.handoff, null);
  assert.equal((await f.store.listSessions())[0].engineRevision, 0);
  assert.deepEqual(await fs.readFile(f.file(session.id)), before);
  const changed = await f.store.switchSessionEngine(session.id, switching(restored, claude));
  assert.equal(changed.engineHistory[0].threadId, session.threadId);
  assert.deepEqual(changed.messages, session.messages);
  assert.equal(JSON.parse(await fs.readFile(f.file(session.id))).engineRevision, 1);
});

test('concurrent switches have one winner and obsolete run snapshots cannot replace it', async t => {
  const f = await fixture(t), original = await conversation(f.store);
  const results = await Promise.allSettled([
    f.store.switchSessionEngine(original.id, switching(original, claude)),
    f.store.switchSessionEngine(original.id, switching(original, openCode)),
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'CONFLICT');
  const changed = await f.store.getSession(original.id), before = await fs.readFile(f.file(original.id));
  await assert.rejects(f.store.patchSession(original.id, { expectedEngineRevision: 0, messages: [], threadId: 'obsolete-thread', contextUsage: null }), { code: 'CONFLICT' });
  await assert.rejects(f.store.switchSessionEngine(original.id, { ...switching(changed, openCode), expectedRevision: original.revision }), { code: 'CONFLICT' });
  await assert.rejects(f.store.switchSessionEngine(original.id, { ...switching(changed, openCode), expectedEngineRevision: 0 }), { code: 'CONFLICT' });
  assert.deepEqual(await fs.readFile(f.file(original.id)), before);
  const [renamed, switched] = await Promise.allSettled([
    f.store.patchSession(original.id, { title: 'Concurrent rename' }),
    f.store.switchSessionEngine(original.id, switching(changed, openCode)),
  ]);
  assert.equal(renamed.status, 'fulfilled');
  assert.equal(switched.reason.code, 'CONFLICT');
  assert.equal((await f.store.getSession(original.id)).title, 'Concurrent rename');
});

test('running, reserved, and unfinished-ledger sessions reject switching without partial writes', async t => {
  const f = await fixture(t);
  for (const busy of [{ running: true }, { activeRequestId: 'active' }, { requests: [{ id: 'active', status: 'inProgress', startedAt: stamp }] }]) {
    const created = await f.store.createSession();
    const session = await f.store.patchSession(created.id, busy);
    const before = await fs.readFile(f.file(session.id));
    await assert.rejects(f.store.switchSessionEngine(session.id, switching(session, claude)), { code: 'SESSION_BUSY' });
    await assert.rejects(f.store.switchSessionEngine(session.id, switching(session, codex)), { code: 'SESSION_BUSY' });
    assert.deepEqual(await fs.readFile(f.file(session.id)), before);
  }
});

test('invalid selections and missing revision guards leave stored data and revision intact', async t => {
  const f = await fixture(t), session = await conversation(f.store), before = await fs.readFile(f.file(session.id));
  const valid = switching(session, claude);
  const inputs = [null, [], {}, ...['engine', 'providerId', 'modelId', 'expectedRevision', 'expectedEngineRevision'].map(key => { const input = { ...valid }; delete input[key]; return input; }),
    { ...valid, engine: 'unknown' }, { ...valid, modelId: '' }, { ...valid, providerId: null },
    { ...valid, ...codex, providerId: 'override' },
    ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', null].map(expectedEngineRevision => ({ ...valid, expectedEngineRevision })),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2', null].map(expectedRevision => ({ ...valid, expectedRevision })),
  ];
  for (const input of inputs) {
    await assert.rejects(f.store.switchSessionEngine(session.id, input), { code: 'INVALID_INPUT' });
    assert.deepEqual(await fs.readFile(f.file(session.id)), before);
  }
  for (const patch of [{ engine: 'claude' }, { providerId: 'new' }, { modelId: 'new' }, { engineRevision: 5 }, { engineHistory: [] }, { handoff: null }]) {
    await assert.rejects(f.store.patchSession(session.id, { ...patch, title: 'Should not persist' }), { code: 'INVALID_INPUT' });
    assert.deepEqual(await fs.readFile(f.file(session.id)), before);
  }
});

test('handoff delivery requires a completed request from its current binding and persists atomically', async t => {
  const f = await fixture(t), original = await conversation(f.store);
  const session = await f.store.switchSessionEngine(original.id, switching(original, claude));
  const before = await fs.readFile(f.file(session.id));
  const invalid = [
    { handoffDeliveredRequestId: 'old-request' },
    { expectedEngineRevision: 1, handoffDeliveredRequestId: 'old-request' },
    { expectedEngineRevision: 1, handoffDeliveredRequestId: 'missing' },
    ...['inProgress', 'failed', 'interrupted'].map(status => ({ expectedEngineRevision: 1, handoffDeliveredRequestId: 'new-request', requests: [{ ...completed('new-request', 1), status }] })),
    { expectedEngineRevision: 1, handoffDeliveredRequestId: 'new-request', requests: [completed('new-request', 0)] },
    { expectedEngineRevision: 1, handoffDeliveredRequestId: 'new-request', requests: [completed('new-request')] },
  ];
  for (const input of invalid) {
    await assert.rejects(f.store.patchSession(session.id, { ...input, title: 'Should not persist' }), { code: 'INVALID_INPUT' });
    assert.deepEqual(await fs.readFile(f.file(session.id)), before);
  }
  const failed = await f.store.patchSession(session.id, { expectedEngineRevision: 1, requests: [...session.requests, { ...completed('new-request', 1), status: 'failed' }] });
  assert.equal(failed.handoff.status, 'pending');
  assert.equal((await (await createStore(f.root)).getSession(session.id)).handoff.status, 'pending');
  const delivered = await f.store.patchSession(session.id, { expectedEngineRevision: 1, running: false, activeRequestId: null, threadId: 'new-thread', requests: [...session.requests, completed('new-request', 1)], handoffDeliveredRequestId: 'new-request' });
  assert.deepEqual(delivered.handoff, { ...session.handoff, status: 'delivered', deliveredRequestId: 'new-request' });
  assert.equal(delivered.requests.at(-1).engineRevision, 1);
  assert.deepEqual((await (await createStore(f.root)).getSession(session.id)).handoff, delivered.handoff);
  const retried = await f.store.patchSession(session.id, { expectedEngineRevision: 1, handoffDeliveredRequestId: 'new-request' });
  assert.deepEqual(retried.handoff, delivered.handoff);
  const after = await fs.readFile(f.file(session.id));
  await assert.rejects(f.store.patchSession(session.id, { expectedEngineRevision: 1, requests: [...retried.requests, completed('another-request', 1)], handoffDeliveredRequestId: 'another-request' }), { code: 'INVALID_INPUT' });
  assert.deepEqual(await fs.readFile(f.file(session.id)), after);
  const next = await f.store.switchSessionEngine(session.id, switching(retried, openCode));
  await assert.rejects(f.store.patchSession(session.id, { expectedEngineRevision: 2, handoffDeliveredRequestId: 'new-request' }), { code: 'INVALID_INPUT' });
  assert.equal(next.handoff.status, 'pending');
});

test('malformed stored switching metadata is preserved instead of reset or migrated', async t => {
  const f = await fixture(t), original = await conversation(f.store);
  const changed = await f.store.switchSessionEngine(original.id, switching(original, claude));
  for (const corruption of [{ engineRevision: -1 }, { engineHistory: {} }, { engineHistory: [{ ...changed.engineHistory[0], engineRevision: 1 }] }, { handoff: { ...changed.handoff, bindingRevision: 2 } }, { handoff: { ...changed.handoff, status: 'delivered' } }, { handoff: { ...changed.handoff, createdAt: 'not a timestamp' } }]) {
    await fs.writeFile(f.file(changed.id), JSON.stringify({ ...changed, ...corruption }));
    const before = await fs.readFile(f.file(changed.id));
    await assert.rejects(f.store.getSession(changed.id), { code: 'CORRUPT_STORAGE' });
    await assert.rejects(f.store.patchSession(changed.id, { title: 'Overwrite' }), { code: 'CORRUPT_STORAGE' });
    await assert.rejects(f.store.switchSessionEngine(changed.id, switching(changed, codex)), { code: 'CORRUPT_STORAGE' });
    assert.deepEqual(await fs.readFile(f.file(changed.id)), before);
  }
});

test('history capacity refuses new switches without silently dropping native identifiers', async t => {
  const f = await fixture(t), created = await f.store.createSession();
  const session = { ...created, engineRevision: 1000, engineHistory: Array.from({ length: 1000 }, (_, engineRevision) => ({ ...codex, threadId: `old-thread-${engineRevision}`, engineRevision, closedAt: stamp })) };
  await fs.writeFile(f.file(session.id), JSON.stringify(session));
  const before = await fs.readFile(f.file(session.id));
  await assert.rejects(f.store.switchSessionEngine(session.id, switching(session, claude)), { code: 'ENGINE_HISTORY_FULL' });
  assert.equal((await f.store.switchSessionEngine(session.id, switching(session, codex))).engineHistory.length, 1000);
  assert.deepEqual(await fs.readFile(f.file(session.id)), before);
});

test('HTTP engine switching retains internal authentication, safe errors and restart drain', async t => {
  const f = await fixture(t), token = 'synthetic-engine-switch-token-not-a-real-secret';
  const server = await createWorkspaceServer({ root: f.root, token }); f.ownServer(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, value, auth = true) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(value) });
  const created = (await (await post('/sessions', {})).json()).session;
  const route = `/sessions/${created.id}/engine`;
  assert.equal((await post(route, switching(created, claude), false)).status, 401);
  assert.equal((await post(route, {})).status, 400);
  const changed = await post(route, switching(created, claude));
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).session.engineRevision, 1);
  const stale = await post(route, switching(created, openCode));
  assert.equal(stale.status, 409);
  const failure = await stale.json();
  assert.equal(failure.error.code, 'CONFLICT');
  assert.ok(!JSON.stringify(failure).includes(f.root));
  assert.ok(!JSON.stringify(failure).includes(token));
  assert.equal((await post('/internal/runtime/prepare', {})).status, 200);
  assert.equal((await post(route, {})).status, 503);
  assert.equal((await post('/internal/runtime/release', {})).status, 200);
  const current = (await (await fetch(`${base}/sessions/${created.id}`, { headers: { Authorization: `Bearer ${token}` } })).json()).session;
  assert.equal((await post(route, switching(current, openCode))).status, 200);
  const logFiles = await fs.readdir(path.join(f.root, 'logs/workspace'));
  for (const file of logFiles) assert.ok(!(await fs.readFile(path.join(f.root, 'logs/workspace', file), 'utf8')).includes(token));
});

test('a denied atomic write leaves the old binding intact and a later retry succeeds', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async t => {
  const f = await fixture(t), original = await conversation(f.store);
  const directory = path.dirname(f.file(original.id)), before = await fs.readFile(f.file(original.id));
  await fs.chmod(directory, 0o500);
  try {
    await assert.rejects(f.store.switchSessionEngine(original.id, switching(original, claude)), error => ['EACCES', 'EPERM'].includes(error.code));
    assert.deepEqual(await fs.readFile(f.file(original.id)), before);
  } finally { await fs.chmod(directory, 0o700); }
  const changed = await f.store.switchSessionEngine(original.id, switching(original, claude));
  const selectedBytes = await fs.readFile(f.file(changed.id));
  const delivery = { expectedEngineRevision: 1, requests: [completed('delivery-request', 1)], handoffDeliveredRequestId: 'delivery-request' };
  await fs.chmod(directory, 0o500);
  try {
    await assert.rejects(f.store.patchSession(changed.id, delivery), error => ['EACCES', 'EPERM'].includes(error.code));
    assert.deepEqual(await fs.readFile(f.file(changed.id)), selectedBytes);
    assert.equal((await f.store.getSession(changed.id)).handoff.status, 'pending');
  } finally { await fs.chmod(directory, 0o700); }
  assert.equal((await f.store.patchSession(changed.id, delivery)).handoff.status, 'delivered');
  assert.deepEqual((await fs.readdir(directory)).filter(name => name.endsWith('.tmp')), []);
});

test('request IDs cannot be reassigned to another binding to acknowledge old history', async t => {
  const f = await fixture(t), original = await conversation(f.store);
  const changed = await f.store.switchSessionEngine(original.id, switching(original, claude));
  const before = await fs.readFile(f.file(changed.id));
  for (const input of [
    { requests: [completed('old-request', 1)], handoffDeliveredRequestId: 'old-request' },
    { requests: [completed('future-request', 2)] },
    { requests: [completed('invalid-request', -1)] },
    { requests: [completed('invalid-request', 0.5)] },
  ]) {
    await assert.rejects(f.store.patchSession(changed.id, { expectedEngineRevision: 1, ...input }), { code: 'INVALID_INPUT' });
    assert.deepEqual(await fs.readFile(f.file(changed.id)), before);
  }
  const failed = await f.store.patchSession(changed.id, { expectedEngineRevision: 1, requests: [...changed.requests, { ...completed('retry-request', 1), status: 'failed' }] });
  const retry = await f.store.patchSession(changed.id, { expectedEngineRevision: 1, requests: [...failed.requests.filter(value => value.id !== 'retry-request'), completed('retry-request', 1)], handoffDeliveredRequestId: 'retry-request' });
  assert.equal(retry.handoff.status, 'delivered', 'same-binding failed requests can still complete');
  assert.equal(retry.requests.at(-1).id, 'retry-request');
});

test('a lost successful delivery response can be retried without changing its owner or model result', async t => {
  const f = await fixture(t), original = await conversation(f.store);
  const changed = await f.store.switchSessionEngine(original.id, switching(original, claude));
  const snapshot = {
    expectedEngineRevision: changed.engineRevision,
    running: false, activeRequestId: null, threadId: 'delivery-native',
    messages: [...changed.messages, { id: 'delivery-user', role: 'user', text: 'Continue', requestId: 'delivery-request' }, { id: 'delivery-answer', role: 'assistant', text: 'A synthetic completed result', status: 'completed', requestId: 'delivery-request' }],
    requests: [...changed.requests, completed('delivery-request', changed.engineRevision)],
    handoffDeliveredRequestId: 'delivery-request',
  };
  await f.store.patchSession(changed.id, snapshot); // Simulate a persisted response the caller did not receive.
  const persisted = await (await createStore(f.root)).getSession(changed.id);
  const replayed = await f.store.patchSession(changed.id, snapshot);
  assert.equal(replayed.revision, persisted.revision + 1);
  assert.deepEqual(replayed.handoff, persisted.handoff);
  assert.deepEqual(replayed.messages, persisted.messages);
  assert.deepEqual(replayed.requests, persisted.requests);
  assert.equal(replayed.handoff.status, 'delivered');
  assert.equal(replayed.requests.at(-1).status, 'completed');
});
