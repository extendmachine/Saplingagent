import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../../../',import.meta.url));
async function until(check){for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,50))}throw Error('Management fixture did not settle')}
test('real management stays on the new root, reuses its lease and finishes without recreating the old folder',{timeout:15000},async t=>{
 const parent=path.join(project,'.cache/rename-entry-tests');await fs.mkdir(parent,{recursive:true});const temp=await fs.mkdtemp(path.join(parent,'flow-')),before=path.join(temp,'Before'),after=path.join(temp,'After');
 await fs.mkdir(before);await fs.cp(path.join(project,'kernel'),path.join(before,'kernel'),{recursive:true,filter:p=>!p.split(path.sep).some(x=>['node_modules','.cache'].includes(x))});
 const assets=path.join(before,'kernel/.cache/setup');await fs.mkdir(assets,{recursive:true});await fs.writeFile(path.join(assets,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__">');
 const start=root=>spawn(process.execPath,[path.join(root,'kernel/launcher/entry.mjs'),'--no-open'],{cwd:temp,env:{...process.env,SEED_ROOT:root,SAPLING_NO_OPEN:'1',SEED_IMPORT_EXISTING_AUTH:'0'},stdio:'ignore'});
 const child=start(before);let second;t.after(async()=>{for(const c of [second,child])if(c&&c.exitCode===null){c.kill('SIGTERM');await until(()=>c.exitCode!==null)}await fs.rm(temp,{recursive:true,force:true})});
 let address;await until(async()=>{try{address=JSON.parse(await fs.readFile(path.join(before,'.runtime/management-address.json')));return true}catch{assert.equal(child.exitCode,null);return false}});
 const base='http://127.0.0.1:'+address.port,html=await fetch(base).then(r=>r.text()),token=html.match(/content="([^"]+)"/)[1],headers={'X-Sapling-Config':token,Origin:base,'Content-Type':'application/json'};
 const post=(route,body)=>fetch(base+'/api/config/'+route,{method:'POST',headers,body:JSON.stringify(body)});
 const profile={engine:'opencode',kind:'api',protocol:'chat',label:'Synthetic',baseUrl:'http://127.0.0.1:1/v1',model:'synthetic',noAuth:true};
 assert.equal((await post('profiles',profile)).status,409);
 const confirmed=await post('project/prepare',{name:'After',folderName:'After',renameFolder:true});assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).root,after);
 assert.equal(await fs.access(before).then(()=>true,()=>false),false);
 for(const f of ['management-address.json','management.lock/owner.json'])assert.equal(JSON.parse(await fs.readFile(path.join(after,'.runtime',f))).root,after);
 assert.equal((await fetch(base+'/health/project-launcher').then(r=>r.json())).root,after);assert.equal((await fetch(base)).status,200);assert.equal((await post('profiles',profile)).status,200);
 second=start(after);await until(()=>second.exitCode!==null);assert.equal(second.exitCode,0);assert.equal(JSON.parse(await fs.readFile(path.join(after,'.runtime/management-address.json'))).pid,child.pid);
 assert.equal((await post('close',{})).status,200);await until(()=>child.exitCode!==null);assert.equal(child.exitCode,0);
 for(const f of ['management-address.json','management.lock'])assert.equal(await fs.access(path.join(after,'.runtime',f)).then(()=>true,()=>false),false);
 assert.equal(await fs.access(before).then(()=>true,()=>false),false);
});
