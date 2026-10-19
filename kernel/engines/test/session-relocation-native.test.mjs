import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppServer } from '../rpc.mjs';
import { AppServer as Transport } from '../../contracts/codex-rpc.mjs';

// Optional native integration. The command is supplied by the test operator;
// shipping/runtime code has no dependency on a developer's checkout or account.
const command = process.env.SAPLING_TEST_CODEX_BIN;
test('pinned Codex resumes the same moved rollout without a model call or raw database rewrite', { skip: !command, timeout: 45000 }, async t => {
  assert.equal((await promisify(execFile)(command, ['--version'])).stdout.trim(), 'codex-cli 0.146.1');
  const cache = fileURLToPath(new URL('../../../.cache/session-relocation-native/', import.meta.url));
  await fs.mkdir(cache, { recursive: true });
  const fixture = await fs.realpath(await fs.mkdtemp(path.join(cache, 'move-')));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  const before = path.join(fixture, 'Before'), after = path.join(fixture, 'After'), threadId = randomUUID();
  const relative = path.join('local-secrets/codex/sessions/2026/10/19', `rollout-2026-10-19T10-22-03-${threadId}.jsonl`);
  const originalFile = path.join(before, relative);
  await fs.mkdir(path.dirname(originalFile), { recursive: true });
  const timestamp = '2026-10-19T10:22:03.000Z';
  await fs.writeFile(originalFile, JSON.stringify({ timestamp, type: 'session_meta', payload: {
    id: threadId, timestamp, cwd: before, originator: 'saplingagent-relocation-test', cli_version: '0.146.1', source: 'cli', model_provider: 'relocation_test', base_instructions: { text: 'Synthetic offline persistence test.' }, dynamic_tools: [],
  } }) + '\n' + JSON.stringify({ timestamp, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Synthetic stored message; do not send to a model.' }] } }) + '\n');
  const initialHash = createHash('sha256').update(await fs.readFile(originalFile)).digest('hex');
  let providerRequests = 0;
  const provider = http.createServer((_req, res) => { providerRequests++; res.writeHead(500); res.end('No inference is allowed in this test.'); });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { provider.closeAllConnections(); provider.close(resolve); }));
  const args = ['-c', 'model="synthetic-offline-model"', '-c', 'model_provider="relocation_test"', '-c', 'model_providers.relocation_test.name="Offline relocation test"', '-c', `model_providers.relocation_test.base_url="http://127.0.0.1:${provider.address().port}/v1"`, '-c', 'model_providers.relocation_test.wire_api="responses"', '-c', 'model_providers.relocation_test.requires_openai_auth=false', '-c', 'web_search="disabled"', '-c', 'check_for_update_on_startup=false'];
  const clients = new Set();
  t.after(async () => { for (const client of clients) await client.close(); });
  async function start(Client, root) {
    const env = { ...process.env, CODEX_HOME: path.join(root, 'local-secrets/codex'), SEED_ROOT: root };
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'SAPLING_CODEX_API_KEY']) delete env[key];
    const client = new Client({ cwd: root, command, args, env }); clients.add(client); client.on('disconnect', () => {});
    await client.call('initialize', { clientInfo: { name: 'saplingagent-relocation-test', version: '0.9.4' }, capabilities: { experimentalApi: true } });
    client.send({ method: 'initialized', params: {} });
    return client;
  }
  const params = { threadId, cwd: before, model: 'synthetic-offline-model', approvalPolicy: 'never', sandbox: 'danger-full-access', excludeTurns: true };
  const first = await start(Transport, before);
  const saved = await first.call('thread/resume', { ...params, path: originalFile });
  assert.equal(saved.thread.id, threadId);
  await first.close(); clients.delete(first);
  await fs.rename(before, after);
  const movedFile = path.join(after, relative);
  const dbPath = path.join(after, 'local-secrets/codex/state_5.sqlite');
  const readRow = () => {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try { return db.prepare('SELECT id,rollout_path,cwd FROM threads WHERE id=?').get(threadId); }
    finally { db.close(); }
  };
  assert.equal(readRow().rollout_path, originalFile, 'Native-created SQLite row must reproduce the original stale index.');
  const raw = await start(Transport, after);
  await assert.rejects(raw.call('thread/resume', { ...params, cwd: after }), /failed to resolve rollout path/);
  await raw.close(); clients.delete(raw);
  const adapted = await start(AppServer, after);
  const restored = await adapted.call('thread/resume', { ...params, cwd: after });
  assert.equal(restored.thread.id, threadId); assert.equal(restored.thread.path, movedFile); assert.equal(restored.cwd, after);
  // thread.cwd describes historical persisted metadata; top-level cwd is the
  // effective resumed configuration. Preserve the original session_meta bytes.
  assert.equal(restored.thread.cwd, before);
  await adapted.close(); clients.delete(adapted);
  assert.equal(createHash('sha256').update(await fs.readFile(movedFile)).digest('hex'), initialHash, 'Historical JSONL bytes must remain unchanged.');
  const row = readRow();
  // This assertion documents actual pinned native behavior, not an assumption
  // that Saplingagent can modify or delete Codex's private database schema.
  assert.equal(row.rollout_path, movedFile, 'Pinned native resume should persist the newly resolved path.');
  const reconnected = await start(Transport, after);
  const resumedAgain = await reconnected.call('thread/resume', { ...params, cwd: after });
  assert.equal(resumedAgain.thread.id, threadId); assert.equal(resumedAgain.thread.path, movedFile);
  await reconnected.close(); clients.delete(reconnected);
  assert.equal(providerRequests, 0, 'No model or provider request may be sent.');
});
