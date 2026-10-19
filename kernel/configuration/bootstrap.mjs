import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {acquireKernelLock} from '../contracts/kernel.mjs';
import {prepareConfigurationBundle,copyConfigurationBundle} from './bundle.mjs';
import {alive,readSession,saveSession,sessionFile,storedSession,removeSessionDirectory} from './session.mjs';
import {readProject,openExternal} from '../launcher/manager.mjs';
import {json,writeJSON,issue,managementFingerprint} from '../launcher/io.mjs';
import {localRuntime,realDirectory,regularJSON,sameIdentity,siblingLocation} from './paths.mjs';

export async function findConfiguration(root){
  const value=await json(path.join(root,'.runtime/management-address.json'));
  if(!value||value.root!==root||!Number.isInteger(value.port)||!alive(value.pid))return null;
  try{
    const health=await fetch(`http://127.0.0.1:${value.port}/health/project-launcher`,{signal:AbortSignal.timeout(1500)}).then(r=>r.json());
    return health.root===root&&health.instanceId===value.instanceId?{...value,busy:health.busy}:null;
  }catch{return null;}
}
async function closePrevious(root,previous){
  const base=`http://127.0.0.1:${previous.port}`;
  const token=(await fs.readFile(path.join(root,'local-secrets/runtime/launcher-token'),'utf8')).trim();
  const response=await fetch(base+'/api/config/close',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Sapling-Config':token},body:'{}',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw issue('CONFIGURATION_BUSY','Finish the current configuration operation before reopening setup.');
  for(let i=0;i<300&&alive(previous.pid);i++)await delay(100);
  if(alive(previous.pid))throw issue('CONFIGURATION_BUSY','The previous configuration is still closing. Retry shortly.');
  // Its returning A may still be removing the old capsule.
  for(let i=0;i<100&&await json(sessionFile(root));i++)await delay(100);
}
export async function openConfiguration(root,{noOpen=false,prepare=prepareConfigurationBundle,copy=copyConfigurationBundle,spawnProcess=spawn}={}){
  root=await fs.realpath(root);
  await localRuntime(root);
  const fingerprint=await managementFingerprint(root);
  const previous=await findConfiguration(root);
  if(previous?.configurationHost==='external'&&previous.fingerprint===fingerprint){
    const session=await storedSession(root);
    if(!noOpen)await openExternal(`http://127.0.0.1:${previous.port}/`);
    return {...previous,relativeDirectory:path.relative(root,session.directory)};
  }
  if(previous)await closePrevious(root,previous);
  const release=await acquireKernelLock(root,'prepare-configuration');
  let directory,directoryIdentity,child,handed=false,ownsLock=false,spawnRecorded=false;
  const lock=path.join(root,'.runtime/management.lock');
  const id=randomUUID();
  try {
  try{await fs.mkdir(lock);}catch(error){
    if(error.code!=='EEXIST')throw error;
    await realDirectory(lock);
    const owner=await regularJSON(path.join(lock,'owner.json'));
    if(!owner||owner.root!==root||!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.id!=='string'||alive(owner.pid))throw issue('CONFIGURATION_BUSY','Another configuration launcher is starting. Retry shortly.');
    await fs.rm(lock,{recursive:true});await fs.mkdir(lock);
  }
  ownsLock=true;
  await writeJSON(path.join(lock,'owner.json'),{pid:process.pid,root,id});
    const oldSession=await storedSession(root);
    if(oldSession){
      const owned=await readSession(oldSession.directory,root);
      if(alive(owned.pid))throw issue('CONFIGURATION_BUSY','Configuration is already running. Use its existing page.');
      if(await json(path.join(root,'.runtime/project-finalization.json')))throw issue('CONFIGURATION_INTERRUPTED','An interrupted configuration operation needs inspection. Saved files remain at this folder.');
      await removeSessionDirectory(owned);await fs.rm(sessionFile(root));
    }
    for(const name of ['macos-install.lock','windows-install.lock','node-install.lock','windows-node.lock'])
      if(await fs.access(path.join(root,'.runtime',name)).then(()=>true,()=>false))throw issue('CONFIGURATION_BUSY','Wait for dependency installation to finish before opening configuration.');
    const bundle=await prepare(root);
    const copied=await copy(root,bundle);directory=copied.directory;directoryIdentity=await realDirectory(directory);
    const requested=process.env.SAPLING_MANAGEMENT_PORT;
    if(requested&&(!/^\d+$/.test(requested)||Number(requested)<1024||Number(requested)>65535))throw issue('PROJECT_MANAGEMENT_PORT','The setup port is invalid.');
    const parent=Number(process.env.SAPLING_CONFIG_PARENT_PID);
    const session={schemaVersion:1,id,nonce:randomBytes(32).toString('hex'),root,directory,pid:process.pid,projectId:(await readProject(root)).projectId,fingerprint,language:process.env.SAPLING_LANG==='zh'?'zh':'en',noOpen,port:requested?Number(requested):null,bootstrapPids:[process.pid,...(Number.isSafeInteger(parent)&&parent>0&&parent!==process.pid?[parent]:[])],createdAt:new Date().toISOString()};
    await saveSession(session);
    const env={...process.env,SEED_ROOT:root,SAPLING_CONFIGURATION_DIR:directory,TMPDIR:path.join(directory,'tmp'),TMP:path.join(directory,'tmp'),TEMP:path.join(directory,'tmp')};
    for(const [key,relative]of Object.entries({XDG_CONFIG_HOME:'config',XDG_CACHE_HOME:'cache',XDG_DATA_HOME:'data',XDG_STATE_HOME:'state',npm_config_cache:'cache/npm',NODE_COMPILE_CACHE:'cache/node'})){env[key]=path.join(directory,relative);await fs.mkdir(env[key],{recursive:true});}
    delete env.NODE_OPTIONS;delete env.NODE_PATH;delete env.SAPLING_SETUP_JOB;
    child=spawnProcess(copied.executable,[path.join(directory,'code/kernel/configuration/host.mjs')],{cwd:directory,env,stdio:'ignore',detached:true,windowsHide:true});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(issue('CONFIGURATION_START_FAILED','The independent configuration runtime could not start.')));});
    // Keep spawned PID evidence even if B fails before publishing its own receipt.
    await writeJSON(path.join(directory,'process.json'),{id,nonce:session.nonce,pid:child.pid});spawnRecorded=true;
    child.unref();
    for(let i=0;i<300;i++){
      const address=await json(path.join(directory,'address.json'));
      if(address?.pid===child.pid&&address.instanceId===id&&address.root===root){handed=true;return {...address,relativeDirectory:path.relative(root,directory)};}
      if(child.exitCode!==null)throw issue('CONFIGURATION_START_FAILED','The independent configuration runtime exited. Check its saved session and retry.');
      if(await json(path.join(directory,'failure.json')))throw issue('CONFIGURATION_PORT_BUSY','The configuration address is unavailable. Retry without a fixed management port.');
      await delay(100);
    }
    throw issue('CONFIGURATION_START_FAILED','Configuration has not become ready. Inspect the saved session before retrying.');
  }finally{
    // A child with unrecorded ownership cannot be safely reclaimed by a later A.
    // Close the operation handle but retain its receipt until deliberate inspection.
    const preserve=Boolean(child?.pid&&alive(child.pid)&&!spawnRecorded);
    try { if(!handed){
      // A failed child may still be alive. Preserve its directory/session instead
      // of deleting an executable or claiming that startup succeeded.
      if(!child?.pid||!alive(child.pid)){
        if(directory){const current=await siblingLocation(root,directory);if(sameIdentity(current.directoryIdentity,directoryIdentity))await fs.rm(directory,{recursive:true,force:true});}
        if((await json(sessionFile(root)))?.id===id)await fs.rm(sessionFile(root));
      }
      if(!preserve&&ownsLock&&(await json(path.join(lock,'owner.json')))?.id===id)await fs.rm(lock,{recursive:true,force:true});
    }
    } finally { await release({preserve}); }
  }
}
