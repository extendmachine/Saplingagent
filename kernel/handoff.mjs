// Public maintenance API used by the runtime owner. No arbitrary PID termination.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { KernelError, acquireKernelLock } from './contracts/kernel.mjs';
import { jsonWrite, safeFile } from './storage.mjs';
import { assertMcpClientsStopped } from './contracts/mcp-access.mjs';
export async function startMaintenance(root, action, id) {
  const jobId = randomUUID(), prefix = `.runtime/kernel/jobs/${jobId}`;
  const release = await acquireKernelLock(root, 'maintenance-handoff');
  let child, exited, cancellation, committed = false;
  async function cancelWaitingWorker() {
    if (child) {
      // Only this fork handle can be stopped. Before begin the worker has no children.
      if (child.pid && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    }
    const lease = path.join(root, '.runtime/kernel/active-job.json');
    try {
      const current = JSON.parse(await fs.readFile(lease, 'utf8'));
      if (current.jobId === jobId && (current.pid === process.pid || current.pid === child?.pid)) {
        await fs.unlink(lease);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  function abort() {
    if (!committed) cancellation ??= cancelWaitingWorker();
    return cancellation;
  }
  try {
    await assertMcpClientsStopped(root);
    const sources = [
      'kernel/compat/paths.mjs',
      'kernel/contracts/ai-configuration.mjs',
      'kernel/contracts/configuration-transaction.mjs',
      'kernel/contracts/configuration-write.mjs',
      'kernel/contracts/engine-dependencies.mjs',
      'kernel/contracts/kernel.mjs',
      'kernel/contracts/local-process.mjs',
      'kernel/contracts/local-storage.mjs',
      'kernel/contracts/mcp-access.mjs',
      'kernel/install-dependencies.mjs',
      'kernel/localization/errors.mjs',
      'kernel/localization/public.mjs',
      'kernel/localization/runtime-messages.mjs',
      'kernel/localization/store.mjs',
      'kernel/manager.mjs',
      'kernel/recover.mjs',
      'kernel/storage.mjs',
      'kernel/tooling/bindings.mjs',
      'kernel/tooling/npm-cache.mjs',
      'kernel/tooling/public-npm-locks.json',
      'kernel/tooling/progress.mjs',
      'kernel/tooling/providers.mjs',
      'kernel/tooling/store.mjs',
      'kernel/tooling/tools.mjs',
      'kernel/worker.mjs',
    ];
    for (const file of sources) {
      const source=await safeFile(root,file);
      const target=await safeFile(root,`${prefix}/runner/${file}`,{internal:true});
      await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target);
    }
    await jsonWrite(root, '.runtime/kernel/active-job.json', {jobId,pid:process.pid,phase:'handoff',createdAt:new Date().toISOString()});
    const logDirectory = path.join(root,'logs/kernel-manager'); await fs.mkdir(logDirectory,{recursive:true});
    const log = await fs.open(path.join(logDirectory,`kernel-manager-${new Date().toISOString().slice(0,10)}.log`),'a',0o600);
    let ready;
    try {
      child = fork(path.join(root,prefix,'runner/kernel/worker.mjs'),[root,jobId,action,id],{
        cwd:root,execPath:process.execPath,detached:true,windowsHide:true,
        env:{...process.env,SAPLING_MAINTENANCE_JOB:jobId},stdio:['ignore',log.fd,log.fd,'ipc']
      });
      exited=new Promise(resolve=>child.once('close',resolve));
      ready = await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new KernelError('KERNEL_WORKER_FAILED','Maintenance process did not become ready.',500)),15000);
        child.once('error',()=>{clearTimeout(timer);reject(new KernelError('KERNEL_WORKER_FAILED','Maintenance process could not start.',500));});
        child.once('exit',()=>{clearTimeout(timer);reject(new KernelError('KERNEL_WORKER_FAILED','Maintenance process exited before handoff.',500));});
        child.once('message',message=>{clearTimeout(timer);if(message?.jobId!==jobId||!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(message.url||''))reject(new KernelError('KERNEL_WORKER_FAILED','Invalid maintenance discovery.',500));else resolve(message);});
      });
    } finally { await log.close(); }
    return {
      jobId, url:ready.url, abort,
      async commit() {
        if (committed) return;
        if (cancellation) throw new KernelError('KERNEL_WORKER_FAILED','Maintenance was cancelled before handoff.',500);
        await new Promise((resolve,reject)=>child.send({begin:true},error=>error?reject(error):resolve()));
        committed=true;
        if (child.connected) child.disconnect();
        child.unref();
      }
    };
  } catch(error) {
    await abort();
    throw error;
  } finally {
    try { await release(); }
    catch (error) {
      await abort();
      throw error;
    }
  }
}
