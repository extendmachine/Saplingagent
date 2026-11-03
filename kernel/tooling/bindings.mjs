import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function readBindings(root) {
  try { const value=JSON.parse(fs.readFileSync(path.join(root,'.runtime/tool-bindings.json'),'utf8'));return value.schemaVersion===1&&(!value.root||path.resolve(value.root)===path.resolve(root))?value:null; } catch { return null; }
}
export function runtimeMode(root,env=process.env) {
  let marker;try{marker=fs.readFileSync(path.join(root,'.runtime/runtime-mode'),'utf8').trim();}catch{}
  const mode=env.SAPLING_RUNTIME_MODE||readBindings(root)?.mode||marker||'shared';
  if(!['shared','portable'].includes(mode))throw Object.assign(new Error('Use shared or portable for SAPLING_RUNTIME_MODE.'),{code:'INVALID_RUNTIME_MODE'});
  return mode;
}
export function runtimeHome(root,env=process.env,platform=process.platform) {
  const saved=readBindings(root);
  const mode=runtimeMode(root,env);
  if(mode==='portable')return path.join(path.resolve(root),'.runtime/tool-store');
  if(env.SAPLING_RUNTIME_HOME){if(!path.isAbsolute(env.SAPLING_RUNTIME_HOME))throw Object.assign(new Error('SAPLING_RUNTIME_HOME must be an absolute directory.'),{code:'INVALID_RUNTIME_HOME'});return path.resolve(env.SAPLING_RUNTIME_HOME);}
  if(saved?.mode==='shared'&&saved.homeKind!=='default'&&path.isAbsolute(saved.home||''))return saved.home;
  return platform==='win32'?path.join(env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'Saplingagent')
    :path.join(os.homedir(),'Library/Application Support/Saplingagent');
}
export function boundTool(root,name,fallback) {
  const item=readBindings(root)?.tools?.[name];
  return item&&path.isAbsolute(item.path||'')&&fs.existsSync(item.path)?item.path:fallback;
}
export function sdkModules(root,fallback) {
  const directory=readBindings(root)?.sdk?.path;
  return path.isAbsolute(directory||'')&&fs.existsSync(directory)?directory:fallback;
}
export function nodeDirectory(root,settings,platform=process.platform,arch=process.arch) {
  return path.join(root,'.runtime',`node-v${settings.nodeVersion}-${platform==='win32'?'win':'darwin'}-${arch}`);
}
