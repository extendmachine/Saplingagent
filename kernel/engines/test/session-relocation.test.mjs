import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { AppServer } from '../rpc.mjs';
import { findRelocatedRollout, isMissingRolloutError } from '../session-relocation.mjs';

const cache = fileURLToPath(new URL('../../../.cache/session-relocation-test/', import.meta.url));
const threadId = '01a13b6f-786f-7e52-854d-60b5701a8220';
const filename = `rollout-2026-10-14T10-22-03-${threadId}.jsonl`;
const oldPath = `/synthetic/Before/local-secrets/codex/sessions/2026/10/14/${filename}`;
const missing = `failed to resolve rollout path \`${oldPath}\`: file does not exist`;
async function fixture(t) {
  await fs.mkdir(cache, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(cache, 'app-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function rollout(root, { location = 'sessions/2026/10/14', id = threadId, metadata } = {}) {
  const file = path.join(root, 'local-secrets/codex', location, filename);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, (metadata || JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/synthetic/Before' } })) + '\n' + JSON.stringify({ type: 'response_item', payload: { synthetic: true } }) + '\n');
  return file;
}
async function rpcFixture(t, root, handler, options = {}) {
  const child = new EventEmitter();
  for (const name of ['stdin', 'stdout', 'stderr']) child[name] = new PassThrough();
  child.kill = () => true;
  let buffer = '';
  const calls = [];
  child.stdin.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      calls.push(message);
      const reply = response => queueMicrotask(() => child.stdout.write(JSON.stringify({ id: message.id, ...response }) + '\n'));
      if (message.method === 'initialize') reply({ result: {} });
      else handler(message, reply, calls);
    }
  });
  const rpc = new AppServer({ cwd: root, env: { CODEX_HOME: path.join(root, 'local-secrets/codex') }, spawnProcess: () => child, ...options });
  rpc.on('disconnect', () => {});
  t.after(() => rpc.close());
  await rpc.call('initialize', { capabilities: { experimentalApi: options.experimentalApi !== false } });
  return { rpc, calls };
}

test('recovery matches only the exact missing project-local rollout error and thread identity', () => {
  assert.equal(isMissingRolloutError(new Error(missing), threadId), true);
  assert.equal(isMissingRolloutError(new Error(missing.replace('file does not exist', 'No such file or directory (os error 2)')), threadId), true);
  assert.equal(isMissingRolloutError(new Error(missing.replaceAll('/', '\\')), threadId), true);
  for (const message of [missing.replace('file does not exist', 'permission denied'), missing.replace('local-secrets/codex', '.codex'), `other: ${missing}`, 'Session does not exist']) assert.equal(isMissingRolloutError(new Error(message), threadId), false);
  assert.equal(isMissingRolloutError(new Error(missing), 'another-thread'), false);
});

for (const location of ['sessions/2026/10/14', 'archived_sessions']) test(`finds and verifies ${location} without rewriting persisted bytes`, async t => {
  const root = await fixture(t), file = await rollout(root, { location }), before = await fs.readFile(file);
  assert.equal(await findRelocatedRollout(root, threadId), file);
  assert.deepEqual(await fs.readFile(file), before);
  assert.equal(await findRelocatedRollout(root, 'missing-thread'), null);
});

test('refuses duplicate paths rather than choosing a conversation silently', async t => {
  const root = await fixture(t); await rollout(root); await rollout(root, { location: 'archived_sessions' });
  await assert.rejects(findRelocatedRollout(root, threadId), { code: 'CODEX_ROLLOUT_AMBIGUOUS' });
});
test('rejects mismatched, malformed and oversized first metadata records', async t => {
  const root = await fixture(t);
  await rollout(root, { id: 'different-thread' });
  await assert.rejects(findRelocatedRollout(root, threadId), { code: 'CODEX_ROLLOUT_MISMATCH' });
  await rollout(root, { metadata: 'invalid JSON' });
  await assert.rejects(findRelocatedRollout(root, threadId), { code: 'CODEX_ROLLOUT_INVALID' });
  await rollout(root, { metadata: 'x'.repeat(65537) });
  await assert.rejects(findRelocatedRollout(root, threadId), { code: 'CODEX_ROLLOUT_INVALID' });
});
test('rejects linked rollout files and provider directories', async t => {
  const root = await fixture(t), file = await rollout(root), other = path.join(root, 'other.jsonl');
  await fs.rename(file, other); await fs.symlink(other, file);
  await assert.rejects(findRelocatedRollout(root, threadId), { code: 'CODEX_ROLLOUT_INVALID' });
  await fs.rm(path.join(root, 'local-secrets/codex'), { recursive: true });
  const external = path.join(root, 'other-provider'); await fs.mkdir(external); await fs.symlink(external, path.join(root, 'local-secrets/codex'));
  await assert.rejects(findRelocatedRollout(root, threadId), { code: 'CODEX_ROLLOUT_INVALID' });
});
test('bounds directory scans and observes cancellation', async t => {
  const root = await fixture(t); await rollout(root);
  await assert.rejects(findRelocatedRollout(root, threadId, { maxEntries: 1 }), { code: 'CODEX_ROLLOUT_SCAN_LIMIT' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(findRelocatedRollout(root, threadId, { signal: controller.signal }), { code: 'CODEX_RESUME_CANCELLED' });
});

test('retries a failed resume once with verified relocated path and unchanged model/permissions', async t => {
  const root = await fixture(t), file = await rollout(root);
  const { rpc, calls } = await rpcFixture(t, root, (request, reply) => reply(request.params.path ? { result: { thread: { id: threadId, path: file, cwd: root } } } : { error: { code: -32603, message: missing } }));
  const params = { threadId, cwd: '/synthetic/Before', model: 'synthetic', sandbox: 'danger-full-access', approvalPolicy: 'never', developerInstructions: 'Synthetic instructions' };
  assert.equal((await rpc.call('thread/resume', params)).thread.id, threadId);
  assert.deepEqual(calls.filter(x => x.method === 'thread/resume').map(x => x.params), [params, { ...params, path: file, cwd: root }]);
  assert.equal(rpc.resumeOperations.size, 0);
  assert.equal(params.cwd, '/synthetic/Before');
});
test('same pending resume shares recovery while conflicting options fail explicitly', async t => {
  const root = await fixture(t); await rollout(root);
  let firstReply;
  const { rpc, calls } = await rpcFixture(t, root, (request, reply) => { if (!request.params.path) firstReply = reply; else reply({ result: { thread: { id: threadId } } }); });
  const first = rpc.call('thread/resume', { threadId }), second = rpc.call('thread/resume', { threadId });
  assert.equal(first, second);
  await assert.rejects(rpc.call('thread/resume', { threadId, model: 'other' }), { code: 'CODEX_RESUME_BUSY' });
  firstReply({ error: { message: missing } });
  assert.deepEqual(await first, await second);
  assert.equal(calls.filter(x => x.method === 'thread/resume').length, 2);
});

for (const scenario of ['other error', 'missing file', 'explicit path', 'history supplied', 'experimental disabled', 'external home', 'default home', 'inherited external home']) test(`does not recover ${scenario}`, async t => {
  const root = await fixture(t); if (scenario !== 'missing file') await rollout(root);
  const expected = scenario === 'other error' ? 'Native provider failed' : missing;
  const options = scenario === 'experimental disabled' ? { experimentalApi: false } : scenario === 'external home' ? { env: { CODEX_HOME: path.join(root, 'other-home') } } : scenario === 'default home' ? { env: {} } : scenario === 'inherited external home' ? { env: undefined } : {};
  if (scenario === 'inherited external home') {
    const previous = process.env.CODEX_HOME; process.env.CODEX_HOME = path.join(root, 'other-home');
    t.after(() => { if (previous === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous; });
  }
  const { rpc, calls } = await rpcFixture(t, root, (_request, reply) => reply({ error: { code: -32603, message: expected } }), options);
  const params = { threadId, ...(scenario === 'explicit path' ? { path: '/explicit/path' } : {}), ...(scenario === 'history supplied' ? { history: [] } : {}) };
  await assert.rejects(rpc.call('thread/resume', params), error => error.message === expected && error.code === -32603);
  assert.equal(calls.filter(x => x.method === 'thread/resume').length, 1);
});
test('refuses a changed native identity and never creates a replacement thread', async t => {
  const root = await fixture(t); await rollout(root);
  const { rpc, calls } = await rpcFixture(t, root, (request, reply) => reply(request.params.path ? { result: { thread: { id: 'wrong-thread' } } } : { error: { message: missing } }));
  await assert.rejects(rpc.call('thread/resume', { threadId }), { code: 'CODEX_ROLLOUT_MISMATCH' });
  assert.deepEqual(calls.map(x => x.method), ['initialize', 'thread/resume', 'thread/resume']);
});
test('native path failure is surfaced without another recovery attempt', async t => {
  const root = await fixture(t); await rollout(root);
  const { rpc, calls } = await rpcFixture(t, root, (_request, reply) => reply({ error: { message: missing } }));
  await assert.rejects(rpc.call('thread/resume', { threadId }), error => error.message === missing);
  assert.equal(calls.filter(x => x.method === 'thread/resume').length, 2);
});
test('the original resume deadline includes the native retry instead of restarting its timer', async t => {
  const root = await fixture(t); await rollout(root);
  const timers = [];
  t.after(() => timers.forEach(clearTimeout));
  const { rpc, calls } = await rpcFixture(t, root, (request, reply) => {
    timers.push(setTimeout(() => reply(request.params.path ? { result: { thread: { id: threadId } } } : { error: { message: missing } }), 110));
  });
  await assert.rejects(rpc.call('thread/resume', { threadId }, 190), /timed out: thread\/resume/);
  assert.equal(calls.filter(x => x.method === 'thread/resume').length, 2);
  assert.equal(rpc.pending.size, 0); assert.equal(rpc.resumeOperations.size, 0);
});
test('the resume deadline also rejects promptly during a delayed filesystem lookup', async t => {
  const root = await fixture(t); await rollout(root);
  const { rpc, calls } = await rpcFixture(t, root, (_request, reply) => reply({ error: { message: missing } }));
  const originalRealpath = fs.realpath;
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  fs.realpath = async file => { await delayed; return originalRealpath(file); };
  t.after(() => { fs.realpath = originalRealpath; release(); });
  // The lookup cannot finish until released. A deadline must still reject it.
  const pending = rpc.call('thread/resume', { threadId }, 20);
  await assert.rejects(pending, /timed out: thread\/resume/);
  assert.equal(calls.filter(x => x.method === 'thread/resume').length, 1);
  assert.equal(rpc.pending.size, 0); assert.equal(rpc.resumeOperations.size, 0);
  fs.realpath = originalRealpath; release();
});
test('cancellation after the missing-path result does not issue a path retry', async t => {
  const root = await fixture(t); await rollout(root);
  const controller = new AbortController();
  const { rpc, calls } = await rpcFixture(t, root, (_request, reply) => {
    reply({ error: { message: missing } }); queueMicrotask(() => controller.abort());
  });
  await assert.rejects(rpc.call('thread/resume', { threadId }, 60000, { signal: controller.signal }), { code: 'CODEX_RESUME_CANCELLED' });
  assert.equal(calls.filter(x => x.method === 'thread/resume').length, 1);
});
for (const action of ['abort', 'cancelResume', 'close']) test(`${action} while native resume is pending prevents relocation retry and clears the pending request`, async t => {
  const root = await fixture(t); await rollout(root);
  const { rpc, calls } = await rpcFixture(t, root, () => {}), controller = new AbortController();
  const promise = rpc.call('thread/resume', { threadId }, 60000, { signal: controller.signal });
  if (action === 'abort') controller.abort(); else if (action === 'cancelResume') rpc.cancelResume(threadId); else await rpc.close();
  await assert.rejects(promise, action === 'close' ? /closed|shut down/ : { code: 'CODEX_RESUME_CANCELLED' });
  assert.equal(rpc.pending.size, 0); assert.equal(rpc.resumeOperations.size, 0);
  assert.equal(calls.filter(x => x.method === 'thread/resume').length, 1);
});
