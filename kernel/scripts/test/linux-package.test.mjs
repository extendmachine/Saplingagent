import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageSource } from '../package-macos.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const canBuild = ['darwin', 'linux'].includes(process.platform)
  && spawnSync('git', ['rev-parse', '--verify', 'HEAD:kernel/scripts/linux/bootstrap.sh'], { cwd: project }).status === 0
  && spawnSync('/usr/bin/zip', ['-v']).status === 0 && spawnSync('unzip', ['-v']).status === 0;

test('Linux ZIP records its own target, runnable entry, installation guide and checked source', { skip: !canBuild }, async t => {
  const cache = path.join(project, '.cache');
  await fs.mkdir(cache, { recursive: true });
  const output = await fs.mkdtemp(path.join(cache, 'linux-package-'));
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  const result = await packageSource({ platform: 'Linux', ref: 'HEAD', outputDir: output });
  const prefix = path.basename(result.zip, '.zip') + '/';
  const member = file => execFileSync('unzip', ['-p', result.zip, prefix + file], { maxBuffer: 4 * 1024 * 1024 });
  const delivery = JSON.parse(member('delivery.json'));
  assert.equal(delivery.sourceCommit, result.commit);
  assert.equal(delivery.kernelVersion, result.version);
  assert.match(delivery.platform, /Linux.*glibc/);
  assert.deepEqual(delivery.architectures, ['x64', 'arm64']);
  assert.deepEqual(delivery.runtimes, JSON.parse(member('kernel/config/linux.json')));
  assert.match(String(member('AGENTS.md')), /docs\/linux-install\.html/);
  assert.match(String(member('TODO.md')), /bash Saplingagent\.sh start/);
  const bootstrap = 'kernel/scripts/linux/bootstrap.sh';
  assert.ok(JSON.parse(member('kernel/manifest.json')).files.some(file => file.path === bootstrap && file.executable));
  execFileSync('unzip', ['-qq', result.zip, prefix + bootstrap, '-d', output]);
  assert.ok((await fs.stat(path.join(output, prefix, bootstrap))).mode & 0o100);
  const digest = createHash('sha256').update(await fs.readFile(result.zip)).digest('hex');
  assert.equal(await fs.readFile(result.zip + '.sha256', 'utf8'), digest + '  ' + path.basename(result.zip) + '\n');
});
