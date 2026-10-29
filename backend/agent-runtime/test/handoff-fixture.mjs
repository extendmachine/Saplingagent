import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { createAgentServer } from '../server.mjs';
import { createWorkspaceServer } from '../../workspace/server.mjs';

export const selections = {
  codex: { engine: 'codex', providerId: null, modelId: null },
  claude: { engine: 'claude', providerId: 'sapling-claude', modelId: 'synthetic-model' },
  opencode: { engine: 'opencode', providerId: 'sapling-opencode', modelId: 'synthetic-model' },
};
export async function until(check) { for (let i = 0; i < 500; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Synthetic condition did not finish'); }
export async function handoffFixture(options = {}) {
  const cache = fileURLToPath(new URL('../../../.cache/session-handoff/', import.meta.url));
  await fs.mkdir(cache, { recursive: true });
  const root = await fs.mkdtemp(path.join(cache, 'app-')), prompts = [], providers = new Map(), channels = [], codexCalls = [];
  const token = 'synthetic-handoff-test-token'; let rpc, nextThread = 0, nextTurn = 0, autoComplete = true, ready = true, catalogGate, writeFault = '', rejectReads = false;
  const gates = [];
  const finish = (entry, status = 'completed') => {
    if (entry.engine === 'codex') {
      rpc.emit('notification', { method: 'item/agentMessage/delta', params: { threadId: entry.threadId, turnId: entry.turnId, itemId: `answer-${entry.requestId}`, delta: 'Synthetic answer' } });
      rpc.emit('notification', { method: 'turn/completed', params: { threadId: entry.threadId, turn: { id: entry.turnId, status } } });
    } else {
      const p = providers.get(entry.engine);
      p.onEvent(entry.run, { type: 'text', id: `answer-${entry.requestId}`, delta: 'Synthetic answer' });
      p.onEvent(entry.run, { type: 'done', status });
    }
  };
  class FakeCodex extends EventEmitter {
    constructor() { super(); rpc = this; this.closed = false; }
    async call(method, p = {}) {
      codexCalls.push({ method, params: structuredClone(p) });
      if (method === 'initialize') return options.codexInitialize ? options.codexInitialize() : {};
      if (method === 'account/read') return { account: { type: 'synthetic' } };
      if (method === 'model/list') return options.codexCatalog ? options.codexCatalog(p) : { data: [{ model: 'synthetic-model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'medium' }], defaultReasoningEffort: 'medium' }] };
      if (method === 'skills/list') return { data: [] };
      if (method === 'mcpServerStatus/list') return { data: [{ name: 'seedagent', tools: { synthetic: {} } }] };
      if (method === 'thread/start') return { thread: { id: `codex-${++nextThread}` }, sandbox: { type: 'dangerFullAccess' }, approvalPolicy: 'never', ...(options.codexReport ? { model: options.codexReport(p.model, method) } : {}) };
      if (method === 'thread/resume') return options.codexReport ? { model: options.codexReport(p.model, method) } : {};
      if (method === 'turn/start') {
        const entry = { engine: 'codex', requestId: p.clientUserMessageId, text: p.input[0].text, threadId: p.threadId, turnId: `turn-${++nextTurn}`, model: p.model, effort: p.effort };
        await options.beforeTurnAck?.(entry, this);
        prompts.push(entry); if (autoComplete) setTimeout(() => finish(entry), 5);
        return { turn: { id: entry.turnId } };
      }
      if (method === 'turn/interrupt') { const entry = prompts.findLast(e => e.turnId === p.turnId); if (entry) setTimeout(() => finish(entry, 'interrupted'), 0); return {}; }
      throw Error(`Unexpected fake RPC ${method}`);
    }
    send() {} reply() {} reject() {} close() { this.closed = true; }
  }
  const providerClass = engine => class {
    constructor({ onEvent }) { this.onEvent = onEvent; providers.set(engine, this); }
    async start() {
      if (catalogGate) { const gate = catalogGate, writeFault = '', rejectReads = false; catalogGate = null; gate.entered = true; await gate.promise; }
      this.ready = ready;
      return { id: engine, label: engine, ready, authenticated: ready, mcp: { ready }, providers: [{ id: `sapling-${engine}`, label: `Synthetic ${engine}`, models: [{ id: 'synthetic-model', label: 'Synthetic model' }, { id: 'synthetic-second', label: 'Second synthetic model' }] }] };
    }
    async execute(run, text, options) {
      if (!run.session.threadId) { run.session.threadId = `${engine}-${++nextThread}`; await run.save(); }
      const entry = { engine, requestId: run.requestId, threadId: run.session.threadId, run, text, options };
      prompts.push(entry); if (autoComplete) setTimeout(() => finish(entry), 5);
    }
    async interrupt(run) { const entry = prompts.findLast(e => e.run === run); if (entry) finish(entry, 'interrupted'); }
    close() {}
  };
  for (const dir of ['config', 'local-secrets/runtime', 'local-secrets/ai-config']) await fs.mkdir(path.join(root, dir), { recursive: true });
  await fs.writeFile(path.join(root, 'local-secrets/runtime/service-token'), token);
  const profiles = ['claude', 'opencode'].map(engine => ({ id: engine, label: engine, engine, kind: 'api', protocol: engine === 'claude' ? 'anthropic' : 'chat', model: 'synthetic-model', baseUrl: 'http://127.0.0.1:1/v1', noAuth: true, contextWindow: 128000, maxOutput: 1000 }));
  if (options.apiModel) profiles.push({ ...profiles[0], engine: 'codex', id: 'codex-api', protocol: 'responses', model: options.apiModel });
  await fs.writeFile(path.join(root, 'local-secrets/ai-config/connections.json'), JSON.stringify({ schemaVersion: 1, revision: 0, activeId: options.apiModel ? 'codex-api' : null, profiles }));
  const workspace = await createWorkspaceServer({ root, token });
  await new Promise(resolve => workspace.listen(0, '127.0.0.1', resolve));
  const proxy = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks), input = body.length ? JSON.parse(body) : {};
    const final = req.method === 'PATCH' && input.handoffDeliveredRequestId;
    if (rejectReads && req.method === 'GET' && req.url.startsWith('/sessions/') || final && writeFault === 'reject') { res.writeHead(503); res.end(JSON.stringify({ error: { code: 'SYNTHETIC_STORAGE', message: 'Synthetic storage unavailable' } })); return; }
    const response = await fetch(`http://127.0.0.1:${workspace.address().port}${req.url}`, { method: req.method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body.length ? { body } : {}) });
    const result = await response.text();
    if (final && writeFault.startsWith('drop-ack')) { if (writeFault === 'drop-ack-and-read') rejectReads = true; res.writeHead(503); res.end(JSON.stringify({ error: { code: 'LOST_ACK', message: 'Synthetic acknowledgement lost after commit' } })); return; }
    res.writeHead(response.status, { 'Content-Type': 'application/json' }); res.end(result);
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  await fs.writeFile(path.join(root, 'config/runtime.json'), JSON.stringify({ workspacePort: proxy.address().port, frontPort: 6120, agentPort: 4310, builderPort: 4312, reasoningEffort: 'medium', preferredModel: options.preferredModel }));
  const server = await createAgentServer({ root, AppServerClass: FakeCodex, OpenCodeProviderClass: providerClass('opencode'), ClaudeProviderClass: providerClass('claude') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); await server.startAgent();
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, data, method = data === undefined ? 'GET' : 'POST') => fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  return {
    root, base, token, server, workspace, prompts, request, finish, codexCalls,
    notify(message) { rpc.emit('notification', message); },
    disconnectCodex() { rpc.closed = true; rpc.emit('disconnect', Error('Synthetic disconnect')); },
    set autoComplete(value) { autoComplete = value; }, set ready(value) { ready = value; },
    set writeFault(value) { writeFault = value; if (!value) rejectReads = false; },
    delayCatalog() { let release; const gate = { entered: false, promise: new Promise(r => { release = r; }), release: () => release() }; gates.push(gate); catalogGate = gate; return gate; },
    async session(id) { return (await (await request(`/api/sessions/${id}`)).json()).session; },
    async switch(session, engine, extra = {}) { return request(`/api/sessions/${session.id}/engine`, { ...selections[engine], expectedEngineRevision: session.engineRevision || 0, ...extra }); },
    async chat(session, requestId, text = 'Synthetic question', extra = {}) {
      const response = await request('/api/chat', { ...(session ? { sessionId: session.id, engine: session.engine, providerId: session.providerId, modelId: session.modelId, engineRevision: session.engineRevision || 0 } : selections.codex), requestId, text, ...extra });
      const stream = response.text(); channels.push(stream);
      return { response, stream, id: response.headers.get('x-session-id') };
    },
    async cleanup() { for (const gate of gates) gate.release(); await server.shutdown(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); workspace.closeAllConnections(); await new Promise(r => workspace.close(r)); await Promise.allSettled(channels); await fs.rm(root, { recursive: true, force: true }); },
  };
}
