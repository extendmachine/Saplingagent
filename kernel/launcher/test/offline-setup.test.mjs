import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {ProjectLauncher,readProject} from '../manager.mjs';
import {assertSetupAvailable,acquireKernelLock} from '../../contracts/kernel.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(t){const parent=path.join(repo,'.cache/offline-setup-tests');await fs.mkdir(parent,{recursive:true});const temp=await fs.mkdtemp(path.join(parent,'flow-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));const root=path.join(temp,'Before');await fs.mkdir(root);return {temp,root};}
async function ready(root,manager){const project=await readProject(root);await fs.writeFile(path.join(root,'.runtime/project-directory.json'),JSON.stringify({schemaVersion:1,root,projectId:project.projectId,folderName:project.folderName}));await fs.writeFile(path.join(root,'.runtime/setup-finalization.json'),JSON.stringify({schemaVersion:1,root,phase:'ready',connectionsFingerprint:await manager.connectionsFingerprint()}));}
test('all settings save before physical move and export remains unavailable',async t=>{
 const {root}=await fixture(t),manager=new ProjectLauncher(root);const saved=await manager.stageSetup({name:'Display',folderName:'After',renameFolder:true});
 assert.equal(saved.name,'Display');assert.equal(saved.folderName,'After');assert.equal(manager.root,root);assert.equal(await fs.access(root).then(()=>true,()=>false),true);
 const state=await manager.state();assert.equal(state.settingsSaved,true);assert.equal(state.directoryReady,false);assert.equal(state.exportReady,false);assert.equal(state.finalization.phase,'saved');
 await assert.rejects(manager.build(),e=>e.code==='PROJECT_RESTART_REQUIRED');
});
test('ready export is invalidated by connection edits or changed identity',async t=>{
 const {root}=await fixture(t),manager=new ProjectLauncher(root);await manager.stageSetup({name:'Display',renameFolder:false});await ready(root,manager);assert.equal(await manager.exportReady(),true);
 await fs.mkdir(path.join(root,'local-secrets/ai-config'),{recursive:true});await fs.writeFile(path.join(root,'local-secrets/ai-config/connections.json'),'{}');assert.equal(await manager.exportReady(),false);
 await ready(root,manager);assert.equal(await manager.exportReady(),true);await manager.invalidateSetup();assert.equal(await manager.settingsSaved(),true);assert.equal(await manager.exportReady(),false);
 await manager.save({name:'Changed'});assert.equal(await manager.settingsSaved(),false);
});
test('staging validates occupied target and invalid icon without modifying saved identity',async t=>{
 const {root,temp}=await fixture(t),manager=new ProjectLauncher(root);await manager.stageSetup({name:'Display',renameFolder:false});const before=await readProject(root);
 await fs.mkdir(path.join(temp,'Occupied'));await assert.rejects(manager.stageSetup({name:'Next',folderName:'Occupied',renameFolder:true}),e=>e.code==='PROJECT_FOLDER_EXISTS');
 await assert.rejects(manager.stageSetup({name:'Next',folderName:'After',renameFolder:true,iconData:'data:image/png;base64,AAAA'}),e=>e.code==='INVALID_PROJECT_ICON');assert.deepEqual(await readProject(root),before);assert.equal(await manager.settingsSaved(),true);
});
test('a development worktree cannot stage an automatic physical rename',async t=>{
 const {root}=await fixture(t),manager=new ProjectLauncher(root);await fs.writeFile(path.join(root,'.git'),'gitdir: /synthetic-only');await assert.rejects(manager.stageSetup({name:'After',renameFolder:true}),e=>e.code==='PROJECT_GIT_RENAME');
 await manager.stageSetup({name:'Display',renameFolder:false});assert.equal(await manager.settingsSaved(),true);
});
test('setup lease blocks runtime/kernel operations except its explicit owner',async t=>{
 const {root}=await fixture(t),id=randomUUID();await fs.mkdir(path.join(root,'.runtime'));await fs.writeFile(path.join(root,'.runtime/project-finalization.json'),JSON.stringify({schemaVersion:1,id}));
 await assert.rejects(assertSetupAvailable(root),e=>e.code==='PROJECT_BUSY');await assert.rejects(acquireKernelLock(root,'test'),e=>e.code==='PROJECT_BUSY');
 const previous=process.env.SAPLING_SETUP_JOB;process.env.SAPLING_SETUP_JOB=id;
 try{await assertSetupAvailable(root);const release=await acquireKernelLock(root,'test');await release();}finally{if(previous===undefined)delete process.env.SAPLING_SETUP_JOB;else process.env.SAPLING_SETUP_JOB=previous;}
});
async function until(work,limit=300){for(let i=0;i<limit;i++){const value=await work();if(value)return value;await delay(50);}throw Error('Offline fixture did not settle');}
async function nativeFixture(t,{brokenResume=false}={}){
 const {root,temp}=await fixture(t),tools=path.join(temp,'system-temp');await fs.mkdir(tools);
 await fs.cp(path.join(repo,'kernel'),path.join(root,'kernel'),{recursive:true,filter:file=>!file.split(path.sep).some(part=>['node_modules','.cache'].includes(part))});
 await fs.mkdir(path.join(root,'.runtime'));await fs.link(process.execPath,path.join(root,'.runtime/node'));
 await fs.mkdir(path.join(root,'local-secrets/notes'),{recursive:true});await fs.writeFile(path.join(root,'local-secrets/notes/project-secrets.json'),JSON.stringify({project:{root},credentials:[{id:'synthetic',credential_file:'../api-keys/demo.json'}]}));
 await fs.mkdir(path.join(root,'.git'));await fs.writeFile(path.join(root,'.git/HEAD'),'ref: refs/heads/main\n');await fs.writeFile(path.join(root,'business.txt'),'preserve application bytes');
 await fs.rename(path.join(root,'kernel/launcher/resume-setup.mjs'),path.join(root,'kernel/launcher/resume-core.mjs'));
 await fs.writeFile(path.join(root,'kernel/launcher/resume-setup.mjs'),`import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {resumeSetup} from './resume-core.mjs';const root=fileURLToPath(new URL('../../',import.meta.url));const id=process.argv[2];await resumeSetup(root,id,process.argv[3],{prepare:async root=>{const job=JSON.parse(await fs.readFile(path.join(root,'.runtime/project-finalization.json')));let parentAlive=true;try{process.kill(job.management.pid,0);}catch{parentAlive=false;}await fs.writeFile(path.join(root,'prepared.json'),JSON.stringify({root,parentAlive}));},start:async root=>({phase:'ready',url:'http://127.0.0.1:12345/'}),management:async(root,job)=>{await fs.writeFile(path.join(root,'management-resumed.json'),JSON.stringify({root,port:job.management.port}));return{port:job.management.port};}}).catch(()=>{process.exitCode=1;});`);
 if(brokenResume)await fs.writeFile(path.join(root,'kernel/launcher/resume-setup.mjs'),'process.exit(7);');
 await fs.writeFile(path.join(root,'fixture.mjs'),`import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {ProjectLauncher} from './kernel/launcher/manager.mjs';import {beginFinalization} from './kernel/launcher/finalization.mjs';const root=process.cwd(),manager=new ProjectLauncher(root);await manager.stageSetup({name:'Display',folderName:'After',renameFolder:true});const state=await manager.state();const management={pid:process.pid,instanceId:randomUUID(),port:62025};await fs.writeFile(path.join(root,'.runtime/management-address.json'),JSON.stringify({...management,root}));const job=await beginFinalization(root,{project:state.project,management,fingerprint:await manager.settingsFingerprint(),connectionsFingerprint:await manager.connectionsFingerprint(),tempParent:process.argv[2]});console.log(JSON.stringify(job));process.stdin.resume();await new Promise(r=>process.stdin.once('end',r));`);
 const child=spawn(path.join(root,'.runtime/node'),[path.join(root,'fixture.mjs'),tools],{cwd:root,env:{...process.env,SAPLING_NO_OPEN:'1'},stdio:['pipe','pipe','pipe']});let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
 t.after(async()=>{if(child.exitCode===null){child.stdin.end();await until(()=>child.exitCode!==null).catch(()=>child.kill());}});
 const job=await until(()=>{if(child.exitCode!==null)throw Error('Fixture exited: '+errors);try{return JSON.parse(output.trim());}catch{return false;}});
 return {root,temp,tools,child,job};
}
test('real macOS external system helper waits for project exit, renames safely, resumes and deletes only its own temp files',{skip:process.platform!=='darwin',timeout:30000},async t=>{
 const {root,temp,tools,child,job}=await nativeFixture(t),after=path.join(temp,'After');
 assert.equal(job.phase,'restarting');assert.equal(await fs.access(root).then(()=>true,()=>false),true);assert.equal(await fs.access(after).then(()=>true,()=>false),false);
 const helpers=await fs.readdir(tools);assert.equal(helpers.length,1);assert.equal((await fs.stat(path.join(tools,helpers[0]))).mode&0o777,0o700);
 await fs.writeFile(path.join(tools,'unrelated.txt'),'keep');child.stdin.end();await until(()=>child.exitCode!==null);
 await until(async()=>{try{return JSON.parse(await fs.readFile(path.join(after,'.runtime/setup-finalization.json'))).phase==='ready';}catch{return false;}});
 await until(async()=>(await fs.readdir(tools)).every(file=>file==='unrelated.txt'));
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(after,'prepared.json'))),{root:after,parentAlive:false});
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(after,'management-resumed.json'))),{root:after,port:62025});
 assert.equal(await fs.readFile(path.join(after,'business.txt'),'utf8'),'preserve application bytes');assert.equal(await fs.readFile(path.join(after,'.git/HEAD'),'utf8'),'ref: refs/heads/main\n');
 const ledger=JSON.parse(await fs.readFile(path.join(after,'local-secrets/notes/project-secrets.json')));assert.equal(ledger.project.root,after);assert.deepEqual(ledger.credentials,[{id:'synthetic',credential_file:'../api-keys/demo.json'}]);
 assert.equal(await fs.access(root).then(()=>true,()=>false),false);assert.equal(await fs.access(path.join(after,'.runtime/project-finalization.json')).then(()=>true,()=>false),false);
 const manager=new ProjectLauncher(after);assert.equal(await manager.settingsSaved(),true);assert.equal(await manager.exportReady(),true);
});
test('a destination appearing during shutdown is never overwritten or nested; original setup resumes with failure',{skip:process.platform!=='darwin',timeout:30000},async t=>{
 const {root,temp,tools,child}=await nativeFixture(t),after=path.join(temp,'After');await fs.mkdir(after);await fs.writeFile(path.join(after,'foreign.txt'),'foreign');
 child.stdin.end();await until(()=>child.exitCode!==null);await until(async()=>{try{return JSON.parse(await fs.readFile(path.join(root,'.runtime/setup-finalization.json'))).phase==='failed';}catch{return false;}});
 await until(async()=>(await fs.readdir(tools)).length===0);assert.equal(await fs.readFile(path.join(after,'foreign.txt'),'utf8'),'foreign');assert.deepEqual(await fs.readdir(after),['foreign.txt']);
 assert.equal((await readProject(root)).name,'Display');assert.equal(await fs.access(path.join(root,'management-resumed.json')).then(()=>true,()=>false),true);assert.equal(await fs.access(path.join(root,'prepared.json')).then(()=>true,()=>false),false);assert.equal(await new ProjectLauncher(root).exportReady(),false);
});

test('resume failure keeps saved data, releases only its own lease and reopens management',async t=>{
 const {root}=await fixture(t),manager=new ProjectLauncher(root);await manager.stageSetup({name:'Display',renameFolder:false});const project=await readProject(root),id=randomUUID();
 const job={schemaVersion:1,id,phase:'restarting',root,previousRoot:root,targetRoot:root,projectId:project.projectId,management:{port:62025},fingerprint:await manager.settingsFingerprint(),connectionsFingerprint:await manager.connectionsFingerprint()};
 await fs.writeFile(path.join(root,'.runtime/project-finalization.json'),JSON.stringify(job));await fs.writeFile(path.join(root,'.runtime/kernel-operation.lock'),JSON.stringify({id}));
 const old=process.env.SAPLING_SETUP_JOB;process.env.SAPLING_SETUP_JOB=id;let reopened=0;
 try{const {resumeSetup}=await import('../resume-setup.mjs');await assert.rejects(resumeSetup(root,id,null,{prepare:async()=>{},start:async()=>({phase:'failed'}),management:async()=>{reopened++;return{port:62025};}}),e=>e.code==='APP_NOT_READY');}
 finally{if(old===undefined)delete process.env.SAPLING_SETUP_JOB;else process.env.SAPLING_SETUP_JOB=old;}
 assert.equal(reopened,1);assert.equal(JSON.parse(await fs.readFile(path.join(root,'.runtime/setup-finalization.json'))).phase,'failed');assert.equal(await fs.access(path.join(root,'.runtime/project-finalization.json')).then(()=>true,()=>false),false);assert.equal((await readProject(root)).projectId,project.projectId);assert.equal(await manager.exportReady(),false);
});
test('native export stops and restarts a previously running owned app even when compilation fails',async t=>{
 const {root}=await fixture(t);const manager=new ProjectLauncher(root,{run:async()=>{},compiler:async()=>{throw Object.assign(Error('synthetic'),{status:500,code:'BUILD_FAILED'});}});await manager.stageSetup({name:'Display',renameFolder:false});await ready(root,manager);
 let running=true,stops=0,starts=0;manager.runtime=async()=>({phase:running?'ready':'stopped'});manager.stop=async()=>{stops++;running=false;};manager.startConfiguredProject=async()=>{starts++;running=true;return{phase:'ready'};};
 const job=await manager.build();await manager.completion;assert.equal(job.phase,'failed');assert.equal(stops,1);assert.equal(starts,1);assert.equal(running,true);
});
test('export waits for both application and management readiness before releasing the setup lease',async t=>{
 const {root}=await fixture(t),manager=new ProjectLauncher(root);await manager.stageSetup({name:'Display',renameFolder:false});const project=await readProject(root),id=randomUUID();
 const lease={schemaVersion:1,id,root,previousRoot:root,targetRoot:root,projectId:project.projectId,management:{port:62025},language:'zh',fingerprint:await manager.settingsFingerprint(),connectionsFingerprint:await manager.connectionsFingerprint()};
 await fs.writeFile(path.join(root,'.runtime/project-finalization.json'),JSON.stringify(lease));await fs.writeFile(path.join(root,'.runtime/kernel-operation.lock'),JSON.stringify({id}));
 const old=process.env.SAPLING_SETUP_JOB;process.env.SAPLING_SETUP_JOB=id;let running=false;
 try{const {resumeSetup}=await import('../resume-setup.mjs');await resumeSetup(root,id,null,{prepare:async()=>{},start:async()=>{running=true;return{phase:'ready'};},management:async()=>{assert.equal(process.env.SAPLING_LANG,'zh');assert.equal(running,true);assert.equal(await manager.exportReady(),false);assert.equal(JSON.parse(await fs.readFile(path.join(root,'.runtime/project-finalization.json'))).id,id);return{port:62025};}});}
 finally{if(old===undefined)delete process.env.SAPLING_SETUP_JOB;else process.env.SAPLING_SETUP_JOB=old;}
 assert.equal(await manager.exportReady(),true);assert.equal(await fs.access(path.join(root,'.runtime/project-finalization.json')).then(()=>true,()=>false),false);
});
test('the external helper temp parent ignores project-local TMPDIR/TEMP from install and management',async()=>{
 const {systemTemporaryParent}=await import('../finalization.mjs');const env={TMPDIR:'/app/.runtime/tmp',TMP:'/app/.runtime/tmp',TEMP:'/app/.runtime/tmp',USERPROFILE:'C:\\Users\\Customer',LOCALAPPDATA:'C:\\Users\\Customer\\AppData\\Local'};
 assert.equal(systemTemporaryParent('darwin',env,'/Users/customer'),'/private/tmp');assert.equal(systemTemporaryParent('win32',env,'C:\\Users\\Customer'),'C:\\Users\\Customer\\AppData\\Local\\Temp');
});
test('a failed new-root Node resume records failure before temporary helper cleanup',{skip:process.platform!=='darwin',timeout:30000},async t=>{
 const {root,temp,tools,child,job}=await nativeFixture(t,{brokenResume:true}),after=path.join(temp,'After');child.stdin.end();await until(()=>child.exitCode!==null);
 await until(async()=>{try{return JSON.parse(await fs.readFile(path.join(after,'.runtime/setup-finalization.json'))).phase==='failed';}catch{return false;}});await until(async()=>(await fs.readdir(tools)).length===0);
 const state=JSON.parse(await fs.readFile(path.join(after,'.runtime/setup-finalization.json')));assert.equal(state.id,job.id);assert.equal(state.error.code,'PROJECT_RESUME_FAILED');assert.equal(await fs.access(path.join(after,'.runtime/setup-restart-error.html')).then(()=>true,()=>false),true);
 assert.equal(JSON.parse(await fs.readFile(path.join(after,'.runtime/project-finalization.json'))).id,job.id);assert.equal(await fs.access(root).then(()=>true,()=>false),false);assert.equal(await fs.readFile(path.join(after,'business.txt'),'utf8'),'preserve application bytes');
});
