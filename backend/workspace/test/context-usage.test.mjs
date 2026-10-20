import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createStore } from '../store.mjs';
import { createWorkspaceServer } from '../server.mjs';

const stamp = '2026-10-19T12:00:00.000Z';
const sample = { usedTokens: 42575, contextWindow: 258400, updatedAt: stamp };
async function fixture(t) {
  const root = await fs.mkdtemp(fileURLToPath(new URL('../.test-context-', import.meta.url)));
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, ownServer(value) { server = value; } };
}

test('context measurement survives reload, while omitted, null and legacy values remain distinct', async t => {
  const { root } = await fixture(t), store = await createStore(root);
  const session = await store.createSession({ title: 'Legacy conversation' });
  const file = `${root}/data/workspace/sessions/${session.id}.json`;
  const original = await fs.readFile(file);
  assert.equal(Object.hasOwn(await store.getSession(session.id), 'contextUsage'), false);
  assert.deepEqual(await fs.readFile(file), original, 'reading does not migrate a legacy record');
  await store.patchSession(session.id, { contextUsage: { ...sample, billingTotal: 999999 } });
  assert.deepEqual((await (await createStore(root)).getSession(session.id)).contextUsage, sample);
  await store.patchSession(session.id, { title: 'Renamed conversation' });
  assert.deepEqual((await store.getSession(session.id)).contextUsage, sample);
  await store.patchSession(session.id, { contextUsage: { ...sample, usedTokens: 0 } });
  assert.equal((await store.getSession(session.id)).contextUsage.usedTokens, 0, 'a lower new measurement is valid');
  await store.patchSession(session.id, { contextUsage: null });
  const cleared = await (await createStore(root)).getSession(session.id);
  assert.equal(cleared.contextUsage, null);
  assert.equal(cleared.title, 'Renamed conversation');
});

test('malformed usage cannot persist a partial patch or advance the session revision', async t => {
  const { root } = await fixture(t), store = await createStore(root);
  const session = await store.createSession();
  await store.patchSession(session.id, { contextUsage: sample });
  const file = `${root}/data/workspace/sessions/${session.id}.json`;
  const before = await fs.readFile(file);
  const invalid = [
    [], '', false, {},
    ...[-1, 0.1, Number.MAX_SAFE_INTEGER + 1, '2', NaN, Infinity].map(usedTokens => ({ ...sample, usedTokens })),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '258400'].map(contextWindow => ({ ...sample, contextWindow })),
    ...['', 'not a date', null, 'x'.repeat(81)].map(updatedAt => ({ ...sample, updatedAt })),
  ];
  for (const contextUsage of invalid) {
    await assert.rejects(store.patchSession(session.id, { title: 'Must not persist', contextUsage }), { code: 'INVALID_INPUT' });
    assert.deepEqual(await fs.readFile(file), before);
  }
  const aboveWindow = { ...sample, usedTokens: sample.contextWindow + 1 };
  assert.deepEqual((await store.patchSession(session.id, { contextUsage: aboveWindow })).contextUsage, aboveWindow);
});

test('concurrent title, message and measurement writes retain each other and legacy engine bindings', async t => {
  const { root } = await fixture(t), store = await createStore(root);
  const session = await store.createSession({ engine: 'opencode', providerId: 'fixture', modelId: 'model' });
  const messages = [{ id: 'u-1', role: 'user', text: 'Synthetic question' }];
  await Promise.all([
    store.patchSession(session.id, { title: '中文 renamed title' }),
    store.patchSession(session.id, { messages, running: true, activeRequestId: 'r-1' }),
    store.patchSession(session.id, { contextUsage: sample }),
  ]);
  const saved = await (await createStore(root)).getSession(session.id);
  assert.equal(saved.revision, 4);
  assert.equal(saved.title, '中文 renamed title');
  assert.deepEqual(saved.messages, messages);
  assert.deepEqual(saved.contextUsage, sample);
  assert.equal(saved.running, true);
  assert.equal(saved.activeRequestId, 'r-1');
  assert.equal(saved.engine, 'opencode');
  const summary = (await store.listSessions())[0];
  assert.equal(summary.title, saved.title);
  assert.equal(Object.hasOwn(summary, 'contextUsage'), false, 'lists remain lightweight summaries');
  await assert.rejects(store.patchSession(session.id, { title: '  ' }), { code: 'INVALID_INPUT' });
});

test('authenticated HTTP persists context values and reports invalid input without leaking private data', async t => {
  const f = await fixture(t), token = 'synthetic-context-token-not-a-real-credential';
  const server = await createWorkspaceServer({ root: f.root, token }); f.ownServer(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const created = await (await fetch(`${base}/sessions`, { method: 'POST', headers, body: '{}' })).json();
  const url = `${base}/sessions/${created.session.id}`;
  const patch = async (value, auth = true) => fetch(url, { method: 'PATCH', headers: auth ? headers : {}, body: JSON.stringify(value) });
  assert.equal((await patch({ contextUsage: sample }, false)).status, 401);
  assert.equal((await patch({ contextUsage: sample })).status, 200);
  const invalid = await patch({ contextUsage: { ...sample, usedTokens: -1 } });
  assert.equal(invalid.status, 400);
  const error = await invalid.json();
  assert.equal(error.error.code, 'INVALID_INPUT');
  assert.ok(!JSON.stringify(error).includes(f.root));
  assert.deepEqual((await (await fetch(url, { headers })).json()).session.contextUsage, sample);
  assert.equal((await patch({ contextUsage: null })).status, 200);
  assert.equal((await (await fetch(url, { headers })).json()).session.contextUsage, null);
});
