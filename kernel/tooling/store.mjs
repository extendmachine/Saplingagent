import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const read=file=>fs.readFile(file,'utf8').then(JSON.parse).catch(()=>null);
const failure=(code,message)=>Object.assign(new Error(message),{code});
export async function atomicJSON(file,value) {
  await fs.mkdir(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n');await fs.rename(temporary,file);}finally{await fs.rm(temporary,{force:true});}
}
export async function sharedEntry(home,key,validate) {
  const saved=await read(path.join(home,'index',key+'.json'));
  if(typeof saved?.directory!=='string')return null;
  const relative=path.relative(path.join(home,'runtimes'),saved.directory);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return null;
  return await validate(saved.directory).catch(error=>{if(error.code==='TOOL_INTERRUPTED'||error.name==='AbortError')throw error;return false;})?saved.directory:null;
}
// All callers use the same component/version lock. Publish only a fully checked
// new directory; never overwrite an executable that another project is running.
export async function ensureShared(home,key,{validate,create,waitMs=600000,signal,onWait=()=>{}}) {
  if(!/^[a-zA-Z0-9._-]+$/.test(key))throw failure('SHARED_RUNTIME_KEY','Invalid shared runtime key.');
  const existing=await sharedEntry(home,key,validate);if(existing)return existing;
  const lock=path.join(home,'locks',key),id=randomUUID(),deadline=Date.now()+waitMs;
  await fs.mkdir(path.dirname(lock),{recursive:true});let lastNotice=0;
  for(;;){
    signal?.throwIfAborted();
    try{await fs.mkdir(lock);break;}catch(e){if(e.code!=='EEXIST')throw e;}
    const done=await sharedEntry(home,key,validate);if(done)return done;
    const owner=await read(path.join(lock,'owner.json'));
    if(owner?.host===os.hostname()&&Number.isSafeInteger(owner.pid)){
      let dead=false;try{process.kill(owner.pid,0);}catch(e){dead=e.code==='ESRCH';}
      if(dead)throw failure('SHARED_RUNTIME_INTERRUPTED',`An interrupted tool installation owns ${lock}. Inspect that lock before retrying.`);
    }
    if(Date.now()>=deadline)throw failure('SHARED_RUNTIME_BUSY',`Another installation is preparing ${key}. Wait and retry.`);
    if(Date.now()-lastNotice>15000){onWait(key);lastNotice=Date.now();}await delay(100,undefined,{signal});
  }
  const identity=await fs.stat(lock);
  try{await atomicJSON(path.join(lock,'owner.json'),{id,pid:process.pid,host:os.hostname()});}catch(error){const current=await fs.stat(lock).catch(()=>null);if(current?.ino===identity.ino&&current?.dev===identity.dev)await fs.rm(lock,{recursive:true,force:true});throw error;}
  const stage=path.join(home,'staging',id);
  try{
    const done=await sharedEntry(home,key,validate);if(done)return done;
    await fs.mkdir(stage,{recursive:true});await create(stage);
    if(!await validate(stage))throw failure('SHARED_RUNTIME_INVALID',`The installed ${key} is incomplete. Retry installation.`);
    const directory=path.join(home,'runtimes',key,id);await fs.mkdir(path.dirname(directory),{recursive:true});
    await fs.rename(stage,directory);
    await atomicJSON(path.join(home,'index',key+'.json'),{schemaVersion:1,directory,createdAt:new Date().toISOString()});return directory;
  }finally{
    await fs.rm(stage,{recursive:true,force:true});
    if((await read(path.join(lock,'owner.json')))?.id===id)await fs.rm(lock,{recursive:true,force:true});
  }
}
