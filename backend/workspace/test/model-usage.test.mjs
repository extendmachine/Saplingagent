import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../store.mjs';
import { createWorkspaceServer } from '../server.mjs';

const stamp = '2026-10-29T12:00:00.000Z';
const modelUsage = { requestedModel: 'fixture-model', actualModel: 'fixture-resolved', requestId: 'request-1', updatedAt: stamp, source: 'thread/start' };
const contextUsage = { usedTokens: 12, contextWindow: 100, updatedAt: stamp };
const codex = modelId => ({ engine: 'codex', providerId: null, modelId });
const claude = { engine: 'claude', providerId: 'fixture-provider', modelId: 'fixture-claude' };
const selection = (session, selected) => ({ ...selected, expectedRevision: session.revision, expectedEngineRevision: session.engineRevision });
const completed = (id, engineRevision) => ({ id, engineRevision, status: 'completed', startedAt: stamp, completedAt: stamp });
async function fixture(t) {
  const root = await fs.mkdtemp(fileURLToPath(new URL('../.test-model-', import.meta.url)));
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, store: await createStore(root), file(id) { return path.join(root, 'data/workspace/sessions', `${id}.json`); }, ownServer(value) { server = value; } };
}
async function conversation(store, selected = codex(null)) {
  const session = await store.createSession({ title: 'One conversation', ...selected });
  return store.patchSession(session.id, {
    threadId: 'retained-native-thread', contextUsage, modelUsage,
    messages: [{ id: 'user-1', role: 'user', text: 'Preserve history', attachments: [{ id: '815b1296-8234-4566-af2b-2c4e7a5b9e8d', name: 'fixture.txt', size: 4, kind: 'file', contentType: 'text/plain' }] }],
    requests: [completed('request-1', 0)],
  });
}

test('Codex accepts a selected model while keeping provider null and ordinary PATCH immutable', async t => {
  const f = await fixture(t);
  const session = await f.store.createSession(codex('fixture-model'));
  assert.equal((await f.store.listSessions())[0].modelId, 'fixture-model');
  assert.deepEqual(await (await createStore(f.root)).getSession(session.id), session);
  assert.equal((await f.store.createSession()).modelId, null);
  for (const input of [codex(''), codex('x'.repeat(241)), { ...codex('fixture-model'), providerId: 'not-allowed' }]) {
    await assert.rejects(f.store.createSession(input), { code: 'INVALID_INPUT' });
  }
  await assert.rejects(f.store.patchSession(session.id, { modelId: 'other' }), { code: 'INVALID_INPUT' });
  await assert.rejects(f.store.switchSessionEngine(session.id, selection(session, { ...codex('other'), providerId: 'not-allowed' })), { code: 'INVALID_INPUT' });
});

test('Codex model-only changes keep the native thread and content, clear stale measurements, and remain no-op on repeat', async t => {
  const f = await fixture(t), original = await conversation(f.store);
  const changed = await f.store.switchSessionEngine(original.id, selection(original, codex('fixture-next')));
  for (const field of ['id', 'title', 'threadId', 'createdAt', 'messages', 'requests', 'engineHistory', 'handoff']) assert.deepEqual(changed[field], original[field], field);
  assert.equal(changed.revision, original.revision + 1);
  assert.equal(changed.engineRevision, original.engineRevision + 1);
  assert.equal(changed.contextUsage, null);
  assert.equal(changed.modelUsage, null);
  assert.deepEqual(await (await createStore(f.root)).getSession(changed.id), changed);
  const before = await fs.readFile(f.file(changed.id));
  assert.deepEqual(await f.store.switchSessionEngine(changed.id, selection(changed, codex('fixture-next'))), changed);
  assert.deepEqual(await fs.readFile(f.file(changed.id)), before);
  const back = await f.store.switchSessionEngine(changed.id, selection(changed, codex(null)));
  assert.equal(back.threadId, original.threadId);
  assert.equal(back.engineHistory.length, 0);
  assert.equal(back.handoff, null);
  const crossed = await f.store.switchSessionEngine(back.id, selection(back, claude));
  assert.equal(crossed.threadId, null);
  assert.equal(crossed.engineHistory.length, 1);
  assert.equal(crossed.engineHistory[0].threadId, original.threadId);
  assert.equal(crossed.modelUsage, null);
  assert.equal(crossed.handoff.status, 'pending');
});

test('model changes retain pending and delivered cross-engine handoffs without sending the same history twice', async t => {
  const f = await fixture(t), original = await conversation(f.store, claude);
  let session = await f.store.switchSessionEngine(original.id, selection(original, codex(null)));
  const handoff = session.handoff;
  session = await f.store.patchSession(session.id, { expectedEngineRevision: 1, threadId: 'codex-native', requests: [...session.requests, { ...completed('failed-first', 1), status: 'failed' }] });
  session = await f.store.switchSessionEngine(session.id, selection(session, codex('fixture-next')));
  assert.deepEqual(session.handoff, { ...handoff, bindingRevision: 2 });
  assert.equal(session.threadId, 'codex-native');
  assert.equal(session.engineHistory.length, 1);
  await assert.rejects(f.store.patchSession(session.id, { expectedEngineRevision: 2, requests: [...session.requests.filter(item => item.id !== 'failed-first'), completed('failed-first', 1)], handoffDeliveredRequestId: 'failed-first' }), { code: 'INVALID_INPUT' });
  const delivered = await f.store.patchSession(session.id, { expectedEngineRevision: 2, requests: [...session.requests, completed('new-delivery', 2)], handoffDeliveredRequestId: 'new-delivery' });
  const changed = await f.store.switchSessionEngine(session.id, selection(delivered, codex('fixture-third')));
  assert.deepEqual(changed.handoff, { ...delivered.handoff, bindingRevision: 3 });
  assert.equal(changed.handoff.status, 'delivered');
  assert.deepEqual((await (await createStore(f.root)).getSession(changed.id)).handoff, changed.handoff);
  assert.deepEqual(changed.requests, delivered.requests);
});

test('concurrent model changes and stale usage snapshots cannot overwrite a winning binding', async t => {
  const f = await fixture(t), original = await conversation(f.store);
  const results = await Promise.allSettled(['fixture-next', 'fixture-other'].map(model => f.store.switchSessionEngine(original.id, selection(original, codex(model)))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CONFLICT');
  const before = await fs.readFile(f.file(original.id));
  await assert.rejects(f.store.patchSession(original.id, { expectedEngineRevision: 0, modelUsage, contextUsage }), { code: 'CONFLICT' });
  assert.deepEqual(await fs.readFile(f.file(original.id)), before);
  for (const busy of [{ running: true }, { activeRequestId: 'busy' }, { requests: [{ id: 'busy', status: 'inProgress', startedAt: stamp }] }]) {
    const session = await f.store.patchSession((await f.store.createSession()).id, busy);
    await assert.rejects(f.store.switchSessionEngine(session.id, selection(session, codex('next'))), { code: 'SESSION_BUSY' });
  }
});

test('model-only changes do not exhaust or rewrite the archived binding history', async t => {
  const f = await fixture(t), created = await f.store.createSession();
  const original = { ...created, threadId: 'current-native', engineRevision: 1000, engineHistory: Array.from({ length: 1000 }, (_, engineRevision) => ({ ...codex(`model-${engineRevision}`), threadId: `thread-${engineRevision}`, engineRevision, closedAt: stamp })) };
  await fs.writeFile(f.file(original.id), JSON.stringify(original));
  const changed = await f.store.switchSessionEngine(original.id, selection(original, codex('next')));
  assert.equal(changed.engineRevision, 1001);
  assert.deepEqual(changed.engineHistory, original.engineHistory);
  assert.equal(changed.threadId, original.threadId);
  await assert.rejects(f.store.switchSessionEngine(changed.id, selection(changed, claude)), { code: 'ENGINE_HISTORY_FULL' });
});

test('actual model evidence persists through reload and partial writes; unknown, cleared and legacy states remain distinct', async t => {
  const f = await fixture(t), original = await f.store.createSession();
  const before = await fs.readFile(f.file(original.id));
  assert.equal(Object.hasOwn(await f.store.getSession(original.id), 'modelUsage'), false);
  assert.deepEqual(await fs.readFile(f.file(original.id)), before);
  for (const source of ['thread/start', 'thread/resume', 'model/rerouted']) {
    const usage = { ...modelUsage, source };
    await f.store.patchSession(original.id, { modelUsage: usage });
    assert.deepEqual((await (await createStore(f.root)).getSession(original.id)).modelUsage, usage);
  }
  await Promise.all([f.store.patchSession(original.id, { title: 'Keep title' }), f.store.patchSession(original.id, { modelUsage })]);
  let saved = await f.store.getSession(original.id);
  assert.equal(saved.title, 'Keep title');
  assert.deepEqual(saved.modelUsage, modelUsage);
  assert.equal(Object.hasOwn((await f.store.listSessions())[0], 'modelUsage'), false);
  const unknown = { ...modelUsage, actualModel: null, source: 'unreported' };
  saved = await f.store.patchSession(original.id, { modelUsage: unknown });
  assert.deepEqual(saved.modelUsage, unknown, 'does not infer actual model from requestedModel');
  assert.equal((await f.store.patchSession(original.id, { modelUsage: null })).modelUsage, null);
  assert.equal((await (await createStore(f.root)).getSession(original.id)).modelUsage, null);
});

test('malformed model metadata rejects partial writes and corrupt stored evidence is preserved for recovery', async t => {
  const f = await fixture(t), original = await conversation(f.store), before = await fs.readFile(f.file(original.id));
  const invalid = [[], false, '', {}, { ...modelUsage, unexpected: true },
    ...Object.keys(modelUsage).map(key => { const value = { ...modelUsage }; delete value[key]; return value; }),
    ...['', ' ', 'x'.repeat(241), 'bad\nmodel'].map(requestedModel => ({ ...modelUsage, requestedModel })),
    ...['', 'x'.repeat(241), false, 'bad\u0000model'].map(actualModel => ({ ...modelUsage, actualModel })),
    ...['', 'x'.repeat(161), 4, 'bad\nrequest'].map(requestId => ({ ...modelUsage, requestId })),
    ...['not a date', '2026-02-30T12:00:00.000Z', '2026-10-29', null].map(updatedAt => ({ ...modelUsage, updatedAt })),
    ...['unknown', '', 5, 'unreported'].map(source => ({ ...modelUsage, source })),
  ];
  for (const usage of invalid) {
    await assert.rejects(f.store.patchSession(original.id, { title: 'Do not persist', modelUsage: usage }), { code: 'INVALID_INPUT' });
    assert.deepEqual(await fs.readFile(f.file(original.id)), before);
  }
  await fs.writeFile(f.file(original.id), JSON.stringify({ ...original, modelUsage: { ...modelUsage, source: 'unknown' } }));
  const corrupted = await fs.readFile(f.file(original.id));
  await assert.rejects(f.store.getSession(original.id), { code: 'CORRUPT_STORAGE' });
  await assert.rejects(f.store.patchSession(original.id, { modelUsage: null }), { code: 'CORRUPT_STORAGE' });
  assert.deepEqual(await fs.readFile(f.file(original.id)), corrupted);
});

test('HTTP model selection and usage preserve authentication, reload evidence and safe validation errors', async t => {
  const f = await fixture(t), token = 'synthetic-model-usage-service-token';
  const server = await createWorkspaceServer({ root: f.root, token }); f.ownServer(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, method = 'GET', body, auth = true) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await request('/sessions', 'POST', codex('fixture-model'));
  assert.equal(response.status, 201);
  let session = (await response.json()).session, route = `/sessions/${session.id}`;
  assert.equal((await request(route, 'PATCH', { modelUsage }, false)).status, 401);
  session = (await (await request(route, 'PATCH', { modelUsage, threadId: 'http-native' })).json()).session;
  assert.deepEqual((await (await request(route)).json()).session.modelUsage, modelUsage);
  const invalid = await request(route, 'PATCH', { modelUsage: { ...modelUsage, source: 'invalid-secret-value' } });
  assert.equal(invalid.status, 400);
  const error = await invalid.text();
  assert.ok(!error.includes('invalid-secret-value') && !error.includes(f.root) && !error.includes(token));
  session = (await (await request(`${route}/engine`, 'POST', selection(session, codex('next-model')))).json()).session;
  assert.equal(session.threadId, 'http-native');
  assert.equal(session.modelUsage, null);
  const stale = await request(route, 'PATCH', { expectedEngineRevision: 0, modelUsage });
  assert.equal(stale.status, 409);
  assert.equal((await (await request(route)).json()).session.modelUsage, null);
});
