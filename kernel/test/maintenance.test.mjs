import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { startMaintenance } from '../handoff.mjs';
import { prepareKernel } from '../manager.mjs';
import { acquireKernelLock } from '../contracts/kernel.mjs';
const exec=promisify(execFile),project=fileURLToPath(new URL('../../',import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
async function write(root,file,value){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),value);}
async function fixture(t,{failure=false}={}){
 const parent=path.join(project,'.cache/maintenance-tests');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'app-'));
 for(const directory of ['kernel','kernel/contracts','kernel/compat','kernel/localization','contracts'])for(const name of await fs.readdir(path.join(project,directory)))if(name.endsWith('.mjs'))await write(root,`${directory}/${name}`,await fs.readFile(path.join(project,directory,name)));
 const helper="import fs from 'node:fs/promises';import path from 'node:path';await fs.writeFile(path.join(process.argv[2],'core-repaired'),'yes');";
 await write(root,'kernel/install-dependencies.mjs',helper);
 const dev=`import http from 'node:http';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';const instanceId=randomUUID();const s=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({instanceId,phase:'${failure?'failed':'ready'}',busy:false}))});await new Promise(r=>s.listen(0,'127.0.0.1',r));await fs.writeFile('.runtime/runtime-address.json',JSON.stringify({pid:process.pid,instanceId,url:'http://127.0.0.1:'+s.address().port+'/'}));process.on('SIGTERM',()=>s.close(()=>process.exit(0)));`;
 const files={'kernel/manager.mjs':await fs.readFile(path.join(root,'kernel/manager.mjs')),'kernel/recover.mjs':await fs.readFile(path.join(root,'kernel/recover.mjs')),'contracts/kernel.mjs':await fs.readFile(path.join(root,'contracts/kernel.mjs')),'Saplingagent.sh':Buffer.from('old launcher'),'scripts/dev.mjs':Buffer.from(dev),'kernel/control-page.mjs':Buffer.from("export const kernelControlPage = 'old control';")};
 for(const [name,value]of Object.entries(files))await write(root,name,value);
 const manifest=(entries,version)=>({schemaVersion:3,version,appApi:1,minNode:'24.11.0',files:Object.entries(entries).map(([name,value])=>({path:name,sha256:hash(value),bytes:value.length,executable:false}))});
 await write(root,'kernel/manifest.json',JSON.stringify(manifest(files,'0.90')));
 const changed={...files,'kernel/control-page.mjs':Buffer.from("export const kernelControlPage = 'new control';")};
 const source={resolve:async()=>'b'.repeat(40),read:async(_,name)=>name==='kernel/manifest.json'?Buffer.from(JSON.stringify(manifest(changed,'0.91'))):changed[name]};
 const user={'front/App.tsx':'CUSTOM PAGE','front/package.json':'CUSTOM DEPENDENCIES','backend/agent-runtime/package-lock.json':'CUSTOM LOCK','data/session.json':'CUSTOM CHAT','local-secrets/test-key':'SYNTHETIC'};
 for(const [name,value]of Object.entries(user))await write(root,name,value);
 await exec('git',['init','-b','main',root]);await exec('git',['-C',root,'remote','add','origin','https://example.invalid/own.git']);const gitBefore=await fs.readFile(path.join(root,'.git/config'));
 return {root,user,gitBefore,plan:await prepareKernel(root,{source})};
}
async function poll(url,phase){const end=Date.now()+20000;let state;while(Date.now()<end){state=await fetch(new URL('/status',url)).then(r=>r.json());if(state.phase===phase&&!state.busy)return state;await new Promise(r=>setTimeout(r,100));}throw Error(JSON.stringify(state));}
async function cleanupWorker(worker,root){
 try {const address=JSON.parse(await fs.readFile(path.join(root,'.runtime/runtime-address.json'),'utf8'));process.kill(address.pid,'SIGTERM');}catch{}
 try{const lease=JSON.parse(await fs.readFile(path.join(root,'.runtime/kernel/active-job.json'),'utf8'));process.kill(lease.pid,'SIGTERM');}catch{}
 // Ready worker intentionally remains briefly to deliver the redirect.
 const state=JSON.parse(await fs.readFile(path.join(root,`.runtime/kernel/jobs/${worker.jobId}/worker.json`),'utf8').catch(()=>'null'));
 if(state?.pid)try{process.kill(state.pid,'SIGTERM');}catch{}
}
test('real detached worker survives handoff, updates only core, repairs own deps and verifies new app',async t=>{
 const f=await fixture(t);const worker=await startMaintenance(f.root,'apply',f.plan.id);
 const lease=JSON.parse(await fs.readFile(path.join(f.root,'.runtime/kernel/active-job.json'),'utf8'));
 t.after(async()=>{await cleanupWorker(worker,f.root);try{process.kill(lease.pid,'SIGTERM');}catch{}await fs.rm(f.root,{recursive:true,force:true});});
 await assert.rejects(acquireKernelLock(f.root,'competing-start'),{code:'KERNEL_BUSY'});
 worker.commit();const state=await poll(worker.url,'ready');assert.equal(state.sourceResult,'applied');assert.ok(state.backupId);assert.match(state.url,/^http:\/\/127/);
 assert.equal(await fs.readFile(path.join(f.root,'kernel/control-page.mjs'),'utf8'),"export const kernelControlPage = 'new control';");
 assert.equal(await fs.readFile(path.join(f.root,'core-repaired'),'utf8'),'yes');
 for(const [name,value]of Object.entries(f.user))assert.equal(await fs.readFile(path.join(f.root,name),'utf8'),value);
 assert.deepEqual(await fs.readFile(path.join(f.root,'.git/config')),f.gitBefore);
 assert.equal(await fs.access(path.join(f.root,'.runtime/kernel/active-job.json')).then(()=>true,()=>false),false);
});
test('source success with failed readiness stays failed and manual restore retains application and Git',async t=>{
 const f=await fixture(t,{failure:true});const worker=await startMaintenance(f.root,'apply',f.plan.id);
 const lease=JSON.parse(await fs.readFile(path.join(f.root,'.runtime/kernel/active-job.json'),'utf8'));
 t.after(async()=>{await cleanupWorker(worker,f.root);try{process.kill(lease.pid,'SIGTERM');}catch{}await fs.rm(f.root,{recursive:true,force:true});});
 worker.commit();let state=await poll(worker.url,'failed');assert.equal(state.sourceResult,'applied');assert.ok(state.backupId);assert.match(state.message,/readiness failed/);
 const denied=await fetch(new URL('/restore',worker.url),{method:'POST',headers:{origin:'http://evil.invalid'},body:'{}'});assert.equal(denied.status,403);
 const restore=await fetch(new URL('/restore',worker.url),{method:'POST',headers:{origin:worker.url.slice(0,-1)},body:'{}'});assert.equal(restore.status,202);
 state=await poll(worker.url,'failed');assert.equal(state.sourceResult,'restored');assert.ok(state.error?.summary);assert.equal(await fs.readFile(path.join(f.root,'kernel/control-page.mjs'),'utf8'),"export const kernelControlPage = 'old control';");
 for(const [name,value]of Object.entries(f.user))assert.equal(await fs.readFile(path.join(f.root,name),'utf8'),value);
 assert.deepEqual(await fs.readFile(path.join(f.root,'.git/config')),f.gitBefore);
 const chosen=await fetch(new URL('/language',worker.url),{method:'POST',headers:{origin:worker.url.slice(0,-1),'Content-Type':'application/json'},body:JSON.stringify({language:'zh'})});assert.equal(chosen.status,200);assert.equal((await chosen.json()).language,'zh');
 assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'config/ui-language.json'),'utf8')).language,'zh');
 const dev=path.join(f.root,'scripts/dev.mjs');await fs.writeFile(dev,(await fs.readFile(dev,'utf8')).replace("phase:'failed'","phase:'ready'"));
 const retry=await fetch(new URL('/retry',worker.url),{method:'POST',headers:{origin:worker.url.slice(0,-1)},body:'{}'});assert.equal(retry.status,202);
 state=await poll(worker.url,'ready');assert.equal(state.error,undefined);assert.equal(state.language,'zh');assert.equal(state.sourceResult,'restored');
});
test('unknown or stale plans are refused before runtime draining',async()=>{
 const {inspectKernelPlan}=await import('../manager.mjs');await assert.rejects(inspectKernelPlan(project,randomUUID()),{code:'INVALID_PLAN'});
});

test('connected external MCP refuses maintenance before spawning or stopping the app',async t=>{
 const f=await fixture(t),id=randomUUID();t.after(()=>fs.rm(f.root,{recursive:true,force:true}));
 await write(f.root,`.runtime/mcp-access/clients/${id}.json`,JSON.stringify({schemaVersion:1,id,root:await fs.realpath(f.root),pid:process.pid}));
 await assert.rejects(startMaintenance(f.root,'apply',f.plan.id),{code:'MCP_CLIENTS_ACTIVE'});
 for(const relative of ['.runtime/kernel/active-job.json','.runtime/kernel-operation.lock','.runtime/kernel/jobs'])assert.equal(await fs.access(path.join(f.root,relative)).then(()=>true,()=>false),false);
});

test('real HTTP202 handoff closes the controller and independent progress reaches new app',async t=>{
 const f=await fixture(t);
 for(const name of ['manager.mjs','services.mjs','ports.mjs','server.mjs','gateway.mjs','status.mjs','status-page.mjs'])await write(f.root,'kernel/services/runtime-manager/'+name,await fs.readFile(path.join(project,'kernel/services/runtime-manager',name)));
 const controller=`import fs from 'node:fs/promises';import http from 'node:http';import {randomUUID} from 'node:crypto';import {RuntimeManager} from './kernel/services/runtime-manager/manager.mjs';import {createGateway} from './kernel/services/runtime-manager/gateway.mjs';
const root=process.cwd(),instanceId=randomUUID();const manager=new RuntimeManager({root,token:'fixture-token',definitions:[],output:false});manager.instanceId=instanceId;manager.phase='ready';manager.config={frontPort:0,vitePort:1,agentPort:1};const options={manager,token:'fixture-token',frontPort:0,managerPort:1,onMaintenance:async()=>{await manager.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.unlink('.runtime/runtime-address.json');process.exit(0)}};const server=createGateway(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));options.frontPort=server.address().port;const url='http://127.0.0.1:'+options.frontPort+'/';await fs.writeFile('.runtime/runtime-address.json',JSON.stringify({pid:process.pid,instanceId,url}));process.send({url});`;
 await write(f.root,'controller.mjs',controller);
 const {fork}=await import('node:child_process');const child=fork(path.join(f.root,'controller.mjs'),[],{cwd:f.root,stdio:['ignore','ignore','pipe','ipc']});
 let output='';child.stderr.on('data',x=>output+=x);const exit=new Promise(r=>child.once('exit',r));
 const url=await new Promise((resolve,reject)=>{child.once('message',x=>resolve(x.url));child.once('error',reject);child.once('exit',()=>reject(Error(output)));});
 let worker,workerPid;
 t.after(async()=>{if(child.exitCode===null)child.kill('SIGTERM');if(worker)await cleanupWorker(worker,f.root);if(workerPid)try{process.kill(workerPid,'SIGTERM');}catch{}await fs.rm(f.root,{recursive:true,force:true});});
 let response=await fetch(new URL('/api/runtime/kernel/apply',url),{method:'POST',headers:{origin:url.slice(0,-1)},body:JSON.stringify({planId:randomUUID(),acceptRisk:true})});assert.equal(response.status,400);assert.equal(child.exitCode,null);
 response=await fetch(new URL('/api/runtime/kernel/apply',url),{method:'POST',headers:{origin:url.slice(0,-1)},body:JSON.stringify({planId:f.plan.id,acceptRisk:true})});
 assert.equal(response.status,202,JSON.stringify(await response.clone().json()));worker=await response.json();workerPid=JSON.parse(await fs.readFile(path.join(f.root,'.runtime/kernel/active-job.json'),'utf8')).pid;
 assert.equal(await exit,0);const state=await poll(worker.url,'ready');assert.equal(state.sourceResult,'applied');assert.notEqual(state.url,url);
 assert.deepEqual(await fs.readFile(path.join(f.root,'.git/config')),f.gitBefore);
});
