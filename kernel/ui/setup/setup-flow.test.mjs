import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAvailability, restartedFinalization, acceptedConfigurationJob, configurationClosed } from './setup-flow.ts';

test('AI setup starts after settings are saved, without requiring a directory move', () => {
  assert.deepEqual(setupAvailability(null, false, false, false), { configureAI: false, exportApp: false, finishSetup: false });
  assert.deepEqual(setupAvailability({ settingsSaved: true, exportReady: false }, true, false, true), { configureAI: true, exportApp: false, finishSetup: false });
  assert.equal(setupAvailability({ directoryReady: true }, false, false, true).configureAI, false);
});

test('external setup finishes only with saved settings and an actual ready launcher', () => {
  const ready = { configurationHost: 'external', settingsSaved: true, exportReady: true, launcher: { artifact: 'My project.app' }, job: { id: 'built', kind: 'configure', phase: 'completed' } };
  assert.equal(setupAvailability(ready, false, false, true).finishSetup, true);
  // A reopen can reuse a verified launcher without creating a new build job.
  assert.equal(setupAvailability({ ...ready, job: undefined }, false, false, true).finishSetup, true);
  for (const [dirty, aiDirty, aiReady] of [[true, false, true], [false, true, true], [false, false, false]]) {
    assert.equal(setupAvailability(ready, dirty, aiDirty, aiReady).finishSetup, false);
  }
  for (const update of [{ exportReady: false }, { launcher: undefined }, { launcher: { artifact: '' } }, { configurationHost: 'project' }, { job: { ...ready.job, phase: 'running' } }, { job: { ...ready.job, phase: 'failed' } }]) {
    assert.equal(setupAvailability({ ...ready, ...update }, false, false, true).finishSetup, false);
  }
  assert.equal(setupAvailability({ ...ready, job: { ...ready.job, phase: 'running' } }, false, false, true).exportApp, false);
});

test('external finalization accepts only the configuration job, never an old restart receipt or another operation', () => {
  for (const phase of ['running', 'completed']) {
    const result = { job: { id: 'configure-123', kind: 'configure', phase, lines: [] } };
    assert.deepEqual(acceptedConfigurationJob(result), { id: 'configure-123', kind: 'configure', phase });
  }
  for (const value of [null, {}, { finalization: { id: 'old' } }, { job: { id: 'x', kind: 'build', phase: 'running' } }, { job: { id: '', kind: 'configure', phase: 'running' } }, { job: { id: 'x', kind: 'configure', phase: 'failed' } }, { job: { id: 'x', kind: 'configure' } }]) {
    assert.equal(acceptedConfigurationJob(value), null);
  }
});

test('the completion page requires an accepted cleanup handoff in external mode', () => {
  assert.equal(configurationClosed({ closed: true, handoff: true }, true), true);
  assert.equal(configurationClosed({ closed: true }, false), true);
  for (const result of [null, {}, { closed: true }, { closed: true, handoff: false }, { handoff: true }, { closed: 'true', handoff: true }]) {
    assert.equal(configurationClosed(result, true), false);
  }
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
