// Public maintenance API used by the runtime owner. No arbitrary PID termination.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { KernelError, acquireKernelLock, isKernelPath } from './contracts/kernel.mjs';
import { jsonWrite, safeFile } from './storage.mjs';
import { assertMcpClientsStopped } from './contracts/mcp-access.mjs';
export async function startMaintenance(root, action, id) {
  const jobId = randomUUID(), prefix = `.runtime/kernel/jobs/${jobId}`;
  const release = await acquireKernelLock(root, 'maintenance-handoff');
  let child;
  try {
    await assertMcpClientsStopped(root);
    const sources=['kernel/worker.mjs','kernel/localization/public.mjs','kernel/localization/errors.mjs','kernel/localization/store.mjs','kernel/localization/runtime-messages.mjs','kernel/manager.mjs','kernel/storage.mjs','kernel/recover.mjs','kernel/install-dependencies.mjs','kernel/contracts/kernel.mjs','kernel/contracts/mcp-access.mjs','kernel/contracts/configuration-write.mjs','kernel/contracts/local-storage.mjs','kernel/contracts/local-process.mjs','kernel/contracts/engine-dependencies.mjs','kernel/compat/paths.mjs'];
    for (const file of sources) {
      const source=await safeFile(root,file);
      const target=await safeFile(root,`${prefix}/runner/${file}`,{internal:true});
      await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target);
    }
    await jsonWrite(root, '.runtime/kernel/active-job.json', {jobId,pid:process.pid,phase:'handoff',createdAt:new Date().toISOString()});
    const logDirectory = path.join(root,'logs/kernel-manager'); await fs.mkdir(logDirectory,{recursive:true});
    const log = await fs.open(path.join(logDirectory,`kernel-manager-${new Date().toISOString().slice(0,10)}.log`),'a',0o600);
    try {
      child = fork(path.join(root,prefix,'runner/kernel/worker.mjs'),[root,jobId,action,id],{
        cwd:root,execPath:process.execPath,detached:true,windowsHide:true,
        env:{...process.env,SAPLING_MAINTENANCE_JOB:jobId},stdio:['ignore',log.fd,log.fd,'ipc']
      });
    } finally { await log.close(); }
    const ready = await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new KernelError('KERNEL_WORKER_FAILED','Maintenance process did not become ready.',500)),15000);
      child.once('error',()=>{clearTimeout(timer);reject(new KernelError('KERNEL_WORKER_FAILED','Maintenance process could not start.',500));});
      child.once('exit',()=>{clearTimeout(timer);reject(new KernelError('KERNEL_WORKER_FAILED','Maintenance process exited before handoff.',500));});
      child.once('message',message=>{clearTimeout(timer);if(message?.jobId!==jobId||!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(message.url||''))reject(new KernelError('KERNEL_WORKER_FAILED','Invalid maintenance discovery.',500));else resolve(message);});
    });
    return {jobId,url:ready.url,commit(){child.send({begin:true});child.disconnect();child.unref();},abort(){child.kill();}};
  } catch(error) {
    child?.kill();
    try { const value=JSON.parse(await fs.readFile(path.join(root,'.runtime/kernel/active-job.json'),'utf8')); if(value.jobId===jobId)await fs.unlink(path.join(root,'.runtime/kernel/active-job.json')); }catch{}
    throw error;
  } finally {await release();}
}
