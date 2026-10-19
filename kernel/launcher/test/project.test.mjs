import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ProjectLauncher,saveProject,readProject,validateProjectName } from '../manager.mjs';
import { publishArtifact,buildEnv } from '../build.mjs';
import { createConfigurationServer } from '../../services/ai-config/server.mjs';
const project=fileURLToPath(new URL('../../../',import.meta.url));
const exec=promisify(execFile);
async function fixture(t){const parent=path.join(project,'.cache/launcher-tests');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'app-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
for(const value of ['My App',"客户's App",'My.App'])test('portable project name: '+value,()=>assert.equal(validateProjectName(value),value));
for(const value of ['../outside','a/b','a\\b','NUL','con.txt','COM1','bad:name','trailing.',' spaced','x\n'])test('unsafe name rejected: '+JSON.stringify(value),()=>assert.throws(()=>validateProjectName(value),e=>e.code==='INVALID_PROJECT_NAME'));
test('project identity stays independent and returns only known public fields',async t=>{const root=await fixture(t);await saveProject(root,{name:'My App',folderName:'My App'});const id=(await readProject(root)).projectId;await saveProject(root,{name:'New App'});assert.equal((await readProject(root)).projectId,id);const file=path.join(root,'config/project.json');const value=JSON.parse(await fs.readFile(file));value.apiKey='synthetic-only';await fs.writeFile(file,JSON.stringify(value));assert.doesNotMatch(JSON.stringify(await readProject(root)),/synthetic-only/);assert.equal(await fs.access(path.join(root,'.git')).then(()=>true,()=>false),false);});
test('invalid icon does not replace project settings or write external files',async t=>{const root=await fixture(t);await saveProject(root,{name:'Before'});await assert.rejects(saveProject(root,{name:'After',iconData:'data:image/png;base64,AAAA'}),e=>e.code==='INVALID_PROJECT_ICON');assert.equal((await readProject(root)).name,'Before');});
test('artifact replacement retains old output when destination is unrelated or new stage is missing',async t=>{const root=await fixture(t);await fs.writeFile(path.join(root,'App.exe'),'previous');await assert.rejects(publishArtifact(root,path.join(root,'missing'),'App.exe'),e=>e.code==='LAUNCHER_DESTINATION_EXISTS');await assert.rejects(publishArtifact(root,path.join(root,'missing'),'App.exe',{oldRelative:'App.exe'}),e=>e.code==='LAUNCHER_REPLACE_FAILED');assert.equal(await fs.readFile(path.join(root,'App.exe'),'utf8'),'previous');const next=path.join(root,'.runtime/new.exe');await fs.writeFile(next,'next');await publishArtifact(root,next,'App.exe',{oldRelative:'App.exe'});assert.equal(await fs.readFile(path.join(root,'App.exe'),'utf8'),'next');});
test('copied runtime discovery cannot act on a foreign directory',async t=>{const root=await fixture(t);await fs.mkdir(path.join(root,'.runtime'));await fs.writeFile(path.join(root,'.runtime/runtime-address.json'),JSON.stringify({root:'/other/project',pid:process.pid,ports:{runtimeManagerPort:12345}}));const manager=new ProjectLauncher(root);assert.equal((await manager.runtime()).phase,'stopped');assert.deepEqual(await manager.stop(),{stopped:true});});
test('runtime identity mismatch is ignored even if the port is live',async t=>{const root=await fixture(t);const server=http.createServer((req,res)=>res.end(JSON.stringify({instanceId:'foreign',applicationRoot:'/other/app',phase:'ready'})));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));await fs.mkdir(path.join(root,'.runtime'));await fs.writeFile(path.join(root,'.runtime/runtime-address.json'),JSON.stringify({root,pid:process.pid,instanceId:'owned',ports:{runtimeManagerPort:server.address().port}}));assert.equal((await new ProjectLauncher(root).runtime()).phase,'stopped');});
test('build is serialized and a compiler failure preserves the previous launcher',async t=>{const root=await fixture(t);await saveProject(root,{name:'App'});let unblock;const gate=new Promise(r=>unblock=r);const manager=new ProjectLauncher(root,{run:async()=>{await gate;},compiler:async()=>{throw Object.assign(Error('synthetic compile failure'),{status:500,code:'BUILD_FAILED'});}});await fs.writeFile(path.join(root,'App.exe'),'old');await manager.stageSetup({name:'App',renameFolder:false});const project=await readProject(root);await fs.writeFile(path.join(root,'.runtime/project-directory.json'),JSON.stringify({schemaVersion:1,projectId:project.projectId,root,folderName:project.folderName}));await fs.writeFile(path.join(root,'.runtime/setup-finalization.json'),JSON.stringify({phase:'ready',root,connectionsFingerprint:await manager.connectionsFingerprint()}));const job=await manager.build();await assert.rejects(manager.save({name:'Other'}),e=>e.code==='PROJECT_BUSY');await assert.rejects(manager.build(),e=>e.code==='PROJECT_BUSY');unblock();await manager.completion;assert.equal(job.phase,'failed');assert.equal(await fs.readFile(path.join(root,'App.exe'),'utf8'),'old');});
test('explicit rename preserves ordinary Git metadata and refuses linked worktrees',async t=>{const root=await fixture(t);const app=path.join(root,'Before');await fs.mkdir(app);await exec('git',['init','--quiet',app]);const manager=new ProjectLauncher(app);const result=await manager.rename('After');assert.equal(result.root,path.join(root,'After'));assert.equal(await fs.access(path.join(result.root,'.git')).then(()=>true,()=>false),true);await fs.rm(path.join(result.root,'.git'),{recursive:true});await fs.writeFile(path.join(result.root,'.git'),'gitdir: /synthetic');await assert.rejects(manager.rename('Again'),e=>e.code==='PROJECT_GIT_RENAME');});
test('HTTP project build requires authentication and a saved AI scheme',async t=>{const root=await fixture(t);const assets=path.join(root,'ui');await fs.mkdir(assets);await fs.writeFile(path.join(assets,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__">');const server=createConfigurationServer({root,assets});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.shutdown());const base=`http://127.0.0.1:${server.address().port}`;const html=await fetch(base).then(r=>r.text());const token=html.match(/content="([^"]+)"/)[1];const headers={'X-Sapling-Config':token,Origin:base,'Content-Type':'application/json'};assert.equal((await fetch(base+'/api/config/project')).status,401);assert.equal((await fetch(base+'/api/config/project/build',{method:'POST',headers,body:'{}'})).status,409);const saved=await fetch(base+'/api/config/project/save',{method:'POST',headers,body:JSON.stringify({name:'Test App'})}).then(r=>r.json());assert.equal(saved.project.name,'Test App');const state=await fetch(base+'/api/config/project',{headers:{'X-Sapling-Config':token}}).then(r=>r.json());assert.equal(state.project.name,'Test App');assert.equal(state.runtime.phase,'stopped');});
test('build environment never forwards common inherited credentials',()=>{process.env.SAPLING_TEST_API_KEY='synthetic-only';const env=buildEnv(project);delete process.env.SAPLING_TEST_API_KEY;assert.equal(env.SAPLING_TEST_API_KEY,undefined);assert.equal(env.GOTOOLCHAIN,'local');assert.ok(env.GOCACHE.startsWith(project));});

test('cancelled compiler command terminates its owned process and retains previous output',async t=>{
 const root=await fixture(t);const {command}=await import('../build.mjs');const abort=new AbortController();const marker=path.join(root,'child.pid');
 const work=command(root,process.execPath,['-e',"require('fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",marker],{signal:abort.signal,timeout:10000});
 for(let i=0;i<100&&!await fs.access(marker).then(()=>true,()=>false);i++)await new Promise(r=>setTimeout(r,10));
 const pid=Number(await fs.readFile(marker,'utf8'));abort.abort();await assert.rejects(work,e=>e.code==='BUILD_CANCELLED');
 for(let i=0;i<100;i++){try{process.kill(pid,0);}catch{ return; }await new Promise(r=>setTimeout(r,10));}
 assert.fail('cancelled command process still running');
});

test('cancellation waits for stubborn owned descendants before completing',{skip:process.platform==='win32',timeout:8000},async t=>{
 const root=await fixture(t);const {command}=await import('../build.mjs');const abort=new AbortController();const marker=path.join(root,'tree.json');
 const childCode="process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
 const script="const cp=require('child_process'),fs=require('fs');const c=cp.spawn(process.execPath,['-e',process.argv[2]],{stdio:'ignore'});setTimeout(()=>fs.writeFileSync(process.argv[1],JSON.stringify({parent:process.pid,child:c.pid})),100);setInterval(()=>{},1000)";
 const work=command(root,process.execPath,['-e',script,marker,childCode],{signal:abort.signal});
 for(let i=0;i<200&&!await fs.access(marker).then(()=>true,()=>false);i++)await new Promise(r=>setTimeout(r,10));
 const pids=JSON.parse(await fs.readFile(marker,'utf8'));t.after(()=>{for(const p of Object.values(pids))try{process.kill(p,'SIGKILL');}catch{}});
 abort.abort();await assert.rejects(work,e=>e.code==='BUILD_CANCELLED');
 for(const p of Object.values(pids)){let gone=false;for(let i=0;i<100;i++){try{process.kill(p,0);}catch{gone=true;break;}await new Promise(r=>setTimeout(r,10));}assert.equal(gone,true,'owned descendant survived cancellation');}
});

test('case-only launcher renaming never deletes the new output',async t=>{
 const root=await fixture(t);await fs.writeFile(path.join(root,'App.exe'),'old');await fs.mkdir(path.join(root,'.runtime'));const stage=path.join(root,'.runtime/staged.exe');await fs.writeFile(stage,'new');
 await publishArtifact(root,stage,'app.exe',{oldRelative:'App.exe'});
 assert.equal(await fs.readFile(path.join(root,'app.exe'),'utf8'),'new');assert.equal((await fs.readdir(root)).filter(f=>f.toLowerCase()==='app.exe').length,1);
});

for(const [platform,arch,expected] of [['darwin','x64','go1.27.2.darwin-amd64.tar.gz'],['darwin','arm64','go1.27.2.darwin-arm64.tar.gz'],['win32','x64','go1.27.2.windows-amd64.zip'],['win32','arm64','go1.27.2.windows-arm64.zip']])test('official compiler archive for '+platform+'/'+arch,async()=>{const {toolchainForDevice}=await import('../build.mjs');const pin=JSON.parse(await fs.readFile(path.join(project,'kernel/launcher/toolchain.json')));const file=toolchainForDevice(pin,platform,arch);assert.equal(file.filename,expected);assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(file.size>1000000);});
test('compiler selection rejects unsupported OS/architecture before download',async()=>{const {toolchainForDevice}=await import('../build.mjs');const pin=JSON.parse(await fs.readFile(path.join(project,'kernel/launcher/toolchain.json')));for(const pair of [['linux','x64'],['win32','ia32'],['darwin','riscv64']])assert.throws(()=>toolchainForDevice(pin,...pair),e=>e.code==='UNSUPPORTED_DEVICE');});

test('directory preparation renames before confirmation and binds readiness to the final root', async t=>{
 const parent=await fixture(t),root=path.join(parent,'Before');await fs.mkdir(root);const manager=new ProjectLauncher(root);
 assert.equal((await manager.state()).directoryReady,false);
 await fs.mkdir(path.join(root,'local-secrets/notes'),{recursive:true});await fs.writeFile(path.join(root,'local-secrets/notes/project-secrets.json'),JSON.stringify({project:{root},credentials:[{id:'synthetic',credential_file:'../api-keys/synthetic.json'}]}));
 const result=await manager.prepare({name:'After',folderName:'After',renameFolder:true});assert.equal(result.root,path.join(parent,'After'));assert.equal(result.renamed,true);assert.equal((await manager.state()).directoryReady,true);
 const ledger=JSON.parse(await fs.readFile(path.join(result.root,'local-secrets/notes/project-secrets.json')));assert.equal(ledger.project.root,result.root);assert.deepEqual(ledger.credentials,[{id:'synthetic',credential_file:'../api-keys/synthetic.json'}]);
 const marker=JSON.parse(await fs.readFile(path.join(result.root,'.runtime/project-directory.json')));assert.equal(marker.projectId,result.project.projectId);assert.equal(marker.root,result.root);
 await manager.save({name:'Other',folderName:'Not applied'});assert.equal((await manager.state()).directoryReady,false);await assert.rejects(manager.build(),e=>e.code==='PROJECT_RESTART_REQUIRED');
});
test('preparing without rename keeps the actual folder and existing destination failures preserve identity',async t=>{
 const parent=await fixture(t),root=path.join(parent,'Before');await fs.mkdir(root);await fs.mkdir(path.join(parent,'Occupied'));const manager=new ProjectLauncher(root);
 await assert.rejects(manager.prepare({name:'Name',folderName:'Occupied',renameFolder:true}),e=>e.code==='PROJECT_FOLDER_EXISTS');assert.equal((await readProject(root)).projectId,null);
 const result=await manager.prepare({name:'Name',folderName:'Ignored',renameFolder:false});assert.equal(result.root,root);assert.equal(result.project.folderName,'Before');assert.equal(await manager.directoryReady(),true);
 await manager.rename('Later');assert.equal(await manager.directoryReady(),false);assert.equal(await fs.access(root).then(()=>true,()=>false),false);
});
test('relocating process paths respects directory boundaries and external login import sources',async()=>{
 const {relocateEnvironment}=await import('../relocation.mjs');const root=path.resolve('/synthetic/Before'),next=path.resolve('/synthetic/After');
 const env={SEED_ROOT:root,SEED_CODEX_BIN:path.join(root,'kernel/scripts/macos/codex.sh'),CODEX_HOME:path.resolve('/external/auth'),TMPDIR:path.join(root,'.runtime/tmp'),PATH:[path.join(root,'.runtime/node/bin'),root+'-other/bin','/usr/bin'].join(path.delimiter)};
 relocateEnvironment(root,next,env);assert.equal(env.SEED_ROOT,next);assert.equal(env.CODEX_HOME,path.resolve('/external/auth'));assert.equal(env.TMPDIR,path.join(next,'.runtime/tmp'));assert.equal(env.PATH.split(path.delimiter)[0],path.join(next,'.runtime/node/bin'));assert.equal(env.PATH.split(path.delimiter)[1],root+'-other/bin');
});

test('invalid prepare payload cannot move an existing project or clear its confirmation',async t=>{
 const root=await fixture(t),manager=new ProjectLauncher(root);await manager.prepare({name:'Valid',renameFolder:false});
 const before=await readProject(root);await assert.rejects(manager.prepare({name:'Invalid/name',folderName:'Later',renameFolder:true}),e=>e.code==='INVALID_PROJECT_NAME');await assert.rejects(manager.prepare({name:'Valid',folderName:'Later',renameFolder:true,iconData:'data:image/png;base64,AAAA'}),e=>e.code==='INVALID_PROJECT_ICON');assert.equal(manager.root,root);assert.equal(await manager.directoryReady(),true);assert.deepEqual(await readProject(root),before);
});
