import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createGateway } from '../gateway.mjs';
const exec = promisify(execFile);
import { RuntimeManager } from '../manager.mjs';
import { createManagerServer } from '../server.mjs';
import { createDrainGate } from '../../../contracts/runtime-drain.mjs';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
async function until(check) { const end = Date.now()+8000; while (Date.now()<end) { if (await check()) return; await delay(20); } throw new Error('Fixture condition timed out'); }
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sapling-runtime-'));
  const config = {}; for (const key of ['workspacePort','builderPort','pdfEditorPort','agentPort','frontPort','runtimeManagerPort','vitePort']) { do { config[key] = await port(); } while (Object.entries(config).some(([k,p]) => k!==key && p===config[key])); }
  await fs.mkdir(path.join(root,'config')); await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify(config));
  const code = `import http from 'node:http'; import fs from 'node:fs/promises';
const name=process.env.FIXTURE_NAME; let prepared=false; const version=await fs.readFile('version.txt','utf8').catch(()=> 'initial');
const port=Number(process.env.FIXTURE_PORT);
const server=http.createServer(async(req,res)=>{let body={ready:true,authenticated:true,mcp:{ready:true},version},status=200;
if(req.url==='/api/sessions')body={sessions:await fs.access('agent.busy').then(()=>[{id:'running'}],()=>[])};
if(req.url==='/api/sessions/running')body={session:{running:true}};
if(req.url==='/hold' && req.method==='POST'){await fs.writeFile('hold.started','1');while(!await fs.access('hold.release').then(()=>true,()=>false))await new Promise(r=>setTimeout(r,10))}
if(req.url==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: first\\n\\n');setTimeout(()=>res.end('data: last\\n\\n'),80);return}
if(req.url==='/internal/runtime/prepare' && version==='legacy'){status=404;body={error:{code:'NOT_FOUND'}}}
else if(req.url==='/internal/runtime/prepare'){try{await fs.access(name+'.busy');status=409;body={error:{code:'RUNTIME_BUSY'}}}catch{prepared=true;body={prepared:true}}}
if(req.url==='/internal/runtime/release'){prepared=false;body={prepared:false}}
if(req.url==='/api/status'){try{await fs.access('agent.not-ready');body.ready=false}catch{}}
if(req.url==='/mutate' && prepared){status=503;body={error:{code:'RUNTIME_RESTARTING'}}}
res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));});
try{await fs.access(name+'.fail'); process.exit(2)}catch{}
server.listen(port,'127.0.0.1');
server.on('upgrade',(req,socket)=>{socket.write('HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: websocket\\r\\n\\r\\nwelcome');socket.on('error',()=>{});socket.on('end',()=>socket.destroy())});
process.on('SIGTERM',()=>{server.close(()=>process.exit(0));server.closeAllConnections()});`;
  await fs.writeFile(path.join(root,'fixture.mjs'),code);
  const names = [['workspace','workspacePort'],['builder','builderPort'],['pdf-editor','pdfEditorPort'],['agent','agentPort']];
  const definitions=names.map(([name,portKey])=>({name,portKey,file:'fixture.mjs',env:{FIXTURE_NAME:name,FIXTURE_PORT:String(config[portKey])}}));
  const manager=new RuntimeManager({root,token:'fixture-token',definitions,frontDefinition:{name:'front',portKey:options.gateway?'vitePort':'frontPort',file:'fixture.mjs',env:{FIXTURE_NAME:'front',FIXTURE_PORT:String(options.gateway ? config.vitePort : config.frontPort)}},healthTimeout:1000,agentTimeout:300,stopTimeout:300,output:false,...options});
  const server=createManagerServer({manager,token:'fixture-token',frontPort:config.frontPort,managerPort:config.runtimeManagerPort});
  await new Promise(r=>server.listen(config.runtimeManagerPort,'127.0.0.1',r));
  let gateway; if(options.gateway) {gateway=createGateway({manager,token:'fixture-token',frontPort:config.frontPort,managerPort:config.runtimeManagerPort});await new Promise(r=>gateway.listen(config.frontPort,'127.0.0.1',r))}
  t.after(async()=>{gateway?.closeUpgrades();gateway?.closeAllConnections();if(gateway)await new Promise(r=>gateway.close(r));await manager.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true})});
  const request = (route, headers={}, method='GET',body)=>fetch(`http://127.0.0.1:${config.runtimeManagerPort}${route}`,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  await manager.start(); await manager.operation;
  return {root,config,manager,request};
}
test('prepare is atomic, busy operations refuse restart and release restores mutation access',()=>{
 let busy=false;const gate=createDrainGate(()=>busy);const leave=gate.enter();assert.throws(()=>gate.prepare(),{code:'RUNTIME_BUSY'});leave();leave();busy=true;assert.throws(()=>gate.prepare(),{code:'RUNTIME_BUSY'});busy=false;gate.prepare();assert.throws(()=>gate.enter(),{code:'RUNTIME_RESTARTING'});gate.release();gate.enter()();assert.equal(gate.pending,0);
});
test('real child restart replaces all backend PIDs, retains front/manager, deduplicates requests and accepts a second restart',async t=>{
 const {manager,request}=await fixture(t);assert.equal(manager.phase,'ready');const before=manager.state();
 const response=await request('/api/runtime/restart',{'Authorization':'Bearer fixture-token'},'POST',{scope:'backend'});assert.equal(response.status,202);const first=await response.json();assert.equal(manager.restart(),first.jobId);
 await manager.operation;const after=manager.state();assert.equal(after.phase,'ready');assert.equal(after.generation,2);assert.equal(after.instanceId,before.instanceId);
 for(const item of before.services){const next=after.services.find(x=>x.name===item.name);assert.equal(next.pid===item.pid,item.name==='front');}
 manager.restart();await manager.operation;assert.equal(manager.generation,3);
});
test('busy downstream task releases already-prepared Agent and leaves all PIDs and generation untouched',async t=>{
 const {root,config,manager}=await fixture(t);const before=manager.state();await fs.writeFile(path.join(root,'builder.busy'),'busy');manager.restart();await manager.operation;
 assert.equal(manager.phase,'ready');assert.equal(manager.error.code,'RUNTIME_BUSY');assert.equal(manager.generation,1);assert.deepEqual(manager.state().services,before.services);
 assert.equal((await fetch(`http://127.0.0.1:${config.agentPort}/mutate`,{method:'POST'})).status,200);
 await fs.unlink(path.join(root,'builder.busy'));manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.generation,2);
});
test('invalid new config preserves live backends and startup failure remains observable and retryable',async t=>{
 const {root,config,manager,request}=await fixture(t);const before=manager.state();await fs.writeFile(path.join(root,'config/runtime.json'),'broken');manager.restart();await manager.operation;assert.equal(manager.error.code,'INVALID_CONFIG');assert.deepEqual(manager.state().services,before.services);
 await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify(config));await fs.writeFile(path.join(root,'builder.fail'),'fail');manager.restart();await manager.operation;assert.equal(manager.phase,'failed');assert.equal(manager.error.service,'builder');assert.equal(manager.children.get('front').pid,before.services.find(x=>x.name==='front').pid);assert.equal((await request('/api/runtime/status')).status,200);
 await fs.unlink(path.join(root,'builder.fail'));manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.generation,2);
});
test('Agent readiness is required; failed readiness preserves recovery controls and retry succeeds',async t=>{
 const {root,manager}=await fixture(t);await fs.writeFile(path.join(root,'agent.not-ready'),'not-ready');manager.restart();await manager.operation;assert.equal(manager.phase,'failed');assert.equal(manager.error.code,'SERVICE_NOT_READY');assert.equal(manager.generation,1);await fs.unlink(path.join(root,'agent.not-ready'));manager.restart();await manager.operation;assert.equal(manager.generation,2);
});
test('restart HTTP rejects cross-site and unauthenticated scripts, keeps token private and closes owned processes',async t=>{
 const {manager,request,config}=await fixture(t);assert.equal((await request('/api/runtime/restart',{},'POST')).status,401);assert.equal((await request('/api/runtime/restart',{Origin:'https://example.invalid'},'POST')).status,403);assert.equal(await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:config.runtimeManagerPort,path:'/api/runtime/restart',method:'POST',headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end()}),403);
 const state=await(await request('/api/runtime/status')).json();assert.ok(!JSON.stringify(state).includes('fixture-token'));
 assert.equal((await request('/api/runtime/restart',{Origin:`http://127.0.0.1:${config.frontPort}`},'POST')).status,202);await manager.operation;const pids=manager.state().services.map(x=>x.pid);await manager.close();for(const pid of pids)assert.throws(()=>process.kill(pid,0));
});

test('foreign occupied port is reported without terminating its owner or the frontend',async t=>{
 const {root,config,manager}=await fixture(t);const frontPid=manager.children.get('front').pid;
 const old=manager.children.get('workspace'); old.kill('SIGTERM'); await until(()=>old.exitCode!==null);
 const foreign=net.createServer();await new Promise(resolve=>foreign.listen(config.workspacePort,'127.0.0.1',resolve));t.after(()=>{if(foreign.listening)return new Promise(resolve=>foreign.close(resolve))});
 manager.restart();await manager.operation;assert.equal(manager.error.code,'PORT_OCCUPIED');assert.equal(foreign.listening,true);assert.equal(manager.children.get('front').pid,frontPid);
 await new Promise(resolve=>foreign.close(resolve));manager.restart();await manager.operation;assert.equal(manager.phase,'ready');
});

test('full restart replaces frontend and backend PIDs while same-origin controls remain live', async t => {
 const {manager,config}=await fixture(t,{gateway:true});const before=manager.state();
 const base=`http://127.0.0.1:${config.frontPort}`;
 const response=await fetch(base+'/api/runtime/restart',{method:'POST',headers:{Origin:base},body:JSON.stringify({scope:'all'})});assert.equal(response.status,202);
 assert.equal((await fetch(base+'/api/runtime/status')).status,200);
 assert.match(await(await fetch(base+'/__saplingagent/runtime')).text(),/Restart app/);
 await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.generation,2);
 for(const child of before.services)assert.notEqual(manager.state().services.find(x=>x.name===child.name).pid,child.pid);
 assert.equal(manager.instanceId,before.instanceId);assert.equal((await fetch(base+'/')).status,200);
});
test('frontend startup failure keeps recovery page and retry available', async t=>{
 const {root,manager,config}=await fixture(t,{gateway:true});const base=`http://127.0.0.1:${config.frontPort}`;
 await fs.writeFile(path.join(root,'front.fail'),'fixture');manager.restart({scope:'all'});await manager.operation;
 assert.equal(manager.phase,'failed');assert.equal(manager.error.service,'front');assert.equal(manager.generation,1);
 assert.match(await(await fetch(base+'/',{headers:{Accept:'text/html'}})).text(),/Saplingagent runtime/);
 assert.equal((await fetch(base+'/api/runtime/status')).status,200);
 await fs.unlink(path.join(root,'front.fail'));manager.restart({scope:'all'});await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.generation,2);
});
test('gateway streams events without buffering and refuses restarts while an upstream write is pending', async t=>{
 const {manager,config}=await fixture(t,{gateway:true});const base=`http://127.0.0.1:${config.frontPort}`;
 const stream=await fetch(base+'/events');const reader=stream.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/first/);assert.equal(first.done,false);await reader.cancel();
 const hold=fetch(base+'/hold',{method:'POST',headers:{Origin:base},body:'fixture'});await until(()=>fs.access(path.join(manager.root,'hold.started')).then(()=>true,()=>false));
 assert.equal(manager.gatewayWrites,1);const before=manager.state();manager.restart({scope:'all'});await manager.operation;assert.equal(manager.error.code,'RUNTIME_BUSY');assert.deepEqual(manager.state().services,before.services);await fs.writeFile(path.join(manager.root,'hold.release'),'1');await hold;await until(()=>manager.gatewayWrites===0);
});
test('selected Git source is loaded by frontend and backend, legacy preparation works and optional services follow checkout', async t=>{
 const {root,manager,config}=await fixture(t,{gateway:true});const git=async(...args)=>exec('git',args,{cwd:root});
 await fs.writeFile(path.join(root,'.gitignore'),'*.log\nlogs/\n');await fs.writeFile(path.join(root,'version.txt'),'baseline');
 await git('init','-b','main');await git('config','user.name','Fixture');await git('config','user.email','fixture@example.invalid');await git('add','.');await git('commit','-m','baseline');
 await git('switch','-c','testcode');await fs.writeFile(path.join(root,'version.txt'),'legacy');await git('add','version.txt');await git('commit','-m','legacy source');
 await fs.mkdir(path.join(root,'private'));await fs.writeFile(path.join(root,'private/auth'),'unchanged');
 manager.restart({scope:'all'});await manager.operation;assert.equal(manager.phase,'ready');
 for(const port of [config.vitePort,config.agentPort])assert.equal((await(await fetch(`http://127.0.0.1:${port}/health`)).json()).version,'legacy');
 await fs.writeFile(path.join(root,'agent.busy'),'busy');const beforeBusy=manager.state();manager.restart({scope:'all'});await manager.operation;assert.equal(manager.error.code,'RUNTIME_BUSY');assert.deepEqual(manager.state().services,beforeBusy.services);await fs.unlink(path.join(root,'agent.busy'));
 await git('switch','main');manager.restart({scope:'all'});await manager.operation;assert.equal(manager.phase,'ready');
 assert.equal((await(await fetch(`http://127.0.0.1:${config.agentPort}/health`)).json()).version,'baseline');assert.equal(await fs.readFile(path.join(root,'private/auth'),'utf8'),'unchanged');
 const optional=manager.definitions.find(x=>x.name==='pdf-editor');optional.optional=true;optional.file='optional.mjs';
 manager.restart({scope:'all'});await manager.operation;assert.equal(manager.children.has('pdf-editor'),false);
 await fs.copyFile(path.join(root,'fixture.mjs'),path.join(root,'optional.mjs'));manager.restart({scope:'all'});await manager.operation;assert.equal(manager.children.has('pdf-editor'),true);
 await fs.unlink(path.join(root,'optional.mjs'));manager.restart({scope:'all'});await manager.operation;assert.equal(manager.children.has('pdf-editor'),false);
});
test('scope validation rejects arbitrary operation arguments', async t=>{
 const {config}=await fixture(t,{gateway:true});const base=`http://127.0.0.1:${config.frontPort}`;
 for(const input of [{scope:'unknown'},{scope:'all',command:'anything'},null])assert.equal((await fetch(base+'/api/runtime/restart',{method:'POST',headers:{Origin:base},body:JSON.stringify(input)})).status,400);
 assert.equal((await fetch(base+'/api/runtime/restart',{method:'POST',headers:{Origin:'https://example.invalid'},body:'{}'})).status,403);
});

test('gateway forwards WebSocket upgrades and their initial bytes', async t=> {
 const {config}=await fixture(t,{gateway:true});
 await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:config.frontPort,path:'/hmr',headers:{Connection:'Upgrade',Upgrade:'websocket',Origin:`http://127.0.0.1:${config.frontPort}`}});req.once('error',reject);req.once('upgrade',(res,socket,head)=>{assert.equal(res.statusCode,101);if(head.toString().includes('welcome')){socket.destroy();resolve()}else socket.once('data',data=>{assert.match(data.toString(),/welcome/);socket.destroy();resolve()})});req.end()});
});
