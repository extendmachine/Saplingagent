import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {json,writeJSON,issue} from '../launcher/io.mjs';
import {siblingLocation,localRuntime,regularJSON,sameIdentity} from './paths.mjs';
export const sessionFile=root=>path.join(root,'.runtime/configuration-session.json');
export const alive=pid=>{if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
export async function waitForExit(pids,{timeout=30000}={}) {
  const deadline=Date.now()+timeout;
  while(pids.some(alive)){if(Date.now()>deadline)throw issue('CONFIGURATION_PROCESS_PENDING','An owned process has not exited. Close the original installer/launcher and retry.');await delay(50);}
}
const invalid=()=>issue('CONFIGURATION_OWNERSHIP','Configuration handoff no longer matches this project. Preserve it and inspect the saved session.');
const name=value=>typeof value==='string'&&value!=='.'&&value!=='..'&&value===path.basename(value)&&!/[\\/\x00-\x1f]/.test(value);
export async function storedSession(root) {
  await localRuntime(root);
  const value=await regularJSON(sessionFile(root),{optional:true});
  if(!value)return null;
  if(value.schemaVersion!==2||!name(value.configurationDirectory)||!name(value.projectDirectory))
    throw issue('CONFIGURATION_LEGACY_SESSION','A previous configuration session needs to be closed using its original page before upgrading. No legacy temporary folder was changed.');
  return readSession(path.join(root,'..',value.configurationDirectory),root);
}
export async function readSession(directory,root) {
  const location=await siblingLocation(root,directory);
  await localRuntime(root);
  const external=await regularJSON(path.join(directory,'session.json'));
  const local=await regularJSON(sessionFile(root));
  const matches=value=>value?.schemaVersion===2&&value.projectDirectory===path.basename(root)&&value.configurationDirectory===path.basename(directory)&&sameIdentity(value.projectIdentity,location.projectIdentity)&&sameIdentity(value.directoryIdentity,location.directoryIdentity)&&sameIdentity(value.parentIdentity,location.parentIdentity);
  if(!matches(external)||!matches(local)||external.id!==local.id||external.nonce!==local.nonce||external.pid!==local.pid||external.projectId!==local.projectId||!Number.isSafeInteger(local.pid)||local.pid<=0||!/^[a-f0-9]{64}$/.test(local.nonce)||!/^[a-f0-9-]{36}$/.test(local.id))throw invalid();
  const project=await json(path.join(root,'config/project.json'));
  if(external.projectId!==null&&external.projectId!==project?.projectId)throw invalid();
  return {...external,root,directory};
}
export async function saveSession(session) {
  const location=await siblingLocation(session.root,session.directory);
  await localRuntime(session.root);
  for(const key of ['projectIdentity','directoryIdentity','parentIdentity'])
    if(session[key]&&!sameIdentity(session[key],location[key]))throw invalid();
  const {root,directory,...fields}=session;
  const value={...fields,schemaVersion:2,projectDirectory:path.basename(root),configurationDirectory:path.basename(directory),projectIdentity:location.projectIdentity,directoryIdentity:location.directoryIdentity,parentIdentity:location.parentIdentity};
  Object.assign(session,value);
  await writeJSON(path.join(directory,'session.json'),value);
  await writeJSON(sessionFile(root),value);
}
export async function removeSessionDirectory(session) {
  const current=await readSession(session.directory,session.root);
  if(current.id!==session.id||current.nonce!==session.nonce||current.pid!==session.pid||alive(current.pid))throw invalid();
  const spawned=await regularJSON(path.join(session.directory,'process.json'),{optional:true});
  if(spawned&&(spawned.id!==session.id||spawned.nonce!==session.nonce||!Number.isSafeInteger(spawned.pid)||spawned.pid<=0||alive(spawned.pid)))throw invalid();
  // The active kernel operation lease excludes another launcher/cleanup. Recheck
  // directory identity immediately before removal; never follow replaced links.
  const location=await siblingLocation(session.root,session.directory);
  if(!sameIdentity(location.directoryIdentity,current.directoryIdentity))throw invalid();
  await fs.rm(session.directory,{recursive:true,force:true,maxRetries:10,retryDelay:150});
}
