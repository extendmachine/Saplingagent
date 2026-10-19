import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {acquireKernelLock} from '../contracts/kernel.mjs';
import {realDirectory,regularJSON} from './paths.mjs';
import {nodeForRoot,buildEnv} from '../launcher/build.mjs';
import {json,writeJSON,issue,dailyLog} from '../launcher/io.mjs';
import {readSession,waitForExit,sessionFile,alive,removeSessionDirectory} from './session.mjs';

const returnAttempts=new Map();
export async function handBack(session,{spawnProcess=spawn,timeout=15000}={}){
  session=await readSession(session.directory,session.root);
  if(session.pid!==process.pid)throw issue('CONFIGURATION_OWNERSHIP','Only the configuration owner can hand back this session.');
  const root=session.root;
  await fs.mkdir(path.join(root,'.runtime/launcher-tmp'),{recursive:true});
  const env=buildEnv(root);
  // A must not retain B's executable, cwd, temporary directory or log descriptor.
  delete env.SAPLING_CONFIGURATION_DIR;delete env.SAPLING_SETUP_JOB;delete env.SAPLING_CONFIG_PARENT_PID;
  const existing=await json(path.join(session.directory,'takeover.json'));
  if(existing?.id===session.id&&existing.nonce===session.nonce&&existing.root===root&&alive(existing.pid))return existing;
  let child=returnAttempts.get(session.id);
  if(!child||!alive(child.pid)){
  child=spawnProcess(nodeForRoot(root),[path.join(root,'kernel/launcher/entry.mjs'),'--configuration-return',session.directory],{cwd:path.dirname(root),env,stdio:'ignore',detached:true,windowsHide:true});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(issue('CONFIGURATION_RETURN_FAILED','The project launcher could not resume. Reopen Saplingagent.sh configure to inspect the saved setup.')));});
  child.unref();returnAttempts.set(session.id,child);
  }
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    const ack=await json(path.join(session.directory,'takeover.json'));
    if(ack?.id===session.id&&ack.nonce===session.nonce&&ack.pid===child.pid&&ack.root===root)return ack;
    if(child.exitCode!==null)break;
    await delay(50);
  }
  throw issue('CONFIGURATION_RETURN_FAILED','The project launcher did not acknowledge cleanup. Saved configuration remains in this project.');
}
export async function finishConfiguration(root,directory,{timeout=30000}={}){
  const session=await readSession(directory,root);
  if(!alive(session.pid))throw issue('CONFIGURATION_OWNERSHIP','The configuration process exited before the handoff. Inspect its saved session.');
  const release=await acquireKernelLock(root,'configuration-cleanup');
  const lock=path.join(root,'.runtime/configuration-cleanup.lock');
  let ownsLock=false;
  try {
  try{await fs.mkdir(lock);}catch(error){
    if(error.code!=='EEXIST')throw error;
    await realDirectory(lock);
    const owner=await regularJSON(path.join(lock,'owner.json'));
    if(!owner||owner.id!==session.id||!Number.isSafeInteger(owner.pid)||owner.pid<=0||alive(owner.pid))throw issue('CONFIGURATION_CLEANUP_BUSY','A configuration cleanup is already active.');
    await fs.rm(lock,{recursive:true});await fs.mkdir(lock);
  }
  ownsLock=true;
  await writeJSON(path.join(lock,'owner.json'),{id:session.id,pid:process.pid});
  await writeJSON(path.join(directory,'takeover.json'),{id:session.id,nonce:session.nonce,pid:process.pid,root});
  await waitForExit([session.pid],{timeout});
  // Re-read both receipts after exit. A moved/replaced session is never deleted.
  await readSession(directory,root);
  for(const name of ['management-address.json','management.lock']){
    const file=path.join(root,'.runtime',name),value=await json(name.endsWith('.lock')?path.join(file,'owner.json'):file);
    if(value?.pid===session.pid)await fs.rm(file,{recursive:true,force:true});
  }
  await removeSessionDirectory(session);
  await writeJSON(path.join(root,'.runtime/configuration-complete.json'),{schemaVersion:1,id:session.id,root,phase:'complete',completedAt:new Date().toISOString(),temporaryFilesRemoved:true});
  if((await json(sessionFile(root)))?.id===session.id)await fs.rm(sessionFile(root));
  await dailyLog(root,'configuration_cleanup_complete',{sessionId:session.id});
  return {complete:true,root};
  }finally{try{if(ownsLock&&(await json(path.join(lock,'owner.json')))?.pid===process.pid)await fs.rm(lock,{recursive:true,force:true});}finally{await release();}}
}
