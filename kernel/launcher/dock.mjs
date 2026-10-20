// Project-local lifecycle bridge for the ordinary macOS Dock application.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {ProjectLauncher,readProject,openExternal} from './manager.mjs';
import {json,writeJSON,issue} from './io.mjs';
import {buildContext} from './build.mjs';
import {ensureApplicationDependencies} from './dependencies.mjs';
import {assertSetupAvailable} from '../contracts/kernel.mjs';
import {ensureManagedDirectory} from '../contracts/local-storage.mjs';
import {statusPageOpener} from './status.mjs';
const run=promisify(execFile), validNonce=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
const fail=(code,message)=>issue(code,message);
export async function processIdentity(pid){
  if(!Number.isSafeInteger(pid)||pid<2)return null;
  try{
    // Finder may omit locale variables; ps then escapes Unicode paths under C.
    // Fix both path encoding and the timestamp locale only for this child.
    const {stdout}=await run('/bin/ps',['-ww','-p',String(pid),'-o','lstart=','-o','comm='],{timeout:2000,env:{...process.env,LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8'}});
    const match=stdout.trim().match(/^(.{24})\s+(.+)$/);
    return match?{stamp:match[1],executable:match[2]}:null;
  }catch(error){if(error.code===1)return null;throw fail('DOCK_PROCESS_UNKNOWN','Cannot verify the project launcher process. Retry after checking local processes.');}
}
export function createDockController(projectRoot,overrides={}){
  const identity=overrides.processIdentity||processIdentity;
  const controller=overrides.launcher||new ProjectLauncher(projectRoot);
  const prepare=overrides.prepare||ensureApplicationDependencies;
  const open=overrides.open||openExternal;
  const configuration=overrides.configuration|| (async root=>{const {findConfiguration}=await import('../configuration/bootstrap.mjs');return findConfiguration(root);});
  let root;
  const file=name=>path.join(root,'.runtime',name);
  async function initialize(){root=await fs.realpath(projectRoot);await ensureManagedDirectory(root,'.runtime');return root;}
  async function read(name){
    const p=file(name),stat=await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(!stat)return null;
    if(!stat.isFile()||stat.isSymbolicLink())throw fail('DOCK_RECORD_INVALID','Inspect the project-local native app record before retrying.');
    return json(p);
  }
  async function control(action){
    const lock=file('native-app-control.lock'),deadline=Date.now()+5000;
    let handle;
    while(!handle){
      try{handle=await fs.open(lock,'wx',0o600);}catch(error){
        if(error.code!=='EEXIST')throw error;
        if(Date.now()>deadline)throw fail('DOCK_CONTROL_BUSY','Another native app operation owns this project. Wait, or inspect its local control lock if interrupted.');
        await delay(25);
      }
    }
    const stat=await handle.stat();
    try{await handle.writeFile(JSON.stringify({pid:process.pid})+'\n');await handle.close();return await action();}
    finally{await handle.close().catch(()=>{});const now=await fs.lstat(lock).catch(()=>null);if(now?.isFile()&&now.ino===stat.ino&&now.dev===stat.dev)await fs.rm(lock);}
  }
  async function owner(){
    const record=await read('native-app.json');if(!record)return null;
    const project=await readProject(root),stat=await fs.stat(root);
    if(record.schemaVersion!==1||record.root!==root||record.projectId!==project.projectId||record.dev!==stat.dev||record.ino!==stat.ino||!validNonce(record.nonce)||!Number.isSafeInteger(record.pid)||!record.process?.stamp||typeof record.process?.executable!=='string')throw fail('DOCK_RECORD_INVALID','The native app ownership record does not match this project. Preserve it for inspection.');
    return record;
  }
  const same=(a,b)=>a&&b&&a.pid===b.pid&&a.nonce===b.nonce;
  async function matchesProcess(pid,expected){const current=await identity(pid);return !!current&&current.stamp===expected?.stamp&&current.executable===expected?.executable;}
  async function workerAlive(state){return !!state?.workerPid&&await matchesProcess(state.workerPid,state.workerProcess);}
  async function scoped(record,name){const value=await read(name);if(value&&value.nonce!==record.nonce)throw fail('DOCK_RECORD_INVALID','Native app records disagree. Preserve them and retry after inspection.');return value;}
  async function remove(record){
    if(!same(await owner(),record))return;
    for(const name of ['native-app-state.json','native-app-request.json']){const v=await scoped(record,name);if(v)await fs.rm(file(name));}
    await fs.rm(file('native-app.json'));
  }
  async function requireOwner(input){
    const record=await owner();
    if(!record||!same(record,input)||!await matchesProcess(record.pid,record.process))throw fail('DOCK_OWNER_MISMATCH','This launcher no longer owns the project. Open its app again.');
    return record;
  }
  async function register(input){
    await assertSetupAvailable(root);
    for(const p of ['kernel-operation.lock','project-finalization.json','kernel/active-job.json'])if(await fs.lstat(file(p)).catch(e=>{if(e.code==='ENOENT')return null;throw e;}))throw fail('PROJECT_BUSY','Finish this project’s setup or maintenance before opening its app.');
    if(!validNonce(input.nonce))throw fail('DOCK_OWNER_INVALID','Invalid native app identity.');
    const native=await identity(input.pid),project=await readProject(root),receipt=await read('launcher.json');
    const artifact=receipt?.artifact;
    if(!artifact||path.basename(artifact)!==artifact||!artifact.endsWith('.app')||receipt.projectId!==project.projectId)throw fail('DOCK_OWNER_INVALID','Rebuild this project’s native app before opening it.');
    const expected=await fs.realpath(path.join(root,artifact,'Contents/MacOS/applet'));
    if(!native||await fs.realpath(native.executable).catch(()=>null)!==expected)throw fail('DOCK_OWNER_INVALID','The Dock application belongs to a different project.');
    const previous=await owner();
    if(previous){
      if(same(previous,input)&&await matchesProcess(previous.pid,previous.process))return previous;
      if(await matchesProcess(previous.pid,previous.process)||await workerAlive(await scoped(previous,'native-app-state.json')))throw fail('DOCK_ALREADY_RUNNING','This project already has a Dock application. Use its existing icon.');
      await remove(previous);
    }
    const stat=await fs.stat(root),record={schemaVersion:1,root,projectId:project.projectId,dev:stat.dev,ino:stat.ino,pid:input.pid,nonce:input.nonce,process:native};
    await writeJSON(file('native-app.json'),record);
    return record;
  }
  async function writeState(record,value){if(!same(await owner(),record))throw fail('DOCK_OWNER_MISMATCH','The project launcher ownership changed.');const old=await scoped(record,'native-app-state.json');await writeJSON(file('native-app-state.json'),{...old,nonce:record.nonce,...value});}
  async function stopRuntime(){
    const address=await read('runtime-address.json');
    if(!address)return;
    if(address.root!==root||typeof address.instanceId!=='string')throw fail('DOCK_RUNTIME_UNVERIFIED','Runtime ownership is invalid. Inspect the project runtime before quitting.');
    const state=await controller.runtime();
    if(state.phase==='stopped'){
      if(await identity(address.pid))throw fail('DOCK_RUNTIME_UNVERIFIED','The recorded runtime is still alive but cannot be verified. Inspect its logs and retry.');
      return;
    }
    if(state.applicationRoot!==root||state.instanceId!==address.instanceId)throw fail('DOCK_RUNTIME_UNVERIFIED','The runtime address belongs to another instance. No services were stopped.');
    const original=await identity(address.pid);
    await controller.stop({reserved:true});
    const deadline=Date.now()+15000;
    while(original&&await matchesProcess(address.pid,original)){
      if(Date.now()>deadline)throw fail('DOCK_STOP_PENDING','The backend is still exiting. Wait and try Quit again.');await delay(100);
    }
  }
  async function request(record,action){await writeJSON(file('native-app-request.json'),{nonce:record.nonce,action});}
  async function waitWorker(record,timeoutMs){
    const deadline=Date.now()+timeoutMs;
    while(await workerAlive(await scoped(record,'native-app-state.json'))){
      if(Date.now()>deadline)throw fail('DOCK_STOP_PENDING','Startup is still releasing files. Wait and retry.');await delay(100);
    }
  }
  async function start(input,{noOpen=false}={}){
    await initialize();
    const abort=new AbortController(),worker=overrides.worker||{pid:process.pid,process:await identity(process.pid)},workerProcess=worker.process;
    if(!workerProcess)throw fail('DOCK_PROCESS_UNKNOWN','Cannot identify the startup process.');
    let record,early;
    await control(async()=>{
      record=await register(input);
      const old=await scoped(record,'native-app-state.json');
      if(await workerAlive(old)){early='starting';return;}
      const pending=await scoped(record,'native-app-request.json');
      if(pending){early=pending.action==='handoff'?'handoff':'stopped';return;}
      await writeState(record,{phase:'starting',workerPid:worker.pid,workerProcess,workerFinished:false,mode:'application'});
    });
    if(early)return early;
    let interrupted=false,requestAction=null,polling=false;
    const signal=()=>{interrupted=true;requestAction='stop';abort.abort();};
    const poll=async()=>{
      if(polling)return;polling=true;
      try{const r=await scoped(record,'native-app-request.json');if(r){requestAction=r.action;abort.abort();}if(!await matchesProcess(record.pid,record.process)){requestAction='stop';abort.abort();}}
      catch{requestAction='stop';abort.abort();}finally{polling=false;}
    };
    const timer=setInterval(()=>void poll(),100);process.on('SIGTERM',signal);process.on('SIGINT',signal);
    controller.abortController=abort;
    try{
      await poll();abort.signal.throwIfAborted();
      const setup=await configuration(root);
      if(setup?.configurationHost==='external'){
        if(!noOpen)await open(`http://127.0.0.1:${setup.port}/`);
        await writeState(record,{phase:'ready',mode:'configuration'});return 'ready';
      }
      await buildContext.run({signal:abort.signal},()=>prepare(root,{signal:abort.signal,onProgress:message=>console.log(message)}));
      await poll();abort.signal.throwIfAborted();
      const onRuntime=statusPageOpener(open,{noOpen});
      const state=await controller.startConfiguredProject({onRuntime});
      await poll();abort.signal.throwIfAborted();
      await onRuntime(state);
      await writeState(record,{phase:'ready',url:state.url});return 'ready';
    }catch(error){
      if(abort.signal.aborted){
        await controller.cancelOwnedStartup?.();
        if(interrupted||requestAction==='stop')await stopRuntime();
        await writeState(record,{phase:requestAction==='handoff'?'handoff':'stopped'});return requestAction==='handoff'?'handoff':'stopped';
      }
      await writeState(record,{phase:'failed',error:{code:error.code||'DOCK_START_FAILED',message:'The project did not start. Inspect logs/project-launcher, then open the app again.'}});throw error;
    }finally{
      clearInterval(timer);process.off('SIGTERM',signal);process.off('SIGINT',signal);
      const state=await scoped(record,'native-app-state.json');
      if(state?.workerPid===worker.pid)await writeState(record,{...state,workerFinished:true});
    }
  }
  async function status(input){
    await initialize();const record=await owner();
    if(!record)return 'starting';
    await requireOwner(input);
    const req=await scoped(record,'native-app-request.json'),state=await scoped(record,'native-app-state.json');
    if(req?.action==='handoff'&&!await workerAlive(state))return 'handoff';
    if(await workerAlive(state))return 'starting';
    if(state?.phase==='failed')return 'failed';
    if(state?.mode==='configuration')return await configuration(root)?'ready':'stopped';
    const runtime=await controller.runtime();return runtime.phase==='ready'?'ready':runtime.phase==='stopped'?'stopped':runtime.phase==='failed'?'failed':'starting';
  }
  async function stop(input,{timeoutMs=15000}={}){
    await initialize();const record=await owner();
    if(!record){await stopRuntime();return 'stopped';}
    await control(async()=>{await requireOwner(input);await request(record,'stop');});
    try{
      await waitWorker(record,timeoutMs);await stopRuntime();await writeState(record,{phase:'stopped'});return 'stopped';
    }catch(error){
      // A refused Quit must leave reopening/retrying available, without clearing
      // a maintenance handoff that arrived in the meantime.
      await control(async()=>{if(same(await owner(),record)&&(await scoped(record,'native-app-request.json'))?.action==='stop')await fs.rm(file('native-app-request.json'));});
      throw error;
    }
  }
  async function close({timeoutMs=15000}={}){
    await initialize();let record;
    await control(async()=>{record=await owner();if(record)await request(record,'handoff');});
    if(!record)return {closed:true};
    await waitWorker(record,timeoutMs);
    const deadline=Date.now()+timeoutMs;
    while(await matchesProcess(record.pid,record.process)){
      if(Date.now()>deadline)throw fail('DOCK_CLOSE_PENDING','Quit this project’s Dock app and retry setup after it exits.');await delay(100);
    }
    // The native host must release its pending helper before exiting; recheck
    // the stable worker identity as well, including late startup bookkeeping.
    await waitWorker(record,timeoutMs);
    await control(()=>remove(record));return {closed:true};
  }
  return {start,status,stop,close};
}
export const closeDockForMaintenance=(root,options)=>createDockController(root).close(options);
