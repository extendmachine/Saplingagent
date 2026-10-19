import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createConfigurationServer} from '../services/ai-config/server.mjs';
import {ConfigurationController} from './controller.mjs';
import {readSession,saveSession,waitForExit} from './session.mjs';
import {handBack} from './handoff.mjs';
import {json,writeJSON,dailyLog} from '../launcher/io.mjs';
import {openExternal} from '../launcher/manager.mjs';

const directory=await fs.realpath(process.env.SAPLING_CONFIGURATION_DIR);
let session=await readSession(directory,process.env.SEED_ROOT);
session={...session,pid:process.pid};await saveSession(session);
process.chdir(directory);
const token=randomBytes(32).toString('hex');
await fs.mkdir(path.join(session.root,'local-secrets/runtime'),{recursive:true,mode:0o700});
await fs.writeFile(path.join(session.root,'local-secrets/runtime/launcher-token'),token,{mode:0o600});
let server;
const controller=new ConfigurationController(session.root,{session,onRelocate:async root=>{
  session=controller.session;process.env.SEED_ROOT=root;
  await server.relocate(root);
}});
const publish=async()=>{
  session=controller.session;
  const address={root:controller.root,fingerprint:session.fingerprint,pid:process.pid,instanceId:session.id,port:server.address().port,configurationHost:'external',relativeDirectory:path.relative(controller.root,directory)};
  await writeJSON(path.join(controller.root,'.runtime/management-address.json'),address);
  await writeJSON(path.join(controller.root,'.runtime/management.lock/owner.json'),{root:controller.root,pid:process.pid,id:session.id});
  await writeJSON(path.join(directory,'address.json'),address);
};
server=createConfigurationServer({root:controller.root,assets:path.join(directory,'ui'),language:session.language,token,projectController:controller,instanceId:session.id,onProjectRename:publish,
  beforeClose:()=>handBack(controller.session),onClose:async()=>{
    // A owns discovery cleanup after it observes B exit. No failing I/O here
    // may leave a headless B keeping its executable open.
    process.exit(0);
  }});
for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>void server.shutdown().catch(error=>{void dailyLog(controller.root,'configuration_close_failed',{code:error.code});}));
server.on('error',error=>{void writeJSON(path.join(directory,'failure.json'),{code:error.code||'CONFIGURATION_START_FAILED'}).finally(()=>process.exit(1));});
// The page is available while bootstrap A exits, but writes wait for its release.
controller.busy=true;
const requested=session.port;
server.listen(requested||0,'127.0.0.1',async()=>{
  try{
    await publish();
    await waitForExit(session.bootstrapPids||[],{timeout:120000});
    controller.busy=false;
    if(!session.noOpen)await openExternal(`http://127.0.0.1:${server.address().port}/`);
    await dailyLog(controller.root,'external_configuration_started',{sessionId:session.id});
  }catch(error){controller.busy=false;await dailyLog(controller.root,'configuration_bootstrap_wait_failed',{code:error.code});}
});
