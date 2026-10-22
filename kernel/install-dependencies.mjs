// Repair only management dependencies. Application manifests/locks are never written.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { prepareManagedEnvironment } from './contracts/local-storage.mjs';
import { npmCommand, codexBinary } from './contracts/local-process.mjs';
import { acquireKernelLock, assertKernelOffline } from './contracts/kernel.mjs';
import { assertMcpClientsStopped } from './contracts/mcp-access.mjs';
const root=path.resolve(process.argv[2]||fileURLToPath(new URL('../',import.meta.url)));
const childEnv=await prepareManagedEnvironment(root);
const release=await acquireKernelLock(root,'kernel-dependencies');
const npmCLI=process.platform==='win32'?path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'):path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
const npm={command:process.execPath,args:[npmCLI]};
function run(command,args,cwd){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,env:childEnv,stdio:'inherit',windowsHide:true});child.once('error',()=>reject(new Error('Kernel dependency command could not start.')));child.once('exit',code=>code===0?resolve():reject(new Error('Kernel dependency command failed; inspect local maintenance log.')));});}
try {
 await fs.access(npmCLI);
 await assertKernelOffline(root);
 await assertMcpClientsStopped(root);
 await run(npm.command,[...npm.args,'ci','--include=optional','--no-audit','--no-fund'],path.join(root,'kernel'));
 const config=JSON.parse(await fs.readFile(path.join(root,`kernel/config/${process.platform==='win32'?'windows':'macos'}.json`),'utf8'));
 const stage=`.runtime/codex-maintenance-${randomUUID()}`;const directory=path.join(root,stage);
 try {
  await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'package.json'),JSON.stringify({private:true,dependencies:{'@openai/codex':config.codexVersion}}));
  await run(npm.command,[...npm.args,'install','--include=optional','--ignore-scripts','--no-audit','--no-fund'],directory);
  await run(codexBinary(root,process.platform,process.arch,stage),['--version'],root);
  const destination=path.join(root,'.runtime/codex'),previous=path.join(root,`.runtime/codex-before-${randomUUID()}`);
  let moved=false;try{await fs.rename(destination,previous);moved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await fs.rename(directory,destination);}catch(error){if(moved)await fs.rename(previous,destination);throw error;}
  if(moved)await fs.rm(previous,{recursive:true,force:true});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
}finally{await release();}
