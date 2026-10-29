import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { launchConfiguration } from '../runtime.mjs';

const receipt = { type: 'sapling-configuration', ok: true, port: 61234, instanceId: 'fixture' };
const address = { root: '/project', configurationHost: 'external', ...receipt };
test('runtime bridge waits for A exit, clears inherited launch ownership and requests the verified OS URL', async () => {
  const child = new EventEmitter(), calls = []; let settled = false;
  const task = launchConfiguration('/project', {
    env: { SAPLING_CONFIG_PARENT_PID: '123', SAPLING_CONFIGURATION_DIR: '/old', SAPLING_MANAGEMENT_PORT: '4318', NODE_OPTIONS: 'bad', SAPLING_SETUP_JOB: 'old' },
    launch(command, args, options) { calls.push({ command, args, options }); return child; },
    find: async () => address, open: async url => calls.push(url),
  }).then(result => { settled = true; return result; });
  child.emit('message', receipt); await new Promise(setImmediate); assert.equal(settled, false);
  assert.equal(calls[0].command, process.execPath); assert.deepEqual(calls[0].args, ['/project/kernel/launcher/entry.mjs', '--configuration-request', '--no-open']);
  assert.equal(calls[0].options.shell, false); assert.equal(calls[0].options.windowsHide, true);
  assert.deepEqual(calls[0].options.env, { SEED_ROOT: '/project', SAPLING_NO_OPEN: '1' });
  child.emit('exit', 0);
  assert.deepEqual(await task, { url: 'http://127.0.0.1:61234/', browserRequested: true });
  assert.equal(calls[1], 'http://127.0.0.1:61234/');
});
test('runtime bridge refuses stale/foreign discovery and keeps a verified URL when the browser fails', async () => {
  const launch = () => { const child = new EventEmitter(); queueMicrotask(() => { child.emit('message', receipt); child.emit('exit', 0); }); return child; };
  for (const found of [null, { ...address, root: '/other' }, { ...address, instanceId: 'old' }, { ...address, port: 4318 }]) {
    await assert.rejects(launchConfiguration('/project', { launch, find: async () => found, open: () => assert.fail('Must not open') }), { code: 'CONFIGURATION_START_FAILED' });
  }
  assert.deepEqual(await launchConfiguration('/project', { launch, find: async () => address, open: async () => { throw Error('No browser'); } }), { url: 'http://127.0.0.1:61234/', browserRequested: false });
});
test('spawn errors and nonzero exits report sanitized structured errors without child output', async () => {
  for (const kind of ['spawn', 'exit']) {
    await assert.rejects(launchConfiguration('/project', { launch() {
      const child = new EventEmitter(); queueMicrotask(() => {
        if (kind === 'spawn') child.emit('error', Error('private child details'));
        else { child.emit('message', { type: 'sapling-configuration', ok: false, code: 'UI_BUILD_FAILED' }); child.emit('exit', 1); }
      }); return child;
    } }), error => error.code === (kind === 'spawn' ? 'CONFIGURATION_START_FAILED' : 'UI_BUILD_FAILED') && !error.message.includes('private'));
  }
});
