import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { codexBinary } from '../../contracts/local-process.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('Mac bootstrap and Codex wrapper share native CPU detection, including failed uname and translated terminals', {skip:process.platform === 'win32'}, async () => {
  const directory = path.join(root,'kernel/scripts/macos');
  for (const file of ['bootstrap.sh','codex.sh']) {
    const script = await fs.readFile(path.join(directory,file),'utf8');
    assert.match(script,/source "[^"]+\/device\.sh"/);
    assert.match(script,/\$\(sapling_macos_arch\)/);
  }
  const probe = `
    /usr/bin/uname() { [ "$1" = -m ] && printf '%s' "$TEST_UNAME"; }
    /usr/sbin/sysctl() {
      case "$2" in hw.optional.arm64) printf '%s' "$TEST_ARM";;
        sysctl.proc_translated) printf '%s' "$TEST_TRANSLATED";;
        machdep.cpu.brand_string) printf '%s' "$TEST_BRAND";;
        hw.machine) printf '%s' "$TEST_MACHINE";; *) return 1;; esac
    }
    source "$1"; sapling_macos_arch`;
  const cases = [
    ['x86_64','0','','','', 'x64'], ['arm64','1','','','', 'arm64'],
    ['x86_64','1','','','', 'arm64'], ['x86_64','','1','','', 'arm64'], ['x86_64','','','','arm64', 'arm64'],
    ['','','','Intel(R) Core','', 'x64'], ['','','','Apple M1','', 'arm64'],
    ['','','','','x86_64', 'x64'], ['','','','','arm64', 'arm64'],
    ['unknown','','','','unknown', null]
  ];
  for (const [uname,arm,translated,brand,machine,expected] of cases) {
    const run = spawnSync('/bin/bash',['-eu','-c',probe,'bash',path.join(directory,'device.sh')],{
      encoding:'utf8',env:{...process.env,TEST_UNAME:uname,TEST_ARM:arm,TEST_TRANSLATED:translated,TEST_BRAND:brand,TEST_MACHINE:machine}
    });
    assert.equal(run.status,expected ? 0 : 1,run.stderr);
    assert.equal(run.stdout.trim(),expected || '');
  }
});

test('Mac installer accepts verified product metadata after a failed OS probe and rejects unknown versions', {skip:process.platform === 'win32'}, () => {
  const probe = `
    /usr/bin/sw_vers() { [ -n "$TEST_SW" ] && printf '%s' "$TEST_SW"; }
    /usr/bin/plutil() { [ -n "$TEST_PLIST" ] && printf '%s' "$TEST_PLIST"; }
    source "$1"; sapling_macos_version`;
  for (const [sw,plist,expected] of [['27.0.1','','27.0.1'],['','13.5','13.5'],['error','14.2.1','14.2.1'],['','',''],['','14.x','']]) {
    const run = spawnSync('/bin/bash',['-eu','-c',probe,'bash',path.join(root,'kernel/scripts/macos/device.sh')],{
      encoding:'utf8',env:{...process.env,TEST_SW:sw,TEST_PLIST:plist}
    });
    assert.equal(run.status,expected ? 0 : 1,run.stderr);
    assert.equal(run.stdout.trim(),expected);
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
  const program = `
    $ErrorActionPreference='Stop'; $errors=$null; $tokens=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile($env:SAPLING_TEST_POWERSHELL,[ref]$tokens,[ref]$errors)
    . $env:SAPLING_TEST_MESSAGES
    if ($errors.Count) { throw 'PowerShell syntax error' }
    $definition=$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Resolve-WindowsArchitecture'},$true)
    Invoke-Expression $definition[0].Extent.Text
    $cases=@(@('X64','','AMD64','x64'),@('ARM64','','AMD64','arm64'),@('','','AMD64','x64'),@('','AMD64','x86','x64'),@('','ARM64','AMD64','arm64'))
    foreach($c in $cases) { if ((Resolve-WindowsArchitecture $c[0] $c[1] $c[2]) -ne $c[3]) { throw 'Wrong native architecture' } }
    $rejected=$false; try { Resolve-WindowsArchitecture '' '' 'x86' | Out-Null } catch { $rejected=$true }
    if (!$rejected) { throw '32-bit was accepted' }
    'Native architecture cases passed'
  `;
  const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', program], { encoding: 'utf8', env: { ...process.env, SAPLING_TEST_POWERSHELL:path.join(root,'kernel/scripts/windows/bootstrap.ps1'),SAPLING_TEST_MESSAGES:path.join(root,'kernel/localization/installer-messages.ps1') }, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Native architecture cases passed/);
});

test('actual PowerShell bootstrap reports its startup boundary before a device check fails', {skip:!powershell || process.platform === 'win32'}, async t => {
  const cache = path.join(root,'.cache/device-detection');
  await fs.mkdir(cache,{recursive:true});
  const fixture = await fs.mkdtemp(path.join(cache,'windows-'));
  t.after(() => fs.rm(fixture,{recursive:true,force:true}));
  for (const file of ['kernel/tooling/node-bootstrap.ps1','kernel/localization/installer-messages.ps1']) {
    await fs.mkdir(path.dirname(path.join(fixture,file)),{recursive:true});
    await fs.copyFile(path.join(root,file),path.join(fixture,file));
  }
  const result = spawnSync(powershell, ['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(root,'kernel/scripts/windows/bootstrap.ps1')], {
    encoding:'utf8', timeout:10000,
    env:{...process.env,SAPLING_BOOTSTRAP_ROOT:fixture,SAPLING_BOOTSTRAP_ACTION:'doctor',SAPLING_LANG:'zh'}
  });
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,/Windows 安装器已启动/);
  assert.match(result.stdout,/非 Windows 系统/);
  assert.doesNotMatch(result.stdout,/Downloading|正在从 nodejs/);
});
