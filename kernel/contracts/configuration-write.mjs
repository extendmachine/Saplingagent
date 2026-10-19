import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ensureManagedDirectory} from './local-storage.mjs';

// Setup and the configuration service share the credential-reference ledger.
// Keep an exclusive ownership receipt, not an open handle across a folder move.
export async function acquireConfigurationWrite(root) {
  const directory=await ensureManagedDirectory(root,'local-secrets/ai-config');
  const file=path.join(directory,'write.lock'), id=randomUUID();
  let handle;
  try {handle=await fs.open(file,'wx',0o600);}
  catch(error) {if(error.code==='EEXIST')throw Object.assign(new Error('Another configuration write is running. Retry after it finishes; inspect a stale write.lock before removing it.'),{code:'CONFIG_BUSY',status:409});throw error;}
  const identity=await handle.stat();
  const isOwned=async target=>{const stat=await fs.lstat(target).catch(()=>null);return stat?.isFile()&&stat.dev===identity.dev&&stat.ino===identity.ino;};
  try {
    try {await handle.writeFile(JSON.stringify({id,pid:process.pid})+'\n');} finally {await handle.close();}
  } catch(error) {
    await handle.close().catch(()=>{});
    if(await isOwned(file))await fs.rm(file).catch(()=>{});
    throw error;
  }
  return async(currentRoot=root)=>{
    // Moving the whole project retains the closed lock file's inode. The owner
    // supplies its verified new root after relocation; never recreate an old root.
    const target=path.join(await fs.realpath(currentRoot),'local-secrets/ai-config/write.lock');
    if(!await isOwned(target))return;
    const current=await fs.readFile(target,'utf8').then(JSON.parse,()=>null);
    if(current?.id===id)await fs.rm(target);
  };
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
