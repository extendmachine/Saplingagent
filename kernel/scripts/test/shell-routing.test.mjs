import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../../', import.meta.url));
async function fixture(t, os = 'MINGW64_NT-10.0-19045') {
  const parent = path.join(project, '.cache/shell-routing'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "中文 app's "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const file of ['kernel/localization/installer-messages.sh','kernel/localization/installer-messages.ps1','Saplingagent.sh','kernel/scripts/Saplingagent.sh', 'kernel/scripts/windows/bootstrap.sh', 'kernel/scripts/windows/bootstrap.ps1']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.copyFile(path.join(project, file), path.join(root, file));
  }
  const bin = path.join(root, 'fake-bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'uname'), `#!/bin/bash\nprintf '%s\\n' '${os}'\n`, { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'cygpath'), "#!/bin/bash\nprintf '%s' \"C:\\\\test\\\\中文 app's folder\"\n", { mode: 0o755 });
  const decode = path.join(root, 'capture.mjs');
  await fs.writeFile(decode, `import fs from 'node:fs'; const args=process.argv.slice(2); const i=args.indexOf('-EncodedCommand'); if(i<0)process.exit(90); const program=Buffer.from(args[i+1],'base64').toString('utf16le'); const item={args,program,root:process.env.SAPLING_BOOTSTRAP_ROOT,action:process.env.SAPLING_BOOTSTRAP_ACTION,flag:process.env.SAPLING_BOOTSTRAP_FLAG,secondFlag:process.env.SAPLING_BOOTSTRAP_SECOND_FLAG,language:process.env.SAPLING_LANG,argConversion:process.env.MSYS2_ARG_CONV_EXCL}; fs.appendFileSync(new URL('./capture.jsonl',import.meta.url),JSON.stringify(item)+'\\n'); process.exit(7);`);
  await fs.writeFile(path.join(bin, 'powershell.exe'), `#!/bin/bash\nexec "${process.execPath}" "${decode}" "$@"\n`, { mode: 0o755 });
  return { root, env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` } };
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
test('Linux/WSL installation refuses without invoking Windows tools; help/menu quit remain available', async t => {
  const f = await fixture(t, 'Linux');
  const result = await run(f, ['install']); assert.equal(result.code, 1); assert.match(result.output, /WSL\/Linux/);
  assert.equal((await run(f, ['--help'])).code, 0); assert.equal((await run(f, ['--lang', 'en'], '0\n')).code, 0);
  await assert.rejects(fs.access(path.join(f.root, 'capture.jsonl')));
});
test('invalid Windows action flags stop before PowerShell or downloads', async t => {
  const f = await fixture(t);
  assert.equal((await run(f, ['doctor', '--repair'])).code, 2);
  assert.equal((await run(f, ['install', '--repair', '--other'])).code, 2);
  await assert.rejects(fs.access(path.join(f.root, 'capture.jsonl')));
});

test('Windows kernel routes optional update acknowledgement and recovery ID without shell interpolation',async t=>{const f=await fixture(t),id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';for(const args of [[],['status'],['check'],['update','--accept-risk'],['restore',id]])assert.equal((await run(f,['kernel',...args])).code,7);const rows=await records(f.root);assert.deepEqual(rows.map(x=>[x.action,x.flag,x.secondFlag]),[['kernel','',''],['kernel','status',''],['kernel','check',''],['kernel','update','--accept-risk'],['kernel','restore',id]]);assert.equal((await run(f,['kernel','restore','../escape'])).code,2);assert.equal((await records(f.root)).length,5);});
