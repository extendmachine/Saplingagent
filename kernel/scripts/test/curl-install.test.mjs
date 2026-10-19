import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { initializeDownloadedRecords } from '../launcher/recipient-records.mjs';
const exec=promisify(execFile),project=fileURLToPath(new URL('../../../',import.meta.url)),sha='a'.repeat(40);
async function fixture(t,{bad=false,link=false,os='Darwin',invalidVersion=false}={}){
  const base=path.join(project,'.cache/curl-tests');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,"客户 app's "));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const bin=path.join(root,'bin'),source=path.join(root,'source',`Saplingagent-${sha}`);await fs.mkdir(bin);await fs.mkdir(source,{recursive:true});
  for(const f of ['install.sh','AGENTS.md','FINAL_GOAL.md','TODO.md','AI_TASKS.md','rules/README.md','kernel/scripts/launcher/recipient-records.mjs','kernel/scripts/macos/bootstrap.sh','kernel/scripts/windows/bootstrap.sh']){await fs.mkdir(path.dirname(path.join(source,f)),{recursive:true});await fs.writeFile(path.join(source,f),'Synthetic '+f+'\n');}
  await fs.writeFile(path.join(source,'Saplingagent.sh'),`#!/bin/bash\nprintf '%s\\n' "$*" >> "${root}/actions.txt"\nif [ "\${3:-}" = install ]; then printf SYNTHETIC_CHOICE; read -r answer; printf '%s\\n' "$answer" >> "${root}/actions.txt"; fi\n`);
  await fs.mkdir(path.join(source,'config'),{recursive:true}); await fs.copyFile(path.join(project,'config/release.json'),path.join(source,'config/release.json'));
  await fs.copyFile(path.join(project,'kernel/manifest.json'),path.join(source,'kernel/manifest.json'));
  if(invalidVersion)await fs.writeFile(path.join(source,'kernel/manifest.json'),JSON.stringify({version:'0.90'}));
  if(link)await fs.symlink('../../outside',path.join(source,'symlink'));
  const archive=path.join(root,'source.tar.gz');await exec('tar',['-czf',archive,'-C',path.dirname(source),path.basename(source)]);
  if(bad)await fs.writeFile(archive,'Not an archive');
  await fs.writeFile(path.join(bin,'uname'),`#!/bin/bash\nprintf '%s\\n' '${os}'\n`,{mode:0o755});
  await fs.writeFile(path.join(bin,'curl'),`#!/bin/bash\nset -e\nprintf '%s\\n' "$*" >> "$FIXTURE_LOG"\nurl='';out='';while [ "$#" -gt 0 ]; do case "$1" in -o) out="$2";shift 2;; https:*) url="$1";shift;; *) shift;; esac;done\ncase "$url" in https://raw.githubusercontent.com/extendmachine/Saplingagent/release/kernel/scripts/install-source.sh) cat "$FIXTURE_HELPER";; https://api.github.com/repos/extendmachine/Saplingagent/git/ref/heads/release) printf '%s' '{"ref":"refs/heads/release","object":{"sha":"${sha}"}}' > "$out";; https://github.com/extendmachine/Saplingagent/archive/${sha}.tar.gz) cp "$FIXTURE_ARCHIVE" "$out";; *) exit 22;; esac\n`,{mode:0o755});
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,FIXTURE_HELPER:path.join(project,'kernel/scripts/install-source.sh'),FIXTURE_ARCHIVE:archive,FIXTURE_LOG:path.join(root,'curl.log')};
  return {root,env,source,run:(args=[],input)=>exec('/bin/bash',[path.join(project,'install.sh'),...args],{cwd:root,env,...(input?{input}:{} )})};
}
test('release-only bootstrap downloads a pinned snapshot into a Unicode/new folder without Git refs',async t=>{
 const f=await fixture(t);await f.run(['--download-only','--dir','new 客户 app']);const dest=path.join(f.root,'new 客户 app');const receipt=JSON.parse(await fs.readFile(path.join(dest,'delivery.json'),'utf8'));
 assert.equal(receipt.releaseVersion,JSON.parse(await fs.readFile(path.join(project,'config/release.json'),'utf8')).version);
 assert.equal(receipt.sourceCommit,sha);assert.equal(receipt.sourceRef,'release');assert.equal(receipt.distribution.gitIncluded,false);assert.equal(receipt.git,undefined);assert.equal(receipt.initializeRecords,true);
 const log=await fs.readFile(path.join(f.root,'curl.log'),'utf8');assert.doesNotMatch(log,/heads\/(main|testcode)/);assert.match(log,new RegExp(sha+'.tar.gz'));await assert.rejects(fs.access(path.join(dest,'.git')));
 for(const file of Object.keys(receipt.recordHashes))assert.equal(receipt.recordHashes[file],createHash('sha256').update(await fs.readFile(path.join(dest,file))).digest('hex'));
 assert.ok((await fs.readdir(f.root)).every(n=>!n.startsWith('.saplingagent-install.')));
});
test('existing destination including customer files is preserved without any download',async t=>{const f=await fixture(t);await fs.mkdir(path.join(f.root,'Saplingagent'));await fs.writeFile(path.join(f.root,'Saplingagent','customer.txt'),'Customer');await assert.rejects(f.run(['--download-only']),/Destination already exists/);assert.equal(await fs.readFile(path.join(f.root,'Saplingagent/customer.txt'),'utf8'),'Customer');await assert.rejects(fs.access(path.join(f.root,'curl.log')));});
test('invalid archive fails without publishing a destination or leaving staging files',async t=>{const f=await fixture(t,{bad:true});await assert.rejects(f.run(['--download-only']));await assert.rejects(fs.access(path.join(f.root,'Saplingagent')));assert.ok((await fs.readdir(f.root)).every(n=>!n.startsWith('.saplingagent-install.')));});
test('archive links are rejected before extraction',async t=>{const f=await fixture(t,{link:true});await assert.rejects(f.run(['--download-only']),/must not contain links/);await assert.rejects(fs.access(path.join(f.root,'Saplingagent')));});
test('Windows Git Bash uses the same downloader and records Windows source without PS/global setup',async t=>{const f=await fixture(t,{os:'MINGW64_NT-10.0-19045'});await f.run(['--download-only','--lang','zh']);const data=JSON.parse(await fs.readFile(path.join(f.root,'Saplingagent/delivery.json'),'utf8'));assert.equal(data.platform,'Windows');});
test('unsupported OS and unsupported branch options fail before download',async t=>{const f=await fixture(t,{os:'Linux'});await assert.rejects(f.run(['--download-only']),/WSL/);await assert.rejects(f.run(['--ref','main']),/Usage/);await assert.rejects(fs.access(path.join(f.root,'curl.log')));});
test('no terminal in piped/noninteractive install gives a clear download-only recovery',async t=>{const f=await fixture(t);await assert.rejects(f.run([]),/download-only/);await assert.rejects(fs.access(path.join(f.root,'curl.log')));});

test('fresh recipient documents are initialized once, keeping source provenance and unchanged rules/code',async t=>{
 const f=await fixture(t);await f.run(['--download-only']);const root=path.join(f.root,'Saplingagent');const rules=await fs.readFile(path.join(root,'rules/README.md'));assert.equal(await initializeDownloadedRecords(root),true);
 assert.match(await fs.readFile(path.join(root,'AI_TASKS.md'),'utf8'),/No task is claimed/);assert.match(await fs.readFile(path.join(root,'AGENTS.md'),'utf8'),/developer approvals do not transfer/);
 assert.deepEqual(await fs.readFile(path.join(root,'rules/README.md')),rules);
 await fs.writeFile(path.join(root,'TODO.md'),'Customer progress');assert.equal(await initializeDownloadedRecords(root),false);assert.equal(await fs.readFile(path.join(root,'TODO.md'),'utf8'),'Customer progress');
});
test('user-changed project records before first install are preserved with a warning',async t=>{const f=await fixture(t);await f.run(['--download-only']);const root=path.join(f.root,'Saplingagent');await fs.writeFile(path.join(root,'FINAL_GOAL.md'),'My application');const warnings=[];assert.equal(await initializeDownloadedRecords(root,msg=>warnings.push(msg)),false);assert.equal(await fs.readFile(path.join(root,'FINAL_GOAL.md'),'utf8'),'My application');assert.match(warnings[0],/keeping/);});

test('piped bootstrap restores installation terminal input then hands off to web setup', {skip:process.platform!=='darwin',timeout:15000},async t=>{
  const f=await fixture(t);
  const python=`import os,pty,select,time,sys,signal,json
pid,fd=pty.fork()
if pid==0:
 os.chdir(sys.argv[2]);os.execv('/bin/bash',['/bin/bash','-c','cat "$1" | /bin/bash -s -- --dir Saplingagent','fixture',sys.argv[1]])
text=b'';end=time.time()+10;sent=False;status=None
try:
 while time.time()<end:
  if select.select([fd],[],[],0.1)[0]:
   try:text+=os.read(fd,65536)
   except OSError:break
   if b'SYNTHETIC_CHOICE' in text and not sent:os.write(fd,b'3\\n');sent=True
  done,value=os.waitpid(pid,os.WNOHANG)
  if done:status=value;break
 if status is None:
  done,value=os.waitpid(pid,os.WNOHANG)
  if done:status=value
  else:os.kill(pid,signal.SIGKILL);_,status=os.waitpid(pid,0)
 print(json.dumps({'status':os.waitstatus_to_exitcode(status),'sent':sent,'text':text.decode('utf8',errors='replace')}))
finally:os.close(fd)
`;
  const {stdout}=await exec('python3',['-c',python,path.join(project,'install.sh'),f.root],{env:f.env});const result=JSON.parse(stdout);assert.equal(result.status,0,result.text);assert.equal(result.sent,true);
  const actions=await fs.readFile(path.join(f.root,'actions.txt'),'utf8');assert.equal(actions,'--lang en install\n3\n');assert.match(result.text,/Continue project setup/);
});

test('invalid distribution version is refused before reserving the customer destination',async t=>{
 const f=await fixture(t,{invalidVersion:true});await assert.rejects(f.run(['--download-only']),/Kernel version metadata/);
 await assert.rejects(fs.access(path.join(f.root,'Saplingagent')));
});
