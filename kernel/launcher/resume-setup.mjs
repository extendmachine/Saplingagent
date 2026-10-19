import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ProjectLauncher, readProject} from './manager.mjs';
import {buildEnv, command, nodeForRoot} from './build.mjs';
import {json, writeJSON, issue, dailyLog} from './io.mjs';
import {completeRelocation, relocationLedger} from './relocation.mjs';
import {releaseFinalization} from './finalization.mjs';
import {prepareSetupUI} from './setup-ui.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function launchManagement(root,job) {
  await prepareSetupUI(root);
  await dailyLog(root,'setup_management_resume',{jobId:job.id});
  async function attempt(fixedPort) {
    const handle=await fs.open(path.join(root,'logs/project-launcher',`project-launcher-${new Date().toISOString().slice(0,10)}.log`),'a');
    const env={...buildEnv(root),SEED_ROOT:root,SAPLING_SETUP_JOB:job.id,SAPLING_LANG:job.language};
    if(process.env.CODEX_HOME)env.CODEX_HOME=process.env.CODEX_HOME;
    if(fixedPort)env.SAPLING_MANAGEMENT_PORT=String(job.management.port);else delete env.SAPLING_MANAGEMENT_PORT;
    const open=!fixedPort&&!job.noOpen;
    env.SAPLING_NO_OPEN=open?'0':'1';
    const child=spawn(nodeForRoot(root),[path.join(root,'kernel/launcher/entry.mjs'),...(open?[]:['--no-open'])],{
      cwd:path.dirname(root),env,stdio:['ignore',handle.fd,handle.fd],detached:true,windowsHide:true,
    });
    const spawned=new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(issue('PROJECT_MANAGEMENT_START_FAILED','The setup service could not restart. Run Saplingagent.sh configure from the current folder.')));});
    await Promise.all([spawned,handle.close()]);
    child.unref();
    for(let i=0;i<100;i++){
      const address=await json(path.join(root,'.runtime/management-address.json'));
      if(address?.root===root&&(address.pid===child.pid||address.configurationHost==='external')&&(!fixedPort||address.port===job.management.port)){
        try{const health=await fetch(`http://127.0.0.1:${address.port}/health/project-launcher`,{signal:AbortSignal.timeout(500)}).then(r=>r.json());
          if(health.root===root&&health.instanceId===address.instanceId)return address;}catch{}
      }
      if(child.exitCode!==null)return null;
      await delay(100);
    }
    // Do not start a duplicate process when this exact owned child is still alive.
    throw Object.assign(issue('PROJECT_MANAGEMENT_START_FAILED','Setup is still starting. Inspect its local log before retrying.'),{managementAttempted:true});
  }
  const retained=await attempt(true);
  if(retained)return retained;
  // The fixed-port attempt has actually exited and cleaned its own lease. A foreign
  // service may have claimed that port; an OS-assigned port preserves project isolation.
  const fallback=await attempt(false);
  if(fallback)return fallback;
  throw Object.assign(issue('PROJECT_MANAGEMENT_START_FAILED','Setup could not restart. Run Saplingagent.sh configure from the current folder.'),{managementAttempted:true});
}
async function prepareApplication(root) {
  const env={...buildEnv(root),SAPLING_SETUP_JOB:process.env.SAPLING_SETUP_JOB,SEED_IMPORT_EXISTING_AUTH:'0'};
  await command(root,nodeForRoot(root),[path.join(root,'kernel/scripts/launcher/cli.mjs'),'install','--app-only'],{env});
  await command(root,nodeForRoot(root),[path.join(root,'front/node_modules/vite/bin/vite.js'),'build'],{cwd:path.join(root,'front'),env});
}
export async function resumeSetup(root,id,failureCode,{prepare=prepareApplication,start,management=launchManagement}={}) {
  root=await fs.realpath(root);
  const lease=await json(path.join(root,'.runtime/project-finalization.json'));
  if(!lease||lease.schemaVersion!==1||lease.id!==id||process.env.SAPLING_SETUP_JOB!==id||![lease.previousRoot,lease.targetRoot].includes(root))
    throw issue('PROJECT_HANDOFF_CHANGED','The setup handoff receipt does not match this folder. Preserve it and inspect the restart.');
  const project=await readProject(root);
  if(project.projectId!==lease.projectId)throw issue('PROJECT_HANDOFF_CHANGED','Project identity changed during restart. Preserve the saved settings.');
  process.env.SAPLING_LANG=lease.language==='zh'?'zh':'en';
  const manager=new ProjectLauncher(root,{open:async()=>{}});
  const status={...lease,root,phase:'restarting',message:'The folder move is complete. Preparing and restarting application services.'};
  let released=false;
  const release=async()=>{if(!released){await releaseFinalization(root,id);released=true;}};
  try {
    if(failureCode) throw issue(failureCode,'The folder could not be renamed. Close terminals, editors or sync tools using it, then save and restart again. The original folder is retained.');
    if(root!==lease.targetRoot||project.folderName!==path.basename(root))throw issue('PROJECT_HANDOFF_CHANGED','The physical folder does not match the saved project settings.');
    await completeRelocation(lease.previousRoot,root,await relocationLedger(root));
    if(await manager.settingsFingerprint()!==lease.fingerprint||await manager.connectionsFingerprint()!==lease.connectionsFingerprint)
      throw issue('PROJECT_SETTINGS_CHANGED','Saved settings changed during restart. Review and save them again before exporting.');
    await writeJSON(path.join(root,'.runtime/setup-settings.json'),{schemaVersion:1,root,projectId:project.projectId,renameFolder:root!==lease.previousRoot,fingerprint:lease.fingerprint});
    await writeJSON(path.join(root,'.runtime/project-directory.json'),{schemaVersion:1,root,projectId:project.projectId,folderName:project.folderName});
    await writeJSON(path.join(root,'.runtime/setup-finalization.json'),status);
    const operation=path.join(root,'.runtime/kernel-operation.lock');
    if((await json(operation))?.id!==id)throw issue('PROJECT_HANDOFF_CHANGED','Setup operation ownership changed before preparation.');
    await fs.rm(operation);
    await prepare(root);
    const runtime=start?await start(root):await manager.startConfiguredProject();
    if(runtime?.phase!=='ready')throw issue('APP_NOT_READY','Application services did not become ready. Inspect runtime diagnostics before exporting.');
    const address=await management(root,lease);
    await writeJSON(path.join(root,'.runtime/setup-finalization.json'),{...status,phase:'ready',finishedAt:new Date().toISOString(),message:'Restart completed. You can now export the app.',runtimeUrl:runtime.url,managementPort:address.port,readyUrl:`http://127.0.0.1:${address.port}/`});
    await release();
    await dailyLog(root,'setup_restart_ready',{jobId:id,managementPort:address.port}).catch(()=>{});
    return {phase:'ready',root,managementPort:address.port,runtimeUrl:runtime.url};
  } catch(error) {
    await writeJSON(path.join(root,'.runtime/setup-finalization.json'),{...status,phase:'failed',finishedAt:new Date().toISOString(),
      message:'Setup restart did not finish. Saved settings remain available; inspect the error and retry.',
      error:{code:error.code||'PROJECT_RESTART_FAILED',message:error.status?error.message:'Application preparation or restart failed. Check logs/project-launcher/ and run the setup script again.'}});
    await dailyLog(root,'setup_restart_failed',{jobId:id,code:error.code||'PROJECT_RESTART_FAILED'}).catch(()=>{});
    await release();
    if(!error.managementAttempted)await management(root,lease).catch(async()=>{await dailyLog(root,'setup_management_unavailable',{jobId:id}).catch(()=>{});});
    throw error;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=fileURLToPath(new URL('../../',import.meta.url));
  resumeSetup(root,process.argv[2],process.argv[3]).catch(()=>{process.exitCode=1;});
}
