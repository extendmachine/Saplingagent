import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSessionSelection, validateEngineSelection } from '../providers/contract.mjs';

test('provider selection defaults to Codex and validates OpenCode coordinates', () => {
  assert.deepEqual(validateEngineSelection({}), { engine: 'codex', providerId: null, modelId: null });
  assert.deepEqual(validateEngineSelection({ engine: 'opencode', providerId: 'anthropic', modelId: 'claude-sonnet-4-6' }), { engine: 'opencode', providerId: 'anthropic', modelId: 'claude-sonnet-4-6' });
  assert.throws(() => validateEngineSelection({ engine: 'opencode', providerId: 'anthropic' }), error => error.code === 'INVALID_ENGINE_SELECTION');
  assert.throws(() => validateEngineSelection({ engine: 'codex', modelId: 'override' }), error => error.code === 'INVALID_ENGINE_SELECTION');
});

test('saved session engine is immutable and legacy sessions remain Codex', () => {
  assert.equal(assertSessionSelection({}).engine, 'codex');
  const session = { engine: 'opencode', providerId: 'anthropic', modelId: 'claude-sonnet-4-6' };
  assert.deepEqual(assertSessionSelection(session, session), session);
  assert.throws(() => assertSessionSelection(session, { engine: 'codex' }), error => error.code === 'SESSION_ENGINE_MISMATCH' && error.status === 409);
});

test('Claude requires model coordinates and rejects changing a saved engine',()=>{const selection={engine:'claude',providerId:'sapling-synthetic',modelId:'synthetic-claude'};assert.deepEqual(validateEngineSelection(selection),selection);assert.throws(()=>validateEngineSelection({engine:'claude'}));assert.throws(()=>assertSessionSelection(selection,{engine:'opencode',providerId:'sapling-synthetic',modelId:'synthetic-claude'}));});
