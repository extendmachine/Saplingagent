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

const root=await fs.realpath(process.env.SEED_ROOT||fileURLToPath(new URL('../../',import.meta.url)));
try{
  const cleanup=process.argv.indexOf('--configuration-return');
  if(cleanup>=0){
    await finishConfiguration(root,path.resolve(process.argv[cleanup+1]));
  }else{
    await assertSetupAvailable(root);
    const noOpen=process.argv.includes('--no-open')||process.env.SAPLING_NO_OPEN==='1';
    if(process.argv.includes('--launch')){
      const configuration=await findConfiguration(root);
      if(configuration?.configurationHost==='external'){
        if(!noOpen)await openExternal(`http://127.0.0.1:${configuration.port}/`);
      }else{
        await ensureApplicationDependencies(root,{onProgress:message=>console.log(message)});
        const controller=new ProjectLauncher(root);
        const state=await controller.startConfiguredProject();
        if(!noOpen)await openExternal(state.url);
        console.log('Project: '+state.url);
      }
    }else{
      const address=await openConfiguration(root,{noOpen});
      console.log(`Project setup: http://127.0.0.1:${address.port}/`);
    }
  }
}catch(error){
  await dailyLog(root,'launcher_failed',{code:error.code||'LAUNCHER_FAILED'}).catch(()=>{});
  console.error(error.code||'LAUNCHER_FAILED',error.status?error.message:'The project launcher could not finish. Inspect logs/project-launcher/ and retry Saplingagent.sh.');
  process.exitCode=1;
}
