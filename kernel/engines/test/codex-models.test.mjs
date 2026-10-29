import test from 'node:test';
import assert from 'node:assert/strict';
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
