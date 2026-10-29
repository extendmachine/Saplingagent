import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handoffFixture, until } from './handoff-fixture.mjs';
import { toolFingerprint } from '../../../contracts/agent-tools.mjs';

const model = (name, effort = 'medium') => ({ model: name, displayName: `Label ${name}`, isDefault: name === 'first', supportedReasoningEfforts: [{ reasoningEffort: effort }], defaultReasoningEffort: effort });
const catalog = async p => p.cursor ? { data: [model('second', 'low')], nextCursor: null } : { data: [model('first')], nextCursor: 'second-page' };
const choices = f => f.request('/api/engines?refresh=codex').then(r => r.json()).then(r => r.engines.find(item => item.id === 'codex'));
const events = raw => raw.split('\n\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));

test('complete catalog, explicit choice, model-only switch and native resume preserve one conversation', async t => {
  const f = await handoffFixture({ codexCatalog: catalog, codexReport: value => value, preferredModel: 'missing-preference' }); t.after(() => f.cleanup());
  const engine = await choices(f);
  assert.deepEqual(engine.models.map(item => item.id), ['first', 'second']); assert.equal(engine.modelSelection, 'account'); assert.equal(engine.defaultModelId, 'first');
  assert.equal(engine.requestedModel, 'missing-preference'); assert.match(engine.modelWarning, /Automatic selection/); assert.equal(engine.modelCatalogError, null);
  const first = await f.chat(null, 'first-request', 'Remember this project', { modelId: 'first' });
  assert.equal(first.response.status, 200);
  assert.equal(events(await first.stream).at(-1).status, 'completed');
  let session = await f.session(first.id); const before = structuredClone(session);
  assert.equal(session.modelUsage.actualModel, 'first'); assert.equal(session.modelUsage.source, 'thread/start');
  const switched = await f.switch(session, 'codex', { modelId: 'second' }); assert.equal(switched.status, 200, await switched.clone().text());
  session = (await switched.json()).session;
  assert.equal(session.threadId, before.threadId); assert.deepEqual(session.messages, before.messages); assert.deepEqual(session.engineHistory, before.engineHistory);
  assert.equal(session.engineRevision, 1); assert.equal(session.contextUsage, null); assert.equal(session.modelUsage, null); assert.equal(session.handoff, before.handoff);
  const next = await f.chat(session, 'second-request'); assert.equal(events(await next.stream).at(-1).status, 'completed');
  assert.equal(f.prompts.at(-1).model, 'second'); assert.equal(f.prompts.at(-1).effort, 'low'); assert.doesNotMatch(f.prompts.at(-1).text, /Conversation history \(JSON\)/);
  const resume = f.codexCalls.findLast(call => call.method === 'thread/resume');
  assert.equal(resume.params.threadId, before.threadId); assert.equal(resume.params.model, 'second'); assert.equal(resume.params.config.model_reasoning_effort, 'low');
  session = await f.session(first.id); assert.equal(session.modelUsage.requestedModel, 'second'); assert.equal(session.modelUsage.actualModel, 'second'); assert.equal(session.modelUsage.source, 'thread/resume');
  const disk = JSON.parse(await fs.readFile(path.join(f.root, 'data/workspace/sessions', `${session.id}.json`), 'utf8'));
  assert.deepEqual(disk.modelUsage, session.modelUsage);
});

test('concurrent Codex sessions keep distinct models/efforts; authoritative reroutes are scoped to the current turn', async t => {
  const f = await handoffFixture({ codexCatalog: catalog, codexReport: value => value }); t.after(() => f.cleanup()); f.autoComplete = false;
  const first = await f.chat(null, 'parallel-one', 'First', { modelId: 'first' });
  const second = await f.chat(null, 'parallel-two', 'Second', { modelId: 'second' });
  await until(() => f.prompts.length === 2);
  const [one, two] = f.prompts;
  assert.equal(one.model, 'first'); assert.equal(one.effort, 'medium'); assert.equal(two.model, 'second'); assert.equal(two.effort, 'low');
  f.notify({ method: 'model/rerouted', params: { threadId: one.threadId, turnId: 'stale-turn', fromModel: 'first', toModel: 'stale' } });
  f.notify({ method: 'model/rerouted', params: { threadId: one.threadId, turnId: one.turnId, fromModel: 'first', toModel: 'actual-route' } });
  await until(async () => (await f.session(first.id)).modelUsage.actualModel === 'actual-route');
  assert.equal((await f.session(second.id)).modelUsage.actualModel, 'second');
  f.finish(one); f.finish(two); await first.stream; await second.stream;
  let session = await f.session(first.id); assert.equal(session.modelUsage.source, 'model/rerouted'); assert.equal(session.modelUsage.requestedModel, 'first');
  const next = await f.chat(session, 'parallel-next'); await until(() => f.prompts.length === 3);
  f.notify({ method: 'model/rerouted', params: { threadId: one.threadId, turnId: one.turnId, toModel: 'late-old-route' } });
  session = await f.session(first.id); assert.equal(session.modelUsage.requestId, 'parallel-one'); assert.equal(session.modelUsage.actualModel, 'actual-route'); assert.equal(session.modelUsage.source, 'model/rerouted');
  f.finish(f.prompts[2]); await next.stream;
});

test('vanished explicit models and refresh failures reject before appending; failed requests retry without downgrade', async t => {
  let current = [model('first'), model('second', 'low')], fail = false;
  const f = await handoffFixture({ codexCatalog: async () => { if (fail) throw Error('private upstream detail'); return { data: current }; } }); t.after(() => f.cleanup());
  const first = await f.chat(null, 'valid', 'History', { modelId: 'second' }); await first.stream;
  let session = await f.session(first.id); const before = structuredClone(session), count = f.prompts.length;
  assert.equal(session.modelUsage.actualModel, null); assert.equal(session.modelUsage.source, 'unreported');
  current = [model('first')];
  const vanished = await f.chat(session, 'vanished'); assert.equal(vanished.response.status, 400); assert.equal(JSON.parse(await vanished.stream).error.code, 'MODEL_NOT_AVAILABLE');
  assert.deepEqual(await f.session(first.id), before); assert.equal(f.prompts.length, count);
  const absent = await f.chat(null, 'invalid-new', 'Do not create', { modelId: 'missing' }); assert.equal(absent.response.status, 400); await absent.stream;
  assert.equal((await (await f.request('/api/sessions')).json()).sessions.length, 1);
  fail = true; const engine = await choices(f); assert.ok(engine.modelCatalogError); assert.deepEqual(engine.models.map(item => item.id), ['first']); assert.doesNotMatch(engine.modelCatalogError, /private upstream/);
  const blocked = await f.chat(session, 'retry'); assert.equal(blocked.response.status, 503); await blocked.stream; assert.deepEqual(await f.session(first.id), before);
  const rejected = await f.switch(session, 'codex', { modelId: 'first' }); assert.equal(rejected.status, 503); assert.deepEqual(await f.session(first.id), before);
  fail = false; current = [model('first'), model('second', 'low')]; f.autoComplete = false;
  const interrupted = await f.chat(session, 'retry'); await until(() => f.prompts.length === count + 1); f.finish(f.prompts.at(-1), 'failed'); await interrupted.stream;
  session = await f.session(first.id); f.autoComplete = true;
  const retry = await f.chat(session, 'retry'); assert.equal(events(await retry.stream).at(-1).status, 'completed');
  session = await f.session(first.id); assert.equal(session.messages.filter(m => m.id === 'retry').length, 1); assert.equal(f.prompts.at(-1).model, 'second');
});

test('API profile stays fixed and exposes no unrelated native catalog', async t => {
  const f = await handoffFixture({ apiModel: 'custom-api-model', codexCatalog: () => { throw Error('must not query account catalog'); } }); t.after(() => f.cleanup());
  const engine = await choices(f); assert.equal(engine.modelSelection, 'api'); assert.equal(engine.model, 'custom-api-model'); assert.deepEqual(engine.models, []); assert.equal(engine.modelCatalogError, null);
  const wrong = await f.chat(null, 'wrong', 'Wrong model', { modelId: 'other-account-model' }); assert.equal(wrong.response.status, 400); await wrong.stream;
  const normal = await f.chat(null, 'correct'); assert.equal(events(await normal.stream).at(-1).status, 'completed'); assert.equal(f.prompts.at(-1).model, 'custom-api-model'); assert.equal(f.prompts.at(-1).effort, null);
  assert.equal(f.codexCalls.some(call => call.method === 'model/list'), false);
});

test('reroute before turn acknowledgement waits for its confirmed turn and streams/persists actual evidence', async t => {
  const f = await handoffFixture({ codexCatalog: catalog, beforeTurnAck: (entry, rpc) => {
    rpc.emit('notification', { method: 'model/rerouted', params: { threadId: entry.threadId, turnId: 'unrelated', toModel: 'wrong' } });
    rpc.emit('notification', { method: 'model/rerouted', params: { threadId: entry.threadId, turnId: entry.turnId, fromModel: entry.model, toModel: 'reported-before-ack', reason: 'synthetic' } });
  } }); t.after(() => f.cleanup());
  const reply = await f.chat(null, 'early-reroute', 'Test', { modelId: 'second' });
  const received = events(await reply.stream);
  assert.ok(received.some(event => event.session?.modelUsage?.actualModel === 'reported-before-ack'));
  const session = await f.session(reply.id);
  assert.equal(session.modelUsage.actualModel, 'reported-before-ack'); assert.equal(session.modelUsage.requestedModel, 'second'); assert.equal(session.modelUsage.source, 'model/rerouted');
});

test('refresh reconnects closed Codex without inference and task records use the frozen session model', async t => {
  const f = await handoffFixture({ codexCatalog: catalog }); t.after(() => f.cleanup());
  f.disconnectCodex(); const engine = await choices(f);
  assert.equal(engine.ready, true); assert.equal(engine.modelCatalogError, null); assert.equal(f.prompts.length, 0);
  assert.equal(f.codexCalls.filter(call => call.method === 'initialize').length, 2);
  f.autoComplete = false; const reply = await f.chat(null, 'task-model', 'Synthetic task', { modelId: 'second' }); await until(() => f.prompts.length === 1);
  const current = f.prompts[0], args = { modification: true };
  await fs.writeFile(path.join(f.root, 'AI_TASKS.md'), '# Synthetic task index\n');
  f.notify({ method: 'item/started', params: { threadId: current.threadId, turnId: current.turnId, item: { id: 'mutation', type: 'mcpToolCall', server: 'seedagent', tool: 'project_context', arguments: args } } });
  const registered = await f.request('/internal/register-task', { tool: 'project_context', fingerprint: toolFingerprint('project_context', args) });
  assert.equal(registered.status, 200, await registered.clone().text()); f.finish(current); await reply.stream;
  const receipt = await fs.readFile(path.join(f.root, 'backend/agent-runtime/ai-tasks/runtime/RUN-task-model.md'), 'utf8');
  assert.match(receipt, /model second\./); assert.doesNotMatch(receipt, /model first\./);
});

test('reconnect failure is an explicit catalog error; refresh can recover without changing sessions', async t => {
  let fail = false;
  const f = await handoffFixture({ codexCatalog: catalog, codexInitialize: () => { if (fail) throw Error('Synthetic startup failure'); return {}; } }); t.after(() => f.cleanup());
  f.disconnectCodex(); fail = true;
  const unavailable = await choices(f); assert.equal(unavailable.ready, false); assert.ok(unavailable.modelCatalogError); assert.deepEqual(unavailable.models.map(item => item.id), ['first', 'second']);
  fail = false; const restored = await choices(f); assert.equal(restored.ready, true); assert.equal(restored.modelCatalogError, null); assert.equal(f.prompts.length, 0);
});
