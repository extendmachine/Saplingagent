import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {json,writeJSON,issue} from '../launcher/io.mjs';
export const sessionFile=root=>path.join(root,'.runtime/configuration-session.json');
export const alive=pid=>{if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
export async function waitForExit(pids,{timeout=30000}={}) {
  const deadline=Date.now()+timeout;
  while(pids.some(alive)){if(Date.now()>deadline)throw issue('CONFIGURATION_PROCESS_PENDING','An owned process has not exited. Close the original installer/launcher and retry.');await delay(50);}
}
export async function readSession(directory,root) {
  const stat=await fs.lstat(directory).catch(()=>null);
  if(!stat?.isDirectory()||stat.isSymbolicLink()||!/^sapling-config-[A-Za-z0-9]+$/.test(path.basename(directory)))throw issue('CONFIGURATION_OWNERSHIP','Configuration directory ownership is invalid.');
  const relative=path.relative(root,directory),reverse=path.relative(directory,root);
  const inside=value=>value===''||value!=='..'&&!value.startsWith('..'+path.sep)&&!path.isAbsolute(value);
  if(inside(relative)||inside(reverse))throw issue('CONFIGURATION_OWNERSHIP','The temporary configuration directory must be separate from the project.');
  const real=await fs.realpath(directory);
  if(real!==path.resolve(directory))throw issue('CONFIGURATION_OWNERSHIP','Configuration directory has moved.');
  const external=await json(path.join(directory,'session.json'));
  const local=await json(sessionFile(root));
  if(!external||external.schemaVersion!==1||!local||external.id!==local.id||external.nonce!==local.nonce||external.directory!==real||local.directory!==real||external.root!==root||local.root!==root||external.pid!==local.pid||!Number.isSafeInteger(local.pid)||local.pid<=0||!/^[a-f0-9]{64}$/.test(local.nonce)||!/^[a-f0-9-]{36}$/.test(local.id))throw issue('CONFIGURATION_OWNERSHIP','Configuration handoff no longer matches this project.');
  const project=await json(path.join(root,'config/project.json'));
  if(external.projectId!==null&&external.projectId!==project?.projectId)throw issue('CONFIGURATION_OWNERSHIP','Configuration project identity changed.');
  return external;
}
export async function saveSession(session) {
  await writeJSON(path.join(session.directory,'session.json'),session);
  await writeJSON(sessionFile(session.root),session);
}
