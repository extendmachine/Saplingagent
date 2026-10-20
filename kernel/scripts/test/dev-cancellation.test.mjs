import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const source=fileURLToPath(new URL('../../../',import.meta.url));
test('SIGTERM during early runtime setup releases its own start lease before exit',{skip:process.platform==='win32'},async t=>{
 const base=path.join(source,'.cache/dev-cancel');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'project-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.cp(path.join(source,'kernel'),path.join(root,'kernel'),{recursive:true,filter:p=>!p.split(path.sep).some(x=>['node_modules','.cache','ai-tasks'].includes(x))});
 await fs.writeFile(path.join(root,'kernel/scripts/setup.mjs'),`import fs from 'node:fs/promises';export const root=process.env.SEED_ROOT;export async function setup(){await fs.writeFile(root+'/setup-entered','yes');await new Promise(resolve=>setTimeout(resolve,300));}`);
 const child=spawn(process.execPath,[path.join(root,'kernel/scripts/dev.mjs')],{cwd:root,env:{...process.env,SEED_ROOT:root,SEED_IMPORT_EXISTING_AUTH:'0'},stdio:['ignore','pipe','pipe']});
 let output='';child.stderr.on('data',b=>output+=b);const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await exit;}});
 const deadline=Date.now()+5000;while(!await fs.access(path.join(root,'setup-entered')).then(()=>true,()=>false)){if(child.exitCode!==null||Date.now()>deadline)assert.fail(output||'setup did not start');await delay(10);}
 assert.equal(JSON.parse(await fs.readFile(path.join(root,'.runtime/kernel-operation.lock'))).pid,child.pid);
 child.kill('SIGTERM');const result=await exit;assert.equal(result.signal,null);assert.match(output,/startup cancelled/);
 await assert.rejects(fs.access(path.join(root,'.runtime/kernel-operation.lock')),{code:'ENOENT'});
 await assert.rejects(fs.access(path.join(root,'.runtime/runtime-address.json')),{code:'ENOENT'});
});
