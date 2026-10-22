import fs from 'node:fs/promises';
import path from 'node:path';
import {ProjectLauncher,readProject} from '../launcher/manager.mjs';
import {closeDockForMaintenance} from '../launcher/public.mjs';
import {json,writeJSON,issue,exists} from '../launcher/io.mjs';
import {relocationLedger,completeRelocation} from '../launcher/relocation.mjs';
import {acquireConfigurationWrite} from '../contracts/configuration-write.mjs';
import {assertKernelOffline} from '../contracts/kernel.mjs';
import {assertMcpClientsStopped} from '../contracts/mcp-access.mjs';
import {saveSession,waitForExit} from './session.mjs';
import {moveProject} from './move.mjs';

export class ConfigurationController extends ProjectLauncher {
  constructor(root,{session,onRelocate=async()=>{},closeNative=closeDockForMaintenance,...options}={}) {
    super(root,options);this.session=session;this.onRelocate=onRelocate;this.closeNative=closeNative;this.configurationHost='external';
  }
  async state(){return {...await super.state(),configurationHost:'external'};}
  async openProject(){throw issue('CONFIGURATION_FINISH_REQUIRED','Finish setup, then open the app to check dependencies and start the project.');}
  async restart(){return this.openProject();}
  async finalizeSetup(){
    this.assertIdle();
    if(!await this.settingsSaved())throw issue('PROJECT_SETTINGS_REQUIRED','Save project settings before building the app.');
    const project=await readProject(this.root);
    await this.preflightDirectory(project.folderName);
    return this.startJob('configure',()=>this.configure(project));
  }
  async build(){return this.finalizeSetup();}
  async configure(project){
    const id=this.session.id, previousRoot=this.root;
    let ownsLease=false,ownsOperation=false,releaseConfiguration;
    const removeOwned=async name=>{const file=path.join(this.root,'.runtime',name);if((await json(file))?.id===id)await fs.rm(file);};
    try {
      await assertMcpClientsStopped(this.root);
      this.progress('Waiting for the original launcher to exit…');
      await waitForExit(this.session.bootstrapPids||[]);
      // Release the resident Dock app and any startup worker before taking the
      // setup leases; the worker may still own a kernel operation lease itself.
      this.progress('Closing this project’s app before saving and building…');
      await this.closeNative(this.root);
      this.progress('Stopping this project before saving and building…');
      const runtime=await this.runtime();
      await this.stop({reserved:true});
      if(runtime.pid)await waitForExit([runtime.pid]);
      await assertKernelOffline(this.root);
      if(await exists(path.join(this.root,'.runtime/kernel/active-job.json')))throw issue('PROJECT_BUSY','Finish kernel maintenance first.');
      if(await exists(path.join(this.root,'.runtime/launcher-compile.lock')))throw issue('PROJECT_BUSY','A launcher compilation still owns this folder. Wait for it to finish before saving or renaming.');
      await this.preflightDirectory(project.folderName);
      for(const [name,purpose]of [['kernel-operation.lock','configuration-build'],['project-finalization.json','external-configuration']]){
        const handle=await fs.open(path.join(this.root,'.runtime',name),'wx',0o600).catch(e=>{if(e.code==='EEXIST')throw issue('PROJECT_BUSY','A project operation is active. Wait before saving again.');throw e;});
        if(name==='project-finalization.json')ownsLease=true;else ownsOperation=true;
        try{await handle.writeFile(JSON.stringify({schemaVersion:1,id,pid:process.pid,purpose,projectId:project.projectId})+'\n');}finally{await handle.close();}
      }
      releaseConfiguration=await acquireConfigurationWrite(this.root);
      await assertMcpClientsStopped(this.root);
      const ledger=await relocationLedger(this.root);
      // Recheck under both leases: a competing app start could have won the
      // operation lock after the earlier idle check.
      await this.closeNative(this.root);
      await assertKernelOffline(this.root);
      if(await exists(path.join(this.root,'.runtime/kernel/active-job.json')))throw issue('PROJECT_BUSY','Finish kernel maintenance first.');
      if(await exists(path.join(this.root,'.runtime/launcher-compile.lock')))throw issue('PROJECT_BUSY','A launcher compilation still owns this folder. Wait for it to finish before saving or renaming.');
      await this.preflightDirectory(project.folderName);
      const target=path.join(path.dirname(this.root),project.folderName);
      await writeJSON(path.join(this.root,'.runtime/setup-finalization.json'),{schemaVersion:1,id,phase:'building',root:this.root,targetRoot:target});
      if(target!==this.root){
        this.progress('Moving the complete project folder…');
        await moveProject(this.root,target);
        this.root=await fs.realpath(target);
        // Rebind even when a later metadata write fails: retries must target the
        // physical current folder, never recreate the vanished previous root.
        this.session={...this.session,root:this.root,projectId:project.projectId};
        // Rebind in finally even if receipt storage fails, so no HTTP handler
        // can write through the old path after the physical move.
        try{await saveSession(this.session);}finally{await this.onRelocate(this.root);}
        await completeRelocation(previousRoot,this.root,ledger);
      }else{
        this.session={...this.session,projectId:project.projectId};await saveSession(this.session);
      }
      const fingerprint=await this.settingsFingerprint();
      await writeJSON(path.join(this.root,'.runtime/setup-settings.json'),{schemaVersion:1,root:this.root,projectId:project.projectId,renameFolder:this.root!==previousRoot,fingerprint});
      await writeJSON(path.join(this.root,'.runtime/project-directory.json'),{schemaVersion:1,root:this.root,projectId:project.projectId,folderName:project.folderName});
      // No live descriptor on the operation file survives the move. The setup
      // lease remains until compilation finishes and excludes independent starts.
      await removeOwned('kernel-operation.lock');ownsOperation=false;
      this.progress('Compiling the lightweight app launcher…');
      const receipt=await this.compiler(this.root,project,{onProgress:s=>this.progress(s),setupId:id});
      const result={artifact:receipt.artifact,root:this.root};
      await writeJSON(path.join(this.root,'.runtime/setup-finalization.json'),{schemaVersion:1,id,phase:'ready',root:this.root,previousRoot,connectionsFingerprint:await this.connectionsFingerprint(),finishedAt:new Date().toISOString(),message:'App built. Finish setup, then open the app. Dependencies are checked at launch.',...result});
      return result;
    }catch(error){
      if(this.root!==previousRoot){
        await saveSession(this.session).catch(()=>{});
        await this.onRelocate(this.root).catch(()=>{});
      }
      await writeJSON(path.join(this.root,'.runtime/setup-finalization.json'),{schemaVersion:1,id,phase:'failed',root:this.root,previousRoot,error:{code:error.code||'CONFIGURATION_BUILD_FAILED',message:error.status?error.message:'Configuration did not finish. Inspect project logs and retry.'}}).catch(()=>{});
      throw error;
    }finally{
      await releaseConfiguration?.(this.root);
      if(ownsOperation)await removeOwned('kernel-operation.lock');
      if(ownsLease)await removeOwned('project-finalization.json');
    }
  }
}
