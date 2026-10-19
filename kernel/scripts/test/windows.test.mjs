import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { claudeBinary, codexBinary, openCodeBinary, npmCommand, commandShell, windowsTreeCommand, terminateOwned } from '../../contracts/local-process.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('Windows paths use native executables and npm JS, with no cmd shim or shell interpolation', () => {
  const folder = path.resolve("app's 中文 folder");
  assert.match(codexBinary(folder, 'win32', 'x64'), /codex-win32-x64.*x86_64-pc-windows-msvc.*codex\.exe$/);
  assert.match(openCodeBinary(folder, 'win32'), /opencode-ai.*bin.*opencode\.exe$/);
  assert.match(claudeBinary(folder, 'win32', 'x64'), /claude-agent-sdk-win32-x64.*claude\.exe$/);
  assert.match(claudeBinary(folder, 'win32', 'arm64'), /claude-agent-sdk-win32-arm64.*claude\.exe$/);
  const npm = npmCommand(path.join(folder, 'node.exe'), 'win32');
  assert.equal(npm.command, path.join(folder, 'node.exe'));
  assert.match(npm.args[0], /npm.*bin.*npm-cli\.js$/);
  const shell = commandShell('echo hello', 'win32', { SHELL: '/bin/bash', ComSpec: 'C:\\Windows\\System32\\cmd.exe' });
  assert.equal(shell.windowsVerbatimArguments, true);
  assert.equal(shell.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(shell.args, ['/d', '/s', '/c', '"echo hello"']);
});
test('Windows stop targets one owned PID tree and rejects PID injection', () => {
  const plan = windowsTreeCommand(123, { SystemRoot: 'C:\\Windows' });
  assert.equal(plan.command, 'C:\\Windows\\System32\\taskkill.exe');
  assert.deepEqual(plan.args, ['/PID', '123', '/T', '/F']);
  for (const invalid of [0, -1, '123 /IM node.exe', 1.5]) assert.throws(() => windowsTreeCommand(invalid));
});
test('Windows termination executes tree kill before reporting exit; repeated exited child never targets a recycled PID', async () => {
  const child = { pid: 123, exitCode: null, signalCode: null };
  let calls = 0;
  const spawnProcess = (command, args, options) => {
    calls++; assert.match(command, /taskkill\.exe$/); assert.deepEqual(args, ['/PID', '123', '/T', '/F']); assert.equal(options.windowsHide, true);
    const killer = new EventEmitter(); killer.kill = () => {};
    queueMicrotask(() => { child.exitCode = 1; killer.emit('exit', 0); }); return killer;
  };
  await Promise.all([terminateOwned(child, { platform: 'win32', spawnProcess }), terminateOwned(child, { platform: 'win32', spawnProcess })]);
  await terminateOwned(child, { platform: 'win32', spawnProcess });
  assert.equal(calls, 1);
});
test('Windows termination reports unavailable taskkill without silently killing only the parent', async () => {
  const child = { pid: 123, exitCode: null, signalCode: null };
  await assert.rejects(terminateOwned(child, { platform: 'win32', spawnProcess: () => {
    const killer = new EventEmitter(); queueMicrotask(() => killer.emit('error', new Error('ENOENT'))); return killer;
  } }), /Cannot stop owned Windows process tree/);
});
test('single Bash entry shares a private Windows bootstrap with native launch, with local runtime and Unicode encoding', async () => {
  await assert.rejects(fs.access(path.join(root, 'Saplingagent.ps1')));
  const shell = await fs.readFile(path.join(root, 'kernel/scripts/windows/bootstrap.sh'), 'utf8');
  const powershell = await fs.readFile(path.join(root, 'kernel/scripts/windows/bootstrap.ps1'), 'utf8');
  const source = shell + powershell;
  assert.match(shell, /kernel\/scripts\/windows\/bootstrap\.ps1/);
  assert.match(powershell, /runtime-only/);
  assert.match(source, /Get-FileHash -LiteralPath \$archive -Algorithm SHA256/);
  assert.match(source, /FileMode\]::CreateNew/);
  assert.match(source, /UTF-16LE/); assert.match(source, /-EncodedCommand/);
  assert.doesNotMatch(source, /Set-ExecutionPolicy|npm\s+.*--global|SetEnvironmentVariable\([^\n]*'(Machine|User)'/i);
  assert.match(source, /\.runtime/); assert.match(source, /SAPLING_BOOTSTRAP_ROOT/);
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
test('native Windows stops parent and grandchild, retains an unrelated process, and supports spaced Unicode paths', { skip: process.platform !== 'win32' }, async t => {
  const cache = path.join(root, '.cache/windows-tests'); await fs.mkdir(cache, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cache, "app's 中文 "));
  const parentFile = path.join(directory, 'parent.mjs'), marker = path.join(directory, 'child.json');
  await fs.writeFile(parentFile, `import {spawn} from 'node:child_process'; import fs from 'node:fs'; const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:child.pid})); setInterval(()=>{},1000);`);
  const parent = spawn(process.execPath, [parentFile], { cwd: directory, stdio: 'ignore' });
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  t.after(async () => { await terminateOwned(parent).catch(() => {}); await terminateOwned(unrelated).catch(() => {}); await fs.rm(directory, { recursive: true, force: true }); });
  for (let i = 0; i < 100 && !await fs.access(marker).then(() => true, () => false); i++) await sleep(30);
  const descendant = JSON.parse(await fs.readFile(marker)).pid;
  assert.ok(alive(parent.pid)); assert.ok(alive(descendant));
  await terminateOwned(parent);
  assert.equal(alive(parent.pid), false); assert.equal(alive(descendant), false); assert.equal(alive(unrelated.pid), true);
  const plan = commandShell(`"${process.execPath}" -e "process.stdout.write('hello')"`);
  const shell = spawn(plan.command, plan.args, { windowsVerbatimArguments: plan.windowsVerbatimArguments, cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = ''; shell.stdout.on('data', chunk => text += chunk); const [code] = await once(shell, 'close');
  assert.equal(code, 0); assert.equal(text, 'hello');
});
test('native Windows installed Codex and OpenCode report pinned versions without login/model calls', { skip: process.platform !== 'win32' || process.env.SAPLING_WINDOWS_INSTALLED_TEST !== '1' }, async () => {
  for (const [binary, expected] of [[codexBinary(root), 'codex-cli 0.146.1'], [openCodeBinary(root), '1.19.0'], [claudeBinary(root), '2.1.296 (Claude Code)']]) {
    const child = spawn(binary, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => output += chunk); const [code] = await once(child, 'close');
    assert.equal(code, 0); assert.equal(output.trim(), expected);
  }
});
