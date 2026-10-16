import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(await fs.readFile(new URL('../features/runtime-control/restart-reload.ts', import.meta.url), 'utf8'));
const { completedRestart, readRestartMarker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const marker = { instanceId: 'manager', generation: 3 };
test('full restart waits through old status and busy readiness, then refreshes after the new generation', () => {
  assert.equal(completedRestart(marker, { ...marker, busy: false, phase: 'ready' }), false);
  assert.equal(completedRestart(marker, { ...marker, generation: 4, busy: true, phase: 'ready' }), false);
  assert.equal(completedRestart(marker, { ...marker, generation: 4, busy: false, phase: 'failed' }), false);
  assert.equal(completedRestart(marker, { ...marker, generation: 4, busy: false, phase: 'ready' }), true);
  assert.equal(completedRestart(null, { ...marker, generation: 5, busy: false, phase: 'ready' }), false);
});
test('ready replacement manager refreshes a pending restart, while denied storage still permits in-memory recovery', () => {
  const denied = { getItem() { throw Error('Storage denied'); } };
  assert.equal(readRestartMarker(denied, 'key'), null);
  assert.equal(completedRestart(marker, { instanceId: 'replacement', generation: 1, busy: false, phase: 'ready' }), true);
  assert.deepEqual(readRestartMarker({ getItem: () => JSON.stringify(marker) }, 'key'), marker);
  for (const value of ['broken', '{}', '{"instanceId":"manager","generation":null}']) assert.equal(readRestartMarker({ getItem: () => value }, 'key'), null);
});
