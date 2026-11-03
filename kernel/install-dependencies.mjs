// Repair only management dependencies. Application manifests/locks are never written.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureTools } from './tooling/tools.mjs';
import {toolProgress} from './tooling/progress.mjs';
import {readLanguage} from './localization/store.mjs';
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
 const language=await readLanguage(root);
 await ensureTools(root,{onProgress:event=>console.log(toolProgress(event,language))});
}finally{await release();}
