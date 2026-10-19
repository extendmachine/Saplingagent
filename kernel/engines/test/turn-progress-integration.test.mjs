import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentServer } from '../../../backend/agent-runtime/server.mjs';
import { fakeClock } from './progress-clock.mjs';

const cache = fileURLToPath(new URL('../../../.cache/turn-progress-test/', import.meta.url));
async function until(check) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error('Synthetic runtime condition not reached');
}
async function fixture(config = {}) {
  await fs.mkdir(cache, { recursive: true });
  const root = await fs.mkdtemp(path.join(cache, 'progress-')), sessions = new Map(), clock = fakeClock();
  let nextSession = 0, nextThread = 0, nextTurn = 0, rpc;
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
      if (req.method === 'PATCH') { if (nextPatchGate) { const hold = nextPatchGate; nextPatchGate = undefined; hold.entered = true; await hold.ready; } Object.assign(session, input); }
      output = { session };
    } else { res.writeHead(404); res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Session does not exist' } })); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(output));
  });
  await new Promise(resolve => workspace.listen(0, '127.0.0.1', resolve));
  await fs.mkdir(path.join(root, 'local-secrets/runtime'), { recursive: true }); await fs.mkdir(path.join(root, 'config'));
  await fs.writeFile(path.join(root, 'local-secrets/runtime/service-token'), 'SYNTHETIC_TEST_TOKEN');
  await fs.writeFile(path.join(root, 'config/runtime.json'), JSON.stringify({ agentPort: 4310, workspacePort: workspace.address().port, builderPort: 4312, frontPort: 5173, reasoningEffort: 'medium', ...config }));
  let server;
  try { server = await createAgentServer({ root, AppServerClass: FakeAppServer, progressClock: clock }); }
  catch (error) { await new Promise(resolve => workspace.close(resolve)); await fs.rm(root, { recursive: true, force: true }); throw error; }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); await server.startAgent();
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, data) => fetch(base + route, { method: data === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer SYNTHETIC_TEST_TOKEN', 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
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
    server, clock, prompts, threadSetups, starts, interrupts, replies, sessions,
    get rpc() { return rpc; }, set beforeAck(value) { beforeAck = value; },
    delayNextSave() { return nextPatchGate = gate(); },
    delayPreferences() { return nextPreferencesGate = gate(); },
    delayThreadSetup() { return nextThreadGate = gate(); },
    delayCancellableResume() { return cancellableResume = gate(); },
    stream, request,
    async chat(requestId, sessionId) { const ch = await stream('/api/chat', { requestId, sessionId, text: 'Synthetic test' }); await until(() => starts.length > 0 && sessions.get(ch.sessionId)?.threadId); return ch; },
    async session(id) { return (await (await request(`/api/sessions/${id}`)).json()).session; },
    notify(turn, method, extra = {}) { rpc.emit('notification', { method, params: { ...turn, ...extra } }); },
    async complete(turn, status = 'completed') { this.notify(turn, 'turn/completed', { turnId: undefined, turn: { id: turn.turnId, status } }); await until(() => [...sessions.values()].some(s => s.threadId === turn.threadId && !s.running)); },
    async cleanup() { for (const hold of gates) hold.release(); for (const channel of channels) await channel.cancel(); await server.shutdown(); workspace.closeAllConnections(); await new Promise(resolve => workspace.close(resolve)); await fs.rm(root, { recursive: true, force: true }); },
  };
}
const idleWarnings = ch => ch.events.filter(e => e.type === 'status' && /no recent progress|waiting for your confirmation/.test(e.label));

test('actual HTTP runtime continues beyond former ten minutes, warns once, replays idle on reconnect and resumes', async () => {
  const f = await fixture();
  try {
    const ch = await f.chat('long-run'), turn = f.starts[0];
    f.clock.advance(599999); f.notify(turn, 'item/reasoning/textDelta', { itemId: 'reason', delta: 'PRIVATE_REASONING' });
    const progressed = await f.session(ch.sessionId); assert.equal(progressed.progress.lastProgressKind, 'reasoning');
    f.clock.advance(599999); assert.equal((await f.session(ch.sessionId)).running, true); assert.equal(f.interrupts.length, 0);
    f.clock.advance(1); await until(() => idleWarnings(ch).length === 1);
    const idle = await f.session(ch.sessionId); assert.equal(idle.progress.idle, true); assert.equal(idle.running, true);
    const refreshed = await f.stream(`/api/events?sessionId=${ch.sessionId}`); await until(() => idleWarnings(refreshed).length === 1);
    f.clock.advance(600000); await f.request('/api/status'); await f.session(ch.sessionId);
    assert.equal(idleWarnings(ch).length, 1); assert.equal(f.starts.length, 1); assert.equal(f.interrupts.length, 0);
    assert.equal((await f.session(ch.sessionId)).progress.lastProgressAt, idle.progress.lastProgressAt);
    f.notify(turn, 'item/mcpToolCall/progress', { itemId: 'tool', message: 'PRIVATE_TOOL_PROGRESS' });
    assert.equal((await f.session(ch.sessionId)).progress.idle, false); await until(() => ch.events.some(e => e.type === 'status' && /New progress received/.test(e.label)));
    assert.doesNotMatch(JSON.stringify([...f.sessions.values(), ch.events]), /PRIVATE_REASONING|PRIVATE_TOOL_PROGRESS/);
    await f.complete(turn); assert.equal(f.clock.pending, 0); assert.equal((await f.session(ch.sessionId)).progress, undefined);
  } finally { await f.cleanup(); }
});
test('polling, reconnect, empty deltas, unbound and old events do not postpone idle warning', async () => {
  const f = await fixture({ turnIdleWarningMs: 100 });
  try {
    const ch = await f.chat('invalid-events'), turn = f.starts[0], before = (await f.session(ch.sessionId)).progress.lastProgressAt;
    f.clock.advance(99);
    for (const method of ['item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/commandExecution/outputDelta']) f.notify(turn, method, { itemId: 'i', delta: '' });
    f.notify(turn, 'item/mcpToolCall/progress', { itemId: 'i', message: ' ' });
    f.notify({ threadId: turn.threadId, turnId: 'old-turn' }, 'item/reasoning/textDelta', { itemId: 'i', delta: 'old' });
    f.notify({ threadId: 'wrong-thread', turnId: turn.turnId }, 'item/reasoning/textDelta', { itemId: 'i', delta: 'wrong' });
    f.notify({ threadId: turn.threadId }, 'item/reasoning/textDelta', { itemId: 'i', delta: 'unbound' });
    f.notify(turn, 'error', { willRetry: true }); await f.request('/api/status'); await f.stream(`/api/events?sessionId=${ch.sessionId}`);
    assert.equal((await f.session(ch.sessionId)).progress.lastProgressAt, before); f.clock.advance(1); await until(() => idleWarnings(ch).length === 1); assert.equal(f.starts.length, 1);
  } finally { await f.cleanup(); }
});
test('concurrent sessions have independent idle states, silent tools and cancellation cleanup', async () => {
  const f = await fixture({ turnIdleWarningMs: 100 });
  try {
    const a = await f.chat('session-a'), b = await f.chat('session-b'); await until(() => f.starts.length === 2);
    f.notify(f.starts[1], 'item/started', { item: { id: 'command', type: 'commandExecution', status: 'inProgress' } });
    f.clock.advance(90); f.notify(f.starts[0], 'item/agentMessage/delta', { itemId: 'text', delta: 'hello' }); f.clock.advance(10);
    await until(() => idleWarnings(b).length === 1); assert.equal(idleWarnings(a).length, 0); assert.match(idleWarnings(b)[0].label, /a tool is still running/);
    const bp = (await f.session(b.sessionId)).progress; assert.equal(bp.phase, 'tool-running'); assert.equal(f.interrupts.length, 0);
    assert.equal((await f.request(`/api/sessions/${b.sessionId}/cancel`, {})).status, 200); await until(() => !f.sessions.get(b.sessionId).running);
    assert.equal(f.interrupts.length, 1); assert.equal(f.interrupts[0].turnId, f.starts[1].turnId); assert.equal(f.clock.pending, 1);
    await f.complete(f.starts[0]); assert.equal(f.clock.pending, 0); f.clock.advance(1000); assert.equal(f.starts.length, 2);
  } finally { await f.cleanup(); }
});
test('confirmed turn binding accepts pre-ACK new progress and ignores nested old start/completion on next turn', async () => {
  const f = await fixture({ turnIdleWarningMs: 100 });
  try {
    const first = await f.chat('first-turn'), old = f.starts[0]; await f.complete(old);
    f.beforeAck = async turn => {
      f.notify(turn, 'item/agentMessage/delta', { itemId: 'new-text', delta: 'new before ack' });
      f.notify({ threadId: turn.threadId }, 'turn/started', { turn: { id: old.turnId } });
      f.notify({ threadId: turn.threadId }, 'turn/completed', { turn: { id: old.turnId, status: 'completed' } });
      await new Promise(resolve => setImmediate(resolve));
    };
    const second = await f.chat('second-turn', first.sessionId); await until(() => f.starts.length === 2); await until(() => second.events.some(e => e.type === 'text_delta'));
    let saved = await f.session(first.sessionId); assert.equal(saved.running, true); assert.ok(saved.messages.some(m => m.text === 'new before ack')); assert.equal(saved.progress.lastProgressKind, 'text');
    f.clock.advance(99); f.notify({ threadId: old.threadId }, 'turn/completed', { turn: { id: old.turnId, status: 'failed' } });
    saved = await f.session(first.sessionId); assert.equal(saved.running, true); assert.equal(f.clock.pending, 1);
    f.clock.advance(1); await until(() => idleWarnings(second).length === 1); await f.complete(f.starts[1]); assert.equal(f.clock.pending, 0);
  } finally { await f.cleanup(); }
});
test('explicit positive hard timeout interrupts the real current turn and does not extend with progress', async () => {
  const f = await fixture({ turnTimeoutMs: 1000, turnIdleWarningMs: 100 });
  try {
    const ch = await f.chat('hard-timeout'), turn = f.starts[0]; f.clock.advance(900);
    f.notify(turn, 'item/reasoning/textDelta', { itemId: 'r', delta: 'still thinking' }); f.clock.advance(100);
    await until(() => f.interrupts.length === 1); await until(() => ch.events.some(e => e.type === 'done'));
    assert.equal(f.interrupts[0].turnId, turn.turnId); assert.equal(ch.events.find(e => e.type === 'done').status, 'failed'); assert.match(ch.events.find(e => e.type === 'error').message, /configured total time limit/); assert.equal(f.clock.pending, 0);
  } finally { await f.cleanup(); }
});
test('Full Access confirmation remains automatic and cannot masquerade as model progress or a user wait', async () => {
  const f = await fixture({ turnIdleWarningMs: 100 });
  try {
    const ch = await f.chat('approval'), turn = f.starts[0], before = (await f.session(ch.sessionId)).progress.lastProgressAt;
    f.rpc.emit('request', { id: 73, method: 'mcpServer/elicitation/request', params: { ...turn, serverName: 'seedagent', mode: 'form', message: 'Synthetic confirmation', requestedSchema: { type: 'object', properties: { confirm: { type: 'boolean' } }, required: ['confirm'] } } });
    assert.equal(f.replies[0].id, 73); assert.equal((await f.session(ch.sessionId)).progress.phase, 'working');
    f.clock.advance(100); await until(() => idleWarnings(ch).length === 1); assert.doesNotMatch(idleWarnings(ch)[0].label, /waiting for your confirmation/);
    const after = await f.session(ch.sessionId); assert.equal(after.progress.lastProgressAt, before); assert.equal(ch.events.some(e => e.type === 'approval'), false); await f.complete(turn);
  } finally { await f.cleanup(); }
});
test('disconnect, shutdown and failed turn completion clear monitor timers without synthetic restart', async () => {
  for (const action of ['disconnect', 'shutdown', 'failed']) {
    const f = await fixture({ turnTimeoutMs: 1000, turnIdleWarningMs: 100 });
    try {
      const ch = await f.chat(`cleanup-${action}`); assert.equal(f.clock.pending, 2);
      if (action === 'disconnect') { f.rpc.closed = true; f.rpc.emit('disconnect', new Error('Synthetic disconnect')); await until(() => !f.sessions.get(ch.sessionId).running); }
      else if (action === 'shutdown') await f.server.shutdown();
      else await f.complete(f.starts[0], 'failed');
      assert.equal(f.clock.pending, 0); f.clock.advance(10000); assert.equal(f.starts.length, 1); assert.equal(f.interrupts.length, 0);
    } finally { await f.cleanup(); }
  }
});
test('invalid timeout config is refused before App Server/model initialization', async () => {
  await assert.rejects(fixture({ turnTimeoutMs: -1 }), /turnTimeoutMs/);
  await assert.rejects(fixture({ turnIdleWarningMs: 1.1 }), /turnIdleWarningMs/);
});

test('disconnect while the first save is pending cannot create an orphan monitor or restart the old request', async () => {
  const f = await fixture({ turnTimeoutMs: 1000, turnIdleWarningMs: 100 });
  try {
    const hold = f.delayNextSave(), channel = f.stream('/api/chat', { requestId: 'delayed-save', text: 'Synthetic test' });
    await until(() => hold.entered); const oldRpc = f.rpc;
    oldRpc.closed = true; oldRpc.emit('disconnect', new Error('Synthetic disconnect during save'));
    hold.release(); const ch = await channel; await until(() => ch.events.some(e => e.type === 'done'));
    assert.equal((await f.session(ch.sessionId)).running, false); assert.equal(f.clock.pending, 0); assert.equal(f.starts.length, 0); assert.equal(f.rpc, oldRpc);
    f.clock.advance(10000); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.clock.pending, 0); assert.equal(f.starts.length, 0); assert.equal(f.rpc, oldRpc);
  } finally { await f.cleanup(); }
});
test('hard deadline during pending preferences remains failed with its cause and never starts the model', async () => {
  const f = await fixture({ turnTimeoutMs: 1000, turnIdleWarningMs: 100 });
  try {
    const hold = f.delayPreferences();
    const ch = await f.stream('/api/chat', { requestId: 'hard-limit-before-model', text: 'Synthetic test' }); await until(() => hold.entered);
    f.clock.advance(1000); assert.equal(f.clock.pending, 0); hold.release(); await until(() => ch.events.some(e => e.type === 'done'));
    const session = await f.session(ch.sessionId); assert.equal(session.running, false); assert.equal(session.requests.at(-1).status, 'failed');
    assert.equal(ch.events.find(e => e.type === 'done').status, 'failed'); assert.match(ch.events.find(e => e.type === 'error').message, /configured total time limit/);
    assert.equal(f.starts.length, 0); assert.equal(f.interrupts.length, 0); assert.equal(f.clock.pending, 0);
  } finally { await f.cleanup(); }
});
for (const setup of ['thread/start', 'thread/resume', 'preferences']) for (const action of ['disconnect', 'cancel']) test(`${action} during awaited ${setup} cannot start a turn or leave progress timers`, async () => {
  const f = await fixture({ turnTimeoutMs: 1000, turnIdleWarningMs: 100 });
  try {
    let sessionId;
    if (setup === 'thread/resume') { sessionId = 'saved-session'; f.sessions.set(sessionId, { id: sessionId, threadId: 'saved-thread', messages: [], requests: [], running: false }); }
    const hold = setup === 'preferences' ? f.delayPreferences() : f.delayThreadSetup();
    const ch = await f.stream('/api/chat', { requestId: `pending-${setup.replace('/', '-')}-${action}`, sessionId, text: 'Synthetic test' }); await until(() => hold.entered);
    assert.equal(f.clock.pending, 2); const oldRpc = f.rpc;
    if (action === 'disconnect') { oldRpc.closed = true; oldRpc.emit('disconnect', new Error('Synthetic disconnect during setup')); }
    else assert.equal((await f.request(`/api/sessions/${ch.sessionId}/cancel`, {})).status, 200);
    assert.equal(f.clock.pending, 0); hold.release(); await until(() => ch.events.some(e => e.type === 'done'));
    const saved = await f.session(ch.sessionId); assert.equal(saved.running, false); assert.equal(saved.requests.at(-1).status, action === 'cancel' ? 'interrupted' : 'failed');
    assert.equal(f.starts.length, 0); assert.equal(f.interrupts.length, 0); assert.equal(f.clock.pending, 0); assert.equal(f.rpc, oldRpc);
    f.clock.advance(10000); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.starts.length, 0); assert.equal(f.clock.pending, 0);
  } finally { await f.cleanup(); }
});

test('all Git mutations reject an active AI turn without interrupting it', async () => {
  const f = await fixture();
  try {
    await f.chat('version-operation-busy');
    for (const route of ['commit', 'switch', 'checkout', 'label']) {
      const response = await f.request(`/api/git/${route}`, {});
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, 'GIT_AGENT_BUSY');
    }
    assert.equal(f.interrupts.length, 0);
    await f.complete(f.starts[0]);
  } finally { await f.cleanup(); }
});

test('runtime prepare refuses active AI, drains idle mutations and releases without interrupting or resending', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const ch = await f.chat('restart-fixture');
  let response = await f.request('/internal/runtime/prepare', {});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'RUNTIME_BUSY');
  assert.equal(f.interrupts.length, 0);
  await f.complete(f.starts[0]);
  response = await f.request('/internal/runtime/prepare', {});
  assert.equal(response.status, 200);
  assert.equal((await (await f.request('/api/status')).json()).ready, false);
  response = await f.request('/api/chat', {sessionId: ch.sessionId, requestId:'blocked-restart-fixture',text:'blocked'});
  assert.equal(response.status, 503);
  assert.equal(f.starts.length, 1);
  assert.equal((await f.request('/internal/runtime/release', {})).status, 200);
  assert.equal((await (await f.request('/api/status')).json()).ready, true);
});


test('new and resumed conversations receive truthful every-turn receipt guidance without reducing Full Access', async () => {
  const f = await fixture();
  try {
    const first = await f.chat('receipt-first');
    await f.complete(f.starts[0]);
    await f.chat('receipt-resumed', first.sessionId);
    await until(() => f.prompts.length === 2);
    for (const prompt of f.prompts) {
      const text = prompt.input[0].text;
      assert.ok(text.startsWith('Synthetic test'));
      assert.match(text, /Active application folder:/);
      assert.match(text, /explicit customer request can target external code/);
      assert.match(text, /not a technical permission restriction/);
      assert.match(text, /Every final assistant reply, including ordinary chat/);
      assert.match(text, /Read-only work remains unregistered/);
      assert.match(text, /Never invent task IDs/);
      for (const field of ['Standard version (start/end)', 'Task attribution', 'Actual modification scope', 'Rule review', 'Document status', 'Verification status', 'Git status', 'Remaining items']) assert.ok(text.includes(field));
    }
    for (const setup of f.threadSetups) {
      assert.equal(setup.sandbox, 'danger-full-access');
      assert.equal(setup.approvalPolicy, 'never');
      assert.match(setup.developerInstructions, /Completion-review receipt/);
    }
    await f.complete(f.starts[1]);
  } finally { await f.cleanup(); }
});


test('Stop cancels the pending native resume before a turn exists and releases the same saved session',async()=>{
 const f=await fixture();try{
  const id='saved-resume-cancel';f.sessions.set(id,{id,threadId:'saved-thread',messages:[],requests:[],running:false});
  const hold=f.delayCancellableResume();const ch=await f.stream('/api/chat',{requestId:'cancel-native-resume',sessionId:id,text:'Synthetic only'});await until(()=>hold.entered);
  assert.equal(f.starts.length,0);assert.equal((await f.request('/api/sessions/'+id+'/cancel',{})).status,200);
  await until(()=>ch.events.some(e=>e.type==='done'));const saved=await f.session(id);
  assert.equal(hold.threadId,'saved-thread');assert.equal(hold.cancelled,true);assert.equal(saved.running,false);assert.equal(saved.threadId,'saved-thread');assert.equal(saved.requests.at(-1).status,'interrupted');assert.equal(ch.events.find(e=>e.type==='done').status,'interrupted');assert.equal(ch.events.some(e=>e.type==='error'),false);assert.equal(f.starts.length,0);assert.equal(f.interrupts.length,0);assert.equal(f.clock.pending,0);
 }finally{await f.cleanup()}
});
