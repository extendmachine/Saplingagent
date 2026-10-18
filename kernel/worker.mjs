// Copied before source replacement. This temporary process survives app shutdown.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { applyKernel } from './manager.mjs';
import { restoreKernel } from './recover.mjs';
import { jsonWrite, validId, record } from './storage.mjs';
import { terminateOwned } from '../contracts/local-process.mjs';
const [root,jobId,action,id]=process.argv.slice(2);
if(!validId(jobId)||!validId(id)||!['apply','restore'].includes(action))throw Error('Invalid maintenance request.');
const prefix=`.runtime/kernel/jobs/${jobId}`, state={jobId,phase:'waiting',message:'Waiting for the application to stop.',backupId:action==='restore'?id:null,url:null};
let app, busy=false, begun=false, successful=false;
async function save(phase,message){Object.assign(state,{phase,message});await jsonWrite(root,`${prefix}/state.json`,state);await record(root,'maintenance_phase',{jobId,phase});}
async function releaseLease(){try{const value=JSON.parse(await fs.readFile(path.join(root,'.runtime/kernel/active-job.json'),'utf8'));if(value.jobId===jobId)await fs.unlink(path.join(root,'.runtime/kernel/active-job.json'));}catch(error){if(error.code!=='ENOENT')throw error;}}
async function waitOffline(){
 const end=Date.now()+30000;
 while(Date.now()<end){
  let value;try{value=JSON.parse(await fs.readFile(path.join(root,'.runtime/runtime-address.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return;throw Error('Runtime discovery is invalid.');}
  try{process.kill(value.pid,0);}catch(error){if(error.code==='ESRCH')return;}
  await delay(150);
 }
 throw Error('Application did not stop. No kernel files were replaced.');
}
async function run(file,args=[]){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file,...args],{cwd:root,env:process.env,stdio:['ignore',process.stdout,process.stderr],windowsHide:true});child.once('error',()=>reject(Error('Maintenance helper could not start.')));child.once('exit',code=>code===0?resolve():reject(Error('Kernel dependencies could not be repaired. See logs/kernel-manager.')));});}
async function stopStartedApp(){if(app&&app.exitCode===null){if(process.platform==='win32')void 0;else app.kill('SIGTERM');await Promise.race([new Promise(resolve=>app.once('exit',resolve)),delay(10000)]);if(app.exitCode===null)await terminateOwned(app,{graceMs:1000});}app=null;}
async function restart(){
 await save('dependencies','Repairing kernel dependencies only. Application code and dependency manifests are preserved.');
 await run(path.join(root,'kernel/install-dependencies.mjs'),[root]);
 await save('starting','Starting the complete application. Model login or network issues are reported separately.');
 app=spawn(process.execPath,[path.join(root,'scripts/dev.mjs')],{cwd:root,env:process.env,stdio:['ignore',process.stdout,process.stderr],detached:process.platform!=='win32',windowsHide:true});
 let spawnError=false;app.once('error',()=>{spawnError=true;});
 const end=Date.now()+150000;
 while(Date.now()<end){
  if(spawnError||app.exitCode!==null)throw Error('Application could not start. Inspect logs/kernel-manager and use retry after fixing the cause.');
  try{
   const address=JSON.parse(await fs.readFile(path.join(root,'.runtime/runtime-address.json'),'utf8'));
   if(address.pid!==app.pid||!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(address.url||''))throw Error('Not this runtime.');
   state.url=address.url;
   const response=await fetch(new URL('/api/runtime/status',address.url),{signal:AbortSignal.timeout(1500)});const value=await response.json();
   if(value.instanceId!==address.instanceId)throw Error('Stale address.');
   if(value.phase==='ready'&&!value.busy){await save('ready','Kernel maintenance complete; the application is ready.');successful=true;await releaseLease();app.unref();setTimeout(()=>server.close(()=>process.exit(0)),30000).unref();return;}
   if(value.phase==='failed'&&!value.busy)throw Object.assign(Error('Source was applied, but application readiness failed. Check model login, dependencies or service diagnostics. Open runtime recovery or retry.'),{terminal:true});
  }catch(error){if(error.terminal)throw error;}
  await delay(500);
 }
 throw Error('Application readiness timed out. Source results and backup remain available. Open runtime recovery or retry.');
}
async function execute(operation){
 if(busy||successful)return;busy=true;
 try{
  if(operation==='begin'){
   await waitOffline();await save('applying',action==='apply'?'Applying the verified kernel package.':'Restoring the selected source backup.');
   const result=action==='apply'?await applyKernel(root,id,{acceptRisk:true}):await restoreKernel(root,id);
   if(result.backupId)state.backupId=result.backupId;
   state.sourceResult=result.changed===false?'already-current':action==='apply'?'applied':'restored';
  } else {
   await stopStartedApp();await waitOffline();
   if(operation==='restore'){
    if(!state.backupId)throw Error('No source backup is available.');
    await save('restoring','Restoring source after your explicit request.');await restoreKernel(root,state.backupId);state.sourceResult='restored';
   }
   if(!state.sourceResult)throw Error('Source was not applied. Close maintenance and start the original application to check again, or inspect the saved recovery helper.');
  }
  await restart();
 }catch(error){
  const match=String(error.message).match(/Backup ([a-f0-9-]{36})/);if(match)state.backupId=match[1];
  await save('failed',error.code?`${error.code}: ${error.message}`:error.message);
 }finally{busy=false;}
}
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Saplingagent kernel maintenance</title><style>body{font:16px system-ui;max-width:680px;margin:10vh auto;padding:24px;color:#263128;background:#fafbf7}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:20px;background:#eef1ea;border-radius:16px}button,a{display:inline-block;padding:10px 14px;margin:6px;border:1px solid #bac5b8;border-radius:8px;background:white;color:inherit}button{cursor:pointer}button:disabled{opacity:.45}</style><h1>Kernel maintenance</h1><p>Keep this page open while the application stops and restarts. Your application files and Git are preserved. Source restore is manual.</p><pre id="state" role="status">Connecting…</pre><div id="actions"><button id="retry">Retry dependencies & start</button><button id="restore">Restore backup & start</button><button id="close">Close maintenance</button></div><a id="app" hidden>Open app / runtime recovery</a><script>
let busy=false;const out=document.getElementById('state');async function poll(){try{const r=await fetch('/status');const s=await r.json();out.textContent=s.phase+'\\n'+s.message+(s.sourceResult?'\\nSource: '+s.sourceResult:'')+(s.backupId?'\\nBackup: '+s.backupId:'');for(const b of document.querySelectorAll('button'))b.disabled=busy||s.busy||s.phase==='ready';document.getElementById('restore').disabled=busy||s.busy||!s.backupId||s.phase==='ready';if(s.url){const a=document.getElementById('app');a.hidden=false;a.href=s.url+'__saplingagent/runtime'}if(s.phase==='ready'&&s.url)location.replace(s.url)}catch{out.textContent='Maintenance connection unavailable. Inspect .runtime/kernel/jobs and logs/kernel-manager; no success is assumed.'}}for(const b of document.querySelectorAll('button'))b.onclick=async()=>{if(b.id==='restore'&&!confirm('Restore the saved kernel source backup? Application data is not restored.'))return;busy=true;try{const r=await fetch('/'+b.id,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok){const e=await r.json();out.textContent=e.error||'Operation failed';}}finally{busy=false;await poll()}};poll();setInterval(poll,1000);
</script></html>`;
const server=http.createServer(async(req,res)=>{
 const port=server.address().port,origin=`http://127.0.0.1:${port}`;
 const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Local origin required.'});
 if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'});return res.end(html);}
 if(req.method==='GET'&&req.url==='/status')return send(200,{...state,busy});
 if(req.method==='POST'&&req.headers.origin===origin&&['/retry','/restore','/close'].includes(req.url)){
  if(busy||successful||!begun)return send(409,{error:'Maintenance is busy or already complete.'});
  if(req.url==='/close'){await releaseLease();send(200,{closed:true});return server.close(()=>process.exit(0));}
  send(202,{accepted:true});void execute(req.url.slice(1));return;
 }
 send(404,{error:'Endpoint unavailable.'});
});
server.requestTimeout=5000;server.headersTimeout=5000;
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
await jsonWrite(root,'.runtime/kernel/active-job.json',{jobId,pid:process.pid,phase:'waiting',createdAt:new Date().toISOString()});
process.send?.({jobId,url:`http://127.0.0.1:${server.address().port}/`});
const handoffTimer=setTimeout(async()=>{if(!begun){await releaseLease();server.close(()=>process.exit(1));}},30000);
process.once('message',message=>{if(message?.begin){begun=true;clearTimeout(handoffTimer);void execute('begin');}});
