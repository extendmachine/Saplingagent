import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const git = async (root, ...args) => (await exec('git', ['-C', root, ...args])).stdout.trim();

const project = fileURLToPath(new URL('../../../', import.meta.url));
async function fixture(t, { failure = false, longRunning = false } = {}) {
  const parent = path.join(project, '.cache/menu-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "菜单 app's "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.copyFile(path.join(project, 'Saplingagent.sh'), path.join(root, 'Saplingagent.sh'));
  await fs.mkdir(path.join(root, 'kernel/scripts/macos'), { recursive: true });
  await fs.copyFile(path.join(project,'kernel/scripts/Saplingagent.sh'),path.join(root,'kernel/scripts/Saplingagent.sh'));await fs.mkdir(path.join(root,'kernel/localization'),{recursive:true});await fs.copyFile(path.join(project,'kernel/localization/installer-messages.sh'),path.join(root,'kernel/localization/installer-messages.sh'));
  await fs.writeFile(path.join(root, 'kernel/scripts/macos/bootstrap.sh'), `#!/bin/bash
cd "$(dirname "$0")/../../.."
printf '%s\\n' "$*" >> actions.txt
printf '%s\\n' "\${SAPLING_LANG}" >> languages.txt
${longRunning ? `trap 'printf stopped > stopped.txt; exit 0' TERM INT HUP
printf running > running.txt
while true; do sleep 0.05; done` : failure ? 'exit 7' : 'exit 0'}
`);
  return root;
}
function execute(root, input = '', args = [], language = 'en', extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [path.join(root, 'Saplingagent.sh'), ...(language ? ['--lang', language] : []), ...args], { cwd: '/', env: { ...process.env, ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
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
    assert.match(result.output, /Install \/ repair/);
    assert.match(result.output, /Configure AI/);
    assert.equal(await fs.access(path.join(root, 'actions.txt')).then(() => true, () => false), false);
  }
});
test('install, diagnostics and startup dispatch to the same bootstrap from another cwd', async t => {
  const root = await fixture(t);
  assert.equal((await execute(root, '1\n4\n3\n0\n')).code, 0);
  assert.equal(await actions(root), 'install\ndoctor\nstart\n');
});
test('Configure AI opens the standalone setup action without an account submenu', async t => {
  const root = await fixture(t);
  const result = await execute(root, '2\n0\n');
  assert.equal(result.code,0);
  assert.match(result.output,/Configure AI/);
  assert.doesNotMatch(result.output,/Codex - sign in|OpenCode - configure/);
  assert.equal(await actions(root),'configure\n');
});
test('invalid choices and failed actions leave the menu available for retry', async t => {
  const root = await fixture(t, { failure: true });
  const result = await execute(root, 'invalid\n1\n0\n');
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Please enter 0, 1/);
  assert.match(result.output, /Operation incomplete \(exit 7\)/);
  assert.equal(await actions(root), 'install\n');
});
test('explicit actions preserve flags and failure status without showing the menu', async t => {
  const root = await fixture(t, { failure: true });
  for (const args of [['install', '--repair'], ['login', '--device-auth'], ['start', '--no-open'], ['opencode'], ['logout'], ['configure','--no-open']]) {
    const result = await execute(root, '', args);
    assert.equal(result.code, 7);
    assert.doesNotMatch(result.output, /Choose \[0-4, 9\]/);
  }
  assert.equal(await actions(root), 'install --repair\nlogin --device-auth\nstart --no-open\nopencode\nlogout\nconfigure --no-open\n');
});
test('help and unknown actions never invoke bootstrap', async t => {
  const root = await fixture(t);
  assert.equal((await execute(root, '', ['--help'])).code, 0);
  assert.equal((await execute(root, '', ['unknown'])).code, 2);
  assert.equal(await fs.access(path.join(root, 'actions.txt')).then(() => true, () => false), false);
});
test('terminating the menu forwards the signal and waits for its active child', async t => {
  const root = await fixture(t, { longRunning: true });
  const child = spawn('/bin/bash', [path.join(root, 'Saplingagent.sh'), '--lang', 'en'], { stdio: ['pipe', 'ignore', 'ignore'] });
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

test('first launch chooses English or Chinese without Node; default, invalid choice and EOF are safe', async t => {
  const root = await fixture(t);
  const zh = await execute(root, 'invalid\n2\n0\n', [], null);
  assert.equal(zh.code, 0, zh.output);
  assert.match(zh.output, /Language \/ 语言/);
  assert.match(zh.output, /请输入 0、1 或 2/);
  assert.match(zh.output, /安装 \/ 修复/);
  assert.match(zh.output, /配置 AI 接口/);
  const en = await execute(root, '\n0\n', [], null);
  assert.equal(en.code, 0);
  assert.match(en.output, /Install \/ repair/);
  for (const input of ['', '0\n']) assert.equal((await execute(root, input, [], null)).code, 0);
  assert.equal(await fs.access(path.join(root, 'actions.txt')).then(() => true, () => false), false);
});
test('Chinese failed operation returns to the menu and language switching propagates to children', async t => {
  const root = await fixture(t, { failure: true });
  const result = await execute(root, 'invalid\n1\n9\n1\n4\n0\n', [], 'zh');
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /操作未完成（退出码 7）/);
  assert.match(result.output, /请输入 0、1、2、3、4、6 或 9/);
  assert.match(result.output, /Operation incomplete \(exit 7\)/);
  assert.equal(await actions(root), 'install\ndoctor\n');
  assert.equal(await fs.readFile(path.join(root, 'languages.txt'), 'utf8'), 'zh\nen\n');
});
test('explicit Chinese actions retain flags and status; malformed language never runs a child', async t => {
  const root = await fixture(t, { failure: true });
  const help = await execute(root, '', ['--help'], 'zh');
  assert.equal(help.code, 0);
  assert.match(help.output, /用法/);
  for (const args of [['--lang'], ['--lang', 'invalid']]) {
    const result = await execute(root, '', args, null);
    assert.equal(result.code, 2);
  }
  assert.equal(await fs.access(path.join(root, 'actions.txt')).then(() => true, () => false), false);
  const result = await execute(root, '', ['install', '--repair'], 'zh');
  assert.equal(result.code, 7);
  assert.equal(await actions(root), 'install --repair\n');
  assert.equal(await fs.readFile(path.join(root, 'languages.txt'), 'utf8'), 'zh\n');
});



test('all fresh and existing modes offer dependency install but no Git storage action',async t=>{
 for(const mode of ['fresh','local','own','upstream']){
  const root=await fixture(t);
  if(mode!=='fresh'){await git(root,'init','-b','main');await git(root,'config','saplingagent.storageMode',mode);await git(root,'remote','add','origin','https://example.invalid/own.git');}
  const before=await fs.readFile(path.join(root,'.git/config')).catch(()=>null);
  const result=await execute(root,'5\n1\n6\n0\n');
  assert.equal(result.code,0);assert.match(result.output,/1\. Install \/ repair dependencies/);
  assert.doesNotMatch(result.output,/Git \/ storage|Storage:|follow.*release/i);
  assert.equal(await actions(root),'install\nkernel\n');
  assert.deepEqual(await fs.readFile(path.join(root,'.git/config')).catch(()=>null),before);
 }
});
test('removed Git CLI action is rejected without running a child',async t=>{
 const root=await fixture(t);assert.equal((await execute(root,'',['git'])).code,2);
 assert.equal(await fs.access(path.join(root,'actions.txt')).then(()=>true,()=>false),false);
});
test('Chinese menu has install, AI setup and kernel management with no storage selection',async t=>{
 const root=await fixture(t);const result=await execute(root,'0\n',[],'zh');
 assert.match(result.output,/安装 \/ 修复依赖/);assert.match(result.output,/内核管理/);assert.doesNotMatch(result.output,/存放配置|存储设置|跟随/);
});

test('menu shows only installed kernel version even when old compatibility metadata disagrees',async t=>{
 const root=await fixture(t);await fs.writeFile(path.join(root,'kernel/manifest.json'),JSON.stringify({version:'0.9.4'}));await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/release.json'),JSON.stringify({version:'0.9.1'}));
 const value=await execute(root,'0\n');assert.equal(value.code,0);assert.match(value.output,/Kernel version: 0\.9\.4/);assert.doesNotMatch(value.output,/Release:|0\.9\.1/);
});

test('successful web setup releases the legacy menu process instead of retaining its project script',async t=>{
 const root=await fixture(t);await fs.mkdir(path.join(root,'kernel/launcher'),{recursive:true});await fs.writeFile(path.join(root,'kernel/launcher/entry.mjs'),'// Synthetic management entry');
 const value=await execute(root,'2\n4\n0\n',[],'en',{SAPLING_LEGACY_MENU:'1'});assert.equal(value.code,0);assert.equal(await actions(root),'configure\n');
 const failed=await fixture(t,{failure:true});await fs.mkdir(path.join(failed,'kernel/launcher'),{recursive:true});await fs.writeFile(path.join(failed,'kernel/launcher/entry.mjs'),'// Synthetic management entry');
 assert.equal((await execute(failed,'2\n4\n0\n',[],'en',{SAPLING_LEGACY_MENU:'1'})).code,0);assert.equal(await actions(failed),'configure\ndoctor\n');
});

test('saved project language skips the picker, explicit option wins, and OS locale is the first-install default',async t=>{
 const root=await fixture(t);await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/ui-language.json'),JSON.stringify({schemaVersion:1,language:'zh'}));
 const stored=await execute(root,'4\n0\n',[],null,{SAPLING_LANG:'en',SAPLING_LANG_EXPLICIT:'0',LANG:'en_US.UTF-8'});assert.equal(stored.code,0);assert.doesNotMatch(stored.output,/Language \/ 语言/);assert.match(stored.output,/服务诊断/);assert.equal(await fs.readFile(path.join(root,'languages.txt'),'utf8'),'zh\n');
 const explicit=await execute(root,'4\n0\n',[],'en');assert.match(explicit.output,/Diagnostics/);assert.equal(await fs.readFile(path.join(root,'languages.txt'),'utf8'),'zh\nen\n');
 await fs.rm(path.join(root,'config/ui-language.json'));const first=await execute(root,'\n0\n',[],null,{SAPLING_LANG:'',SAPLING_LANG_EXPLICIT:'0',LANG:'zh_CN.UTF-8',LC_ALL:''});assert.match(first.output,/Enter=中文/);assert.match(first.output,/服务诊断/);
});
