import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../../', import.meta.url));
async function fixture(t, os = 'MINGW64_NT-10.0-19045') {
  const parent = path.join(project, '.cache/shell-routing'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "中文 app's "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const file of ['kernel/localization/installer-messages.sh','kernel/localization/installer-messages.ps1','Saplingagent.sh','kernel/scripts/platform.sh','kernel/scripts/Saplingagent.sh', 'kernel/scripts/windows/bootstrap.sh', 'kernel/scripts/windows/bootstrap.ps1']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.copyFile(path.join(project, file), path.join(root, file));
  }
  for(const platform of ['linux','macos']){
    const folder=path.join(root,'kernel/scripts',platform);await fs.mkdir(folder,{recursive:true});
    await fs.writeFile(path.join(folder,'bootstrap.sh'), `#!/bin/bash\nprintf '%s\\n' "$SAPLING_PLATFORM ${platform} $*"\nexit 19\n`);
  }
  const bin = path.join(root, 'fake-bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'uname'), `#!/bin/bash\nprintf '%s\\n' '${os}'\n`, { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'cygpath'), "#!/bin/bash\nprintf '%s' \"C:\\\\test\\\\中文 app's folder\"\n", { mode: 0o755 });
  const decode = path.join(root, 'capture.mjs');
  await fs.writeFile(decode, `import fs from 'node:fs'; const args=process.argv.slice(2); const i=args.indexOf('-EncodedCommand'); if(i<0)process.exit(90); const program=Buffer.from(args[i+1],'base64').toString('utf16le'); const item={args,program,root:process.env.SAPLING_BOOTSTRAP_ROOT,action:process.env.SAPLING_BOOTSTRAP_ACTION,flag:process.env.SAPLING_BOOTSTRAP_FLAG,secondFlag:process.env.SAPLING_BOOTSTRAP_SECOND_FLAG,language:process.env.SAPLING_LANG,platform:process.env.SAPLING_PLATFORM,argConversion:process.env.MSYS2_ARG_CONV_EXCL}; fs.appendFileSync(new URL('./capture.jsonl',import.meta.url),JSON.stringify(item)+'\\n'); process.exit(7);`);
  await fs.writeFile(path.join(bin, 'powershell.exe'), `#!/bin/bash\nexec "${process.execPath}" "${decode}" "$@"\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin` };
  delete env.SAPLING_PLATFORM;
  return { root, env };
}
async function run({ root, env }, args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [path.join(root, 'Saplingagent.sh'), ...args], { cwd: '/', env, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
    child.once('error', reject); child.once('exit', code => resolve({ code, output })); child.stdin.end(input);
  });
}
const records = async root => (await fs.readFile(path.join(root, 'capture.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
test('Windows Bash routes explicit actions with converted Unicode root and encoded program, preserving flags/exit', async t => {
  const f = await fixture(t);
  for (const args of [['install', '--repair'], ['login', '--device-auth'], ['start', '--no-open'], ['opencode'], ['configure','--no-open']]) assert.equal((await run(f, ['--lang', 'zh', ...args])).code, 7);
  const capture = await records(f.root);
  assert.deepEqual(capture.map(x => [x.action, x.flag]), [['install', '--repair'], ['login', '--device-auth'], ['start', '--no-open'], ['opencode', ''],['configure','--no-open']]);
  for (const row of capture) {
    assert.equal(row.root, "C:\\test\\中文 app's folder"); assert.equal(row.language, 'zh');
    assert.match(row.program, /installer-messages.ps1/); assert.match(row.program, /function Get-WindowsDevice/);
    assert.match(row.program, /\$env:SAPLING_BOOTSTRAP_ROOT/); assert.equal(row.argConversion, '*');
  }
});
test('the same Chinese menu returns after failed Windows install and supports configure/back and EOF', async t => {
  const f = await fixture(t);
  const result = await run(f, ['--lang', 'zh'], '2\n1\n4\n0\n');
  assert.equal(result.code, 0); assert.match(result.output, /配置 AI 接口/); assert.match(result.output, /退出码 7/);
  assert.deepEqual((await records(f.root)).map(x => x.action), ['configure','install','doctor']);
});
test('Windows routing respects independent storage and retains configure/diagnostics', async t => {
  const f = await fixture(t);
  const git = (...args) => promisify(execFile)('git', ['-C', f.root, ...args]);
  await git('init', '-b', 'main'); await git('config', '--local', 'saplingagent.storageMode', 'own');
  const result = await run(f, ['--lang', 'zh'], '1\n2\n4\n0\n');
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /1\. 安装 \/ 修复依赖/);
  assert.match(result.output, /\[0-4, 6, 9\]/);
  assert.deepEqual((await records(f.root)).map(x => x.action), ['install', 'configure', 'doctor']);
});
test('unknown host defaults to Linux and forwards the selected child exit status', async t => {
  const f = await fixture(t, 'FreeBSD');
  const result = await run(f, ['--lang','en','install']);
  assert.equal(result.code, 19); assert.match(result.output, /Defaulting to the Linux/);
  assert.match(result.output, /linux linux install/);
  await fs.writeFile(path.join(f.root,'fake-bin/uname'),'#!/bin/bash\nexit 1\n');
  const failed=await run(f,['--lang','zh','doctor']);assert.equal(failed.code,19);
  assert.match(failed.output,/默认选用 Linux/);assert.match(failed.output,/linux linux doctor/);
  assert.equal((await run(f, ['--help'])).code, 0);
  assert.equal((await run(f, ['--lang', 'en'], '0\n')).code, 0);
  await assert.rejects(fs.access(path.join(f.root, 'capture.jsonl')));
});
test('global target before or after an action overrides the environment and keeps child flags', async t=>{
  const f=await fixture(t,'Linux');f.env.SAPLING_PLATFORM='windows';
  for(const args of [['--platform','macos','--lang','zh','install','--repair'],['install','--repair','--lang','en','--platform','macos']]){
    const result=await run(f,args);assert.equal(result.code,19);assert.match(result.output,/macos macos install --repair/);
  }
  const auto=await run(f,['doctor','--platform','auto']);assert.match(auto.output,/linux linux doctor/);
  assert.equal((await run(f,['doctor'])).code,7);
  assert.deepEqual((await records(f.root)).map(r=>r.action),['doctor']);
});
test('invalid requested platforms never fall back to a different installer', async t=>{
  const f=await fixture(t);
  for (const args of [['--platform','bogus','install'],['install','--platform'],['doctor','--platform','']]){
    const result=await run(f,args);assert.equal(result.code,2);assert.match(result.output,/platform/);
  }
  f.env.SAPLING_PLATFORM='bad';assert.equal((await run(f,['install'])).code,2);
  await assert.rejects(fs.access(path.join(f.root,'capture.jsonl')));
});
test('invalid Windows action flags stop before PowerShell or downloads', async t => {
  const f = await fixture(t);
  assert.equal((await run(f, ['doctor', '--repair'])).code, 2);
  assert.equal((await run(f, ['install', '--repair', '--other'])).code, 2);
  await assert.rejects(fs.access(path.join(f.root, 'capture.jsonl')));
});

test('Windows kernel routes optional update acknowledgement and recovery ID without shell interpolation',async t=>{const f=await fixture(t),id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';for(const args of [[],['status'],['check'],['update','--accept-risk'],['restore',id]])assert.equal((await run(f,['kernel',...args])).code,7);const rows=await records(f.root);assert.deepEqual(rows.map(x=>[x.action,x.flag,x.secondFlag]),[['kernel','',''],['kernel','status',''],['kernel','check',''],['kernel','update','--accept-risk'],['kernel','restore',id]]);assert.equal((await run(f,['kernel','restore','../escape'])).code,2);assert.equal((await records(f.root)).length,5);});


test('Windows configure preserves AI-only and no-open flags in either order',async t=>{
 const f=await fixture(t);
 for(const flags of [['--ai-only'],['--ai-only','--no-open'],['--no-open','--ai-only']])assert.equal((await run(f,['configure',...flags])).code,7);
 assert.deepEqual((await records(f.root)).map(r=>[r.flag,r.secondFlag]),[['--ai-only',''],['--ai-only','--no-open'],['--no-open','--ai-only']]);
 for(const flags of [['--ai-only','--other'],['--ai-only','--ai-only'],['--no-open','--no-open'],['--ai-only','--no-open','--other']])assert.equal((await run(f,['configure',...flags])).code,2);
 assert.equal((await records(f.root)).length,3);
});

test('foreground install asks once and accepts the Linux default, another platform, or cancellation',
{skip:process.platform==='win32'||spawnSync('python3',['--version']).status!==0, timeout:15000}, async t=>{
  const f=await fixture(t, 'FreeBSD');
  // A pseudo terminal is needed to exercise the installer's actual TTY gate.
  const python=`import os,pty,select,sys,time
pid,fd=pty.fork()
if pid==0:
 os.execv('/bin/bash',['/bin/bash',sys.argv[1],'--lang','en']+sys.argv[3:])
data=b'';sent=False;deadline=time.monotonic()+5
while time.monotonic()<deadline:
 if select.select([fd],[],[],0.2)[0]:
  try: chunk=os.read(fd,8192)
  except OSError: break
  if not chunk: break
  data+=chunk
  if not sent and b'[1-3, 0]:' in data:
   os.write(fd,(sys.argv[2]+'\\n').encode());sent=True
else:
 os.kill(pid,9);os.waitpid(pid,0);raise RuntimeError('terminal did not complete')
print(os.waitstatus_to_exitcode(os.waitpid(pid,0)[1]))
print(data.decode(errors='replace'))`;
  const ptyRun=async(answer,args,env=f.env)=>(await promisify(execFile)('python3',
    ['-c',python,path.join(f.root,'Saplingagent.sh'),answer,...args],{env})).stdout;
  for(const [answer,expected] of [['','linux linux install'],['1','macos macos install'],['0','130']]){
    const output=await ptyRun(answer,['install']);assert.equal(output.split('Installation platform').length,2);
    assert.ok(output.includes(expected),output);
    if(answer==='0')assert.doesNotMatch(output,/linux linux install|macos macos install/);
  }
  await fs.mkdir(path.join(f.root,'kernel/launcher'),{recursive:true});
  await fs.writeFile(path.join(f.root,'kernel/launcher/entry.mjs'),'// first installation');
  const first=await ptyRun('2',[]);assert.equal(first.split('Installation platform').length,2);
  assert.match(first,/linux linux install/);
  for(const [args,env] of [[['install','--platform','auto'],f.env],[['install'],{...f.env,SAPLING_PLATFORM:'auto'}],[['doctor'],f.env]]){
    const output=await ptyRun('',args,env);assert.doesNotMatch(output,/Installation platform/);
    assert.match(output,/linux linux (install|doctor)/);
  }
});
