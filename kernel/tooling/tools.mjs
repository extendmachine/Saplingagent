import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {runtimeHome,runtimeMode,readBindings,nodeDirectory} from './bindings.mjs';
import {ensureShared,atomicJSON} from './store.mjs';

const json=file=>fs.readFile(file,'utf8').then(JSON.parse).catch(()=>null);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const settingsFor=root=>json(path.join(root,`kernel/config/${process.platform==='win32'?'windows':'macos'}.json`));
export const hasTooling=root=>existsSync(path.join(root,'kernel/tooling/sdk/package-lock.json'));
export function npmFor(node=process.execPath,platform=process.platform){
  return {command:node,args:[platform==='win32'?path.join(path.dirname(node),'node_modules/npm/bin/npm-cli.js'):path.resolve(path.dirname(node),'../lib/node_modules/npm/bin/npm-cli.js')]};
}
export function toolEnvironment(root,home,inherited=process.env){
  const env={...inherited};
  for(const name of Object.keys(env))if(/API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|SECRET|^CODEX_HOME$|^CLAUDE_CONFIG_DIR$|TOKEN|^NODE_OPTIONS$/i.test(name))delete env[name];
  return {...env,CODEX_HOME:path.join(root,'local-secrets/codex'),CLAUDE_CONFIG_DIR:path.join(root,'local-secrets/claude'),XDG_CONFIG_HOME:path.join(root,'local-secrets/runtime/config'),XDG_DATA_HOME:path.join(root,'data/runtime'),XDG_STATE_HOME:path.join(root,'data/runtime-state'),XDG_CACHE_HOME:path.join(root,'.cache/runtime'),npm_config_cache:path.join(home,'cache/npm'),TMPDIR:path.join(root,'.runtime/tmp'),TMP:path.join(root,'.runtime/tmp'),TEMP:path.join(root,'.runtime/tmp'),NODE_COMPILE_CACHE:path.join(root,'.cache/node-compile')};
}
export function execute(command,args,{cwd,env,timeout=600000,onOutput=()=>{},signal}={}){
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'});
    let output='',interrupted=false,timedOut=false;
    const stop=async()=>{const {terminateOwned}=await import('../contracts/local-process.mjs');await terminateOwned(child,{graceMs:300,killMs:1000});};
    const interrupt=()=>{interrupted=true;void stop().catch(()=>{});};
    const timer=setTimeout(()=>{timedOut=true;void stop().catch(()=>{});},timeout);
    const cleanup=()=>{clearTimeout(timer);process.off('SIGTERM',interrupt);process.off('SIGINT',interrupt);signal?.removeEventListener('abort',interrupt);};
    process.on('SIGTERM',interrupt);process.on('SIGINT',interrupt);signal?.addEventListener('abort',interrupt,{once:true});
    for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output=(output+b).slice(-16000);onOutput(b.toString());});
    child.once('error',()=>{cleanup();reject(Object.assign(new Error('Tool executable could not start. Retry detection.'),{code:'TOOL_UNAVAILABLE'}));});
    child.once('close',code=>{
      cleanup();
      if(timedOut||interrupted)return reject(Object.assign(new Error(timedOut?'Tool operation timed out. Retry installation.':'Tool preparation was interrupted. Retry installation.'),{code:timedOut?'TOOL_TIMEOUT':'TOOL_INTERRUPTED'}));
      code===0?resolve(output):reject(Object.assign(new Error('Tool operation failed. Check the installation log and retry.'),{code:'TOOL_INSTALL_FAILED'}));
    });
  });
}

async function fingerprint(file){try{const real=await fs.realpath(file),s=await fs.stat(real);return s.isFile()?{real,bytes:s.size,modified:s.mtimeMs}:null;}catch{return null;}}
const unchanged=(a,b)=>a&&b&&a.real===b.real&&a.bytes===b.bytes&&a.modified===b.modified;
export async function toolRequirements(root){
  const settings=await settingsFor(root),sdk=await json(path.join(root,'kernel/tooling/sdk/package.json'));
  if(!settings||!sdk)throw new Error('The complete kernel tooling source is missing. Repair this kernel.');
  return {node:settings.nodeVersion,codex:settings.codexVersion,claude:'2.1.'+sdk.dependencies['@anthropic-ai/claude-agent-sdk'].split('.').at(-1),
    claudePackage:sdk.dependencies['@anthropic-ai/claude-agent-sdk'],opencode:JSON.parse(await fs.readFile(path.join(root,'kernel/tooling/versions.json'))).opencode};
}
export async function sdkSignature(root){return hash(await fs.readFile(path.join(root,'kernel/tooling/sdk/package-lock.json')));}
export async function toolSetStatus(root){
  const wanted=await toolRequirements(root),receipt=readBindings(root),signature=hash(JSON.stringify(wanted)+await sdkSignature(root)+process.platform+process.arch);
  let ready=receipt?.signature===signature;
  for(const name of ['node','codex','claude','opencode']){
    const item=receipt?.tools?.[name];ready=ready&&item?.version===wanted[name]&&unchanged(item.fingerprint,await fingerprint(item.path));
  }
  ready=ready&&await validSdk(root,receipt?.sdk?.path);
  return {name:'tools',signature,ready:!!ready,present:!!ready};
}
async function validSdk(root,directory){
  if(!directory)return false;
  const spec=await json(path.join(root,'kernel/tooling/sdk/package.json'));
  for(const [name,version]of Object.entries(spec?.dependencies||{})){
    const pkg=await json(path.join(directory,name,'package.json'));
    if(pkg?.version!==version)return false;
    const entry=pkg.main||pkg.exports?.['.']?.import||pkg.exports?.['.']?.default||pkg.exports?.['.'];
    if(typeof entry!=='string'||!existsSync(path.join(directory,name,entry)))return false;
  }
  return true;
}
export function systemCandidates(name,{env=process.env,platform=process.platform,home=os.homedir()}={}){
  const result=[];
  for(const dir of (env.PATH||'').split(platform==='win32'?';':':').filter(Boolean)){
    result.push(path.join(dir,name+(platform==='win32'?'.exe':'')));
    if(name==='codex'&&platform==='win32'){
      const triple=process.arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
      for(const modules of [path.join(dir,'node_modules'),path.join(dir,'node_modules/@openai/codex/node_modules')])result.push(path.join(modules,'@openai/codex-win32-'+process.arch,'vendor',triple,'bin/codex.exe'));
    }
  }
  result.push(path.join(home,'.local/bin',name+(platform==='win32'?'.exe':'')));
  if(name==='opencode')result.push(path.join(home,'.opencode/bin',name+(platform==='win32'?'.exe':'')));
  if(platform==='darwin'){result.push('/opt/homebrew/bin/'+name,'/usr/local/bin/'+name);if(name==='codex')result.push('/Applications/Codex.app/Contents/Resources/codex');}
  return [...new Set(result)];
}
async function compatible(file,name,version,run,env,root){
  try{
    if(!await fingerprint(file))return false;
    const output=await run(file,['--version'],{cwd:root,env,timeout:5000});
    if(!new RegExp('(?:^|\\s)'+version.replaceAll('.','\\.')+'(?:\\s|$|\\))').test(output.trim()))return false;
    if(name==='codex')await run(file,['app-server','--help'],{cwd:root,env,timeout:5000});
    return true;
  }catch(error){if(error.code==='TOOL_INTERRUPTED'||error.name==='AbortError')throw error;return false;}
}
function installedBinary(directory,name,versions,platform=process.platform,arch=process.arch){
  const modules=path.join(directory,'node_modules');
  if(name==='codex')return platform==='win32'?path.join(modules,`@openai/codex-win32-${arch}/vendor/${arch==='arm64'?'aarch64':'x86_64'}-pc-windows-msvc/bin/codex.exe`):path.join(modules,'.bin/codex');
  if(name==='claude')return path.join(modules,`@anthropic-ai/claude-agent-sdk-${platform}-${arch}`,platform==='win32'?'claude.exe':'claude');
  return path.join(modules,'opencode-ai/bin',platform==='win32'?'opencode.exe':'opencode');
}
export async function bindAlias(root,name,target,{directory=false}={}){
  const link=path.join(root,'.runtime/tools',name),parent=directory?target:path.dirname(target);
  await fs.mkdir(path.dirname(link),{recursive:true});
  try{
    const old=await fs.lstat(link).catch(()=>null);
    if(old){if(!old.isSymbolicLink())return {status:'path-only'};await fs.unlink(link);}
    await fs.symlink(process.platform!=='win32'&&parent.startsWith(root+path.sep)?path.relative(path.dirname(link),parent):parent,link,process.platform==='win32'?'junction':'dir');
    return {status:'linked',path:directory?link:path.join(link,path.basename(target))};
  }catch(error){if(['EPERM','EACCES','ENOSYS','EINVAL'].includes(error.code))return {status:'path-only'};throw error;}
}
async function prepareTools(root,{onProgress=()=>{},run=execute,candidates=systemCandidates,home:overrideHome,signal}={}){
  signal?.throwIfAborted();const originalRun=run;run=(exe,args,options)=>originalRun(exe,args,{...options,signal});
  root=await fs.realpath(root);const wanted=await toolRequirements(root),home=overrideHome||runtimeHome(root);
  const mode=runtimeMode(root);
  const env=toolEnvironment(root,home);await fs.mkdir(env.TMPDIR,{recursive:true});
  const saved=readBindings(root),tools=saved?.tools?.go?{go:saved.tools.go}:{};
  // The Node bootstrap establishes the canonical alias before this module runs.
  const settings=await settingsFor(root),localNode=path.join(nodeDirectory(root,settings),...(process.platform==='win32'?['node.exe']:['bin/node']));
  const node=existsSync(localNode)?await fs.realpath(localNode):process.execPath;
  if(process.versions.node!==wanted.node)throw Object.assign(new Error('Run Saplingagent.sh to select the supported Node runtime.'),{code:'TOOL_NODE_REQUIRED'});
  if(mode==='portable'&&!node.startsWith(root+path.sep))throw Object.assign(new Error('Run Saplingagent.sh with portable mode to prepare a local Node runtime.'),{code:'TOOL_NODE_REQUIRED'});
  const npm=npmFor(node);env.PATH=path.dirname(node)+path.delimiter+(env.PATH||'');
  tools.node={path:node,version:wanted.node,source:node.includes(home+path.sep)?'shared':'local',fingerprint:await fingerprint(node)};
  for(const name of ['codex','claude','opencode']){
    onProgress({event:'checking',name});let file,source;
    for(const candidate of [...(saved?.tools?.[name]?.path?[saved.tools[name].path]:[]),...(mode==='portable'?[]:candidates(name)),
      ...(name==='codex'?[path.join(root,'.runtime/codex/node_modules/.bin/codex')]:[])]){
      if(mode==='portable'&&!((await fingerprint(candidate))?.real||'').startsWith(root+path.sep))continue;
      if(await compatible(candidate,name,wanted[name],run,env,root)){file=await fs.realpath(candidate);source=candidate.includes(home+path.sep)?'shared':'local';break;}
    }
    if(!file){
      const key=`${name}-${wanted[name]}-${process.platform}-${process.arch}`;
      const validate=async dir=>compatible(installedBinary(dir,name,wanted),name,wanted[name],run,env,root);
      const directory=await ensureShared(home,key,{validate,signal,onWait:()=>onProgress({event:'waiting',name}),create:async dir=>{
        onProgress({event:'installing',name});
        const dependency=name==='codex'?{'@openai/codex':wanted.codex}:name==='claude'?{[`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`]:wanted.claudePackage}:{'opencode-ai':wanted.opencode};
        await atomicJSON(path.join(dir,'package.json'),{private:true,dependencies:dependency});
        await run(npm.command,[...npm.args,'install','--include=optional',...(name==='opencode'?[]:['--ignore-scripts']),'--no-audit','--no-fund'],{cwd:dir,env,onOutput:()=>{}});
      }});file=await fs.realpath(installedBinary(directory,name,wanted));source='shared';
    }
    const alias=await bindAlias(root,name,file);tools[name]={path:file,version:wanted[name],source,alias,fingerprint:await fingerprint(file)};
    onProgress({event:'ready',name,source});
  }
  const signature=await sdkSignature(root);
  const directory=await ensureShared(home,`sdk-${signature.slice(0,24)}-${process.platform}-${process.arch}`,{
    signal,validate:dir=>validSdk(root,path.join(dir,'node_modules')),
    create:async dir=>{
      onProgress({event:'installing',name:'SDK'});
      for(const name of ['package.json','package-lock.json'])await fs.copyFile(path.join(root,'kernel/tooling/sdk',name),path.join(dir,name));
      // Omit native CLI optional packages only in this SDK group, never in Vite's group.
      await run(npm.command,[...npm.args,'ci','--omit=optional','--ignore-scripts','--no-audit','--no-fund'],{cwd:dir,env});
    },onWait:()=>onProgress({event:'waiting',name:'SDK'})});
  const sdk=path.join(directory,'node_modules');await bindAlias(root,'sdk',sdk,{directory:true});
  const statusSignature=hash(JSON.stringify(wanted)+signature+process.platform+process.arch);
  await atomicJSON(path.join(root,'.runtime/tool-bindings.json'),{schemaVersion:1,root,mode,home,homeKind:(overrideHome||process.env.SAPLING_RUNTIME_HOME)?'custom':(saved?.homeKind||'default'),signature:statusSignature,tools,sdk:{path:sdk,signature}});
  return toolSetStatus(root);
}

// Serialize the aliases/receipt of one project as well as the cross-project pool.
export async function ensureTools(root,options={}){
  root=await fs.realpath(root);
  const lock=path.join(root,'.runtime/tool-setup.lock'),id=randomUUID();await fs.mkdir(path.dirname(lock),{recursive:true});
  const deadline=Date.now()+600000;
  for(;;){
    options.signal?.throwIfAborted();
    try{await fs.mkdir(lock);break;}catch(error){if(error.code!=='EEXIST')throw error;}
    const owner=await json(path.join(lock,'owner.json'));
    if(owner?.pid){let dead=false;try{process.kill(owner.pid,0);}catch(error){dead=error.code==='ESRCH';}if(dead)throw Object.assign(new Error('An interrupted project tool setup must be inspected before retrying.'),{code:'SHARED_RUNTIME_INTERRUPTED'});}
    if(Date.now()>=deadline)throw Object.assign(new Error('Another tool setup is active. Wait and retry.'),{code:'SHARED_RUNTIME_BUSY'});
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const identity=await fs.stat(lock);
  try{await atomicJSON(path.join(lock,'owner.json'),{id,pid:process.pid});}catch(error){const current=await fs.stat(lock).catch(()=>null);if(current?.ino===identity.ino&&current?.dev===identity.dev)await fs.rm(lock,{recursive:true,force:true});throw error;}
  try{return await prepareTools(root,options);}finally{if((await json(path.join(lock,'owner.json')))?.id===id)await fs.rm(lock,{recursive:true,force:true});}
}
