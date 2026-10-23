import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handoffInput, HANDOFF_EXCERPT_CHARACTERS } from '../session-handoff.mjs';
import { handoffFixture, selections, until } from './handoff-fixture.mjs';
const events = raw => raw.split('\n\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
const dataIn = text => JSON.parse(text.split('Conversation history (JSON):\n')[1].split('\n\nCurrent user message:')[0]);

test('one logical conversation survives all engines, model change and returning to Codex; handoff stays invisible', async t => {
  const f = await handoffFixture(); t.after(() => f.cleanup());
  const first = await f.chat(null, 'first', 'Remember the project name Oak'); await first.stream;
  let session = await f.session(first.id); const firstThread = session.threadId;
  for (const [i, engine] of ['claude', 'opencode', 'codex'].entries()) {
    const before = structuredClone(session), count = f.prompts.length;
    const response = await f.switch(session, engine); assert.equal(response.status, 200, await response.clone().text());
    session = (await response.json()).session;
    assert.equal(f.prompts.length, count); assert.equal(session.id, first.id); assert.equal(session.title, before.title);
    assert.deepEqual(session.messages, before.messages); assert.deepEqual(session.requests, before.requests);
    assert.equal(session.engineRevision, i + 1); assert.equal(session.threadId, null); assert.equal(session.contextUsage, null);
    assert.equal(session.engineHistory.at(-1).threadId, before.threadId); assert.equal(session.handoff.status, 'pending');
    const ch = await f.chat(session, `switch-${i}`, 'Continue with that project');
    assert.equal(events(await ch.stream).at(-1).status, 'completed');
    const prompt = f.prompts.at(-1), context = dataIn(prompt.text);
    assert.equal(context.totalHistoricalMessages, before.messages.length); assert.equal(context.messages[0].text, 'Remember the project name Oak');
    assert.ok(prompt.text.includes('Current user message:\nContinue with that project'));
    if (engine === 'opencode') assert.ok(!prompt.options.context.includes('Conversation history (JSON)'));
    session = await f.session(first.id);
    assert.equal(session.handoff.status, 'delivered'); assert.equal(session.handoff.deliveredRequestId, `switch-${i}`);
    assert.equal(session.requests.at(-1).engineRevision, i + 1);
    assert.ok(!session.messages.some(m => m.text.includes('Conversation history (JSON)')));
  }
  assert.notEqual(session.threadId, firstThread);
  const same = await f.switch(session, 'codex'); assert.deepEqual((await same.json()).session, session);
  const normal = await f.chat(session, 'normal'); await normal.stream;
  assert.ok(!f.prompts.at(-1).text.includes('Conversation history (JSON)'));
  session = (await (await f.switch(await f.session(first.id), 'claude')).json()).session;
  const changed = (await (await f.switch(session, 'claude', { modelId: 'synthetic-second' })).json()).session;
  assert.equal(changed.modelId, 'synthetic-second'); assert.equal(changed.id, first.id);
  assert.equal((await (await f.request('/api/sessions')).json()).sessions.length, 1);
});

test('busy and catalog reservation reject chat/switch; unavailable targets and stale callers retain history', async t => {
  const f = await handoffFixture(); t.after(() => f.cleanup());
  f.autoComplete = false;
  const ch = await f.chat(null, 'busy'); await until(() => f.prompts.length === 1);
  let session = await f.session(ch.id); assert.equal((await f.switch(session, 'claude')).status, 409);
  f.finish(f.prompts[0]); await ch.stream; session = await f.session(ch.id);
  f.ready = false; assert.equal((await f.switch(session, 'claude')).status, 503); assert.deepEqual(await f.session(ch.id), session);
  f.ready = true;
  const gate = f.delayCatalog(), switching = f.switch(session, 'claude'); await until(() => gate.entered);
  assert.equal((await f.switch(session, 'opencode')).status, 409);
  assert.equal((await f.chat(session, 'blocked')).response.status, 409);
  gate.release(); assert.equal((await switching).status, 200);
  const switched = await f.session(ch.id);
  assert.equal((await f.switch(session, 'opencode')).status, 409);
  assert.equal((await f.request('/api/chat', { ...selections.claude, sessionId: ch.id, engineRevision: 0, requestId: 'stale', text: 'stale' })).status, 409);
  assert.equal((await f.chat(switched, 'busy')).response.status, 409);
  assert.equal(f.prompts.length, 1); assert.equal(switched.messages.length, session.messages.length);
});

test('interrupted/failed handoff remains pending through reload and retry; successful current request delivers it', async t => {
  const f = await handoffFixture(); t.after(() => f.cleanup());
  const first = await f.chat(null, 'first'); await first.stream;
  let session = (await (await f.switch(await f.session(first.id), 'claude')).json()).session;
  const handoffId = session.handoff.id; f.autoComplete = false;
  for (const result of ['failed', 'interrupted']) {
    const before = f.prompts.length, ch = await f.chat(session, 'retry-me'); await until(() => f.prompts.length > before);
    f.finish(f.prompts.at(-1), result); assert.equal(events(await ch.stream).at(-1).status, result);
    session = await f.session(first.id); assert.equal(session.handoff.status, 'pending'); assert.equal(session.handoff.id, handoffId);
    assert.equal(dataIn(f.prompts.at(-1).text).totalHistoricalMessages, 2);
  }
  f.autoComplete = true; const ch = await f.chat(session, 'retry-me'); await ch.stream;
  session = await f.session(first.id); assert.equal(session.handoff.status, 'delivered'); assert.equal(session.handoff.id, handoffId);
  const disk = JSON.parse(await fs.readFile(path.join(f.root, 'data/workspace/sessions', `${first.id}.json`)));
  assert.deepEqual(disk.handoff, session.handoff); assert.equal(session.messages.filter(m => m.id === 'retry-me').length, 1);
});

test('bounded history labels roles, omitted messages, partial content and unavailable attachments honestly', async () => {
  const session = { id: 'session', engineRevision: 1, handoff: { id: 'handoff', status: 'pending', bindingRevision: 1, throughMessageId: 'huge' }, messages: [{ id: 'old', role: 'user', text: 'old'.repeat(10000) }, { id: 'huge', role: 'assistant', status: 'interrupted', text: '\u0001'.repeat(90000), attachments: [{ id: 'file1', name: 'Report' }] }, { id: 'new', role: 'user', text: 'current' }] };
  const before = structuredClone(session);
  const input = await handoffInput({ root: '/synthetic/project', session, text: 'current', attachment: async () => { throw Error('missing'); } });
  const data = dataIn(input);
  assert.equal(data.totalHistoricalMessages, 2); assert.equal(data.omittedMessages, 1); assert.equal(data.partialMessage, true);
  assert.ok(JSON.stringify(data.messages).length <= HANDOFF_EXCERPT_CHARACTERS);
  assert.equal(data.messages[0].role, 'assistant'); assert.equal(data.messages[0].status, 'interrupted');
  assert.match(data.files[0].status, /unavailable/); assert.deepEqual(session, before);
  session.handoff.throughMessageId = 'missing';
  await assert.rejects(handoffInput({ root: '/synthetic/project', session, text: 'current' }), { code: 'HANDOFF_HISTORY_UNAVAILABLE' });
});

for (const fault of ['reject', 'drop-ack', 'drop-ack-and-read']) test(`final storage ${fault}: consistent delivery and no duplicate completed inference`, async t => {
  const f = await handoffFixture(); t.after(() => f.cleanup());
  const first = await f.chat(null, 'first'); await first.stream;
  let session = (await (await f.switch(await f.session(first.id), 'claude')).json()).session;
  f.writeFault = fault;
  const next = await f.chat(session, 'after-switch'), result = events(await next.stream).at(-1);
  assert.equal(result.status, fault === 'drop-ack' ? 'completed' : 'failed');
  let disk = JSON.parse(await fs.readFile(path.join(f.root, 'data/workspace/sessions', `${first.id}.json`)));
  assert.equal(disk.handoff.status, fault === 'reject' ? 'pending' : 'delivered');
  if (fault !== 'drop-ack') assert.equal((await f.switch(session, 'opencode')).status, 409);
  f.writeFault = '';
  const count = f.prompts.length, retry = await f.chat(session, 'after-switch');
  assert.equal(events(await retry.stream).at(-1).status, 'completed');
  assert.equal(f.prompts.length, count);
  session = await f.session(first.id);
  assert.equal(session.handoff.status, 'delivered'); assert.equal(session.handoff.deliveredRequestId, 'after-switch');
  assert.equal(session.requests.find(r => r.id === 'after-switch').status, 'completed');
  assert.equal((await f.switch(session, 'opencode')).status, 200);
});

test('old provider callbacks cannot overwrite a later binding and history resolves attachment files', async t => {
  const f = await handoffFixture(); t.after(() => f.cleanup());
  const uploaded = await f.request('/api/attachments', { name: 'Project notes.txt', contentType: 'text/plain', data: Buffer.from('Synthetic file content').toString('base64') });
  assert.equal(uploaded.status, 201);
  const attachment = (await uploaded.json()).attachment;
  const first = await f.chat(null, 'with-file', 'Read this file', { attachmentIds: [attachment.id] }); await first.stream;
  let session = (await (await f.switch(await f.session(first.id), 'claude')).json()).session;
  const next = await f.chat(session, 'next'); await next.stream;
  const entry = f.prompts.at(-1), data = dataIn(entry.text);
  assert.equal(data.files[0].id, attachment.id); assert.equal(data.files[0].status, 'available');
  assert.equal(await fs.readFile(data.files[0].path, 'utf8'), 'Synthetic file content');
  session = (await (await f.switch(await f.session(first.id), 'opencode')).json()).session;
  await assert.rejects(entry.run.save(), { status: 409 });
  assert.deepEqual(await f.session(first.id), session);
  f.finish(entry); await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(await f.session(first.id), session);
});
