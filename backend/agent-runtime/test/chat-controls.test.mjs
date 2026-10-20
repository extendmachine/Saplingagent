import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentServer } from '../server.mjs';

const cache = fileURLToPath(new URL('../../../.cache/chat-controls-test/', import.meta.url));
async function until(check) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error('Synthetic runtime condition not reached');
}
async function fixture(config = {}) {
  await fs.mkdir(cache, { recursive: true });
  const root = await fs.mkdtemp(path.join(cache, 'progress-')), sessions = new Map();
  let nextSession = 0, nextThread = 0, nextTurn = 0, rpc;
  const patches = []; let failWrites = false;
  const prompts = [], threadSetups = [], starts = [], interrupts = [], replies = [], channels = [];
  let beforeAck, nextPatchGate, nextPreferencesGate, nextThreadGate, cancellableResume;
  const gates = [];
  function gate() { let release; const value = { entered: false, ready: new Promise(resolve => { release = resolve; }), release: () => release() }; gates.push(value); return value; }
  class FakeAppServer extends EventEmitter {
    constructor() { super(); rpc = this; this.closed = false; }
    async call(method, p = {}) {
      if (method === 'initialize') return {};
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'model/list') return { data: [{ model: 'synthetic-model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'medium' }], defaultReasoningEffort: 'medium' }] };
      if (method === 'skills/list') return { data: [] };
      if (method === 'mcpServerStatus/list') return { data: [{ name: 'seedagent', tools: { fake: {} } }] };
      if (['thread/start', 'thread/resume'].includes(method)) threadSetups.push(p);
      if (['thread/start', 'thread/resume'].includes(method) && !p.ephemeral && nextThreadGate) { const hold = nextThreadGate; nextThreadGate = undefined; hold.entered = true; await hold.ready; }
      if (method === 'thread/start') return { thread: { id: `thread-${++nextThread}` }, sandbox: { type: 'dangerFullAccess' }, approvalPolicy: 'never' };
      if (method === 'thread/resume') { if (cancellableResume) { cancellableResume.entered = true; await cancellableResume.ready; if(cancellableResume.cancelled)throw Object.assign(Error('Conversation resume was cancelled.'),{code:'CODEX_RESUME_CANCELLED'}); } return {}; }
      if (method === 'turn/start') {
        prompts.push(p);
        const turnId = `turn-${++nextTurn}`, turn = { threadId: p.threadId, turnId };
        starts.push(turn);
        if (beforeAck) { const callback = beforeAck; beforeAck = undefined; await callback(turn); }
        return { turn: { id: turnId } };
      }
      if (method === 'turn/interrupt') {
        interrupts.push(p); queueMicrotask(() => this.emit('notification', { method: 'turn/completed', params: { threadId: p.threadId, turn: { id: p.turnId, status: 'interrupted' } } })); return {};
      }
      throw new Error(`Unexpected synthetic RPC ${method}`);
    }
    cancelResume(threadId) { if(cancellableResume?.entered){cancellableResume.threadId=threadId;cancellableResume.cancelled=true;cancellableResume.release();} }
    send() {}
    reply(id, result) { replies.push({ id, result }); }
    reject() {}
    close() { this.closed = true; return Promise.resolve(); }
  }
  const workspace = http.createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    const input = parts.length ? JSON.parse(Buffer.concat(parts)) : {};
    let output;
    if (req.url === '/preferences') { if (nextPreferencesGate) { const hold = nextPreferencesGate; nextPreferencesGate = undefined; hold.entered = true; await hold.ready; } output = { preferences: [] }; }
    else if (req.url === '/sessions' && req.method === 'GET') output = { sessions: [...sessions.values()].map(s => ({ id: s.id })) };
    else if (req.url === '/sessions' && req.method === 'POST') {
      const session = { id: `session-${++nextSession}`, messages: [], requests: [], running: false, title: 'Synthetic test' }; sessions.set(session.id, session); output = { session };
    } else if (sessions.has(req.url.slice('/sessions/'.length))) {
      const session = sessions.get(req.url.slice('/sessions/'.length));
      if (req.method === 'PATCH') { patches.push(structuredClone(input)); if (failWrites) { res.writeHead(500); res.end(JSON.stringify({error:{code:'STORAGE_ERROR',message:'Synthetic storage failure'}})); return; } if (nextPatchGate) { const hold = nextPatchGate; nextPatchGate = undefined; hold.entered = true; await hold.ready; } Object.assign(session, input, {updatedAt: new Date().toISOString()}); }
      output = { session };
    } else { res.writeHead(404); res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Session does not exist' } })); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(output));
  });
  await new Promise(resolve => workspace.listen(0, '127.0.0.1', resolve));
  await fs.mkdir(path.join(root, 'local-secrets/runtime'), { recursive: true }); await fs.mkdir(path.join(root, 'config'));
  await fs.writeFile(path.join(root, 'local-secrets/runtime/service-token'), 'SYNTHETIC_TEST_TOKEN');
  await fs.writeFile(path.join(root, 'config/runtime.json'), JSON.stringify({ agentPort: 4310, workspacePort: workspace.address().port, builderPort: 4312, frontPort: 5173, reasoningEffort: 'medium', ...config }));
  let server;
  try { server = await createAgentServer({ root, AppServerClass: FakeAppServer }); }
  catch (error) { await new Promise(resolve => workspace.close(resolve)); await fs.rm(root, { recursive: true, force: true }); throw error; }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); await server.startAgent();
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, data, method = data === undefined ? 'GET' : 'POST') => fetch(base + route, { method, headers: { Authorization: 'Bearer SYNTHETIC_TEST_TOKEN', 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  async function stream(route, data) {
    const response = await request(route, data); assert.equal(response.status, 200);
    const reader = response.body.getReader(), events = [], decoder = new TextDecoder();
    const channel = { events, sessionId: response.headers.get('x-session-id'), ended: false, cancel: () => reader.cancel().catch(() => {}) }; channels.push(channel);
    void (async () => {
      let buffer = '';
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary; while ((boundary = buffer.indexOf('\n\n')) >= 0) { const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice(6))); }
        }
      } finally { channel.ended = true; }
    })().catch(() => {});
    await until(() => events.some(e => e.type === 'snapshot')); return channel;
  }
  return {
    server, base, prompts, patches, threadSetups, starts, interrupts, replies, sessions,
    set failWrites(value) { failWrites = value; },
    get rpc() { return rpc; }, set beforeAck(value) { beforeAck = value; },
    delayNextSave() { return nextPatchGate = gate(); },
    delayPreferences() { return nextPreferencesGate = gate(); },
    delayThreadSetup() { return nextThreadGate = gate(); },
    delayCancellableResume() { return cancellableResume = gate(); },
    stream, request,
    async chat(requestId, sessionId) { const previous = starts.length; const ch = await stream('/api/chat', { requestId, sessionId, text: 'Synthetic test' }); await until(() => starts.length > previous && sessions.get(ch.sessionId)?.threadId); return ch; },
    async session(id) { return (await (await request(`/api/sessions/${id}`)).json()).session; },
    notify(turn, method, extra = {}) { rpc.emit('notification', { method, params: { ...turn, ...extra } }); },
    async complete(turn, status = 'completed') { this.notify(turn, 'turn/completed', { turnId: undefined, turn: { id: turn.turnId, status } }); await until(() => [...sessions.values()].some(s => s.threadId === turn.threadId && !s.running)); },
    async cleanup() { for (const hold of gates) hold.release(); for (const channel of channels) await channel.cancel(); await server.shutdown(); workspace.closeAllConnections(); await new Promise(resolve => workspace.close(resolve)); await fs.rm(root, { recursive: true, force: true }); },
  };
}
const usage = (usedTokens = 42575, contextWindow = 258400) => ({
  last: { totalTokens: usedTokens }, total: { totalTokens: 9000000 }, modelContextWindow: contextWindow,
});
const report = (f, turn, value) => f.notify(turn, 'thread/tokenUsage/updated', { tokenUsage: value });

test('current Codex usage streams, persists, can decrease, and is distinct from cumulative billing', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const ch = await f.chat('usage'), turn = f.starts[0];
  assert.equal((await f.session(ch.sessionId)).contextUsage, undefined);
  report(f, turn, usage());
  await until(() => ch.events.some(e => e.session?.contextUsage?.usedTokens === 42575));
  assert.equal((await f.session(ch.sessionId)).contextUsage.contextWindow, 258400);
  report(f, turn, usage(900));
  await until(() => ch.events.some(e => e.session?.contextUsage?.usedTokens === 900));
  await f.complete(turn); await until(() => ch.ended);
  const saved = (await f.session(ch.sessionId)).contextUsage;
  assert.equal(saved.usedTokens, 900); assert.equal(saved.contextWindow, 258400);
  assert.ok(Number.isFinite(Date.parse(saved.updatedAt)));
  assert.deepEqual(f.sessions.get(ch.sessionId).contextUsage, saved);
  const reconnect = await f.stream(`/api/events?sessionId=${ch.sessionId}`);
  await until(() => reconnect.ended);
  assert.deepEqual(reconnect.events.find(e => e.type === 'snapshot').session.contextUsage, saved);
  assert.equal(f.prompts.length, 1);
});

test('usage follows strict confirmed thread/turn ownership and invalid data cannot pollute another session', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const a = await f.chat('owner-a'), turnA = f.starts[0];
  const b = await f.chat('owner-b'), turnB = f.starts[1];
  report(f, turnA, usage(30, 100)); report(f, turnB, usage(60, 100));
  await until(async () => (await f.session(b.sessionId)).contextUsage?.usedTokens === 60);
  for (const value of [undefined, {}, usage(-1), usage(1, 0), usage(1.5), usage(Number.MAX_SAFE_INTEGER + 1), usage(1, '100')]) report(f, turnA, value);
  for (const wrong of [{threadId:turnA.threadId,turnId:turnB.turnId}, {threadId:'foreign',turnId:turnA.turnId}, {threadId:turnA.threadId}]) report(f, wrong, usage(99, 100));
  assert.equal((await f.session(a.sessionId)).contextUsage.usedTokens, 30);
  assert.equal((await f.session(b.sessionId)).contextUsage.usedTokens, 60);
  await f.complete(turnA); await until(() => a.ended);
  report(f, turnA, usage(99, 100));
  const next = await f.chat('owner-a-new-turn', a.sessionId), turnNext = f.starts.at(-1);
  report(f, turnA, usage(99, 100));
  assert.equal((await f.session(a.sessionId)).contextUsage.usedTokens, 30);
  report(f, turnNext, usage(0, 100));
  await until(async () => (await f.session(next.sessionId)).contextUsage?.usedTokens === 0);
  assert.equal((await f.session(b.sessionId)).contextUsage.usedTokens, 60);
});

test('usage before turn acknowledgement waits for the confirmed turn ID', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  f.beforeAck = turn => {
    report(f, {...turn,turnId:'previous-turn'}, usage(99, 100));
    report(f, turn, usage(15, 100));
  };
  const ch = await f.chat('early-usage');
  await until(async () => (await f.session(ch.sessionId)).contextUsage?.usedTokens === 15);
  assert.equal(ch.events.some(e => e.session?.contextUsage?.usedTokens === 99), false);
});

test('unavailable usage explicitly clears previous measurements and survives save/reload', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const ch = await f.chat('unknown-usage'), turn = f.starts[0];
  report(f, turn, usage(10, 100)); await until(async () => (await f.session(ch.sessionId)).contextUsage?.usedTokens === 10);
  report(f, turn, usage(20, null)); await until(async () => (await f.session(ch.sessionId)).contextUsage === null);
  report(f, turn, usage(30, 100)); await until(async () => (await f.session(ch.sessionId)).contextUsage?.usedTokens === 30);
  report(f, turn, null); await f.complete(turn); await until(() => ch.ended);
  assert.equal(f.sessions.get(ch.sessionId).contextUsage, null);
  assert.equal((await f.session(ch.sessionId)).contextUsage, null);
});

test('failed final persistence restores usage, including null, before a subsequent prompt', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  for (const [index, value] of [usage(45, 100), null].entries()) {
    const ch = await f.chat(`dirty-${index}`), turn = f.starts.at(-1);
    report(f, turn, value); await until(async () => (await f.session(ch.sessionId)).contextUsage !== undefined);
    f.failWrites = true;
    f.notify(turn, 'turn/completed', {turnId:undefined,turn:{id:turn.turnId,status:'completed'}});
    await until(() => ch.ended);
    const retained = (await f.session(ch.sessionId)).contextUsage;
    assert.equal(value === null ? retained : retained.usedTokens, value === null ? null : 45);
    f.failWrites = false;
    const count = f.patches.length;
    await f.chat(`retry-${index}`, ch.sessionId);
    const recovery = f.patches.slice(count).find(p => p.running === false);
    assert.ok(recovery); assert.deepEqual(recovery.contextUsage, retained);
    assert.deepEqual(f.sessions.get(ch.sessionId).contextUsage, retained);
    await f.complete(f.starts.at(-1));
  }
});

test('renaming an active conversation changes only title, broadcasts, and survives completion without inference', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const ch = await f.chat('rename'), turn = f.starts[0];
  report(f, turn, usage(10, 100));
  const before = await f.session(ch.sessionId);
  const response = await f.request(`/api/sessions/${ch.sessionId}`, {title:'  Study notes  ',messages:[],threadId:'foreign',engine:'claude',contextUsage:null}, 'PATCH');
  assert.equal(response.status, 200);
  const renamed = (await response.json()).session;
  assert.equal(renamed.title, 'Study notes'); assert.equal(renamed.running, true);
  assert.deepEqual(renamed.messages, before.messages); assert.equal(renamed.threadId, before.threadId);
  assert.deepEqual(renamed.contextUsage, before.contextUsage);
  await until(() => ch.events.some(e => e.session?.title === 'Study notes'));
  await f.complete(turn); await until(() => ch.ended);
  assert.equal((await f.session(ch.sessionId)).title, 'Study notes');
  assert.equal(f.sessions.get(ch.sessionId).title, 'Study notes');
  assert.equal(f.prompts.length, 1); assert.equal(f.interrupts.length, 0);
});

test('concurrent title writes retain request order and a failed write does not poison later renames', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const ch = await f.chat('rename-order');
  const gate = f.delayNextSave();
  const first = f.request(`/api/sessions/${ch.sessionId}`, {title:'First'}, 'PATCH');
  await until(() => gate.entered);
  const second = f.request(`/api/sessions/${ch.sessionId}`, {title:'Second'}, 'PATCH');
  gate.release();
  assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  assert.equal((await f.session(ch.sessionId)).title, 'Second');
  assert.equal(f.sessions.get(ch.sessionId).title, 'Second');
  f.failWrites = true;
  assert.equal((await f.request(`/api/sessions/${ch.sessionId}`, {title:'Failed'}, 'PATCH')).status, 500);
  assert.equal((await f.session(ch.sessionId)).title, 'Second');
  f.failWrites = false;
  assert.equal((await f.request(`/api/sessions/${ch.sessionId}`, {title:'Recovered'}, 'PATCH')).status, 200);
  assert.equal((await f.session(ch.sessionId)).title, 'Recovered');
});

test('rename writes are validated, authorized and rejected while the runtime is prepared', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const ch = await f.chat('rename-auth'); await f.complete(f.starts[0]); await until(() => ch.ended);
  for (const title of ['', '   ', 'a'.repeat(201), null, 12]) {
    const response = await f.request(`/api/sessions/${ch.sessionId}`, {title}, 'PATCH');
    assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'INVALID_TITLE');
  }
  assert.equal((await f.request('/api/sessions/missing', {title:'Missing'}, 'PATCH')).status, 404);
  assert.equal((await fetch(f.base + `/api/sessions/${ch.sessionId}`, {method:'PATCH',body:JSON.stringify({title:'No token'})})).status, 401);
  assert.equal((await fetch(f.base + `/api/sessions/${ch.sessionId}`, {method:'PATCH',headers:{Origin:'https://foreign.example'},body:JSON.stringify({title:'Cross origin'})})).status, 403);
  assert.equal((await f.request('/internal/runtime/prepare', {})).status, 200);
  assert.equal((await f.request(`/api/sessions/${ch.sessionId}`, {title:'During restart'}, 'PATCH')).status, 503);
});

test('a delayed rename updates the replacement active turn instead of its completed predecessor', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const first = await f.chat('rename-before-finish'), oldTurn = f.starts[0];
  const gate = f.delayNextSave();
  const renaming = f.request(`/api/sessions/${first.sessionId}`, {title:'Across turns'}, 'PATCH');
  await until(() => gate.entered);
  await f.complete(oldTurn); await until(() => first.ended);
  const second = await f.chat('rename-after-finish', first.sessionId), newTurn = f.starts.at(-1);
  gate.release();
  assert.equal((await renaming).status, 200);
  assert.equal((await f.session(first.sessionId)).title, 'Across turns');
  await until(() => second.events.some(e => e.session?.title === 'Across turns'));
  report(f, newTurn, usage(12, 100));
  await until(() => second.events.some(e => e.session?.contextUsage?.usedTokens === 12));
  assert.equal(second.events.at(-1).session.title, 'Across turns');
  await f.complete(newTurn); await until(() => second.ended);
  assert.equal(f.sessions.get(first.sessionId).title, 'Across turns');
  assert.equal(f.prompts.length, 2); assert.equal(f.interrupts.length, 0);
});
