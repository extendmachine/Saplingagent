import { readLanguage } from '../localization/store.mjs';
import { normalizeLanguage, describeError, formatMessage } from '../localization/public.mjs';
import { launcherMessages } from '../localization/launcher-messages.mjs';
// A is a short-lived bootstrap. Configuration runs from the external capsule B.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertSetupAvailable} from '../contracts/kernel.mjs';
import {ProjectLauncher,openExternal} from './manager.mjs';
import {openConfiguration,findConfiguration} from '../configuration/bootstrap.mjs';
import {finishConfiguration} from '../configuration/handoff.mjs';
import {ensureApplicationDependencies} from './dependencies.mjs';
import {dailyLog} from './io.mjs';
import {statusPageOpener,launchProgress} from './status.mjs';

const root=await fs.realpath(process.env.SEED_ROOT||fileURLToPath(new URL('../../',import.meta.url)));
try{
  process.env.SAPLING_LANG=process.env.SAPLING_LANG_EXPLICIT==='1'?normalizeLanguage(process.env.SAPLING_LANG):await readLanguage(root,normalizeLanguage(process.env.LC_ALL||process.env.LANG));
  const dockAction=process.argv.find(value=>/^--dock-(start|open|stop|status)$/.test(value));
  if(dockAction){
    const {createDockController}=await import('./dock.mjs');
    const arg=name=>process.argv[process.argv.indexOf(name)+1];
    const owner={pid:Number(arg('--dock-pid')),nonce:arg('--dock-nonce')};
    const dock=createDockController(root);
    const result=await (dockAction==='--dock-stop'?dock.stop(owner):dockAction==='--dock-status'?dock.status(owner):dock.start(owner,{noOpen:process.env.SAPLING_NO_OPEN==='1'}));
    console.log(result);
  }else{
  const cleanup=process.argv.indexOf('--configuration-return');
  if(cleanup>=0){
    await finishConfiguration(root,path.resolve(process.argv[cleanup+1]));
  }else{
    await assertSetupAvailable(root);
    const noOpen=process.argv.includes('--no-open')||process.env.SAPLING_NO_OPEN==='1';
    if(process.argv.includes('--launch')){
      launchProgress('checking');
      const configuration=await findConfiguration(root);
      if(configuration?.configurationHost==='external'){
        if(!noOpen)await openExternal(`http://127.0.0.1:${configuration.port}/`);
        launchProgress('ready');
      }else{
        let repairing=false;
        await ensureApplicationDependencies(root,{onProgress:message=>{if(!repairing){repairing=true;launchProgress('installing');}console.log(message);}});
        launchProgress('starting');
        const controller=new ProjectLauncher(root);
        const onRuntime=statusPageOpener(openExternal,{noOpen});
        const state=await controller.startConfiguredProject({onRuntime});
        await onRuntime(state);
        launchProgress('ready');
      }
    }else{
      const address=await openConfiguration(root,{noOpen});
      console.log(formatMessage(launcherMessages,process.env.SAPLING_LANG,'Project setup: {url}',{url:`http://127.0.0.1:${address.port}/`}));
    }
  }
  }
}catch(error){
  if(process.argv.includes('--launch'))launchProgress('failed');
  await dailyLog(root,'launcher_failed',{code:error.code||'LAUNCHER_FAILED'}).catch(()=>{});
  const info=describeError(error,process.env.SAPLING_LANG);
  console.error([info.summary,info.action,info.code||'LAUNCHER_FAILED',info.details].filter(Boolean).join('\n'));
  process.exitCode=1;
}
