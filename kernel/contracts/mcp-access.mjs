import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {withConfigurationWrite,atomicConfigurationJSON} from './configuration-write.mjs';
import {ensureManagedDirectory} from './local-storage.mjs';

const failure=(code,message,status=409)=>Object.assign(new Error(message),{code,status});
const defaults=()=>({schemaVersion:1,revision:0,enabled:false,externalOnly:false});
const fields=['schemaVersion','revision','enabled','externalOnly'];
const valid=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>fields.includes(key))&&value.schemaVersion===1&&Number.isSafeInteger(value.revision)&&value.revision>=0&&typeof value.enabled==='boolean'&&typeof value.externalOnly==='boolean'&&(!value.externalOnly||value.enabled);
const settingsPath=root=>path.join(root,'config/mcp-access.json');

// This constrains management metadata, never paths supplied to Full Access tools.
async function managedExisting(root,relative) {
  let current=await fs.realpath(root);
  for(const part of relative.split('/')) {
    current=path.join(current,part);
    const stat=await fs.lstat(current).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(!stat)return null;
    if(stat.isSymbolicLink())throw failure('MCP_STORAGE_LOCATION','Inspect symbolic links in MCP configuration or ownership metadata.');
  }
  return current;
}

export async function readMcpAccess(root) {
  const file=await managedExisting(root,'config/mcp-access.json');
  if(!file)return defaults();
  let value;
  try {value=JSON.parse(await fs.readFile(file,'utf8'));}
  catch {throw failure('INVALID_MCP_CONFIG','Preserve and repair config/mcp-access.json; it could not be read.');}
  if(!valid(value))throw failure('INVALID_MCP_CONFIG','Preserve and repair config/mcp-access.json; its schema is invalid.');
  return {...value};
}

export async function saveMcpAccess(root,input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['revision','enabled','externalOnly'].includes(key))||!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.enabled!=='boolean'||typeof input.externalOnly!=='boolean'||input.externalOnly&&!input.enabled)throw failure('INVALID_CONFIG','Use revision, enabled and externalOnly; external-only mode requires MCP access to be enabled.',400);
  const base=await fs.realpath(root);
  return withConfigurationWrite(base,async()=>{
    const current=await readMcpAccess(base);
    if(current.revision!==input.revision)throw failure('CONFIG_CHANGED','MCP configuration changed. Reload before saving.');
    if(current.revision===Number.MAX_SAFE_INTEGER)throw failure('INVALID_MCP_CONFIG','MCP configuration revision cannot advance.');
    await ensureManagedDirectory(base,'config');
    const value={schemaVersion:1,revision:current.revision+1,enabled:input.enabled,externalOnly:input.externalOnly};
    await atomicConfigurationJSON(settingsPath(base),value);
    return value;
  });
}

export async function getMcpAccess(root) {
  const base=await fs.realpath(root),state=await readMcpAccess(base),warnings=[];
  const os=process.platform==='win32'?'windows':'macos';
  let version;
  try {version=JSON.parse(await fs.readFile(path.join(base,`kernel/config/${os}.json`),'utf8')).nodeVersion;}catch{}
  if(!/^\d+\.\d+\.\d+$/.test(version||'')||!['darwin','win32'].includes(process.platform)||!['arm64','x64'].includes(process.arch))version=null;
  const command=version?path.join(base,'.runtime',`node-v${version}-${process.platform==='win32'?'win':'darwin'}-${process.arch}`,...(process.platform==='win32'?['node.exe']:['bin','node'])):null;
  const entry=path.join(base,'kernel/services/mcp-access/server.mjs');
  const exists=async file=>!!file&&await fs.stat(file).then(s=>s.isFile(),()=>false);
  if(!await exists(command))warnings.push({code:'PROJECT_LOCAL_NODE_REQUIRED',message:'Install or repair this project to prepare its local Node runtime.'});
  if(!await exists(entry)||!await exists(path.join(base,'kernel/node_modules/@modelcontextprotocol/sdk/package.json')))warnings.push({code:'MCP_DEPENDENCIES_REQUIRED',message:'Install or repair the kernel to prepare MCP source and dependencies.'});
  return {...state,transport:'stdio',permissionMode:'full-access',configuration:command?{mcpServers:{saplingagent:{command,args:[entry]}}}:null,available:warnings.length===0,warnings};
}

export async function assertMcpClientsStopped(root) {
  const base=await fs.realpath(root),directory=await managedExisting(base,'.runtime/mcp-access/clients');
  if(!directory)return;
  const busy=()=>failure('MCP_CLIENTS_ACTIVE','Close this project’s MCP connection in every external AI client before updating, renaming or replacing its launcher. If a client crashed, inspect .runtime/mcp-access/clients; no external host was stopped.');
  const entries=await fs.readdir(directory,{withFileTypes:true}).catch(()=>{throw busy();});
  for(const entry of entries) {
    if(!entry.isFile()||!/^[a-f0-9-]{36}\.json$/i.test(entry.name))throw busy();
    let value;
    try {value=JSON.parse(await fs.readFile(path.join(directory,entry.name),'utf8'));}catch{throw busy();}
    if(value.schemaVersion!==1||value.id+'.json'!==entry.name||value.root!==base||!Number.isSafeInteger(value.pid)||value.pid<=0)throw busy();
    try {process.kill(value.pid,0);throw busy();}catch(error){if(error.code!=='ESRCH')throw busy();}
  }
}

export async function registerMcpClient(root) {
  const base=await fs.realpath(root);
  // Deferred import permits kernel maintenance to import the read-only guard.
  const {acquireKernelLock}=await import('./kernel.mjs');
  const release=await acquireKernelLock(base,'mcp-connect');
  try {
    for(const relative of ['.runtime/macos-install.lock','.runtime/windows-install.lock','.runtime/node-install.lock','.runtime/windows-node.lock','.runtime/project-finalization.json','.runtime/kernel/active-job.json']) {
      if(await fs.lstat(path.join(base,relative)).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))throw failure('KERNEL_BUSY','Project installation, configuration or kernel maintenance is active. Finish it before connecting MCP.');
    }
    if(!(await readMcpAccess(base)).enabled)throw failure('MCP_DISABLED','Enable External AI / MCP in this project’s configuration page before connecting.');
    const directory=await ensureManagedDirectory(base,'.runtime/mcp-access/clients'),id=randomUUID(),file=path.join(directory,id+'.json');
    const handle=await fs.open(file,'wx',0o600),identity=await handle.stat();
    const receipt={schemaVersion:1,id,root:base,pid:process.pid,createdAt:new Date().toISOString()};
    try {await handle.writeFile(JSON.stringify(receipt)+'\n');await handle.sync();}finally{await handle.close();}
    return async()=>{
      const current=await fs.lstat(file).catch(()=>null);
      if(!current?.isFile()||current.dev!==identity.dev||current.ino!==identity.ino)return;
      const value=await fs.readFile(file,'utf8').then(JSON.parse,()=>null);
      if(value?.id===id&&value.pid===process.pid&&value.root===base)await fs.unlink(file);
    };
  } finally {await release();}
}
