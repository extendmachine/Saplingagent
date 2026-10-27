import { launcherMessages } from '../localization/launcher-messages.mjs';
import { formatMessage } from '../localization/public.mjs';
import { readLanguage } from '../localization/store.mjs';
// Shared headless dependency preparation for a complete, customer-owned folder.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {command,nodeForRoot,buildEnv} from './build.mjs';
import {json,writeJSON,exists,issue,dailyLog} from './io.mjs';
import {codexBinary,openCodeBinary,claudeBinary,npmCommand} from '../contracts/local-process.mjs';
import {assertSetupAvailable} from '../contracts/kernel.mjs';
import {assertMcpClientsStopped} from '../contracts/mcp-access.mjs';

const alive=pid=>{if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}};
const digest=(...values)=>{const h=createHash('sha256');for(const value of values)h.update(value);return h.digest('hex');};
const platformName=()=>process.platform==='win32'?'windows':'macos';
const requiredEntries={kernel:['node_modules/vite/bin/vite.js'],front:['node_modules/vite/bin/vite.js','node_modules/typescript/bin/tsc']};

const regularFile=file=>fs.stat(file).then(value=>value.isFile(),()=>false);
async function packageMainPresent(directory,main){
  // Node's legacy package-main resolution: file, extension, main/index, then
  // package/index fallback. Read filesystem state directly so a repair cannot
  // leave a stale require.resolve/package-json cache, and never execute code.
  const candidate=path.resolve(directory,main);
  const files=[candidate,...['.js','.json','.node'].map(ext=>candidate+ext),
    ...['.js','.json','.node'].map(ext=>path.join(candidate,'index'+ext)),
    ...['.js','.json','.node'].map(ext=>path.join(directory,'index'+ext))];
  for(const file of files)if(await regularFile(file))return true;
  return false;
}

async function packages(root){
  const directories=['kernel','front'];
  const backend=await fs.readdir(path.join(root,'backend'),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  for(const entry of backend)if(entry.isDirectory())directories.push('backend/'+entry.name);
  const groups=[];
  for(const relative of directories){
    const directory=path.join(root,relative),manifestFile=path.join(directory,'package.json');
    if(!await exists(manifestFile))continue;
    const manifestBytes=await fs.readFile(manifestFile),manifest=JSON.parse(manifestBytes);
    const names=[...new Set([...Object.keys(manifest.dependencies||{}),...Object.keys(manifest.devDependencies||{})])];
    const lockBytes=await fs.readFile(path.join(directory,'package-lock.json')).catch(e=>{if(e.code==='ENOENT'&&!names.length)return Buffer.from('{"packages":{"":{}}}');if(e.code==='ENOENT')throw issue('DEPENDENCY_LOCK_MISSING',`Missing ${relative}/package-lock.json. Save a lockfile for this service before starting.`,400);throw e;});
    const lock=JSON.parse(lockBytes);
    if(!lock.packages?.[''])throw issue('DEPENDENCY_LOCK_INVALID',`Unsupported dependency lockfile in ${relative}. Regenerate it with the project's npm.`,400);
    let present=['dependencies','devDependencies'].every(kind=>{
      const declared=manifest[kind]||{},locked=lock.packages[''][kind]||{};
      return Object.keys(declared).length===Object.keys(locked).length&&Object.entries(declared).every(([name,value])=>locked[name]===value);
    });
    for(const name of names){
      const entry=lock.packages['node_modules/'+name];
      const expected=entry?.link?lock.packages[entry.resolved]:entry;
      const installed=await json(path.join(directory,'node_modules',name,'package.json')).catch(()=>null);
      if(!expected||!installed||expected.version!==installed.version){present=false;break;}
      const packageDirectory=path.join(directory,'node_modules',name);
      const localEntry=x=>typeof x==='string'&&x&&!path.isAbsolute(x)&&!x.split(/[\\/]/).includes('..');
      if(localEntry(installed.main)&&!await packageMainPresent(packageDirectory,installed.main)){present=false;break;}
      // A bin is an exact executable path; it does not use package-main extension lookup.
      const bins=(typeof installed.bin==='string'?[installed.bin]:Object.values(installed.bin||{})).filter(localEntry);
      if((await Promise.all(bins.map(file=>regularFile(path.join(packageDirectory,file))))).some(ok=>!ok)){present=false;break;}
    }
    for(const file of requiredEntries[relative]||[])if(!await exists(path.join(directory,file)))present=false;
    if(relative==='kernel'&&(!await exists(openCodeBinary(root))||!await exists(claudeBinary(root))))present=false;
    groups.push({name:relative,signature:digest(manifestBytes,lockBytes,process.platform,process.arch),present,empty:names.length===0,lockBytes});
  }
  return groups;
}

export async function applicationDependencyStatus(root){
  root=path.resolve(root);
  const settings=await json(path.join(root,`kernel/config/${platformName()}.json`));
  if(!settings?.codexVersion)throw issue('DEPENDENCY_CONFIG_MISSING','The complete kernel device configuration is required.',400);
  const groups=await packages(root),receipt=await json(path.join(root,'.runtime/dependencies.json'));
  const coreLegacy=await json(path.join(root,'.runtime/core-install.json'));
  const appLegacy=await json(path.join(root,`.runtime/${platformName()}-install.json`));
  const historicalApps=['front','backend/app-builder','backend/mcp-runtime','backend/agent-runtime'];
  const appLegacySignature=digest(JSON.stringify(settings),...historicalApps.map(name=>groups.find(g=>g.name===name)?.lockBytes||''));
  for(const group of groups){
    const legacy=group.name==='kernel'?coreLegacy?.signature===digest(group.lockBytes,JSON.stringify(settings),process.platform+process.arch):historicalApps.includes(group.name)&&appLegacy?.arch===process.arch&&appLegacy.signature===appLegacySignature;
    group.ready=group.present&&(group.empty||receipt?.groups?.[group.name]===group.signature||legacy);
    delete group.lockBytes;
  }
  const codexPackage=await json(path.join(root,'.runtime/codex/node_modules/@openai/codex/package.json')).catch(()=>null);
  const codex={name:'codex',signature:digest(settings.codexVersion,process.platform,process.arch),ready:codexPackage?.version===settings.codexVersion&&await exists(codexBinary(root))};
  groups.unshift(codex);
  return {ready:groups.every(g=>g.ready),signature:digest(...groups.map(g=>g.name+g.signature)),groups,settings};
}

async function repairGroup(root,group,settings,onProgress){
  const localNode=nodeForRoot(root),npm=npmCommand(localNode),env=buildEnv(root);
  // Keep installer output available to the caller; never inherit account keys into npm lifecycle scripts.
  const run=(exe,args,options={})=>command(root,exe,args,{env,onOutput:onProgress,...options});
  if(group.name!=='codex'){
    await run(npm.command,[...npm.args,'ci','--include=dev','--include=optional',...(['kernel','backend/agent-runtime'].includes(group.name)?[]:['--ignore-scripts']),'--no-audit','--no-fund'],{cwd:path.join(root,group.name)});
    return;
  }
  const stage=path.join(root,'.runtime','codex-install-'+randomUUID()),previous=path.join(root,'.runtime','codex-previous-'+randomUUID()),destination=path.join(root,'.runtime/codex');
  try{
    await fs.mkdir(stage,{recursive:true});
    await writeJSON(path.join(stage,'package.json'),{name:'saplingagent-local-codex',private:true,dependencies:{'@openai/codex':settings.codexVersion}});
    await run(npm.command,[...npm.args,'install','--include=optional','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage});
    const staged=codexBinary(root,process.platform,process.arch,path.relative(root,stage));
    if((await run(staged,['--version'])).trim()!==`codex-cli ${settings.codexVersion}`)throw issue('DEPENDENCY_TOOL_INVALID','The downloaded Codex runtime does not match the configured version.');
    const hadPrevious=await exists(destination);if(hadPrevious)await fs.rename(destination,previous);
    try{await fs.rename(stage,destination);}catch(e){if(hadPrevious)await fs.rename(previous,destination);throw e;}
    if(hadPrevious)await fs.rm(previous,{recursive:true,force:true});
  }finally{await fs.rm(stage,{recursive:true,force:true});}
}

export async function ensureApplicationDependencies(root,{onProgress=()=>{},install=repairGroup,waitMs=120000,signal}={}){
  signal?.throwIfAborted();root=path.resolve(root);await assertSetupAvailable(root);
  const initial=await applicationDependencyStatus(root);
  if(initial.ready)return {changed:false,signature:initial.signature};
  await fs.mkdir(path.join(root,'.runtime'),{recursive:true});
  const lock=path.join(root,`.runtime/${platformName()}-install.lock`),id=randomUUID(),deadline=Date.now()+waitMs;
  while(true){
    signal?.throwIfAborted();
    try{await fs.mkdir(lock);break;}catch(e){if(e.code!=='EEXIST')throw e;}
    const owner=await json(path.join(lock,'owner.json'));
    if(owner?.pid&&!alive(owner.pid))throw issue('DEPENDENCY_INSTALL_INTERRUPTED','A previous dependency installer stopped. Inspect its local install lock before retrying.');
    if(Date.now()>=deadline)throw issue('DEPENDENCY_INSTALL_BUSY','Another dependency installer is running. Wait for it to finish, then open the app again.');
    await delay(100);
  }
  await writeJSON(path.join(lock,'owner.json'),{id,pid:process.pid,root});
  try{
    await assertSetupAvailable(root);
    const state=await applicationDependencyStatus(root);
    if(state.ready)return {changed:false,signature:state.signature};
    await assertMcpClientsStopped(root);
    if(await exists(path.join(root,'.runtime/kernel-operation.lock'))||await exists(path.join(root,'.runtime/kernel/active-job.json')))throw issue('DEPENDENCY_MAINTENANCE_BUSY','Finish kernel maintenance before installing dependencies.');
    const runtime=await json(path.join(root,'.runtime/runtime-address.json'));
    if((!runtime?.root||path.resolve(runtime.root)===root)&&alive(runtime?.pid))throw issue('DEPENDENCY_APP_RUNNING','Dependencies changed or are missing. Stop this project, then open the app again to install them.');
    const receipt=await json(path.join(root,'.runtime/dependencies.json'))||{schemaVersion:1,groups:{}};
    receipt.groups||={};let changed=false;
    for(const group of state.groups){
      signal?.throwIfAborted();
      if(!group.ready){
        onProgress(formatMessage(launcherMessages,await readLanguage(root,process.env.SAPLING_LANG),"Preparing dependencies: {name}…",{name:group.name}));
        await dailyLog(root,'dependency-install',{group:group.name});
        await install(root,group,state.settings,onProgress);
        signal?.throwIfAborted();
        const checked=await applicationDependencyStatus(root),actual=checked.groups.find(g=>g.name===group.name);
        if(actual?.signature!==group.signature)throw issue('DEPENDENCY_SOURCE_CHANGED','Dependency declarations changed during installation. Save your edits, then open the app again.');
        if(group.name==='codex'?!actual.ready:!actual.present)throw issue('DEPENDENCY_INSTALL_INCOMPLETE',`Installed files for ${group.name} are incomplete. Check the local launcher log and retry.`);
        changed=true;
      }
      receipt.groups[group.name]=group.signature;
      receipt.updatedAt=new Date().toISOString();await writeJSON(path.join(root,'.runtime/dependencies.json'),receipt);
    }
    const final=await applicationDependencyStatus(root);
    if(!final.ready||final.signature!==state.signature)throw issue('DEPENDENCY_SOURCE_CHANGED','Dependency declarations changed during preparation. Retry after saving your edits.');
    return {changed,signature:final.signature};
  }finally{
    const owner=await json(path.join(lock,'owner.json')).catch(()=>null);
    if(owner?.id===id)await fs.rm(lock,{recursive:true,force:true});
  }
}
