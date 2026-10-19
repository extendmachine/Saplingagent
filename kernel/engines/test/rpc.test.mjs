import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter, once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AppServer } from '../rpc.mjs';
import { createAgentServer } from '../../../backend/agent-runtime/server.mjs';

function fixture() {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
  const rpc = new AppServer({ spawnProcess: () => child });
  rpc.on('disconnect', () => {});
  return { rpc, child };
}
test('RPC handles fragmented UTF-8, notifications and out-of-order replies', async () => {
  const { rpc, child } = fixture();
  const a = rpc.call('a'), b = rpc.call('b');
  const event = once(rpc, 'notification');
  const data = Buffer.from('{"method":"note","params":{"text":"\u6d41\u5f0f"}}\n{"id":2,"result":"b"}\n{"id":1,"result":"a"}\n');
  for (let i = 0; i < data.length; i += 5) child.stdout.write(data.subarray(i, i + 5));
  assert.equal((await event)[0].params.text, '\u6d41\u5f0f'); assert.equal(await b, 'b'); assert.equal(await a, 'a'); rpc.close();
});
test('RPC deadline rejects and removes pending requests', async () => {
  const { rpc } = fixture(); await assert.rejects(rpc.call('slow', {}, 10), /timed out/); assert.equal(rpc.pending.size, 0); rpc.close();
});
test('pipe failure rejects pending RPC instead of causing an unhandled process error', async () => {
  const { rpc, child } = fixture(); const pending = rpc.call('pending'); child.stdin.emit('error', new Error('EPIPE')); await assert.rejects(pending, /pipe closed/); assert.equal(rpc.closed, true);
});
test('malformed protocol terminates connection and rejects requests', async () => {
  const { rpc, child } = fixture(); const pending = rpc.call('pending'); child.stdout.write('invalid\n'); await assert.rejects(pending, /Invalid Agent protocol/); assert.equal(rpc.closed, true);
});

const cache = fileURLToPath(new URL('../../../.cache/agent-runtime-test/', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 4000) {
  const end = Date.now() + timeout;
  do { if (await check()) return; await sleep(25); } while (Date.now() < end);
  throw new Error('Lifecycle condition was not reached');
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function lifecycleFixture() {
  await fs.mkdir(cache, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(cache, 'shutdown-')));
  const executable = path.join(root, 'fake-codex');
  const fakeModule = path.join(root, 'fake-codex.mjs');
  const marker = path.join(root, 'owned-processes.json');
  const interruptMarker = path.join(root, 'interrupt-called');
  await fs.mkdir(path.join(root, 'local-secrets/runtime'), { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(root, 'config'));
  await fs.writeFile(path.join(root, 'local-secrets/runtime/service-token'), 'SYNTHETIC_TEST_TOKEN', { mode: 0o600 });
  await fs.writeFile(fakeModule, `
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
process.on('SIGTERM', () => {});
const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
child.once('message', () => fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify([process.pid, child.pid])));
readline.createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line); if (message.id === undefined) return;
  const model = { model: 'fake-model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'medium' }], defaultReasoningEffort: 'medium' };
  const results = {
    initialize: {}, 'account/read': { account: { type: 'chatgpt' } }, 'model/list': { data: [model] },
    'thread/start': { thread: { id: 'fake-thread' }, sandbox: { type: 'dangerFullAccess' }, approvalPolicy: 'never' },
    'skills/list': { data: [] }, 'mcpServerStatus/list': { data: [{ name: 'seedagent', tools: { fake: { description: 'Synthetic fixture' } } }] },
    'turn/start': { turn: { id: 'fake-turn' } }
  };
  if (message.method === 'turn/interrupt') { fs.writeFileSync(${JSON.stringify(interruptMarker)}, 'called'); return; }
  process.stdout.write(JSON.stringify({ id: message.id, result: results[message.method] || {} }) + '\\n');
  if (message.method === 'turn/start') process.stdout.write(JSON.stringify({ method: 'turn/started', params: { threadId: 'fake-thread', turn: { id: 'fake-turn' } } }) + '\\n');
});
setInterval(() => {}, 1000);
`);
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  await fs.writeFile(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fakeModule)} "$@"\n`, { mode: 0o700 });
  let saved, stall = false;
  const workspace = http.createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    const value = parts.length ? JSON.parse(Buffer.concat(parts)) : {};
    let result;
    if (req.url === '/preferences') result = { preferences: [] };
    else if (req.url === '/sessions' && req.method === 'GET') result = { sessions: saved ? [{ id: saved.id }] : [] };
    else if (req.url === '/sessions' && req.method === 'POST') { saved = { id: 'fake-session', messages: [], requests: [], running: false }; result = { session: saved }; }
    else if (req.url === '/sessions/fake-session') {
      if (req.method === 'PATCH') { if (stall) return; Object.assign(saved, value); }
      result = { session: saved };
    } else { res.writeHead(404); res.end('{}'); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
  });
  await new Promise(resolve => workspace.listen(0, '127.0.0.1', resolve));
  await fs.writeFile(path.join(root, 'config/runtime.json'), JSON.stringify({ workspacePort: workspace.address().port, agentPort: 4310, builderPort: 4312, frontPort: 5173, preferredModel: 'fake-model', reasoningEffort: 'medium', turnTimeoutMs: 600000 }));
  return {
    root, executable, marker, interruptMarker, workspace,
    get saved() { return saved; }, stallSaves() { stall = true; },
    async pids() { await until(async () => fs.access(marker).then(() => true, () => false)); return JSON.parse(await fs.readFile(marker, 'utf8')); },
    async cleanup() {
      const pids = await fs.readFile(marker, 'utf8').then(JSON.parse, () => []);
      for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch {} }
      workspace.closeAllConnections(); await new Promise(resolve => workspace.close(resolve));
      await fs.rm(root, { recursive: true, force: true });
    }
  };
}
test('RPC closes only its own process group, including descendants ignoring SIGTERM', { skip: process.platform === 'win32' }, async () => {
  const f = await lifecycleFixture();
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const rpc = new AppServer({ command: f.executable, cwd: f.root, env: { ...process.env } });
  rpc.on('disconnect', () => {});
  try {
    const pids = await f.pids();
    const began = Date.now();
    const closing = rpc.close(); assert.equal(rpc.close(), closing); await closing;
    assert.ok(Date.now() - began < 2000);
    await until(() => pids.every(pid => !alive(pid)));
    assert.ok(alive(unrelated.pid), 'An unrelated process must remain alive');
  } finally { await rpc.close(); unrelated.kill('SIGKILL'); await once(unrelated, 'exit'); await f.cleanup(); }
});
for (const stalled of [false, true]) test(`Agent shutdown is bounded during an active turn (${stalled ? 'unavailable' : 'available'} storage)`, { skip: process.platform === 'win32' }, async () => {
  const f = await lifecycleFixture();
  const original = { SEED_CODEX_BIN: process.env.SEED_CODEX_BIN, SEED_WORKSPACE_PORT: process.env.SEED_WORKSPACE_PORT };
  let server, response;
  try {
    process.env.SEED_CODEX_BIN = f.executable;
    process.env.SEED_WORKSPACE_PORT = String(f.workspace.address().port);
    server = await createAgentServer({ root: f.root });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await server.startAgent();
    const pids = await f.pids();
    response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, { method: 'POST', headers: { Authorization: 'Bearer SYNTHETIC_TEST_TOKEN', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Synthetic lifecycle test', requestId: 'fake-request' }) });
    assert.equal(response.status, 200);
    await until(() => f.saved?.threadId === 'fake-thread');
    if (stalled) f.stallSaves();
    const began = Date.now(), closing = server.shutdown();
    assert.equal(server.shutdown(), closing); await closing;
    assert.ok(Date.now() - began < 2600);
    await until(() => pids.every(pid => !alive(pid)));
    assert.equal(await fs.access(f.interruptMarker).then(() => true, () => false), false, 'Shutdown must not await an interrupt RPC');
    if (!stalled) { assert.equal(f.saved.running, false); assert.equal(f.saved.requests[0].status, 'interrupted'); }
    await assert.rejects(server.startAgent(), /Service is shutting down/);
  } finally {
    for (const [name, value] of Object.entries(original)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (response?.body) await response.body.cancel().catch(() => {});
    if (server) await server.shutdown();
    await f.cleanup();
  }
});
test('SIGHUP closes a terminal-launched Agent and its detached App Server group', { skip: process.platform === 'win32' }, async () => {
  const f = await lifecycleFixture();
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../../backend/agent-runtime/server.mjs', import.meta.url))], { cwd: f.root, env: { ...process.env, SEED_ROOT: f.root, SEED_CODEX_BIN: f.executable, SEED_AGENT_PORT: '0', SEED_WORKSPACE_PORT: String(f.workspace.address().port) }, stdio: 'ignore' });
  try {
    const pids = await f.pids();
    const exited = once(child, 'exit');
    child.kill('SIGHUP'); child.kill('SIGTERM');
    const [code, signal] = await Promise.race([exited, sleep(3000).then(() => { throw new Error('Agent did not shut down after SIGHUP'); })]);
    assert.equal(code, 0); assert.equal(signal, null);
    await until(() => pids.every(pid => !alive(pid)));
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await f.cleanup(); }
});
