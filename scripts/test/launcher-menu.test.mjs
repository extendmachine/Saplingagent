import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const project = fileURLToPath(new URL('../../', import.meta.url));
async function fixture(t, { failure = false, longRunning = false } = {}) {
  const parent = path.join(project, '.cache/menu-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "菜单 app's "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.copyFile(path.join(project, 'Saplingagent.command'), path.join(root, 'Saplingagent.command'));
  await fs.mkdir(path.join(root, 'scripts/macos'), { recursive: true });
  await fs.writeFile(path.join(root, 'scripts/macos/bootstrap.sh'), `#!/bin/bash
cd "$(dirname "$0")/../.."
printf '%s\\n' "$*" >> actions.txt
${longRunning ? `trap 'printf stopped > stopped.txt; exit 0' TERM INT HUP
printf running > running.txt
while true; do sleep 0.05; done` : failure ? 'exit 7' : 'exit 0'}
`);
  return root;
}
function execute(root, input = '', args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [path.join(root, 'Saplingagent.command'), ...args], { cwd: '/', stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => output += chunk);
    child.stderr.on('data', chunk => output += chunk);
    const timeout = setTimeout(() => child.kill('SIGTERM'), 3000);
    child.once('error', reject);
    child.once('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, output }); });
    child.stdin.end(input);
  });
}
const actions = root => fs.readFile(path.join(root, 'actions.txt'), 'utf8');

test('menu opens without installed Node; quit and EOF do not run actions', async t => {
  const root = await fixture(t);
  for (const input of ['0\n', '']) {
    const result = await execute(root, input);
    assert.equal(result.code, 0);
    assert.match(result.output, /Install \/ update/);
    assert.match(result.output, /Configure AI/);
    assert.equal(await fs.access(path.join(root, 'actions.txt')).then(() => true, () => false), false);
  }
});
test('install, diagnostics and startup dispatch to the same bootstrap from another cwd', async t => {
  const root = await fixture(t);
  assert.equal((await execute(root, '1\n4\n3\n0\n')).code, 0);
  assert.equal(await actions(root), 'install\ndoctor\nstart\n');
});
test('configuration offers Codex and OpenCode and back creates no action', async t => {
  const root = await fixture(t);
  const result = await execute(root, '2\n0\n2\n1\n2\n2\n0\n');
  assert.equal(result.code, 0);
  assert.match(result.output, /OpenCode - configure a provider \/ API key/);
  assert.equal(await actions(root), 'login\nopencode\n');
});
test('invalid choices and failed actions leave the menu available for retry', async t => {
  const root = await fixture(t, { failure: true });
  const result = await execute(root, 'invalid\n2\ninvalid\n0\n1\n0\n');
  assert.equal(result.code, 0);
  assert.match(result.output, /Please enter a number/);
  assert.match(result.output, /Please enter 0, 1 or 2/);
  assert.match(result.output, /Operation incomplete \(exit 7\)/);
  assert.equal(await actions(root), 'install\n');
});
test('explicit actions preserve flags and failure status without showing the menu', async t => {
  const root = await fixture(t, { failure: true });
  for (const args of [['install', '--repair'], ['login', '--device-auth'], ['start', '--no-open'], ['opencode'], ['logout']]) {
    const result = await execute(root, '', args);
    assert.equal(result.code, 7);
    assert.doesNotMatch(result.output, /Choose \[0-4\]/);
  }
  assert.equal(await actions(root), 'install --repair\nlogin --device-auth\nstart --no-open\nopencode\nlogout\n');
});
test('help and unknown actions never invoke bootstrap', async t => {
  const root = await fixture(t);
  assert.equal((await execute(root, '', ['--help'])).code, 0);
  assert.equal((await execute(root, '', ['unknown'])).code, 2);
  assert.equal(await fs.access(path.join(root, 'actions.txt')).then(() => true, () => false), false);
});
test('terminating the menu forwards the signal and waits for its active child', async t => {
  const root = await fixture(t, { longRunning: true });
  const child = spawn('/bin/bash', [path.join(root, 'Saplingagent.command')], { stdio: ['pipe', 'ignore', 'ignore'] });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  child.stdin.write('3\n');
  const end = Date.now() + 2000;
  while (!await fs.access(path.join(root, 'running.txt')).then(() => true, () => false) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await fs.readFile(path.join(root, 'running.txt'), 'utf8'), 'running');
  child.kill('SIGTERM');
  assert.equal((await exited).code, 143);
  assert.equal(await fs.readFile(path.join(root, 'stopped.txt'), 'utf8'), 'stopped');
});
