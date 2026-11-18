import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('two macOS Node installers serialize and recover after a killed lock owner', {
  skip: process.platform !== 'darwin', timeout: 10000
}, async t => {
  const parent = path.join(root, '.cache', 'node-lock-tests');
  await fs.mkdir(parent, {recursive: true});
  const base = await fs.mkdtemp(path.join(parent, 'lib-'));
  t.after(() => fs.rm(base, {recursive: true, force: true}));
  const lock = path.join(base, 'node-version-arch.lock');
  // Legacy mkdir locks have no owner identity and may belong to an old installer.
  const legacy = lock.slice(0, -5);
  await fs.mkdir(legacy);
  await fs.writeFile(lock, '');
  const script = [
    'set -eu',
    'source "$1"',
    'sapling_message() { echo waiting >&2; }',
    'exec 9>>"$2"',
    'sapling_acquire_node_lock',
    'echo acquired',
    'read -r reply'
  ].join('\n');
  function start() {
    const child = spawn('/bin/bash', ['-c', script, 'lock-test',
      path.join(root, 'kernel/tooling/node-bootstrap.sh'), lock], {stdio: ['pipe','pipe','pipe']});
    const ready = once(createInterface({input: child.stdout}), 'line');
    const exited = once(child, 'exit');
    t.after(() => { if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL'); });
    return {child, ready, exited};
  }
  const first = start();
  assert.equal((await Promise.race([first.ready, first.exited]))[0], 'acquired');
  const next = start();
  assert.match(String((await Promise.race([once(next.child.stderr, 'data'), next.ready, next.exited]))[0]), /waiting/);
  first.child.kill('SIGKILL');
  await first.exited;
  assert.equal((await Promise.race([next.ready, next.exited]))[0], 'acquired');
  next.child.stdin.end('done\n');
  assert.equal((await next.exited)[0], 0);
  assert.ok((await fs.stat(legacy)).isDirectory());
});
