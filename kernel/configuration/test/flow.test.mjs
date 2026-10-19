import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {openConfiguration} from '../bootstrap.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readSession,storedSession} from '../session.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const exists=file=>fs.access(file).then(()=>true,()=>false);
async function until(work,count=400){for(let i=0;i<count;i++){const value=await work();if(value)return value;await sleep(50);}throw Error('Configuration fixture did not settle');}
export async function fixture(t){
 const parent=path.join(repo,'.cache/configuration-tests');await fs.mkdir(parent,{recursive:true});const temp=await fs.mkdtemp(path.join(parent,'flow-'));const root=path.join(temp,'Before');await fs.mkdir(root);
 await fs.cp(path.join(repo,'kernel'),path.join(root,'kernel'),{recursive:true,filter:file=>!path.relative(path.join(repo,'kernel'),file).split(path.sep).some(p=>['node_modules','.cache','ai-tasks'].includes(p))});
 const config=await json(path.join(root,'kernel/config/macos.json'));
 const localNode=path.join(root,`.runtime/node-v${config.nodeVersion}-darwin-${process.arch}/bin/node`);await fs.mkdir(path.dirname(localNode),{recursive:true});await fs.copyFile(process.execPath,localNode);await fs.chmod(localNode,0o755);
 const vite=path.join(root,'kernel/node_modules/vite/bin');await fs.mkdir(vite,{recursive:true});await fs.writeFile(path.join(vite,'vite.js'),`const fs=require('node:fs'),path=require('node:path');const out=process.argv[process.argv.indexOf('--outDir')+1];fs.mkdirSync(path.join(out,'assets'),{recursive:true});fs.writeFileSync(path.join(out,'assets/setup-fixture.js'),'/* synthetic setup */');fs.writeFileSync(path.join(out,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__"><script src="/assets/setup-fixture.js"></script>');`);
 // Only compilation is synthetic; external processes, HTTP/root rebinding, move,
 // session matching, copied executable, and A cleanup run their real code.
 const controller=path.join(root,'kernel/configuration/controller.mjs');let source=await fs.readFile(controller,'utf8');source=source.replace('super(root,options);','super(root,{...options,compiler:async(root,project)=>{const receipt={artifact:project.name+".app"};await fs.mkdir(path.join(root,receipt.artifact),{recursive:true});await writeJSON(path.join(root,".runtime/launcher.json"),receipt);return receipt;}});');await fs.writeFile(controller,source);
 // The short-lived takeover receipt can disappear before teardown runs. Record
 // returning A only in this copied fixture entry, before its real handoff code.
 const entry=path.join(root,'kernel/launcher/entry.mjs');const entrySource=await fs.readFile(entry,'utf8');
 assert.ok(entrySource.includes('if(cleanup>=0){'));
 await fs.writeFile(entry,entrySource.replace('if(cleanup>=0){',`if(cleanup>=0){await fs.appendFile(path.join(root,'.runtime/fixture-return-pids.jsonl'),JSON.stringify({pid:process.pid,root,directory:path.resolve(process.argv[cleanup+1]),compileCache:process.env.NODE_COMPILE_CACHE})+'\\n');`));
 await fs.writeFile(path.join(root,'business.txt'),'preserve application');await fs.mkdir(path.join(root,'.git'));await fs.writeFile(path.join(root,'.git/HEAD'),'ref: refs/heads/customer\n');await fs.mkdir(path.join(root,'local-secrets/codex/sessions'),{recursive:true});await fs.writeFile(path.join(root,'local-secrets/codex/sessions/history.jsonl'),'synthetic retained history\n');
 const roots=[root],children=[],returnedProcesses=[];let directory;
 let cleaned=false;
 async function cleanup(){
  if(cleaned)return;
  // Stop fixture children first, so an interrupted A cannot spawn a new B after
  // discovery. Every child here was created by this test's spawn call.
  for(const child of children)if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');await until(()=>child.exitCode!==null||child.signalCode!==null,100).catch(async()=>{child.kill('SIGKILL');await until(()=>child.exitCode!==null||child.signalCode!==null,100);});
  }
  const owners=[];
  for(const current of roots){
   const session=await storedSession(current).catch(()=>null);
   const address=await json(path.join(current,'.runtime/management-address.json')).catch(()=>null);
   if(!session||!address||address.root!==current||address.instanceId!==session.id||address.pid!==session.pid)continue;
   const base=`http://127.0.0.1:${address.port}`;
   const health=await fetch(base+'/health/project-launcher',{signal:AbortSignal.timeout(2000)}).then(r=>r.json()).catch(()=>null);
   if(health?.root!==current||health.instanceId!==session.id)continue;
   owners.push({session,address,base});directory=session.directory;
   if(health.busy)await until(async()=>!(await fetch(base+'/health/project-launcher',{signal:AbortSignal.timeout(2000)}).then(r=>r.json())).busy,100).catch(()=>{});
   const token=await fs.readFile(path.join(current,'local-secrets/runtime/launcher-token'),'utf8').catch(()=>'');
   await fetch(base+'/api/config/close',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Sapling-Config':token.trim()},body:'{}',signal:AbortSignal.timeout(20000)}).catch(()=>{});
  }
  const isAlive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
  for(const {session,address,base}of owners){
   let forced=false;
   try{await until(()=>!isAlive(address.pid),60);}catch{
    // A failing test may intentionally hide source required by graceful handoff.
    // Verify the exact synthetic B again; never signal an arbitrary reused PID.
    const current=await readSession(session.directory,session.root);
    const health=await fetch(base+'/health/project-launcher',{signal:AbortSignal.timeout(2000)}).then(r=>r.json());
    assert.equal(current.id,session.id);assert.equal(current.pid,address.pid);assert.equal(health.root,session.root);assert.equal(health.instanceId,session.id);
    process.kill(address.pid,'SIGKILL');forced=true;await until(()=>!isAlive(address.pid),100);
   }
   if(!forced)await until(async()=>!await exists(session.directory)&&!await exists(path.join(session.root,'.runtime/configuration-cleanup.lock'))&&!await exists(path.join(session.root,'.runtime/kernel-operation.lock')),200);
  }
  // Node flushes compile cache on process exit, after finishConfiguration has
  // released its locks. Wait for the actual returning A, not only those locks.
  for(const current of roots){
   const records=await fs.readFile(path.join(current,'.runtime/fixture-return-pids.jsonl'),'utf8').catch(()=>'');
   for(const line of records.trim().split('\n').filter(Boolean)){
    const owner=JSON.parse(line);assert.equal(owner.root,current);assert.equal(path.dirname(owner.directory),temp);assert.match(path.basename(owner.directory),/^sapling-config-[A-Za-z0-9]+$/);assert.ok(Number.isSafeInteger(owner.pid)&&owner.pid>0&&owner.pid!==process.pid);
    await until(()=>!isAlive(owner.pid),200);
    returnedProcesses.push({...owner,cacheEntries:await fs.readdir(owner.compileCache).catch(()=>[])});
   }
  }
  if(directory&&await exists(directory)){
   // Any undecidable live owner leaves the fixture intact for inspection.
   const receipt=await json(path.join(directory,'session.json')).catch(()=>null);
   assert.ok(!receipt||!isAlive(receipt.pid),'Refusing to remove a live configuration fixture');
  }
  for(const name of await fs.readdir(temp)){
   if(!/^sapling-config-[A-Za-z0-9]+$/.test(name))continue;
   const capsule=path.join(temp,name),receipt=await json(path.join(capsule,'session.json')).catch(()=>null),spawned=await json(path.join(capsule,'process.json')).catch(()=>null);
   for(const pid of [receipt?.pid,spawned?.pid])if(Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid)assert.equal(isAlive(pid),false,'Preserving fixture with an unresolved live configuration owner');
  }
  await fs.rm(temp,{recursive:true,force:true});cleaned=true;
 }
 t.after(cleanup);
 function start(){const child=spawn(localNode,[path.join(root,'kernel/launcher/entry.mjs'),'--no-open'],{cwd:temp,env:{...process.env,SEED_ROOT:root,SAPLING_NO_OPEN:'1',SAPLING_LANG:'zh',TMPDIR:path.join(root,'.runtime/tmp'),NODE_COMPILE_CACHE:path.join(root,'.cache/node-compile')},stdio:['ignore','pipe','pipe']});children.push(child);let errors='';child.stderr.on('data',b=>errors+=b);return {child,get errors(){return errors;}};}
 return {root,temp,localNode,roots,start,cleanup,returnedProcesses,track:child=>children.push(child),setDirectory:value=>directory=value};
}
test('real external B keeps its page across rename, then returned A removes B after exit',{skip:process.platform!=='darwin',timeout:45000},async t=>{
 const f=await fixture(t),launched=f.start();await until(()=>launched.child.exitCode!==null);assert.equal(launched.child.exitCode,0,launched.errors);
 const address=await json(path.join(f.root,'.runtime/management-address.json')),session=await storedSession(f.root);f.setDirectory(session.directory);
 assert.notEqual(address.pid,launched.child.pid);assert.equal(session.pid,address.pid);assert.equal(path.dirname(session.directory),path.dirname(f.root));assert.equal(address.relativeDirectory,path.relative(f.root,session.directory));await readSession(session.directory,f.root);
 const base=`http://127.0.0.1:${address.port}`,token=(await fs.readFile(path.join(f.root,'local-secrets/runtime/launcher-token'),'utf8')).trim();
 const request=(route,body)=>fetch(base+'/api/config/'+route,body===undefined?{headers:{'X-Sapling-Config':token}}:{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Sapling-Config':token},body:JSON.stringify(body)});
 await until(async()=>!(await fetch(base+'/health/project-launcher').then(r=>r.json())).busy);
 const repeat=f.start();await until(()=>repeat.child.exitCode!==null);assert.equal(repeat.child.exitCode,0,repeat.errors);assert.equal((await json(path.join(f.root,'.runtime/management-address.json'))).pid,address.pid);
 // The running UI/backend no longer depend on original configuration resources.
 await fs.rename(path.join(f.root,'kernel/services/ai-config'),path.join(f.root,'kernel/services/ai-config-hidden'));
 await fs.rm(path.join(f.root,'kernel/.cache/setup'),{recursive:true});
 assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/assets/setup-fixture.js')).status,200);assert.equal((await request('state')).status,200);
 const runtimeFile=path.join(f.root,'owned-runtime.mjs');
 await fs.writeFile(runtimeFile,`import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';const root=process.cwd(),id='fixture-runtime';await fs.writeFile(path.join(root,'local-secrets/runtime/service-token'),'fixture-token');const server=http.createServer((req,res)=>{if(req.url==='/api/runtime/status'){res.end(JSON.stringify({applicationRoot:root,instanceId:id,phase:'ready'}));return;}if(req.url==='/api/runtime/stop'&&req.headers.authorization==='Bearer fixture-token'){res.end('{}');setTimeout(async()=>{await fs.rm(path.join(root,'.runtime/runtime-address.json'));server.close(()=>process.exit(0));},30);return;}res.writeHead(404);res.end();});server.listen(0,'127.0.0.1',async()=>{const port=server.address().port;await fs.writeFile(path.join(root,'.runtime/runtime-address.json'),JSON.stringify({root,pid:process.pid,instanceId:id,ports:{runtimeManagerPort:port},url:'http://127.0.0.1:'+port}));});`);
 const runtime=spawn(f.localNode,[runtimeFile],{cwd:f.root,stdio:'ignore'});f.track(runtime);await until(()=>exists(path.join(f.root,'.runtime/runtime-address.json')));
 const finalName='项目 After α',after=path.join(f.temp,finalName);f.roots.push(after);
 assert.equal((await request('project/save',{name:finalName,folderName:finalName,renameFolder:true})).status,200);
 assert.equal((await request('profiles',{engine:'opencode',kind:'api',protocol:'chat',label:'Synthetic',baseUrl:'http://127.0.0.1:1/v1',model:'synthetic',noAuth:true})).status,200);
 const result=await request('project/finalize',{});assert.equal(result.status,202);assert.equal((await result.json()).job.kind,'configure');
 const state=await until(async()=>{const s=await request('project').then(r=>r.json());if(s.job?.phase==='failed')throw Error(JSON.stringify(s.job.error));return s.job?.phase==='completed'&&s;});
 assert.equal(runtime.exitCode,0,'owned runtime exited normally before folder move');
 assert.equal(state.root,after);assert.equal(state.exportReady,true);assert.equal(state.runtime.phase,'stopped');assert.equal(state.launcher.artifact,finalName+'.app');assert.equal(await exists(f.root),false);
 assert.equal((await request('state')).status,200);assert.equal((await json(path.join(after,'.runtime/management-address.json'))).pid,address.pid);assert.equal((await fs.readFile(path.join(after,'local-secrets/runtime/launcher-token'),'utf8')).trim(),token);
 assert.equal(await fs.readFile(path.join(after,'business.txt'),'utf8'),'preserve application');assert.equal(await fs.readFile(path.join(after,'.git/HEAD'),'utf8'),'ref: refs/heads/customer\n');assert.equal(await fs.readFile(path.join(after,'local-secrets/codex/sessions/history.jsonl'),'utf8'),'synthetic retained history\n');
 // Restore only synthetic hidden source so A imports the normal complete project.
 await fs.rename(path.join(after,'kernel/services/ai-config-hidden'),path.join(after,'kernel/services/ai-config'));
 const closed=await request('close',{});assert.equal(closed.status,200,await closed.clone().text());assert.deepEqual(await closed.json(),{closed:true,handoff:true});
 await until(async()=>!await exists(session.directory));await until(()=>exists(path.join(after,'.runtime/configuration-complete.json')));
 const done=await json(path.join(after,'.runtime/configuration-complete.json'));assert.equal(done.temporaryFilesRemoved,true);assert.equal(await exists(path.join(after,'.runtime/configuration-session.json')),false);assert.equal(await exists(path.join(after,'.runtime/management-address.json')),false);
});

test('two complete project folders configure on independent ports and cleanup independently',{skip:process.platform!=='darwin',timeout:45000},async t=>{
 const a=await fixture(t),b=await fixture(t),one=a.start(),two=b.start();await until(()=>one.child.exitCode!==null&&two.child.exitCode!==null);assert.equal(one.child.exitCode,0,one.errors);assert.equal(two.child.exitCode,0,two.errors);
 const first=await json(path.join(a.root,'.runtime/management-address.json')),second=await json(path.join(b.root,'.runtime/management-address.json'));
 a.setDirectory((await storedSession(a.root)).directory);b.setDirectory((await storedSession(b.root)).directory);
 assert.notEqual(first.port,second.port);assert.notEqual(first.pid,second.pid);
 for(const [address,root]of [[first,a.root],[second,b.root]])assert.equal((await fetch(`http://127.0.0.1:${address.port}/health/project-launcher`).then(r=>r.json())).root,root);
});

test('simultaneous configuration startup cannot steal the other launcher lease',{skip:process.platform!=='darwin',timeout:45000},async t=>{
 const f=await fixture(t),one=f.start(),two=f.start();await until(()=>one.child.exitCode!==null&&two.child.exitCode!==null);
 assert.ok([one,two].some(start=>start.child.exitCode===0),one.errors+two.errors);
 const session=await storedSession(f.root);f.setDirectory(session.directory);
 const address=await json(path.join(f.root,'.runtime/management-address.json'));
 assert.equal(address.pid,session.pid);assert.equal(path.dirname(session.directory),f.temp);
 assert.equal((await fs.readdir(f.temp)).filter(name=>name.startsWith('sapling-config-')).length,1);
});

test('live management lock blocks and a verified dead owner can be reclaimed',{skip:process.platform!=='darwin',timeout:45000},async t=>{
 const f=await fixture(t),lock=path.join(f.root,'.runtime/management.lock');await fs.mkdir(lock,{recursive:true});
 const owner={root:f.root,pid:process.pid,id:'11111111-1111-4111-8111-111111111111'};await fs.writeFile(path.join(lock,'owner.json'),JSON.stringify(owner));
 const blocked=f.start();await until(()=>blocked.child.exitCode!==null);assert.equal(blocked.child.exitCode,1);assert.match(blocked.errors,/CONFIGURATION_BUSY/);assert.deepEqual(await json(path.join(lock,'owner.json')),owner);
 const short=spawn(f.localNode,['-e',''],{stdio:'ignore'});f.track(short);await until(()=>short.exitCode!==null);
 await fs.writeFile(path.join(lock,'owner.json'),JSON.stringify({...owner,pid:short.pid}));
 const retry=f.start();await until(()=>retry.child.exitCode!==null);assert.equal(retry.child.exitCode,0,retry.errors);const session=await storedSession(f.root);f.setDirectory(session.directory);assert.notEqual(session.pid,short.pid);
});

test('failed spawned-PID persistence retains closed operation and management leases',async t=>{
 const f=await fixture(t);let directory;
 await assert.rejects(openConfiguration(f.root,{noOpen:true,prepare:async()=>f.root,copy:async()=>{directory=await fs.mkdtemp(path.join(f.temp,'sapling-config-'));await fs.mkdir(path.join(directory,'process.json'));return {directory,executable:f.localNode};},spawnProcess:()=>{const child=new EventEmitter();child.pid=process.pid;child.exitCode=null;child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}}));
 const lock=await json(path.join(f.root,'.runtime/kernel-operation.lock'));assert.equal(lock.pid,process.pid);assert.equal(lock.purpose,'prepare-configuration');
 assert.equal((await json(path.join(f.root,'.runtime/management.lock/owner.json'))).pid,process.pid);await fs.access(directory);
 // The closed receipt can be moved/removed without an open operation descriptor.
 await fs.rename(path.join(f.root,'.runtime/kernel-operation.lock'),path.join(f.root,'.runtime/inspected-operation.json'));
});

test('fixture cleanup stops its verified B when graceful handoff cannot import hidden source',{skip:process.platform!=='darwin',timeout:45000},async t=>{
 const f=await fixture(t),started=f.start();await until(()=>started.child.exitCode!==null);assert.equal(started.child.exitCode,0,started.errors);
 const address=await json(path.join(f.root,'.runtime/management-address.json'));await until(async()=>!(await fetch(`http://127.0.0.1:${address.port}/health/project-launcher`).then(r=>r.json())).busy);
 await fs.rename(path.join(f.root,'kernel/launcher/entry.mjs'),path.join(f.root,'kernel/launcher/entry-hidden.mjs'));
 await f.cleanup();assert.equal(await exists(f.temp),false);assert.throws(()=>process.kill(address.pid,0),{code:'ESRCH'});
});

test('fixture removal waits for returning A to exit and flush its real local Node cache',{skip:process.platform!=='darwin',timeout:45000},async t=>{
 const f=await fixture(t),started=f.start();await until(()=>started.child.exitCode!==null);assert.equal(started.child.exitCode,0,started.errors);
 await f.cleanup();assert.ok(f.returnedProcesses.length>0);
 for(const owner of f.returnedProcesses){assert.equal(owner.compileCache,path.join(f.root,'.cache/node-compile'));assert.ok(owner.cacheEntries.length>0,'Node wrote its enabled compile cache before fixture removal');assert.throws(()=>process.kill(owner.pid,0),{code:'ESRCH'});}
 assert.equal(await exists(f.temp),false);
});
