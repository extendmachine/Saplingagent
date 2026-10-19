import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmationContent } from '../approval.mjs';
test('form confirmation only chooses a one-time option and rejects unknown required input', () => {
  assert.deepEqual(confirmationContent({ type: 'object', properties: { choice: { type: 'string', enum: ['Approve for session', 'Approve', 'Decline'] } }, required: ['choice'] }), { choice: 'Approve' });
  assert.equal(confirmationContent({ type: 'object', properties: { password: { type: 'string' } }, required: ['password'] }), null);
  assert.equal(confirmationContent({ type: 'object', properties: { choice: { type: 'string', enum: ['Approve for session', 'Decline'] } }, required: ['choice'] }), null);
  assert.deepEqual(confirmationContent({ type: 'object', properties: { confirm: { type: 'boolean' } }, required: ['confirm'] }), { confirm: true });
});
