import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAvailability, restartedFinalization } from './setup-flow.ts';

test('AI setup starts after settings are saved, without requiring a directory move', () => {
  assert.deepEqual(setupAvailability(null, false, false, false), { configureAI: false, exportApp: false });
  assert.deepEqual(setupAvailability({ settingsSaved: true, exportReady: false }, true, false, true), { configureAI: true, exportApp: false });
  assert.equal(setupAvailability({ directoryReady: true }, false, false, true).configureAI, false);
});

test('export needs a verified restart and current saved identity and AI', () => {
  const ready = { settingsSaved: true, exportReady: true };
  assert.equal(setupAvailability(ready, false, false, true).exportApp, true);
  for (const [dirty, aiDirty, aiReady] of [[true, false, true], [false, true, true], [false, false, false]]) {
    assert.equal(setupAvailability(ready, dirty, aiDirty, aiReady).exportApp, false);
  }
  assert.equal(setupAvailability({ settingsSaved: true, finalization: { id: 'job', phase: 'ready' } }, false, false, true).exportApp, false);
});

test('post-shutdown health must match the accepted handoff before reloading the rotated-token page', () => {
  for (const phase of ['saved', 'waiting-release', 'restarting', undefined]) {
    assert.equal(restartedFinalization({ finalization: { id: 'mine', phase } }, 'mine'), false);
  }
  for (const phase of ['ready', 'failed']) {
    assert.equal(restartedFinalization({ finalization: { id: 'mine', phase } }, 'mine'), true);
    assert.equal(restartedFinalization({ finalization: { id: 'another-project', phase } }, 'mine'), false);
  }
  for (const health of [null, undefined, {}, 'ready', { phase: 'ready' }]) {
    assert.equal(restartedFinalization(health, 'mine'), false);
  }
});
