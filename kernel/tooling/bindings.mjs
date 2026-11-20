import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function readBindings(root) {
  try {
    const value=JSON.parse(fs.readFileSync(path.join(root,'.runtime/tool-bindings.json'),'utf8'));
    if(value.schemaVersion!==1)return null;
    const base=value.root,current=path.resolve(root);
    if(base&&path.resolve(base)!==current){
      if(!path.isAbsolute(base))return null;
      const rebase=file=>{
        if(typeof file!=='string'||!path.isAbsolute(file))return file;
        const relative=path.relative(base,file);
        return !relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)?path.join(current,relative):file;
      };
      value.home=rebase(value.home);
      for(const binding of [value.sdk,...Object.values(value.sdks||{})].filter(Boolean)){
        binding.path=rebase(binding.path);
        if(binding.alias?.path)binding.alias.path=rebase(binding.alias.path);
      }
      for(const item of Object.values(value.tools||{})){
        item.path=rebase(item.path);if(item.fingerprint)item.fingerprint.real=rebase(item.fingerprint.real);
        if(item.alias?.path)item.alias.path=rebase(item.alias.path);
      }
      value.root=current;
    }
    return value;
  } catch { return null; }
}

export function runtimeMode(root,env=process.env) {
  let marker;try{marker=fs.readFileSync(path.join(root,'.runtime/runtime-mode'),'utf8').trim();}catch{}
  const mode=env.SAPLING_RUNTIME_MODE||marker||readBindings(root)?.mode||'shared';
  if(!['shared','portable'].includes(mode))throw Object.assign(new Error('Use shared or portable for SAPLING_RUNTIME_MODE.'),{code:'INVALID_RUNTIME_MODE'});
  return mode;
}
export function runtimeHome(root,env=process.env,platform=process.platform) {
  const saved=readBindings(root);
  const mode=runtimeMode(root,env);
  if(mode==='portable')return path.join(path.resolve(root),'.runtime/tool-store');
  if(env.SAPLING_RUNTIME_HOME){if(!path.isAbsolute(env.SAPLING_RUNTIME_HOME))throw Object.assign(new Error('SAPLING_RUNTIME_HOME must be an absolute directory.'),{code:'INVALID_RUNTIME_HOME'});return path.resolve(env.SAPLING_RUNTIME_HOME);}
  const custom=saved?.mode==='shared'&&saved.homeKind!=='default'?saved.home:saved?.sharedHome;
  if(path.isAbsolute(custom||''))return custom;
  return platform==='win32'?path.join(env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'Saplingagent')
    :path.join(os.homedir(),'Library/Application Support/Saplingagent');
}
// Evaluate actual executable/module targets, including symlinks and Windows junctions.
export function containsPath(directory,file) {
  if(!directory||!file)return false;
  const relative=path.relative(directory,file);
  return relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
}
export function realLocation(file) {
  try{return path.isAbsolute(file||'')?fs.realpathSync.native(file):null;}catch{return null;}
}
export function toolLocationAllowed(root,file,mode) {
  const real=realLocation(file),project=realLocation(path.resolve(root));
  if(!real||!project)return false;
  return mode==='portable'?containsPath(project,real):!containsPath(path.join(project,'.runtime/tool-store'),real);
}
function activeBindings(root) {
  const saved=readBindings(root);
  return saved?.mode===runtimeMode(root)&&saved.home===runtimeHome(root)?saved:null;
}
export function boundTool(root,name,fallback) {
  const saved=activeBindings(root),file=saved?.tools?.[name]?.path;
  return file&&toolLocationAllowed(root,file,saved.mode)?file:fallback;
}
export function sdkModules(root,fallback,engine) {
  const saved=activeBindings(root),dir=saved?.sdks?.[engine]?.path||saved?.sdk?.path;
  return dir&&toolLocationAllowed(root,dir,saved.mode)&&containsPath(realLocation(saved.home),realLocation(dir))?dir:fallback;
}
export function nodeDirectory(root,settings,platform=process.platform,arch=process.arch) {
  return path.join(root,'.runtime',`node-v${settings.nodeVersion}-${platform==='win32'?'win':'darwin'}-${arch}`);
}
