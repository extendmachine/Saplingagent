import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../../../',import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,attempts=200){for(let i=0;i<attempts;i++){if(await check())return;await sleep(75);}throw Error('Offline setup fixture did not settle');}
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const exists=async file=>fs.access(file).then(()=>true,()=>false);
const appSource=`import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import{fileURLToPath}from'node:url';import{randomUUID}from'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),id=randomUUID(),token='synthetic-runtime-token';
await fs.mkdir(path.join(root,'local-secrets/runtime'),{recursive:true});await fs.writeFile(path.join(root,'local-secrets/runtime/service-token'),token);
let port;const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/runtime/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({applicationRoot:root.replace(/[\\\\/]$/,''),instanceId:id,phase:'ready'}));return;}
 if(req.url==='/api/runtime/stop'&&req.method==='POST'&&req.headers.authorization==='Bearer '+token){res.end('{}');setTimeout(async()=>{await fs.rm(path.join(root,'.runtime/runtime-address.json'),{force:true});server.close(()=>process.exit(0));},25);return;}
 res.end('synthetic application');
});server.listen(0,'127.0.0.1',async()=>{port=server.address().port;const normalized=root.replace(/[\\\\/]$/,'');await fs.mkdir(path.join(root,'.runtime'),{recursive:true});await fs.writeFile(path.join(root,'.runtime/runtime-address.json'),JSON.stringify({root:normalized,instanceId:id,pid:process.pid,url:'http://127.0.0.1:'+port,ports:{runtimeManagerPort:port}}));});
`;
test('public setup saves first, releases old processes/log handles, moves and restarts before allowing export',{skip:process.platform!=='darwin',timeout:40000},async t=>{
 const parent=path.join(project,'.cache/rename-entry-tests');await fs.mkdir(parent,{recursive:true});const temp=await fs.mkdtemp(path.join(parent,'flow-'));
 const before=path.join(temp,'Before'),after=path.join(temp,'项目 After α');await fs.mkdir(before);
 await fs.cp(path.join(project,'kernel'),path.join(before,'kernel'),{recursive:true,filter:p=>!p.split(path.sep).some(x=>['node_modules','.cache'].includes(x))});
 const relative=path.join('.runtime',path.basename(path.dirname(path.dirname(process.execPath))),'bin','node');
 const localNode=path.join(before,relative);await fs.mkdir(path.dirname(localNode),{recursive:true});await fs.copyFile(process.execPath,localNode);await fs.chmod(localNode,0o755);
 for(const d of ['scripts','front/node_modules/vite/bin','logs/project-launcher','local-secrets/codex/sessions','.git'])await fs.mkdir(path.join(before,d),{recursive:true});
 await fs.writeFile(path.join(before,'package.json'),'{"type":"module"}');await fs.writeFile(path.join(before,'scripts/dev.mjs'),appSource);
 await fs.writeFile(path.join(before,'kernel/scripts/launcher/cli.mjs'),"import fs from 'node:fs';import{fileURLToPath}from'node:url';fs.writeFileSync(fileURLToPath(new URL('../../../application-prepared',import.meta.url)),'prepared');");
 await fs.writeFile(path.join(before,'front/node_modules/vite/bin/vite.js'),"require('node:fs').writeFileSync('pages-built','built');");
 await fs.writeFile(path.join(before,'business.txt'),'preserve application bytes');await fs.writeFile(path.join(before,'.git/HEAD'),'ref: refs/heads/main\n');await fs.writeFile(path.join(before,'local-secrets/codex/sessions/history.jsonl'),'synthetic historical bytes\n');
 const assets=path.join(before,'kernel/.cache/setup');await fs.mkdir(assets,{recursive:true});await fs.writeFile(path.join(assets,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__"><meta name="language" content="__SAPLING_CONFIG_LANGUAGE__">');
 let management,oldRuntime,jobId,helperDirectory;
 const runtimeMeta=root=>path.join(root,'.runtime/runtime-address.json'),managementMeta=root=>path.join(root,'.runtime/management-address.json');
 const roots=[before,after];
 t.after(async()=>{
  for(const root of roots){
   if(!await exists(root))continue;
   const runtime=await json(runtimeMeta(root)).catch(()=>null);
   if(runtime?.root===root){await fetch(runtime.url+'/api/runtime/stop',{method:'POST',headers:{Authorization:'Bearer synthetic-runtime-token'},signal:AbortSignal.timeout(1000)}).catch(()=>{});await until(async()=>!await exists(runtimeMeta(root)),15).catch(()=>{});}
   const address=await json(managementMeta(root)).catch(()=>null);
   if(address?.root===root){const token=await fs.readFile(path.join(root,'local-secrets/runtime/launcher-token'),'utf8').catch(()=>'');await fetch('http://127.0.0.1:'+address.port+'/api/config/close',{method:'POST',headers:{Origin:'http://127.0.0.1:'+address.port,'Content-Type':'application/json','X-Sapling-Config':token.trim()},body:'{}',signal:AbortSignal.timeout(1000)}).catch(()=>{});await until(async()=>!await exists(managementMeta(root)),15).catch(()=>{});}
  }
  for(const child of [management,oldRuntime])if(child&&child.exitCode===null){child.kill('SIGTERM');await until(()=>child.exitCode!==null).catch(()=>{});}
  const processes=(await promisify(execFile)('/bin/ps',['-axo','pid=,command='])).stdout;
  for(const line of processes.split('\n')){const match=line.trim().match(/^(\d+)\s+(.*)$/);if(!match)continue;const command=match[2];if(roots.some(root=>command.startsWith(path.join(root,relative)))||helperDirectory&&command.startsWith('/bin/sh '+helperDirectory+'/offline-helper.sh')){try{process.kill(Number(match[1]),'SIGTERM');}catch{}}}
  if(helperDirectory)await until(async()=>!await exists(helperDirectory),20).catch(()=>{});
  const debug=[];for(const root of roots)if(await exists(root)){const status=await json(path.join(root,'.runtime/setup-finalization.json')).catch(()=>null);const log=await fs.readFile(path.join(root,'logs/project-launcher/fixture.log'),'utf8').catch(()=>'');debug.push({root,status,log:log.slice(-3000)});for(const file of [runtimeMeta(root),managementMeta(root)]){const record=await json(file).catch(()=>null);if(record?.root===root&&record.pid)try{process.kill(record.pid,'SIGTERM');}catch{}}}
  await fs.writeFile(path.join(parent,'last-debug.json'),JSON.stringify(debug,null,2));await sleep(150);
  await fs.rm(temp,{recursive:true,force:true});
 });
 const log=await fs.open(path.join(before,'logs/project-launcher/fixture.log'),'a');
 management=spawn(localNode,[path.join(before,'kernel/launcher/entry.mjs'),'--no-open'],{cwd:temp,env:{...process.env,SEED_ROOT:before,SAPLING_NO_OPEN:'1',SAPLING_LANG:'zh',TMPDIR:path.join(before,'.runtime/tmp'),SEED_IMPORT_EXISTING_AUTH:'0'},stdio:['ignore',log.fd,log.fd]});await log.close();
 await until(async()=>{assert.equal(management.exitCode,null);return exists(managementMeta(before));});
 const address=await json(managementMeta(before)),base='http://127.0.0.1:'+address.port;
 const token=(await fetch(base).then(r=>r.text())).match(/name="config-token" content="([^"]+)"/)[1];
 const post=(route,body={},credential=token)=>fetch(base+'/api/config/'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Sapling-Config':credential},body:JSON.stringify(body)});
 const profile={engine:'opencode',kind:'api',protocol:'chat',label:'Synthetic',baseUrl:'http://127.0.0.1:1/v1',model:'synthetic',noAuth:true};
 assert.equal((await post('profiles',profile)).status,409);
 const saved=await post('project/save',{name:'项目 After α',folderName:'项目 After α',renameFolder:true});assert.equal(saved.status,200);assert.equal((await saved.json()).root,before);
 assert.equal(await exists(before),true);assert.equal(await exists(after),false);assert.equal((await post('profiles',profile)).status,200);assert.equal((await post('project/build')).status,409);
 oldRuntime=spawn(localNode,[path.join(before,'scripts/dev.mjs')],{cwd:before,env:{...process.env,SEED_ROOT:before},stdio:'ignore'});await until(()=>exists(runtimeMeta(before)));
 const accepted=await post('project/finalize');assert.equal(accepted.status,202);const result=await accepted.json();jobId=result.finalization.id;assert.equal(result.finalization.targetRoot,after);
 for(const folder of await fs.readdir('/private/tmp')){if(!folder.startsWith('sapling-setup-'))continue;const candidate=path.join('/private/tmp',folder);if((await json(path.join(candidate,'job.json')).catch(()=>null))?.id===jobId){helperDirectory=candidate;break;}}
 assert.ok(helperDirectory,'helper really runs outside the moving project');assert.equal(helperDirectory.startsWith(before+path.sep),false);
 await until(()=>management.exitCode!==null);await until(()=>oldRuntime.exitCode!==null);
 await until(async()=>{const status=await json(path.join(after,'.runtime/setup-finalization.json')).catch(()=>null),old=await json(path.join(before,'.runtime/setup-finalization.json')).catch(()=>null);if((status||old)?.phase==='failed')throw Error('Synthetic restart failed: '+JSON.stringify((status||old).error));return status?.phase==='ready';});
 await until(async()=>!await exists(helperDirectory));assert.equal(await exists(before),false);
 const newAddress=await json(managementMeta(after));assert.equal(newAddress.port,address.port);assert.notEqual(newAddress.pid,management.pid);
 const health=await fetch(base+'/health/project-launcher').then(r=>r.json());assert.equal(health.root,after);assert.deepEqual(health.finalization,{id:jobId,phase:'ready'});
 const html=await fetch(base).then(r=>r.text()),newToken=html.match(/name="config-token" content="([^"]+)"/)[1];assert.notEqual(newToken,token);assert.match(html,/name="language" content="zh"/);
 assert.equal((await post('profiles',profile)).status,401,'old page must reload its rotated token');
 const state=await fetch(base+'/api/config/project',{headers:{'X-Sapling-Config':newToken}}).then(r=>r.json());assert.equal(state.exportReady,true);assert.equal(state.runtime.phase,'ready');assert.equal(state.root,after);
 assert.equal(await fs.readFile(path.join(after,'business.txt'),'utf8'),'preserve application bytes');assert.equal(await fs.readFile(path.join(after,'.git/HEAD'),'utf8'),'ref: refs/heads/main\n');assert.equal(await fs.readFile(path.join(after,'local-secrets/codex/sessions/history.jsonl'),'utf8'),'synthetic historical bytes\n');
 assert.equal(await exists(path.join(after,'application-prepared')),true);assert.equal(await exists(path.join(after,'front/pages-built')),true);assert.equal(await exists(path.join(after,'.runtime/project-finalization.json')),false);
});
