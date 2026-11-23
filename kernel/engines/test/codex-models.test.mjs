import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppServer } from '../rpc.mjs';
import { readCodexModels, defaultCodexModel, selectCodexModel, reportedModel } from '../codex-models.mjs';

const model = (id, extra = {}) => ({ model: id, displayName: `Label ${id}`, supportedReasoningEfforts: [{ reasoningEffort: 'low' }], defaultReasoningEffort: 'low', ...extra });
test('all model pages preserve model IDs, server labels, efforts and order; hidden entries are excluded', async () => {
  const calls = [], models = await readCodexModels({ call: async (method, params) => {
    calls.push({ method, params });
    return params.cursor ? { data: [model('second', { isDefault: true }), model('hidden', { hidden: true })], nextCursor: null } : { data: [model('first', { id: 'different-row-id' })], nextCursor: 'page2' };
  } });
  assert.deepEqual(models.map(item => item.id), ['first', 'second']); assert.equal(models[0].label, 'Label first');
  assert.equal(calls[1].params.cursor, 'page2'); assert.equal(calls[0].params.includeHidden, false);
  assert.equal(defaultCodexModel(models, 'second').warning, null);
  const choice = defaultCodexModel(models, 'missing'); assert.equal(choice.model, 'second'); assert.match(choice.warning, /Automatic selection/);
  assert.deepEqual(selectCodexModel({ models, defaultModelId: 'second', modelId: 'first', reasoningEffort: 'medium' }), { model: 'first', effort: 'low' });
  assert.throws(() => selectCodexModel({ models, defaultModelId: 'second', modelId: 'missing' }), { code: 'MODEL_NOT_AVAILABLE' });
});
test('partial page failure, invalid data, repeated cursor and empty catalog never produce a partial selection', async () => {
  let calls = 0;
  await assert.rejects(readCodexModels({ call: async () => { if (++calls > 1) throw Error('failed second page'); return { data: [model('first')], nextCursor: 'next' }; } }), /failed second page/);
  await assert.rejects(readCodexModels({ call: async () => ({ data: [model('first')], nextCursor: 'cycle' }) }), { code: 'MODEL_CATALOG_INVALID' });
  for (const data of [null, {}, [{ model: 'bad\nvalue' }]]) await assert.rejects(readCodexModels({ call: async () => ({ data }) }), { code: 'MODEL_CATALOG_INVALID' });
  assert.throws(() => defaultCodexModel([], 'missing'), { code: 'MODEL_NOT_AVAILABLE' });
});
test('API model stays exact and authoritative model evidence never invents an ID', () => {
  assert.deepEqual(selectCodexModel({ apiModel: 'custom', modelId: null, reasoningEffort: 'high' }), { model: 'custom', effort: null });
  assert.throws(() => selectCodexModel({ apiModel: 'custom', modelId: 'other' }), { code: 'MODEL_NOT_AVAILABLE' });
  for (const value of [undefined, null, '', 'bad\nmodel', {}, 'a'.repeat(241)]) assert.equal(reportedModel(value), null);
  assert.equal(reportedModel('native-reported'), 'native-reported');
});

const nativeCommand = process.env.SAPLING_TEST_CODEX_BIN;
test('native account catalog exposes GPT-6.2 and accepts an explicit thread model', { skip: !nativeCommand, timeout: 20000 }, async t => {
  const cache = fileURLToPath(new URL('../../../.cache/codex-models-native/', import.meta.url));
  await fs.mkdir(cache, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(cache, 'app-')));
  const codexHome = path.join(root, 'local-secrets/codex');
  await fs.mkdir(codexHome, { recursive: true, mode: 0o700 });
  const env = { PATH: process.env.PATH, CODEX_HOME: codexHome, OPENAI_BASE_URL: 'http://127.0.0.1:9/v1' };
  if (process.platform === 'win32') env.SystemRoot = process.env.SystemRoot;
  const client = new AppServer({
    cwd: root, command: nativeCommand, env,
    args: ['-c', 'cli_auth_credentials_store="file"', '-c', 'check_for_update_on_startup=false', '-c', 'chatgpt_base_url="http://127.0.0.1:9"']
  });
  t.after(async () => {
    await client.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  await client.call('initialize', { clientInfo: { name: 'saplingagent-model-test', version: '1.0.0' }, capabilities: { experimentalApi: true } }, 8000);
  client.send({ method: 'initialized', params: {} });
  assert.equal((await client.call('account/read', { refreshToken: false }, 8000)).account, null);
  const models = await readCodexModels(client);
  assert.ok(models.some(model => model.id === 'gpt-6.2-sol'));
  const { model } = selectCodexModel({ models, modelId: 'gpt-6.2-astra' });
  const thread = await client.call('thread/start', {
    cwd: root, model, ephemeral: true, sandbox: 'danger-full-access', approvalPolicy: 'never'
  }, 8000);
  assert.equal(thread.model, 'gpt-6.2-astra');
  assert.equal(thread.sandbox.type, 'dangerFullAccess');
  assert.equal(thread.approvalPolicy, 'never');
});
