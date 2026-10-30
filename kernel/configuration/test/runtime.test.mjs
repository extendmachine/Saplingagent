import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchConfiguration } from '../runtime.mjs';

const receipt = { type: 'sapling-configuration', ok: true, configurationMode: 'ai', port: 61234, instanceId: 'fixture' };
const addressFor = root => ({ root, configurationHost: 'external', ...receipt });
async function fixture(t) {
  const parent = fileURLToPath(new URL('../../../.cache/configuration-runtime-tests/', import.meta.url));
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'root-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return fs.realpath(directory);
}
const successfulLaunch = () => {
  const child = new EventEmitter();
  queueMicrotask(() => { child.emit('message', receipt); child.emit('exit', 0); });
  return child;
};
test('runtime bridge waits for A exit, clears inherited launch ownership and requests the verified OS URL', async t => {
  const root = await fixture(t), address = addressFor(root);
  const child = new EventEmitter(), calls = []; let settled = false;
  let didLaunch; const launched = new Promise(resolve => { didLaunch = resolve; });
  const task = launchConfiguration(root, {
    env: { SAPLING_CONFIG_PARENT_PID: '123', SAPLING_CONFIGURATION_DIR: '/old', SAPLING_MANAGEMENT_PORT: '4318', NODE_OPTIONS: 'bad', SAPLING_SETUP_JOB: 'old' },
    launch(command, args, options) { calls.push({ command, args, options }); didLaunch(); return child; },
    find: async () => address, open: async url => calls.push(url),
  }).then(result => { settled = true; return result; });
  await launched;
  child.emit('message', receipt); await new Promise(setImmediate); assert.equal(settled, false);
  assert.equal(calls[0].command, process.execPath); assert.deepEqual(calls[0].args, [path.join(root, 'kernel/launcher/entry.mjs'), '--configuration-request', '--ai-only', '--no-open']);
  assert.equal(calls[0].options.shell, false); assert.equal(calls[0].options.windowsHide, true);
  assert.deepEqual(calls[0].options.env, { SEED_ROOT: root, SAPLING_NO_OPEN: '1' });
  child.emit('exit', 0);
  assert.deepEqual(await task, { url: 'http://127.0.0.1:61234/', browserRequested: true });
  assert.equal(calls[1], 'http://127.0.0.1:61234/');
});
test('runtime bridge refuses stale/foreign discovery and keeps a verified URL when the browser fails', async t => {
  const root = await fixture(t), address = addressFor(root), launch = successfulLaunch;
  for (const found of [null, { ...address, root: path.join(root, 'other') }, { ...address, instanceId: 'old' }, { ...address, port: 4318 }, { ...address, configurationHost: 'internal' }, { ...address, configurationMode: 'setup' }]) {
    await assert.rejects(launchConfiguration(root, { launch, find: async () => found, open: () => assert.fail('Must not open') }), { code: 'CONFIGURATION_START_FAILED' });
  }
  assert.deepEqual(await launchConfiguration(root, { launch, find: async () => address, open: async () => { throw Error('No browser'); } }), { url: 'http://127.0.0.1:61234/', browserRequested: false });
});
test('spawn errors and nonzero exits report sanitized structured errors without child output', async t => {
  const root = await fixture(t);
  for (const kind of ['spawn', 'exit']) {
    await assert.rejects(launchConfiguration(root, { launch() {
      const child = new EventEmitter(); queueMicrotask(() => {
        if (kind === 'spawn') child.emit('error', Error('private child details'));
        else { child.emit('message', { type: 'sapling-configuration', ok: false, code: 'UI_BUILD_FAILED' }); child.emit('exit', 1); }
      }); return child;
    } }), error => error.code === (kind === 'spawn' ? 'CONFIGURATION_START_FAILED' : 'UI_BUILD_FAILED') && !error.message.includes('private'));
  }
});

test('equivalent project paths use one real root for bootstrap and discovery', async t => {
  const root = await fixture(t), project = path.join(root, 'Project');
  await fs.mkdir(project);
  const alias = path.join(root, 'Alias');
  await fs.symlink(project, alias, process.platform === 'win32' ? 'junction' : 'dir');
  for (const supplied of [project + path.sep, project + path.sep + '.', alias, path.relative(process.cwd(), project)]) {
    const result = await launchConfiguration(supplied, {
      launch(command, args, options) {
        assert.equal(options.cwd, project);
        assert.equal(options.env.SEED_ROOT, project);
        assert.equal(args[0], path.join(project, 'kernel/launcher/entry.mjs'));
        return successfulLaunch();
      },
      find: async actual => { assert.equal(actual, project); return addressFor(project); },
      open: async () => {},
    });
    assert.equal(result.browserRequested, true);
  }
});

test('missing project root fails before bootstrap without exposing filesystem details', async t => {
  const root = await fixture(t);
  await assert.rejects(launchConfiguration(path.join(root, 'missing-private-project'), {
    launch: () => assert.fail('Must not launch'), find: () => assert.fail('Must not discover'), open: () => assert.fail('Must not open'),
  }), error => error.code === 'CONFIGURATION_START_FAILED' && !error.message.includes(root));
});
