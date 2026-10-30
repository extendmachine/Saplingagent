import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {ConfigurationController} from '../controller.mjs';
import {saveSession,readSession} from '../session.mjs';
import {finishConfiguration} from '../handoff.mjs';
import {resumeAIConfiguration,nativeRestartArtifact} from '../ai-lifecycle.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const exists=file=>fs.access(file).then(()=>true,()=>false);
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
async function fixture(t,{identity=true}={}){
 const parent=path.join(repo,'.cache/configuration-ai-tests');await fs.mkdir(parent,{recursive:true});
 const base=await fs.mkdtemp(path.join(parent,'flow-')),root=path.join(base,'Application'),directory=path.join(base,'sapling-config-fixture');await fs.mkdir(root);await fs.mkdir(directory);
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const projectId=identity?randomUUID():null;
 if(identity){await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/project.json'),JSON.stringify({schemaVersion:1,projectId,name:'Application',folderName:'Application',icon:null}));}
 const session={id:randomUUID(),nonce:'a'.repeat(64),pid:process.pid,root,directory,projectId,configurationMode:'ai',bootstrapPids:[]};await saveSession(session);
 const manager=new ConfigurationController(root,{session,nativeRestartArtifact:async()=>null,closeNative:async()=>{},compiler:async()=>assert.fail('AI configuration must never compile')});
 return {base,root,directory,session,manager};
}
test('AI write preparation stops once, owns a lease and finishes without identity or launcher changes',async t=>{
 const {root,manager}=await fixture(t),events=[];
 await fs.writeFile(path.join(root,'business.txt'),'application');await fs.mkdir(path.join(root,'local-secrets/codex/sessions'),{recursive:true});await fs.writeFile(path.join(root,'local-secrets/codex/sessions/history'),'retained');
 await fs.mkdir(path.join(root,'Application.app'));await fs.writeFile(path.join(root,'Application.app/sentinel'),'native');
 const originals=await Promise.all(['config/project.json','business.txt','local-secrets/codex/sessions/history','Application.app/sentinel'].map(async f=>[f,await fs.readFile(path.join(root,f))]));
 manager.runtime=async()=>({phase:events.includes('stop')?'stopped':'ready'});
 manager.closeNative=async()=>{events.push('native');};manager.stop=async()=>{events.push('stop');};
 await Promise.all([manager.prepareAIChange(),manager.prepareAIChange()]);assert.deepEqual(events,['native','stop','native']);
 assert.equal(await exists(path.join(root,'.runtime/kernel-operation.lock')),true);assert.equal(manager.aiPrepared,true);assert.equal(manager.session.restartAfterClose,'runtime');
 await assert.rejects(manager.stageSetup({name:'Changed'}),{code:'AI_CONFIGURATION_ONLY'});await assert.rejects(manager.build(),{code:'AI_CONFIGURATION_ONLY'});
 assert.deepEqual(await manager.prepareAIFinish(),{restartAfterClose:'runtime'});assert.equal(await exists(path.join(root,'.runtime/kernel-operation.lock')),false);
 assert.deepEqual(await manager.prepareAIFinish(),{restartAfterClose:'runtime'});await assert.rejects(manager.prepareAIChange(),{code:'CONFIGURATION_CLOSING'});
 for(const [f,b]of originals)assert.deepEqual(await fs.readFile(path.join(root,f)),b);
 assert.equal(await exists(path.join(root,'.runtime/setup-finalization.json')),false);
});
test('AI state and read-only close do not create project identity, stop services or request restart',async t=>{
 const {root,manager}=await fixture(t,{identity:false});manager.stop=async()=>assert.fail('Read-only visit must not stop');manager.closeNative=async()=>assert.fail('Read-only visit must not close app');
 assert.equal((await manager.state()).configurationMode,'ai');assert.deepEqual(await manager.prepareAIFinish(),{restartAfterClose:'none'});
 assert.equal(await exists(path.join(root,'config/project.json')),false);assert.equal(await exists(path.join(root,'.runtime/kernel-operation.lock')),false);
});
test('AI changes made while initially stopped still request application startup',async t=>{
 const {manager}=await fixture(t);await manager.prepareAIChange();assert.equal(manager.session.restartAfterClose,'runtime');await manager.prepareAIFinish();
});
test('busy shutdown refuses credential preparation and preserves a foreign operation receipt',async t=>{
 const {root,manager}=await fixture(t);manager.stop=async()=>{throw Object.assign(Error('Task active'),{code:'RUNTIME_BUSY'});};
 await assert.rejects(manager.prepareAIChange(),{code:'RUNTIME_BUSY'});assert.equal(manager.aiPrepared,undefined);assert.equal(await exists(path.join(root,'.runtime/kernel-operation.lock')),false);
 const lock=path.join(root,'.runtime/kernel-operation.lock');await fs.writeFile(lock,'foreign');manager.stop=async()=>{};
 await assert.rejects(manager.prepareAIChange(),{code:'KERNEL_BUSY'});assert.equal(await fs.readFile(lock,'utf8'),'foreign');await manager.prepareAIFinish();assert.equal(await fs.readFile(lock,'utf8'),'foreign');
});
test('AI finish only refreshes an already valid ready receipt and preserves its other evidence',async t=>{
 const {root,manager}=await fixture(t),file=path.join(root,'.runtime/setup-finalization.json');
 const ready={schemaVersion:1,phase:'ready',root,connectionsFingerprint:'old',artifact:'Application.app',finishedAt:'old-time',id:'previous-setup'};await fs.writeFile(file,JSON.stringify(ready));
 manager.settingsSaved=async()=>true;manager.directoryReady=async()=>true;manager.connectionsFingerprint=async()=>'new';
 await manager.prepareAIChange();await manager.prepareAIFinish();assert.deepEqual(await read(file),{...ready,connectionsFingerprint:'new'});
});
test('mode defaults remain compatible while mismatched or unknown session modes are rejected',async t=>{
 const {root,directory,session}=await fixture(t);const files=[path.join(root,'.runtime/configuration-session.json'),path.join(directory,'session.json')];
 for(const f of files){const record=await read(f);delete record.configurationMode;await fs.writeFile(f,JSON.stringify(record));}
 assert.equal((await readSession(directory,root)).configurationMode,'setup');
 await saveSession(session);const record=await read(files[0]);record.configurationMode='setup';await fs.writeFile(files[0],JSON.stringify(record));await assert.rejects(readSession(directory,root),{code:'CONFIGURATION_OWNERSHIP'});
 await assert.rejects(saveSession({...session,configurationMode:'other'}),{code:'CONFIGURATION_MODE_INVALID'});
});
async function realReturningA(t,{fail=false}={}){
 const f=await fixture(t);const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});await once(child,'spawn');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill();await once(child,'exit');}});
 f.session.pid=child.pid;f.session.restartAfterClose='runtime';await saveSession(f.session);
 await fs.writeFile(path.join(f.directory,'process.json'),JSON.stringify({id:f.session.id,nonce:f.session.nonce,pid:child.pid}));
 await fs.writeFile(path.join(f.root,'.runtime/management-address.json'),JSON.stringify({pid:child.pid}));
 let resumed=0;
 const done=finishConfiguration(f.root,f.directory,{timeout:10000,resume:async(root,session)=>{resumed++;assert.equal(root,f.root);assert.equal(session.restartAfterClose,'runtime');assert.equal(await exists(f.directory),false);assert.equal(await exists(path.join(root,'.runtime/kernel-operation.lock')),false);assert.equal(await exists(path.join(root,'.runtime/management-address.json')),false);if(fail)throw Object.assign(Error('Synthetic startup failure'),{code:'CONFIGURATION_RESTART_FAILED'});return {restarted:true,url:'http://127.0.0.1:61234/'};}});
 const outcome=done.then(value=>({value}),error=>({error}));
 for(let i=0;i<200&&!await exists(path.join(f.directory,'takeover.json'));i++)await delay(10);
 assert.equal(await exists(path.join(f.directory,'takeover.json')),true);assert.equal(resumed,0);const exited=once(child,'exit');child.kill();await exited;
 const result=await outcome;assert.equal(resumed,1);return {...f,result};
}
test('returning A observes real B exit and cleans all owned discovery before restart',async t=>{
 const {root,result}=await realReturningA(t);assert.equal(result.value.restarted,true);assert.equal((await read(path.join(root,'.runtime/configuration-complete.json'))).phase,'complete');assert.equal((await read(path.join(root,'.runtime/ai-configuration.json'))).phase,'complete');
});
test('restart failure after cleanup preserves saved status and never reports ready',async t=>{
 const {root,result}=await realReturningA(t,{fail:true});assert.equal(result.error.code,'CONFIGURATION_RESTART_FAILED');assert.equal((await read(path.join(root,'.runtime/configuration-complete.json'))).phase,'restart-failed');assert.equal((await read(path.join(root,'.runtime/ai-configuration.json'))).saved,true);
});
test('resume starts a plain runtime when no native app existed and does not compile',async t=>{
 const {root,session}=await fixture(t);const opened=[];let starts=0;
 const result=await resumeAIConfiguration(root,{...session,restartAfterClose:'runtime'},{open:async url=>opened.push(url),launcher:{startConfiguredProject:async({onRuntime})=>{starts++;const state={phase:'ready',url:'http://127.0.0.1:61234/'};await onRuntime(state);return state;}}});
 assert.equal(starts,1);assert.equal(result.restarted,true);assert.equal(opened.length,1);
});
test('native restart reuses a validated existing app even when it is initially stopped',{skip:process.platform!=='darwin'},async t=>{
 const {root,session}=await fixture(t);await fs.mkdir(path.join(root,'Application.app'));await fs.writeFile(path.join(root,'.runtime/launcher.json'),JSON.stringify({projectId:session.projectId,artifact:'Application.app'}));
 assert.equal(await nativeRestartArtifact(root),'Application.app');const opened=[];
 const result=await resumeAIConfiguration(root,{...session,restartAfterClose:'native',restartArtifact:'Application.app'},{open:async file=>opened.push(file),launcher:{runtime:async()=>({phase:'ready',url:'http://127.0.0.1:61235/'})}});
 assert.equal(result.restarted,true);assert.deepEqual(opened,[path.join(root,'Application.app')]);
 await assert.rejects(resumeAIConfiguration(root,{...session,restartAfterClose:'native',restartArtifact:'../Other.app'}),{code:'CONFIGURATION_RESTART_FAILED'});
});
