// AI-only maintenance keeps the existing identity, launcher and application source.
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {acquireKernelLock,assertKernelOffline} from '../contracts/kernel.mjs';
import {ProjectLauncher,readProject,openExternal} from '../launcher/manager.mjs';
import {processIdentity} from '../launcher/dock.mjs';
import {json,writeJSON,issue} from '../launcher/io.mjs';
import {statusPageOpener} from '../launcher/status.mjs';
import {saveSession,readSession,waitForExit} from './session.mjs';

export async function nativeRestartArtifact(root) {
  if(process.platform!=='darwin')return null;
  const launcher=await json(path.join(root,'.runtime/launcher.json'));
  if(!launcher)return null;
  const project=await readProject(root);
  if(!project.projectId||launcher.projectId!==project.projectId||typeof launcher.artifact!=='string'||launcher.artifact!==path.basename(launcher.artifact)||!launcher.artifact.endsWith('.app'))throw issue('CONFIGURATION_OWNERSHIP','The existing native launcher does not match this project.');
  const artifact=path.join(root,launcher.artifact),stat=await fs.lstat(artifact).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(!stat)return null;
  if(!stat.isDirectory()||stat.isSymbolicLink())throw issue('CONFIGURATION_OWNERSHIP','The existing project app must be an ordinary project-local directory.');
  const owner=await json(path.join(root,'.runtime/native-app.json'));
  if(owner){
    const actual=await processIdentity(owner.pid);
    if(actual&&actual.stamp===owner.process?.stamp&&actual.executable===owner.process?.executable){
      if(owner.root!==root||owner.projectId!==project.projectId)throw issue('CONFIGURATION_OWNERSHIP','The native launcher owner does not match this project.');
      const expected=await fs.realpath(path.join(artifact,'Contents/MacOS/applet'));
      if(await fs.realpath(actual.executable)!==expected)throw issue('CONFIGURATION_OWNERSHIP','The native launcher process does not match its project artifact.');
    }
  }
  return launcher.artifact;
}

export async function prepareAIChange(controller) {
  if(controller.configurationMode!=='ai')return;
  if(controller.aiFinishing)throw issue('CONFIGURATION_CLOSING','AI configuration is finishing. Reopen it after the restart.');
  if(controller.aiPrepared)return;
  if(controller.aiPreparing)return controller.aiPreparing;
  controller.busy=true;
  controller.aiPreparing=(async()=>{
    // Never wait on the resident runtime's PID as an original bootstrap A.
    await waitForExit(controller.session.bootstrapPids||[]);
    await readSession(controller.session.directory,controller.root);
    const runtime=await controller.runtime();
    const artifact=await controller.nativeRestartArtifact(controller.root);
    const previous=controller.session.restartAfterClose||'none';
    controller.session={...controller.session,restartAfterClose:artifact?'native':previous==='native'?previous:'runtime',...(artifact?{restartArtifact:artifact}:{})};
    // Persist the restart intention before stopping anything. A later failure
    // can still be closed normally and resume the project that was stopped.
    await saveSession(controller.session);
    await controller.closeNative(controller.root);
    await controller.stop({reserved:true});
    if(runtime.pid)await waitForExit([runtime.pid]);
    controller.aiRelease=await acquireKernelLock(controller.root,'ai-configuration');
    try {
      await controller.closeNative(controller.root);
      await assertKernelOffline(controller.root);
      await readSession(controller.session.directory,controller.root);
      controller.aiPrepared=true;
      controller.aiPhase='editing';
    }catch(error){await controller.aiRelease();controller.aiRelease=null;throw error;}
  })().finally(()=>{controller.aiPreparing=null;controller.busy=false;});
  return controller.aiPreparing;
}

export async function prepareAIFinish(controller) {
  if(controller.configurationMode!=='ai')return {restartAfterClose:'none'};
  if(controller.aiFinished)return controller.aiFinished;
  if(controller.aiPreparing)await controller.aiPreparing;
  controller.aiFinishing=true;
  try {
    await readSession(controller.session.directory,controller.root);
    // A setup already marked ready need not become an unfinished rename/build
    // just because AI credentials changed. Preserve all its other evidence.
    if(controller.aiPrepared){
      const file=path.join(controller.root,'.runtime/setup-finalization.json');
      const ready=await json(file);
      if(ready?.phase==='ready'&&ready.root===controller.root&&await controller.settingsSaved()&&await controller.directoryReady()){
        await writeJSON(file,{...ready,connectionsFingerprint:await controller.connectionsFingerprint()});
      }
    }
    await saveSession(controller.session);
    const result={restartAfterClose:controller.session.restartAfterClose||'none'};
    await writeJSON(path.join(controller.root,'.runtime/ai-configuration.json'),{schemaVersion:1,id:controller.session.id,root:controller.root,phase:'saved',...result,savedAt:new Date().toISOString()});
    await controller.aiRelease?.();controller.aiRelease=null;
    controller.aiPhase=controller.aiPrepared?'saved':'closed';controller.aiFinished=result;
    return result;
  }catch(error){controller.aiFinishing=false;throw error;}
}

export async function resumeAIConfiguration(root,session,{launcher=new ProjectLauncher(root),open=openExternal,timeout=120000}={}) {
  if(session.configurationMode!=='ai'||!session.restartAfterClose||session.restartAfterClose==='none')return {restarted:false};
  if(session.restartAfterClose==='native'){
    const project=await readProject(root),receipt=await json(path.join(root,'.runtime/launcher.json'));
    const artifact=session.restartArtifact;
    if(!artifact||artifact!==path.basename(artifact)||!artifact.endsWith('.app')||receipt?.artifact!==artifact||receipt.projectId!==project.projectId||project.projectId!==session.projectId)throw issue('CONFIGURATION_RESTART_FAILED','The existing app launcher changed. Open this project manually after checking its launcher.');
    const file=path.join(root,artifact),stat=await fs.lstat(file);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw issue('CONFIGURATION_RESTART_FAILED','The existing project app is unavailable. Reopen the project manually.');
    await open(file);
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline){
      const state=await launcher.runtime();
      if(state.phase==='ready'&&!state.busy)return {restarted:true,url:state.url};
      if(state.phase==='failed')throw issue('CONFIGURATION_RESTART_FAILED','AI settings were saved, but the project did not start. Inspect logs/project-launcher and reopen the app.');
      await delay(100);
    }
    throw issue('CONFIGURATION_RESTART_FAILED','AI settings were saved. The app is still starting; inspect its status page or reopen it.');
  }
  const onRuntime=statusPageOpener(open);
  const state=await launcher.startConfiguredProject({onRuntime});
  await onRuntime(state);
  return {restarted:true,url:state.url};
}
