import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { distributable } from '../package-macos.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const project = fileURLToPath(new URL('../../../', import.meta.url));
async function fixture(t, { auth = 'missing', badDev = false } = {}) {
  const parent = path.join(project, '.cache/macos-tests'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "\u6d4b\u8bd5 app's "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const file of ['kernel/localization/public.mjs','kernel/localization/errors.mjs','kernel/localization/store.mjs','kernel/localization/launcher-messages.mjs','kernel/localization/installer-messages.sh','kernel/contracts/configuration-write.mjs','kernel/contracts/local-storage.mjs','kernel/contracts/mcp-access.mjs','kernel/contracts/kernel.mjs', 'kernel/compat/paths.mjs', 'kernel/contracts/ai-configuration.mjs', 'kernel/contracts/local-process.mjs', 'kernel/contracts/engine-dependencies.mjs', 'kernel/scripts/launcher/cli.mjs', 'scripts/launcher/source-update.mjs', 'scripts/launcher/git-storage.mjs', 'kernel/scripts/launcher/recipient-records.mjs', 'kernel/scripts/setup.mjs', 'kernel/scripts/macos/cli.mjs', 'kernel/scripts/macos/bootstrap.sh', 'kernel/scripts/macos/codex.sh', 'Saplingagent.sh', 'kernel/scripts/Saplingagent.sh', 'kernel/config/macos.json', 'config/runtime.json']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.copyFile(path.join(project, file), path.join(root, file));
  }
  const settings = JSON.parse(await fs.readFile(path.join(root, 'kernel/config/macos.json'), 'utf8'));
  const hash = createHash('sha256').update(JSON.stringify(settings));
  for (const service of ['front', 'backend/app-builder', 'backend/mcp-runtime', 'backend/agent-runtime']) {
    await fs.mkdir(path.join(root, service), { recursive: true });
    await fs.writeFile(path.join(root, service, 'package-lock.json'), '{}'); hash.update('{}');
  }
  const codex = path.join(root, '.runtime/codex/node_modules/.bin/codex');
  const fake = `#!/bin/sh\ncase "$*" in\n *--version*) echo 'codex-cli 0.146.1'; exit 0;;\n *status*) ${auth === 'missing' ? "echo 'Not logged in' >&2; exit 1" : auth === 'broken' ? "echo 'Config error PRIVATE_FIXTURE_VALUE' >&2; exit 1" : 'exit 0'};;\n *) exit 7;;\nesac\n`;
  await fs.mkdir(path.dirname(codex), { recursive: true }); await fs.writeFile(codex, fake, { mode: 0o755 });
  for (const file of ['front/node_modules/vite/bin/vite.js', 'backend/mcp-runtime/node_modules/@modelcontextprotocol/sdk/package.json', 'backend/agent-runtime/node_modules/.bin/opencode', `backend/agent-runtime/node_modules/@anthropic-ai/claude-agent-sdk-darwin-${process.arch}/claude`]) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), '{}'); }
  await fs.writeFile(path.join(root, '.runtime/macos-install.json'), JSON.stringify({ signature: hash.digest('hex'), arch: process.arch }));
  await fs.writeFile(path.join(root, 'scripts/dev.mjs'), badDev ? "console.error('Port occupied'); process.exit(1);" : "await import('node:fs/promises').then(f=>f.writeFile(new URL('../UNEXPECTED_LAUNCH',import.meta.url),'bad'));process.exit(7);");
  return root;
}
function runCli(root, action, extraEnv = {},nodeExecutable=process.execPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeExecutable, [path.join(root, 'kernel/scripts/macos/cli.mjs'), ...action], { cwd: root, env: { ...process.env, SEED_ROOT: '/invalid-root', CODEX_HOME: '/invalid-codex-home', ...(action[0] === 'install' ? { SAPLING_GIT_MODE: 'local' } : {}), ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x); child.once('error', reject); child.once('exit', code => resolve({ code, output }));
  });
}
test('distribution filter excludes runtime/private files while retaining complete rules and Skills', () => {
  for (const file of ['local-secrets/codex/auth.json', 'backend/a/local-secrets/key.txt', 'data/session.json', 'backend/agent-runtime/ai-tasks/runtime/run.md', 'front/node_modules/react/index.js', '.runtime/codex/package.json', '.worktrees/coordination/TODO.md', 'logs/front/x.log', 'backend/a/.env.local', 'backend/a/token.pem', 'front/dist/index.html', '1-Install.command', '2-Login-Codex.command', '3-Start-Saplingagent.command', 'Saplingagent.command', '4-Doctor.command', '5-Configure-OpenCode.command']) assert.equal(distributable(file), false, file);
  for (const file of ['config/release.json','README.zh-CN.md','assets/brand/saplingagent-growth-logo.png','assets/cases/document-workspace/workspace-overview.jpg','kernel/manifest.json','kernel/recover.mjs','contracts/kernel.mjs','LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'rules/README.md', 'rules/clawtask-package-skill-v2.zip', '.agents/skills/seed-page-edit/SKILL.md', 'Saplingagent.sh', 'install.sh', 'kernel/scripts/launcher/recipient-records.mjs', '.agents/.claude-plugin/plugin.json', 'kernel/engines/providers/claude.mjs', 'front/App.tsx', 'kernel/scripts/macos/codex.sh']) assert.equal(distributable(file), true, file);
});
test('missing login does not launch services or copy global authentication', async t => {
  const root = await fixture(t);
  const result = await runCli(root, ['start', '--no-open']);
  assert.equal(result.code, 1); assert.match(result.output, /save an account\/API\/subscription scheme/);
  assert.equal(await fs.access(path.join(root, 'UNEXPECTED_LAUNCH')).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(root, 'local-secrets/codex/auth.json')).then(() => true, () => false), false);
  const ledger = JSON.parse(await fs.readFile(path.join(root, 'local-secrets/notes/project-secrets.json'), 'utf8'));
  assert.equal(ledger.schema_version, 1); assert.equal(ledger.project.root, root); assert.deepEqual(ledger.credentials, []);
});
test('configuration errors are not reported as missing login and raw diagnostics stay private', async t => {
  const root = await fixture(t, { auth: 'broken' });
  const result = await runCli(root, ['login']);
  assert.equal(result.code, 1); assert.match(result.output, /does not mean the project is not logged in/); assert.doesNotMatch(result.output, /PRIVATE_FIXTURE_VALUE/);
});
test('OpenCode configuration uses this project storage without requiring Codex login', async t => {
  const root = await fixture(t);
  const binary = path.join(root, 'backend/agent-runtime/node_modules/.bin/opencode');
  await fs.writeFile(binary, '#!/bin/sh\nprintf "%s\\n" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$CODEX_HOME" "${OPENAI_API_KEY-unset}" > opencode-env.txt\nexit 0\n', { mode: 0o755 });
  await fs.chmod(binary, 0o755);
  const result = await runCli(root, ['opencode'], { OPENAI_API_KEY: 'SYNTHETIC_EXTERNAL_KEY' });
  assert.equal(result.code, 0);
  assert.match(result.output, /OpenCode provider saved/);
  assert.equal(await fs.readFile(path.join(root, 'opencode-env.txt'), 'utf8'), [path.join(root, 'local-secrets/opencode/data'), path.join(root, 'local-secrets/opencode/config'), path.join(root, 'local-secrets/codex'), 'unset', ''].join('\n'));
  assert.equal(await fs.access(path.join(root, 'UNEXPECTED_LAUNCH')).then(() => true, () => false), false);
});
test('cancelled OpenCode configuration stops the owned auth child and does not claim success', async t => {
  const root = await fixture(t);
  const binary = path.join(root, 'backend/agent-runtime/node_modules/.bin/opencode');
  await fs.writeFile(binary, '#!/bin/sh\ntrap "printf stopped > auth-stopped.txt; exit 0" TERM INT HUP\nprintf running > auth-running.txt\nwhile true; do sleep 0.05; done\n');
  await fs.chmod(binary, 0o755);
  const child = spawn(process.execPath, [path.join(root, 'kernel/scripts/macos/cli.mjs'), 'opencode'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  const deadline = Date.now() + 2000;
  while (!await fs.access(path.join(root, 'auth-running.txt')).then(() => true, () => false) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await fs.readFile(path.join(root, 'auth-running.txt'), 'utf8'), 'running');
  child.kill('SIGTERM');
  assert.equal(await exited, 1);
  assert.equal(await fs.readFile(path.join(root, 'auth-stopped.txt'), 'utf8'), 'stopped');
  assert.match(output, /cancelled/);
  assert.doesNotMatch(output, /provider saved/);
});
test('dependency changes invalidate the success marker before launching', async t => {
  const root = await fixture(t, { auth: 'present' }); await fs.writeFile(path.join(root, 'front/package-lock.json'), '{"changed":true}');
  const result = await runCli(root, ['start', '--no-open']);
  assert.equal(result.code, 1); assert.match(result.output, /lockfiles have changed/);
  assert.match(result.output, /bash Saplingagent.sh install --repair/);
  assert.doesNotMatch(result.output, /choose Install \/ update/);
  assert.equal(await fs.access(path.join(root, 'UNEXPECTED_LAUNCH')).then(() => true, () => false), false);
});
test('a failed launcher cannot claim another live project is ready', async t => {
  const root = await fixture(t, { auth: 'present', badDev: true });
  const result = await runCli(root, ['start', '--no-open']);
  assert.equal(result.code, 1); assert.match(result.output, /Port occupied/); assert.doesNotMatch(result.output, /Connected to Codex App Server/);
});
test('failed staging preserves a complete old installation and repairs stripped script permissions', async t => {
  const root = await fixture(t, { auth: 'present' });
  const marker = path.join(root, '.runtime/macos-install.json'), wrapper = path.join(root, 'kernel/scripts/macos/codex.sh');
  const before = await fs.readFile(marker, 'utf8'); await fs.chmod(wrapper, 0o644);
  const bin = path.join(root, 'fake-bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'npm'), '#!/bin/sh\necho "Synthetic network failure" >&2\nexit 42\n', { mode: 0o755 });
  // Simulate failure of this project's own npm, rather than overriding it globally.
  const localNode=path.join(bin,'node');await fs.copyFile(process.execPath,localNode,fs.constants.COPYFILE_FICLONE);
  const result = await runCli(root, ['install', '--repair'], { PATH: bin + path.delimiter + process.env.PATH },localNode);
  assert.equal(result.code, 1); assert.match(result.output, /exit code 42/);
  assert.equal(await fs.readFile(marker, 'utf8'), before);
  assert.equal((await fs.stat(wrapper)).mode & 0o777, 0o755);
  assert.equal(await fs.access(path.join(root, '.runtime/macos-install.lock')).then(() => true, () => false), false);
  assert.equal((await fs.readdir(path.join(root, '.runtime'))).some(x => x.startsWith('codex-install-')), false);
});

test('failed managed startup keeps the recovery gateway alive until the user stops the Mac launcher', async t => {
  const root = await fixture(t, { auth: 'saved' });
  const net = await import('node:net'); const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const file = path.join(root, 'config/runtime.json'), config = JSON.parse(await fs.readFile(file, 'utf8')); config.frontPort = port; await fs.writeFile(file, JSON.stringify(config));
  await fs.writeFile(path.join(root, 'scripts/dev.mjs'), `import http from 'node:http';const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({phase:'failed',busy:false,error:{code:'FIXTURE_NOT_READY'}}))});server.listen(${port},'127.0.0.1',()=>console.log('Saplingagent: http://127.0.0.1:${port}/'));process.on('SIGTERM',()=>{server.close(()=>process.exit(0));server.closeAllConnections()});`);
  const child = spawn(process.execPath,[path.join(root,'kernel/scripts/macos/cli.mjs'),'start','--no-open'],{cwd:root,env:{...process.env,SEED_ROOT:root},stdio:['ignore','pipe','pipe']});
  let output = ''; child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM')});
  const exited = new Promise(resolve=>child.once('exit',code=>resolve(code)));
  const end=Date.now()+5000;while(!output.includes('Keep this window open')&&child.exitCode===null&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,30));
  assert.match(output,/Keep this window open/);assert.equal(child.exitCode,null);assert.equal((await fetch(`http://127.0.0.1:${port}/api/runtime/status`)).status,200);
  child.kill('SIGTERM');assert.equal(await exited,0);
});

test('Mac startup follows the announced port instead of a ready foreign app on the configured port', async t => {
 const root=await fixture(t,{auth:'present'});const http=await import('node:http');let foreignRequests=0;
 const foreign=http.createServer((req,res)=>{foreignRequests++;res.end(JSON.stringify({ready:true,authenticated:true,phase:'ready',mcp:{ready:true,tools:[]},skills:[],model:'foreign-model'}))});
 await new Promise(resolve=>foreign.listen(0,'127.0.0.1',resolve));t.after(()=>{foreign.closeAllConnections();return new Promise(resolve=>foreign.close(resolve))});
 const configFile=path.join(root,'config/runtime.json'),config=JSON.parse(await fs.readFile(configFile));config.frontPort=foreign.address().port;await fs.writeFile(configFile,JSON.stringify(config));
 await fs.writeFile(path.join(root,'scripts/dev.mjs'),`import http from 'node:http';import fs from 'node:fs';const s=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({instanceId:'fixture-instance',phase:'ready',busy:false,ready:true,authenticated:true,provider:'Fixture',model:'fixture-model',mcp:{ready:true,tools:[]},skills:[]}))});s.listen(0,'127.0.0.1',()=>{const port=s.address().port;fs.writeFileSync('.runtime/runtime-address.json',JSON.stringify({instanceId:'fixture-instance',ports:{frontPort:port}}));console.log('Saplingagent: http://127.0.0.1:'+port+'/')});process.on('SIGTERM',()=>{s.closeAllConnections();s.close(()=>process.exit(0))});`);
 const child=spawn(process.execPath,[path.join(root,'kernel/scripts/macos/cli.mjs'),'start','--no-open'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);const exited=new Promise(resolve=>child.once('exit',code=>resolve(code)));t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM')});
 const end=Date.now()+5000;while(!output.includes('Keep this window open')&&child.exitCode===null&&Date.now()<end)await new Promise(r=>setTimeout(r,30));
 assert.match(output,/Connected to Fixture: fixture-model/);assert.equal(foreignRequests,0);
 const address=JSON.parse(await fs.readFile(path.join(root,'.runtime/runtime-address.json')));assert.match(output,new RegExp('Web page: http://127.0.0.1:'+address.ports.frontPort+'/'));
 const diagnostic=await runCli(root,['doctor']);assert.match(diagnostic.output,new RegExp('Runtime address: http://127.0.0.1:'+address.ports.frontPort+'/'));assert.match(diagnostic.output,/model:fixture-model/);
 await fs.writeFile(path.join(root,'.runtime/runtime-address.json'),JSON.stringify({instanceId:'stale',ports:{frontPort:address.ports.frontPort}}));
 const stale=await runCli(root,['doctor']);assert.match(stale.output,/Runtime status: not started/);assert.doesNotMatch(stale.output,/model:fixture-model/);
 child.kill('SIGTERM');assert.equal(await exited,0);assert.equal(foreignRequests,0);
});

test('Chinese bootstrap reports missing Node without downloading anything', async t => {
  const root = await fixture(t);
  const result = await new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [path.join(root, 'kernel/scripts/macos/bootstrap.sh'), 'doctor'], { cwd: '/', env: { ...process.env, SAPLING_LANG: 'zh' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
    child.once('error', reject); child.once('exit', code => resolve({ code, output }));
  });
  assert.equal(result.code, 1);
  assert.match(result.output, /项目内 Node 未安装或版本不符/);
  assert.match(result.output, /bash Saplingagent.sh/);
  assert.equal(await fs.access(path.join(root, '.runtime/node-install.lock')).then(() => true, () => false), false);
});
test('Chinese login failures preserve error meaning and do not expose raw credential diagnostics', async t => {
  for (const auth of ['missing', 'broken']) {
    const root = await fixture(t, { auth });
    const result = await runCli(root, ['start', '--no-open'], { SAPLING_LANG: 'zh' });
    assert.equal(result.code, 1);
    assert.match(result.output, auth === 'missing' ? /保存账号\/API\/订阅 Token 方案/ : /此错误不代表未登录/);
    assert.doesNotMatch(result.output, /PRIVATE_FIXTURE_VALUE/);
    assert.equal(await fs.access(path.join(root, 'UNEXPECTED_LAUNCH')).then(() => true, () => false), false);
  }
});

async function configurationStub(root,marker='configuration-start.json') {
 await fs.mkdir(path.join(root,'kernel/configuration'),{recursive:true});
 await fs.writeFile(path.join(root,'kernel/configuration/bootstrap.mjs'),`import fs from 'node:fs/promises';import path from 'node:path';export async function openConfiguration(root,{noOpen}){await fs.writeFile(path.join(root,${JSON.stringify(marker)}),JSON.stringify({root,home:process.env.CODEX_HOME||undefined,noOpen}));return {port:60001};}`);
}
test('CLI delegates to external configuration without Codex login or chat startup',async t=>{
 const root=await fixture(t,{auth:'broken'});await configurationStub(root);
 const result=await runCli(root,['configure','--no-open']);assert.equal(result.code,0,result.output);assert.match(result.output,/independent AI configuration/);
 const started=JSON.parse(await fs.readFile(path.join(root,'configuration-start.json'),'utf8'));assert.equal(started.noOpen,true);assert.equal(path.resolve(started.root),root);assert.equal(started.home,'/invalid-codex-home');
 // Runtime isolation is retained while explicit setup discovery uses caller home.
 assert.equal(await fs.readFile(path.join(root,'local-secrets/codex/config.toml'),'utf8'),'cli_auth_credentials_store = "file"\n');
 const defaultHome=await runCli(root,['configure','--no-open'],{CODEX_HOME:''});assert.equal(defaultHome.code,0,defaultHome.output);
 assert.equal(JSON.parse(await fs.readFile(path.join(root,'configuration-start.json'),'utf8')).home,undefined);
 assert.equal(await fs.access(path.join(root,'UNEXPECTED_LAUNCH')).then(()=>true,()=>false),false);
});

async function menuPty(root,{storageChoice=false,independent=false}={}) {
 const python=`import os,pty,select,time,sys,signal,json
pid,fd=pty.fork()
if pid==0:
 os.chdir(sys.argv[1]);os.execv('/bin/bash',['/bin/bash','Saplingagent.sh','--lang','zh'])
text=b'';end=time.time()+15;menu=False;storage=False;quit=False;status=None
try:
 while time.time()<end:
  if select.select([fd],[],[],0.1)[0]:
   try:text+=os.read(fd,65536)
   except OSError:break
   decoded=text.decode('utf8',errors='replace')
   if sys.argv[3]=='yes' and '请选择 [0, 2-6, 9]' in decoded and not quit:os.write(fd,b'0\\n');quit=True
   if '请选择 [0-4, 6, 9]' in decoded and not menu:os.write(fd,b'1\\n');menu=True
   if sys.argv[2]=='yes' and '请选择 [1-3]' in decoded and not storage:os.write(fd,b'1\\n');storage=True
   if '安装 / 修复执行完成' in decoded and not quit:os.write(fd,b'0\\n');quit=True
  done,value=os.waitpid(pid,os.WNOHANG)
  if done:status=value;break
 if status is None:
  done,value=os.waitpid(pid,os.WNOHANG)
  if done:status=value
  else:os.killpg(pid,signal.SIGKILL);_,status=os.waitpid(pid,0)
 print(json.dumps({'code':os.waitstatus_to_exitcode(status),'menu':menu,'storage':storage,'quit':quit,'text':text.decode('utf8',errors='replace')}))
finally:os.close(fd)
`;
 const {stdout}=await promisify(execFile)('python3',['-c',python,root,storageChoice?'yes':'no',independent?'yes':'no'],{timeout:20000,env:{...process.env,SAPLING_GIT_MODE:'',SAPLING_SOURCE_UPDATE_DONE:''}});return JSON.parse(stdout);
}
async function nativeNode(root) {
 const settings=JSON.parse(await fs.readFile(path.join(root,'kernel/config/macos.json'))),folder=path.join(root,'.runtime',`node-v${settings.nodeVersion}-darwin-${process.arch}`,'bin');await fs.mkdir(folder,{recursive:true});await fs.symlink(process.execPath,path.join(folder,'node'));
}
test('actual macOS terminal installs existing dependencies without a Git prompt or initialization',{skip:process.platform!=='darwin',timeout:25000},async t=>{
 const root=await fixture(t);await nativeNode(root);const result=await menuPty(root);
 assert.equal(result.code,0,result.text);assert.equal(result.quit,true);assert.equal(result.storage,false);
 assert.match(result.text,/正在启动安装 \/ 修复/);assert.match(result.text,/依赖检查完成/);assert.doesNotMatch(result.text,/请选择 \[1-3\]|Git \/ 存放/);
 assert.equal(await fs.access(path.join(root,'.git')).then(()=>true,()=>false),false);
});
test('actual macOS terminal install preserves an existing customer repository and source',{skip:process.platform!=='darwin',timeout:25000},async t=>{
 const root=await fixture(t);await nativeNode(root);const exec=promisify(execFile);
 await exec('git',['init','-b','custom',root]);await exec('git',['-C',root,'remote','add','origin','https://example.invalid/my.git']);await fs.writeFile(path.join(root,'feature.txt'),'my page');const before=await fs.readFile(path.join(root,'.git/config'));
 const result=await menuPty(root);assert.equal(result.code,0,result.text);assert.equal(result.quit,true);
 assert.deepEqual(await fs.readFile(path.join(root,'.git/config')),before);assert.equal(await fs.readFile(path.join(root,'feature.txt'),'utf8'),'my page');
});

test('AI setup remains available with kernel dependencies when app frontend and lock are broken',async t=>{
 const root=await fixture(t);await configurationStub(root,'core-setup-started');await fs.mkdir(path.join(root,'kernel'),{recursive:true});await fs.writeFile(path.join(root,'kernel/package.json'),'{}');
 for(const relative of ['.bin/opencode',`@anthropic-ai/claude-agent-sdk-darwin-${process.arch}/claude`]){const target=path.join(root,'kernel/node_modules',relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,'backend/agent-runtime/node_modules',relative),target);}
 await fs.mkdir(path.join(root,'kernel/node_modules/vite/bin'),{recursive:true});await fs.writeFile(path.join(root,'kernel/node_modules/vite/bin/vite.js'),"import fs from 'node:fs';fs.writeFileSync('core-ui-built','yes')");
 await fs.mkdir(path.join(root,'kernel/services/ai-config'),{recursive:true});await fs.writeFile(path.join(root,'kernel/services/ai-config/server.mjs'),"import fs from 'node:fs';fs.writeFileSync('core-setup-started','yes')");
 await fs.rm(path.join(root,'front/node_modules'),{recursive:true,force:true});await fs.writeFile(path.join(root,'front/package-lock.json'),'CUSTOMER APP LOCK');
 const result=await runCli(root,['configure','--no-open']);assert.equal(result.code,0,result.output);assert.equal(JSON.parse(await fs.readFile(path.join(root,'core-setup-started'),'utf8')).noOpen,true);assert.equal(await fs.readFile(path.join(root,'front/package-lock.json'),'utf8'),'CUSTOMER APP LOCK');
});
