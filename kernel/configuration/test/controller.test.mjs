import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {ConfigurationController} from '../controller.mjs';
import {saveSession} from '../session.mjs';
import {moveProject} from '../move.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
async function fixture(t){
 const parent=path.join(repo,'.cache/configuration-tests');await fs.mkdir(parent,{recursive:true});const temp=await fs.mkdtemp(path.join(parent,'controller-'));
 t.after(()=>fs.rm(temp,{recursive:true,force:true}));const root=path.join(temp,'Before'),directory=path.join(temp,'sapling-config-fixture');await fs.mkdir(root);await fs.mkdir(directory);
 const session={schemaVersion:1,id:randomUUID(),nonce:'a'.repeat(64),root,directory,pid:process.pid,projectId:null,bootstrapPids:[]};await saveSession(session);
 let compiled=0,rebound;
 const manager=new ConfigurationController(root,{session,onRelocate:async value=>{rebound=value;},compiler:async(root,project)=>{compiled++;const receipt={artifact:project.name+'.app'};await fs.writeFile(path.join(root,'.runtime/launcher.json'),JSON.stringify(receipt));return receipt;}});
 return {manager,root,temp,get compiled(){return compiled;},get rebound(){return rebound;}};
}
test('external configuration saves, moves and compiles before completion without starting application',{skip:process.platform!=='darwin'},async t=>{
 const f=await fixture(t),{manager,root,temp}=f;await fs.writeFile(path.join(root,'business.txt'),'unchanged');await manager.stageSetup({name:'测试 App',folderName:'项目 After α',renameFolder:true});
 const job=await manager.finalizeSetup();assert.equal(job.kind,'configure');await manager.completion;
 assert.equal(job.phase,'completed',JSON.stringify(job.error));assert.equal(f.compiled,1);assert.equal(f.rebound,path.join(temp,'项目 After α'));assert.equal(await fs.readFile(path.join(manager.root,'business.txt'),'utf8'),'unchanged');
 const state=await manager.state();assert.equal(state.configurationHost,'external');assert.equal(state.exportReady,true);assert.equal(state.runtime.phase,'stopped');assert.equal(await fs.access(root).then(()=>true,()=>false),false);
 assert.equal(await fs.access(path.join(manager.root,'.runtime/project-finalization.json')).then(()=>true,()=>false),false);
});
test('failed compiler keeps moved root and saved settings available for retry',{skip:process.platform!=='darwin'},async t=>{
 const f=await fixture(t),{manager,temp}=f;let failures=0;const compiler=manager.compiler;manager.compiler=async(...args)=>{if(!failures++)throw Object.assign(Error('synthetic build failure'),{status:500,code:'BUILD_FAILED'});return compiler(...args);};
 await manager.stageSetup({name:'After',renameFolder:true});const first=await manager.finalizeSetup();await manager.completion;assert.equal(first.phase,'failed');assert.equal(manager.root,path.join(temp,'After'));assert.equal(await manager.settingsSaved(),true);assert.equal(await manager.exportReady(),false);
 const retry=await manager.finalizeSetup();await manager.completion;assert.equal(retry.phase,'completed');assert.equal(await manager.exportReady(),true);
});
test('an existing destination is never replaced, even when it is empty',{skip:process.platform!=='darwin'},async t=>{
 const {root,temp}=await fixture(t),target=path.join(temp,'occupied');await fs.mkdir(target);await assert.rejects(moveProject(root,target),e=>e.code==='PROJECT_RENAME_FAILED');await fs.access(root);assert.deepEqual(await fs.readdir(target),[]);
});
test('another operation blocks configuration and its lock is preserved',async t=>{
 const {manager,root}=await fixture(t);await manager.stageSetup({name:'Before',renameFolder:false});await fs.writeFile(path.join(root,'.runtime/kernel-operation.lock'),'{}');const job=await manager.finalizeSetup();await manager.completion;assert.equal(job.phase,'failed');assert.equal(await fs.readFile(path.join(root,'.runtime/kernel-operation.lock'),'utf8'),'{}');assert.equal(await manager.settingsSaved(),true);
});
test('unchanged setup can rebuild and connection edits invalidate completed export',async t=>{
 const {manager,root}=await fixture(t);await manager.stageSetup({name:'Before',renameFolder:false});await manager.finalizeSetup();await manager.completion;assert.equal(await manager.exportReady(),true);
 await fs.mkdir(path.join(root,'local-secrets/ai-config'),{recursive:true});await fs.writeFile(path.join(root,'local-secrets/ai-config/connections.json'),'{}');assert.equal(await manager.exportReady(),false);const job=await manager.build();await manager.completion;assert.equal(job.phase,'completed');assert.equal(await manager.exportReady(),true);
});

test('external setup never starts the app before Finish handoff',async()=>{
 const controller=new ConfigurationController('/unused');
 await assert.rejects(controller.openProject(),{code:'CONFIGURATION_FINISH_REQUIRED'});
 await assert.rejects(controller.restart(),{code:'CONFIGURATION_FINISH_REQUIRED'});
});

test('active native compilation prevents configuration rename and preserves its lock',async t=>{
 const {manager,root}=await fixture(t);await manager.stageSetup({name:'After',renameFolder:true});
 const file=path.join(root,'.runtime/launcher-compile.lock');await fs.writeFile(file,JSON.stringify({pid:process.pid,id:'compiler'}));
 const job=await manager.finalizeSetup();await manager.completion;assert.equal(job.phase,'failed');assert.equal(job.error.code,'PROJECT_BUSY');assert.equal(manager.root,root);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{pid:process.pid,id:'compiler'});
});

test('an in-progress AI configuration writer blocks relocation and retains its ownership',async t=>{
 const {manager,root}=await fixture(t);await manager.stageSetup({name:'After',renameFolder:true});
 const file=path.join(root,'local-secrets/ai-config/write.lock');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify({id:'other-writer',pid:process.pid}));
 const job=await manager.finalizeSetup();await manager.completion;assert.equal(job.phase,'failed');assert.equal(job.error.code,'CONFIG_BUSY');assert.equal(manager.root,root);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).id,'other-writer');
});
