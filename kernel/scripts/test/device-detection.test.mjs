import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { codexBinary } from '../../contracts/local-process.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('Mac bootstrap and Codex wrapper agree on native Intel, Apple Silicon and Rosetta architecture', { skip: process.platform === 'win32' }, async () => {
  for (const [file, variable, end] of [
    ['kernel/scripts/macos/bootstrap.sh', 'SEED_MAC_ARCH', '\nesac'],
    ['kernel/scripts/macos/codex.sh', 'SEED_CODEX_ARCH', '\nSEED_CODEX_NODE='],
  ]) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    const start = source.indexOf(`${variable}="$(/usr/bin/uname -m)"`);
    const finish = source.indexOf(end, start) + (end === '\nesac' ? end.length : 0);
    assert.ok(start >= 0 && finish > start);
    const code = source.slice(start, finish).replaceAll('/usr/bin/uname -m', 'fake_uname').replaceAll('/usr/sbin/sysctl -n hw.optional.arm64', 'fake_sysctl');
    for (const [uname, nativeArm, expected] of [['x86_64', '0', 'x64'], ['arm64', '1', 'arm64'], ['x86_64', '1', 'arm64']]) {
      const run = spawnSync('/bin/bash', ['-c', `fake_uname() { echo ${uname}; }; fake_sysctl() { echo ${nativeArm}; }; ${code}\nprintf '%s' "$${variable}"`], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, expected, `${file}: ${uname}/${nativeArm}`);
    }
  }
});
test('Windows config includes checksum-verified native x64 and ARM64 archives and native Codex binaries', async () => {
  const config = JSON.parse(await fs.readFile(path.join(root, 'kernel/config/windows.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.nodeSha256).sort(), ['arm64', 'x64']);
  for (const digest of Object.values(config.nodeSha256)) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(config.nodeSha256.arm64, config.nodeSha256.x64);
  assert.match(codexBinary(root, 'win32', 'arm64'), /codex-win32-arm64.*aarch64-pc-windows-msvc.*codex\.exe$/);
});

const powershell = process.env.SAPLING_TEST_PWSH || (process.platform === 'win32' ? 'powershell.exe' : null);
test('actual PowerShell resolver prefers native OS over emulation, handles WOW64 fallback and rejects 32-bit', { skip: !powershell }, async () => {
  const helper = await fs.readFile(path.join(root, 'kernel/scripts/windows/bootstrap.sh'), 'utf8');
  const embedded = helper.split("<<'SAPLING_POWERSHELL'\n")[1].split('\nSAPLING_POWERSHELL')[0];
  const program = `
    $ErrorActionPreference='Stop'; $errors=$null; $tokens=$null
    $ast=[Management.Automation.Language.Parser]::ParseInput($env:SAPLING_TEST_POWERSHELL,[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'PowerShell syntax error' }
    $definition=$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Resolve-WindowsArchitecture'},$true)
    Invoke-Expression $definition[0].Extent.Text
    $cases=@(@('X64','','AMD64','x64'),@('ARM64','','AMD64','arm64'),@('','','AMD64','x64'),@('','AMD64','x86','x64'),@('','ARM64','AMD64','arm64'))
    foreach($c in $cases) { if ((Resolve-WindowsArchitecture $c[0] $c[1] $c[2]) -ne $c[3]) { throw 'Wrong native architecture' } }
    $rejected=$false; try { Resolve-WindowsArchitecture '' '' 'x86' | Out-Null } catch { $rejected=$true }
    if (!$rejected) { throw '32-bit was accepted' }
    'Native architecture cases passed'
  `;
  const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', program], { encoding: 'utf8', env: { ...process.env, SAPLING_TEST_POWERSHELL: embedded }, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Native architecture cases passed/);
});

test('actual PowerShell bootstrap reports its startup boundary before a device check fails', { skip: !powershell || process.platform === 'win32' }, async () => {
  const helper = await fs.readFile(path.join(root, 'kernel/scripts/windows/bootstrap.sh'), 'utf8');
  const embedded = helper.split("<<'SAPLING_POWERSHELL'\n")[1].split('\nSAPLING_POWERSHELL')[0];
  const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-EncodedCommand', Buffer.from(embedded, 'utf16le').toString('base64')], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, SAPLING_BOOTSTRAP_ROOT: root, SAPLING_BOOTSTRAP_ACTION: 'doctor', SAPLING_LANG: 'zh' },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Windows 安装器已启动/);
  assert.match(result.stdout, /non-Windows system/);
  assert.doesNotMatch(result.stdout, /Downloading|正在从 nodejs/);
});
