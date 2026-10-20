import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createDockController} from '../dock.mjs';
const base=fileURLToPath(new URL('../../../.cache/dock-tests/',import.meta.url));
async function fixture(t){
 await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'project 中文 '));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const projectId=randomUUID(),input={pid:91001,nonce:randomUUID()},native=path.join(root,'Demo.app/Contents/MacOS/applet');
 const write=async(name,data)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),typeof data==='string'?data:JSON.stringify(data));};
 await write('config/project.json',{schemaVersion:1,projectId,name:'Demo',folderName:path.basename(root),icon:null});
 await write('.runtime/launcher.json',{projectId,artifact:'Demo.app'});await write('Demo.app/Contents/MacOS/applet','synthetic');
 const identities=new Map([[input.pid,{stamp:'native stamp',executable:native}],[process.pid,{stamp:'worker stamp',executable:process.execPath}]]);
 let current={phase:'stopped'},calls={prepare:0,start:0,stop:0,open:0};
 const launcher={runtime:async()=>current,startConfiguredProject:async()=>{calls.start++;current={phase:'ready',url:'http://127.0.0.1:12345',applicationRoot:root,instanceId:'instance'};identities.set(91002,{stamp:'runtime stamp',executable:'synthetic-runtime'});await write('.runtime/runtime-address.json',{root,pid:91002,instanceId:'instance'});return current;},stop:async()=>{calls.stop++;current={phase:'stopped'};identities.delete(91002);}};
 const worker={pid:91004,process:{stamp:'synthetic worker',executable:'synthetic-worker'}};
 const options={configuration:async()=>null,worker,processIdentity:async pid=>{if(pid===worker.pid){const s=JSON.parse(await fs.readFile(path.join(root,'.runtime/native-app-state.json'),'utf8').catch(()=>'{}'));return s.workerFinished?null:worker.process;}return identities.get(pid)||null;},launcher,prepare:async()=>{calls.prepare++;},open:async()=>{calls.open++;}};
 return {root,input,write,identities,options,calls,launcher,setState:value=>current=value,dock:()=>createDockController(root,options)};
}
test('ordinary app starts once, reopens same cluster and Quit stops owned services',async t=>{
 const f=await fixture(t),dock=f.dock();assert.equal(await dock.start(f.input),'ready');assert.equal(await dock.status(f.input),'ready');
 // Production ProjectLauncher.startConfiguredProject reuses a ready cluster.
 f.launcher.startConfiguredProject=async()=>f.launcher.runtime();
 assert.equal(await dock.start(f.input),'ready');assert.equal(f.calls.start,1);assert.equal(f.calls.open,2);
 assert.equal(await dock.stop(f.input),'stopped');assert.equal(f.calls.stop,1);assert.equal(await dock.status(f.input),'stopped');
});
test('Quit cancels pending dependency work, waits cleanup, and never starts the cluster later',async t=>{
 const f=await fixture(t);let entered=false,cleaned=false;
 f.options.prepare=async(_,{signal})=>{entered=true;try{await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}finally{cleaned=true;}};
 const start=f.dock().start(f.input);while(!entered)await delay(5);
 assert.equal(await f.dock().stop(f.input),'stopped');assert.equal(await start,'stopped');assert.equal(cleaned,true);assert.equal(f.calls.start,0);
});
test('handoff closes native shell before movement without stopping an already ready cluster',async t=>{
 const f=await fixture(t);await f.dock().start(f.input);
 const close=f.dock().close({timeoutMs:1000});
 while(await f.dock().status(f.input)!=='handoff')await delay(5);
 f.identities.delete(f.input.pid);assert.deepEqual(await close,{closed:true});assert.equal(f.calls.stop,0);
 await assert.rejects(fs.access(path.join(f.root,'.runtime/native-app.json')),{code:'ENOENT'});
});
test('handoff aborts startup and waits for its cleanup before native exit',async t=>{
 const f=await fixture(t);let entered=false,cleaned=false;
 f.options.prepare=async(_,{signal})=>{entered=true;try{await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}finally{await delay(30);cleaned=true;}};
 const start=f.dock().start(f.input);while(!entered)await delay(5);
 const close=f.dock().close({timeoutMs:1000});
 while(await f.dock().status(f.input)!=='handoff')await delay(5);
 assert.equal(cleaned,true);f.identities.delete(f.input.pid);await close;assert.equal(await start,'handoff');assert.equal(f.calls.start,0);
});
test('different project PID, duplicate live app and mismatched nonce are rejected',async t=>{
 const f=await fixture(t);
 f.identities.set(91005,{stamp:'foreign',executable:process.execPath});
 await assert.rejects(f.dock().start({pid:91005,nonce:randomUUID()}),{code:'DOCK_OWNER_INVALID'});
 assert.equal(f.calls.prepare,0);
 await f.dock().start(f.input);
 await assert.rejects(f.dock().stop({...f.input,nonce:randomUUID()}),{code:'DOCK_OWNER_MISMATCH'});
 f.identities.set(91003,{stamp:'other',executable:f.identities.get(f.input.pid).executable});
 await assert.rejects(f.dock().start({pid:91003,nonce:randomUUID()}),{code:'DOCK_ALREADY_RUNNING'});
 assert.equal(f.calls.stop,0);
});
test('unknown live runtime refuses Quit; another project instance is never stopped',async t=>{
 const f=await fixture(t);await f.dock().start(f.input);
 f.setState({phase:'stopped'});await assert.rejects(f.dock().stop(f.input),{code:'DOCK_RUNTIME_UNVERIFIED'});
 f.setState({phase:'ready',applicationRoot:'/another-project',instanceId:'elsewhere'});
 await assert.rejects(f.dock().stop(f.input),{code:'DOCK_RUNTIME_UNVERIFIED'});assert.equal(f.calls.stop,0);
});
test('busy backend refusal is reported and preserved for retry',async t=>{
 const f=await fixture(t);await f.dock().start(f.input);const original=f.launcher.stop;
 f.launcher.stop=async()=>{throw Object.assign(Error('Busy'),{code:'RUNTIME_BUSY'});};
 await assert.rejects(f.dock().stop(f.input),{code:'RUNTIME_BUSY'});assert.equal(await f.dock().status(f.input),'ready');
 await assert.rejects(fs.access(path.join(f.root,'.runtime/native-app-request.json')),{code:'ENOENT'});
 f.launcher.stop=original;assert.equal(await f.dock().stop(f.input),'stopped');
});
test('maintenance blocks new app registration and symlinked records are not followed',async t=>{
 const f=await fixture(t);await f.write('.runtime/kernel-operation.lock','maintenance');
 await assert.rejects(f.dock().start(f.input),{code:'PROJECT_BUSY'});assert.equal(f.calls.prepare,0);
 await fs.rm(path.join(f.root,'.runtime/kernel-operation.lock'));await f.write('sentinel.json','{}');await fs.symlink(path.join(f.root,'sentinel.json'),path.join(f.root,'.runtime/native-app.json'));
 await assert.rejects(f.dock().start(f.input),{code:'DOCK_RECORD_INVALID'});assert.equal(await fs.readFile(path.join(f.root,'sentinel.json'),'utf8'),'{}');
});
test('unknown native ownership is retained; handoff timeout does not delete a live application record',async t=>{
 const f=await fixture(t);await f.dock().start(f.input);
 await assert.rejects(f.dock().close({timeoutMs:20}),{code:'DOCK_CLOSE_PENDING'});
 assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'.runtime/native-app.json'))).nonce,f.input.nonce);
});

test('simultaneous reopen shares one startup worker and maintenance waits for it',async t=>{
 const f=await fixture(t);let entered=false;
 f.options.prepare=async(_,{signal})=>{f.calls.prepare++;entered=true;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));};
 const first=f.dock().start(f.input);while(!entered)await delay(5);
 assert.equal(await f.dock().start(f.input),'starting');assert.equal(f.calls.prepare,1);
 assert.equal(await f.dock().stop(f.input),'stopped');await first;
});

test('Quit terminates the owned startup child before runtime discovery exists',async t=>{
 const f=await fixture(t);
 const {ProjectLauncher}=await import('../manager.mjs');
 f.options.launcher=new ProjectLauncher(f.root);
 const localNode=path.join(f.root,path.relative(fileURLToPath(new URL('../../../',import.meta.url)),process.execPath));
 await fs.mkdir(path.dirname(localNode),{recursive:true});await fs.copyFile(process.execPath,localNode);
 await f.write('scripts/dev.mjs',`import fs from 'node:fs';process.on('SIGTERM',()=>{fs.writeFileSync('startup-cleaned','yes');process.exit(0);});fs.writeFileSync('startup-pid',String(process.pid));setTimeout(()=>fs.writeFileSync('late-start','bad'),2500);setInterval(()=>{},500);`);
 const work=f.dock().start(f.input);
 const marker=path.join(f.root,'startup-pid');while(!await fs.access(marker).then(()=>true,()=>false))await delay(10);
 const pid=Number(await fs.readFile(marker));
 assert.equal(await f.dock().stop(f.input),'stopped');assert.equal(await work,'stopped');
 assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});assert.equal(await fs.readFile(path.join(f.root,'startup-cleaned'),'utf8'),'yes');
 await assert.rejects(fs.access(path.join(f.root,'late-start')),{code:'ENOENT'});
});

test('existing external configuration opens without starting another application cluster',async t=>{
 const f=await fixture(t);f.options.configuration=async()=>({configurationHost:'external',port:12345});
 assert.equal(await f.dock().start(f.input),'ready');assert.equal(f.calls.prepare,0);assert.equal(f.calls.start,0);assert.equal(f.calls.open,1);
});
