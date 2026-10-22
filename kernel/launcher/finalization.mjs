import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {json, writeJSON, issue, exists} from './io.mjs';
import {nodeForRoot} from './build.mjs';
import {relocationLedger} from './relocation.mjs';
import {assertKernelOffline} from '../contracts/kernel.mjs';
import {assertMcpClientsStopped} from '../contracts/mcp-access.mjs';

const source = path.dirname(fileURLToPath(import.meta.url));
const isInside = (root, file) => { const relative = path.relative(root, file); return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Compatibility export: callers must supply a project. There is no OS-temp fallback.
export function systemTemporaryParent(root) {
  if(typeof root!=='string'||!path.isAbsolute(root))throw issue('PROJECT_HELPER_LOCATION','A project folder is required for sibling setup storage.');
  return path.dirname(root);
}
export function helperEnvironment(platform=process.platform, inherited=process.env, directory) {
  const env={};
  for(const key of ['SystemRoot','SYSTEMROOT','ComSpec','COMSPEC','WINDIR','USERPROFILE','HOME','LANG','LC_ALL',
    'LOCALAPPDATA','APPDATA','ProgramFiles','ProgramFiles(x86)','ProgramW6432','PATHEXT'])
    if(inherited[key])env[key]=inherited[key];
  const system=platform==='win32' ? path.win32.join(inherited.SystemRoot || inherited.SYSTEMROOT || 'C:\\Windows','System32') : null;
  const base=platform==='win32' ? [system,path.win32.join(system,'WindowsPowerShell','v1.0')] : ['/usr/bin','/bin','/usr/sbin','/sbin'];
  // PATH is location metadata, not an authentication payload. Preserve user tools;
  // resume rebases project-internal entries before running application commands.
  if(inherited.PATH)base.push(inherited.PATH);
  env.PATH=base.join(platform==='win32'?';':':');
  if(directory){
    const join=platform==='win32'?path.win32.join:path.join;
    for(const key of ['TMPDIR','TMP','TEMP'])env[key]=join(directory,'tmp');
    for(const [key,name]of [['XDG_CACHE_HOME','cache'],['XDG_CONFIG_HOME','config'],['XDG_DATA_HOME','data'],['XDG_STATE_HOME','state']])env[key]=join(directory,name);
    env.npm_config_cache=join(directory,'cache','npm');
  }
  return env;
}
// This helper receives paths and lifecycle IDs only. Credentials never leave the project.
export async function beginFinalization(root, {project, management, language, fingerprint, connectionsFingerprint,
  tempParent, platform = process.platform, node = nodeForRoot(root), spawnHelper = spawn} = {}) {
  root = await fs.realpath(root);
  if (!management || management.pid !== process.pid || !Number.isInteger(management.port) || management.port < 1024 || management.port > 65535 || typeof management.instanceId !== 'string')
    throw issue('PROJECT_HANDOFF_UNAVAILABLE', 'Use the project management launcher to save and restart setup.');
  if (!['darwin','win32'].includes(platform)) throw issue('UNSUPPORTED_DEVICE', 'Offline setup restart currently supports macOS and Windows.');
  const announced = await json(path.join(root, '.runtime/management-address.json'));
  if (announced?.pid !== management.pid || announced.instanceId !== management.instanceId || announced.port !== management.port || announced.root !== root)
    throw issue('PROJECT_HANDOFF_UNAVAILABLE', 'Management ownership changed. Reload setup before restarting.');
  if (!isInside(root, node)) throw issue('PROJECT_LOCAL_NODE_REQUIRED', 'Run this project with its installed local Node runtime before saving and restarting.');
  if (await exists(path.join(root, '.runtime/kernel/active-job.json'))) throw issue('PROJECT_BUSY', 'Finish kernel maintenance before restarting setup.');
  for (const file of ['launcher-compile.lock','macos-install.lock','windows-install.lock','node-install.lock','windows-node.lock'])
    if (await exists(path.join(root,'.runtime',file))) throw issue('PROJECT_BUSY','Finish dependency installation before restarting setup.');
  await relocationLedger(root); // Validate before any shutdown or physical move.
  await assertMcpClientsStopped(root);
  const {closeDockForMaintenance}=await import('./dock.mjs');
  await closeDockForMaintenance(root);
  const id = randomUUID(), lease = path.join(root,'.runtime/project-finalization.json');
  const targetRoot = path.join(path.dirname(root), project.folderName);
  if (targetRoot !== root && await exists(targetRoot)) throw issue('PROJECT_FOLDER_EXISTS', 'The requested folder already exists. Choose another name.');
  const previous = await fs.open(lease,'wx',0o600).catch(error => { if(error.code==='EEXIST') throw issue('PROJECT_BUSY','A setup restart is already recorded. Inspect its status before retrying.'); throw error; });
  const leaseIdentity=await previous.stat();
  let temp, child;
  const job = {schemaVersion:1,id,phase:'restarting',previousRoot:root,targetRoot,root,projectId:project.projectId,
    management, nodeRelative:path.relative(root,node),language:language==='zh'?'zh':'en',noOpen:process.env.SAPLING_NO_OPEN==='1',fingerprint,connectionsFingerprint,
    createdAt:new Date().toISOString(),message:'Settings saved. Waiting for owned processes to exit before the folder move.'};
  try {
    const operationFile=path.join(root,'.runtime/kernel-operation.lock');
    const operation=await fs.open(operationFile,'wx',0o600).catch(error=>{if(error.code==='EEXIST')throw issue('PROJECT_BUSY','A start or kernel operation is still active. Wait before restarting setup.');throw error;});
    try {await operation.writeFile(JSON.stringify({id,pid:process.pid,purpose:'setup-finalization',createdAt:job.createdAt})+'\n');} finally {await operation.close();}
    await assertMcpClientsStopped(root);
    await previous.writeFile(JSON.stringify(job)+'\n'); await previous.close();
    await closeDockForMaintenance(root);
    await assertKernelOffline(root);
    await writeJSON(path.join(root,'.runtime/setup-finalization.json'),job);
    const tempBase=await fs.realpath(path.dirname(root));
    if(tempParent && await fs.realpath(tempParent)!==tempBase)throw issue('PROJECT_HELPER_LOCATION','Setup helpers must be direct siblings of this project.');
    temp = await fs.mkdtemp(path.join(tempBase,'sapling-setup-')); await fs.chmod(temp,0o700);
    const owned=await fs.lstat(temp);
    job.helper={name:path.basename(temp),device:String(owned.dev),inode:String(owned.ino)};
    for(const name of ['tmp','cache','config','data','state'])await fs.mkdir(path.join(temp,name),{mode:0o700});
    await writeJSON(lease,job);await writeJSON(path.join(root,'.runtime/setup-finalization.json'),job);
    // All launch fields are private job metadata, never executable string interpolation.
    await writeJSON(path.join(temp,'job.json'),job);
    for (const file of platform==='win32'?['offline-helper.ps1']:['offline-helper.sh','offline-move.js'])
      await fs.copyFile(path.join(source,file),path.join(temp,file));
    const env = helperEnvironment(platform,process.env,temp);
    env.SAPLING_SETUP_JOB=id;
    const executable=platform==='win32'?path.win32.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'):'/bin/sh';
    const args=platform==='win32'?['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(temp,'offline-helper.ps1'),'-JobDirectory',temp]:[path.join(temp,'offline-helper.sh'),temp];
    child=spawnHelper(executable,args,{cwd:temp,env,stdio:'ignore',windowsHide:true,detached:true});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(issue('PROJECT_HELPER_START_FAILED','The system helper could not start. Settings are saved; retry after inspecting the local status.')));});
    child.unref();
    // Acknowledgement proves the external script is executing, before management exits.
    for(let i=0;i<350;i++) {if(await exists(path.join(temp,'waiting')))break;if(child.exitCode!==null)throw issue('PROJECT_HELPER_START_FAILED','The system helper exited before accepting the restart.');await pause(30);}
    if(!await exists(path.join(temp,'waiting'))) throw issue('PROJECT_HELPER_START_FAILED','The system helper did not acknowledge the restart.');
    return {id,phase:'restarting',previousRoot:root,targetRoot,readyUrl:`http://127.0.0.1:${management.port}/`,message:'Settings saved. Wait for the restart, then export the app.'};
  } catch(error) {
    await previous.close().catch(()=>{});
    // A helper that has acknowledged may already be waiting. Cancel only through its own flag.
    if(temp) {await fs.writeFile(path.join(temp,'cancel'),'1').catch(()=>{});if(!child?.pid)await fs.rm(temp,{recursive:true,force:true});}
    const current=await json(lease).catch(()=>null),now=await fs.lstat(lease).catch(()=>null);
    if(current?.id===id||(now?.isFile()&&now.ino===leaseIdentity.ino&&now.dev===leaseIdentity.dev))await fs.rm(lease,{force:true});
    const operation=path.join(root,'.runtime/kernel-operation.lock');if((await json(operation).catch(()=>null))?.id===id)await fs.rm(operation,{force:true});
    await writeJSON(path.join(root,'.runtime/setup-finalization.json'),{...job,phase:'failed',error:{code:error.code||'PROJECT_HANDOFF_FAILED',message:'The setup handoff failed. Settings are retained; inspect the local status and retry.'}}).catch(()=>{});
    throw error;
  }
}

export async function releaseFinalization(root,id) {
  const lease=path.join(root,'.runtime/project-finalization.json');
  if((await json(lease))?.id!==id) throw issue('PROJECT_HANDOFF_CHANGED','Setup restart ownership changed. Preserve the local receipt and inspect it.');
  await fs.rm(lease);
  const operation=path.join(root,'.runtime/kernel-operation.lock');
  if((await json(operation))?.id===id)await fs.rm(operation,{force:true});
}
