import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ProjectLauncher } from '../manager.mjs';
import { beginFinalization, cleanupExitedHelper } from '../finalization.mjs';
import { compileLauncher } from '../build.mjs';
import { stopRuntime } from '../../scripts/runtime-stop.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(t) {
  const base = path.join(repo, '.cache/reliability-fixtures'); await fs.mkdir(base, { recursive: true });
  const parent = await fs.mkdtemp(path.join(base, 'failure-')); t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'Project'); await fs.mkdir(root); return { parent, root };
}

test('PowerShell environment references in shipped sources use the environment drive', async () => {
  const failures = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (['node_modules', '.cache', 'test'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && !entry.name.includes('.test.') && /\.(?:mjs|ps1|sh)$/.test(file) && /\$env\.[A-Za-z_]/.test(await fs.readFile(file, 'utf8'))) failures.push(path.relative(repo, file));
    }
  }
  await walk(path.join(repo, 'kernel')); assert.deepEqual(failures, []);
});

test('management startup cancellation terminates only its own child before returning', { timeout: 10000 }, async t => {
  const { root } = await fixture(t); await fs.mkdir(path.join(root, 'scripts'));
  await fs.writeFile(path.join(root, 'scripts/dev.mjs'), `import fs from 'node:fs';process.on('SIGTERM',()=>process.exit(0));fs.writeFileSync('owned-pid',String(process.pid));setInterval(()=>{},1000);`);
  const manager = new ProjectLauncher(root); manager.abortController = new AbortController(); manager.runtime = async () => ({ phase: 'stopped' });
  const work = manager.startConfiguredProject(); const rejected = assert.rejects(work, { code: 'PROJECT_CANCELLED' });
  let pid; for (let i = 0; i < 100; i++) { try { pid = Number(await fs.readFile(path.join(root, 'owned-pid'))); break; } catch {} await delay(15); }
  assert.ok(pid); t.after(async () => { const child = manager.appChild; if (child?.exitCode === null && !child.signalCode) await manager.cancelOwnedStartup(child); });
  manager.abortController.abort(); await rejected;
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('shutdown retries a failed child stop once and truthfully reports final failure', async () => {
  for (const persistent of [false, true]) {
    let stops = 0, cleanup = 0, servers = 0; const messages = [];
    const code = await stopRuntime({ release: async () => {}, closeConnections() {}, closeServers: async () => { servers++; }, stopChildren: async () => { if (++stops === 1 || persistent) throw Error('synthetic stop failure'); }, cleanup: async () => { cleanup++; }, report: phase => messages.push(phase) });
    assert.equal(stops, 2); assert.equal(servers, persistent ? 0 : 1); assert.equal(code, persistent ? 1 : 0); assert.equal(cleanup, persistent ? 0 : 1);
    assert.deepEqual(messages, persistent ? ['retry', 'stop-failed'] : ['retry']);
  }
});

test('server-close errors are observed while child shutdown still completes', async () => {
  let stopped = false;
  const code = await stopRuntime({ release: async () => {}, closeConnections() {}, closeServers: async () => { throw Error('server failure'); }, stopChildren: async () => { stopped = true; }, cleanup: async () => {} });
  assert.equal(code, 1); assert.equal(stopped, true);
});

test('early helper exit cleans its own verified sibling and releases leases', async t => {
  const { parent, root } = await fixture(t); await fs.mkdir(path.join(root, '.runtime'));
  const management = { pid: process.pid, port: 62025, instanceId: randomUUID() };
  await fs.writeFile(path.join(root, '.runtime/management-address.json'), JSON.stringify({ ...management, root }));
  await assert.rejects(beginFinalization(root, { management, project: { projectId: randomUUID(), folderName: 'Project' }, platform: 'darwin', node: path.join(root, '.runtime/node'), spawnHelper() { const child = new EventEmitter(); Object.assign(child, { pid: process.pid, exitCode: 1, signalCode: null, unref() {} }); queueMicrotask(() => child.emit('spawn')); return child; } }), { code: 'PROJECT_HELPER_START_FAILED' });
  assert.deepEqual(await fs.readdir(parent), ['Project']);
  await assert.rejects(fs.access(path.join(root, '.runtime/project-finalization.json')));
  await assert.rejects(fs.access(path.join(root, '.runtime/kernel-operation.lock')));
});

test('parent helper cleanup preserves live, replaced and symlinked directories', async t => {
  const { parent, root } = await fixture(t), directory = await fs.mkdtemp(path.join(parent, 'sapling-setup-'));
  const stat = await fs.lstat(directory), job = { previousRoot: root, targetRoot: root, helper: { name: path.basename(directory), device: String(stat.dev), inode: String(stat.ino) } };
  await fs.writeFile(path.join(directory, 'retained'), 'owned');
  assert.equal(await cleanupExitedHelper(directory, job, { pid: process.pid, exitCode: null }), false);
  assert.equal(await cleanupExitedHelper(directory, job, { pid: process.pid }), false);
  assert.equal(await cleanupExitedHelper(directory, { ...job, helper: { ...job.helper, inode: 'incorrect' } }, { pid: process.pid, exitCode: 1 }), false);
  assert.equal(await fs.readFile(path.join(directory, 'retained'), 'utf8'), 'owned');
  if (process.platform !== 'win32') {
    const elsewhere = path.join(parent, 'replacement'); await fs.rename(directory, elsewhere); await fs.symlink(elsewhere, directory, 'dir');
    assert.equal(await cleanupExitedHelper(directory, job, { pid: process.pid, exitCode: 1 }), false); assert.equal(await fs.readFile(path.join(elsewhere, 'retained'), 'utf8'), 'owned');
    await fs.unlink(directory); await fs.rename(elsewhere, directory);
  }
  assert.equal(await cleanupExitedHelper(directory, job, { pid: process.pid, exitCode: 1 }), true);
});

test('macOS helper installs its cleanup trap before reading job fields', { skip: process.platform !== 'darwin', timeout: 15000 }, async t => {
  const { parent, root } = await fixture(t), directory = await fs.mkdtemp(path.join(parent, 'sapling-setup-')), stat = await fs.lstat(directory);
  const job = { schemaVersion: 1, id: randomUUID(), previousRoot: root, targetRoot: root, management: null, helper: { name: path.basename(directory), device: String(stat.dev), inode: String(stat.ino) } };
  await fs.writeFile(path.join(directory, 'job.json'), JSON.stringify(job));
  for (const file of ['offline-helper.sh', 'offline-move.js']) await fs.copyFile(path.join(repo, 'kernel/launcher', file), path.join(directory, file));
  const child = spawn('/bin/sh', [path.join(directory, 'offline-helper.sh'), directory], { stdio: 'ignore' });
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }); assert.notEqual(code, 0);
  await assert.rejects(fs.access(directory)); assert.ok(await fs.stat(root));
});

test('failed native compilation removes transient stage and preserves previous launcher', { skip: process.platform !== 'darwin', timeout: 20000 }, async t => {
  const { root } = await fixture(t), launcher = path.join(root, 'kernel/launcher'); await fs.mkdir(launcher, { recursive: true });
  for (const file of ['toolchain.json', 'build.mjs', 'windows-icon.ps1']) await fs.copyFile(path.join(repo, 'kernel/launcher', file), path.join(launcher, file));
  await fs.cp(path.join(repo, 'kernel/launcher/native'), path.join(launcher, 'native'), { recursive: true });
  const arch = process.arch === 'x64' ? 'amd64' : process.arch, go = path.join(root, `.runtime/go1.27.2-darwin-${arch}/go/bin/go`);
  await fs.mkdir(path.dirname(go), { recursive: true }); await fs.writeFile(go, `#!/bin/sh\nif [ "$1" = version ]; then echo 'go version go1.27.2 darwin/${arch}'; else exit 42; fi\n`, { mode: 0o755 });
  await fs.writeFile(path.join(root, 'Existing.app'), 'previous');
  await assert.rejects(compileLauncher(root, { name: 'Existing', projectId: randomUUID() }, { force: true }), { code: 'BUILD_COMMAND_FAILED' });
  assert.deepEqual(await fs.readdir(path.join(root, '.runtime/launcher-build')), []);
  assert.equal(await fs.readFile(path.join(root, 'Existing.app'), 'utf8'), 'previous');
});
