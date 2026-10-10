import test from 'node:test';
import assert from 'node:assert/strict';
import { toolFingerprint } from '../../../contracts/agent-tools.mjs';
test('MCP context matches parsed/reordered input and validated trimming', () => {
  const original = { reason: '  Add a title ', files: [{ path: 'front/App.tsx', content: '\u4f60\u597d', expectedHash: null }] };
  const parsed = { files: [{ expectedHash: null, content: '\u4f60\u597d', path: 'front/App.tsx' }], reason: 'Add a title' };
  assert.equal(toolFingerprint('page_propose', original), toolFingerprint('page_propose', JSON.stringify(parsed)));
  assert.notEqual(toolFingerprint('page_propose', original), toolFingerprint('page_apply', original));
  assert.equal(toolFingerprint('preferences_set', { key: ' color ', value: 'green', evidence: ' always green ' }), toolFingerprint('preferences_set', { evidence: 'always green', value: 'green', key: 'color' }));
});
