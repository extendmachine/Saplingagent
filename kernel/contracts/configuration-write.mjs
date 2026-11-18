import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {configurationWritePending,recoverConfigurationWrite} from './configuration-transaction.mjs';
import {ensureManagedDirectory} from './local-storage.mjs';

const busy=()=>Object.assign(Error('Another configuration write is running. Retry after it finishes; inspect an unverified write.lock before removing it.'),{code:'CONFIG_BUSY',status:409});

async function reclaimExitedWriter(file) {
  const bytes=await fs.readFile(file,'utf8').catch(()=>null);
  let owner;try{owner=JSON.parse(bytes);}catch{return false;}
  if(!/^[a-f0-9-]{36}$/.test(owner?.id)||!Number.isSafeInteger(owner.pid)||owner.pid<2)return false;
  try{process.kill(owner.pid,0);return false;}catch(error){if(error.code!=='ESRCH')return false;}
  // Only one contender may unlink this specific dead owner's receipt.
  const claim=file+'.'+owner.id+'.reclaim';
  const guard=await fs.open(claim,'wx',0o600).catch(error=>{if(error.code==='EEXIST')return null;throw error;});
  if(!guard)return false;
  try{
    if(await fs.readFile(file,'utf8').catch(()=>null)!==bytes)return false;
    await fs.unlink(file);return true;
  }finally{await guard.close();await fs.rm(claim,{force:true});}
}

// Setup and the configuration service share the credential-reference ledger.
// Keep an exclusive ownership receipt, not an open handle across a folder move.
export async function acquireConfigurationWrite(root) {
  const directory=await ensureManagedDirectory(root,'local-secrets/ai-config');
  const file=path.join(directory,'write.lock'), id=randomUUID();
  let handle;
  try {handle=await fs.open(file,'wx',0o600);}
  catch(error) {
    if(error.code!=='EEXIST')throw error;
    if(!await reclaimExitedWriter(file))throw busy();
    try{handle=await fs.open(file,'wx',0o600);}catch(retry){if(retry.code==='EEXIST')throw busy();throw retry;}
  }
  const identity=await handle.stat();
  const isOwned=async target=>{const stat=await fs.lstat(target).catch(()=>null);return stat?.isFile()&&stat.dev===identity.dev&&stat.ino===identity.ino;};
  try {
    try {await handle.writeFile(JSON.stringify({id,pid:process.pid})+'\n');} finally {await handle.close();}
  } catch(error) {
    await handle.close().catch(()=>{});
    if(await isOwned(file))await fs.rm(file).catch(()=>{});
    throw error;
  }
  const release = async(currentRoot=root)=>{
    // Moving the whole project retains the closed lock file's inode. The owner
    // supplies its verified new root after relocation; never recreate an old root.
    const target=path.join(await fs.realpath(currentRoot),'local-secrets/ai-config/write.lock');
    if(!await isOwned(target))return;
    const current=await fs.readFile(target,'utf8').then(JSON.parse,()=>null);
    if(current?.id===id)await fs.rm(target);
  };
  try {await recoverConfigurationWrite(root);} catch(error){await release();throw error;}
  return release;
}
export async function withConfigurationWrite(root, work) {
  const release=await acquireConfigurationWrite(root);
  try {return await work();} finally {await release();}
}

export async function atomicConfigurationJSON(file, value) {
  const stat=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(stat&&!stat.isFile())throw Object.assign(new Error('Configuration file must be a regular file.'),{code:'CONFIG_STORAGE_ERROR',status:409});
  const stage=file+'.'+randomUUID()+'.tmp';
  try {await fs.writeFile(stage,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(stage,file);}
  finally {await fs.rm(stage,{force:true});}
}

// Native Codex reads auth.json directly. Do not launch it between credential
// replacement and publication. A dead writer's previous image is restored here.
export async function ensureNativeConfigurationCommitted(root) {
  if(await configurationWritePending(root))await withConfigurationWrite(root,async()=>{});
}
