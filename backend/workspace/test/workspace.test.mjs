import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../store.mjs';
import { createWorkspaceServer } from '../server.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(fileURLToPath(new URL('../.test-', import.meta.url)));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test('sessions persist safely across reload, revisions reject stale writers', async (t) => {
  const root = await fixture(t); const store = await createStore(root);
  const session = await store.createSession({ title: 'Focused application' });
  const updated = await store.patchSession(session.id, { threadId: 'thread-001', running: true, activeRequestId: 'request-001', messages: [{ id: 'u-1', role: 'user', text: '\u4f60\u597d', requestId: 'request-001' }], requests: [{ id: 'request-001', status: 'inProgress', startedAt: new Date().toISOString() }] });
  assert.equal(updated.revision, 2);
  assert.equal((await (await createStore(root)).getSession(session.id)).messages[0].text, '\u4f60\u597d');
  assert.equal((await (await createStore(root)).getSession(session.id)).requests[0].status, 'inProgress');
  await assert.rejects(store.patchSession(session.id, { requests: [{ id: 'invalid', status: 'unknown', startedAt: new Date().toISOString() }] }), { code: 'INVALID_INPUT' });
  await assert.rejects(store.patchSession(session.id, { expectedRevision: 1, title: 'old writer' }), { code: 'CONFLICT' });
  const [first, second] = await Promise.all([store.patchSession(session.id, { title: 'A' }), store.patchSession(session.id, { title: 'B' })]);
  assert.equal(second.revision, first.revision + 1);
  assert.equal((await store.getSession(session.id)).title, 'B');
  assert.equal((await fs.stat(path.join(root, 'data/workspace/sessions', `${session.id}.json`))).mode & 0o777, 0o600);
});

test('sessions pin provider selection while legacy records normalize to Codex', async (t) => {
  const root = await fixture(t); const store = await createStore(root);
  const selected = await store.createSession({ engine: 'opencode', providerId: 'anthropic', modelId: 'claude-sonnet-4-6' });
  assert.equal(selected.engine, 'opencode');
  assert.equal((await store.listSessions())[0].modelId, 'claude-sonnet-4-6');
  await assert.rejects(store.patchSession(selected.id, { modelId: 'another-model' }), error => error.code === 'INVALID_INPUT');
  await assert.rejects(store.createSession({ engine: 'opencode', providerId: 'anthropic' }), error => error.code === 'INVALID_INPUT');
  const legacy = await store.createSession();
  const file = path.join(root, 'data/workspace/sessions', `${legacy.id}.json`);
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  delete raw.engine; delete raw.providerId; delete raw.modelId;
  await fs.writeFile(file, JSON.stringify(raw));
  const { engine, providerId, modelId } = await store.getSession(legacy.id);
  assert.deepEqual({ engine, providerId, modelId }, { engine: 'codex', providerId: null, modelId: null });
});
test('invalid IDs/messages and symlink storage never read or modify outside data', async (t) => {
  const root = await fixture(t); const store = await createStore(root); const session = await store.createSession();
  await assert.rejects(store.getSession('../../outside'), { code: 'INVALID_INPUT' });
  await assert.rejects(store.patchSession(session.id, { messages: [{ role: 'assistant', text: 'bad' }] }), { code: 'INVALID_INPUT' });
  await assert.rejects(store.patchSession(session.id, { messages: [{ id: 'same', role: 'user', text: 'a' }, { id: 'same', role: 'user', text: 'b' }] }), { code: 'INVALID_INPUT' });
  const outside = path.join(root, 'outside.json'); await fs.writeFile(outside, '{"untouched":true}');
  await fs.symlink(outside, path.join(root, 'data/workspace/sessions', 'escape.json'));
  await assert.rejects(store.getSession('escape'), { code: 'UNSAFE_STORAGE' });
  assert.equal(await fs.readFile(outside, 'utf8'), '{"untouched":true}');
  const corrupt = path.join(root, 'data/workspace/sessions', 'corrupt.json');
  await fs.writeFile(corrupt, '[]');
  await assert.rejects(store.patchSession('corrupt', { title: 'must not overwrite invalid schema' }), { code: 'CORRUPT_STORAGE' });
  assert.equal(await fs.readFile(corrupt, 'utf8'), '[]');
});
test('preferences require explicit evidence and can be corrected by deletion', async (t) => {
  const store = await createStore(await fixture(t));
  await assert.rejects(store.createPreference({ key: 'theme', value: 'dark', evidence: '' }), { code: 'INVALID_INPUT' });
  const preference = await store.createPreference({ key: 'theme', value: 'dark', evidence: 'User asked: default to dark from now on' });
  assert.equal((await store.listPreferences())[0].evidence, preference.evidence);
  await store.deletePreference(preference.id); assert.deepEqual(await store.listPreferences(), []);
});
test('HTTP requires bearer auth, validates malformed JSON and exposes safe health', async (t) => {
  const root = await fixture(t); const token = 'test-token-not-a-production-credential';
  const server = await createWorkspaceServer({ root, token });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/sessions`)).status, 401);
  const result = await fetch(`${base}/sessions`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' });
  assert.equal(result.status, 201); assert.ok((await result.json()).session.id);
  assert.equal((await fetch(`${base}/sessions`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{' })).status, 400);
  const logs = (await fs.readdir(path.join(root, 'logs/workspace'))).filter((name) => name.endsWith('.log'));
  assert.ok(logs.length);
  assert.ok(!(await fs.readFile(path.join(root, 'logs/workspace', logs[0]), 'utf8')).includes(token));
});

test('restart preparation requires authentication and gates new session writes until release', async t => {
  const root = await fixture(t), token='fixture-runtime-gate-token';
  const server=await createWorkspaceServer({root,token});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=(route,authorized=true)=>fetch(`http://127.0.0.1:${server.address().port}${route}`,{method:'POST',headers:authorized?{Authorization:`Bearer ${token}`}:{},body:'{}'});
  assert.equal((await request('/internal/runtime/prepare',false)).status,401);
  assert.equal((await request('/internal/runtime/prepare')).status,200);
  assert.equal((await request('/sessions')).status,503);
  assert.equal((await request('/internal/runtime/release')).status,200);
  assert.equal((await request('/sessions')).status,201);
});

test('Claude native thread and model binding survive reload and cannot be switched in place',async t=>{
 const root=await fixture(t),store=await createStore(root);const selected=await store.createSession({engine:'claude',providerId:'sapling-synthetic',modelId:'synthetic-claude'});
 await store.patchSession(selected.id,{threadId:'claude-thread'});const restored=await (await createStore(root)).getSession(selected.id);assert.equal(restored.engine,'claude');assert.equal(restored.threadId,'claude-thread');
 await assert.rejects(store.patchSession(selected.id,{engine:'opencode'}));await assert.rejects(store.patchSession(selected.id,{providerId:'other'}));await assert.rejects(store.createSession({engine:'claude'}));
});
