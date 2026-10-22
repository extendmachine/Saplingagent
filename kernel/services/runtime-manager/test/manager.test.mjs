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
const key=name==='pdf-editor'?'PDF_EDITOR':name.toUpperCase();const port=Number(name==='front'?process.env.FIXTURE_PORT:process.env['SEED_'+key+'_PORT']||process.env.FIXTURE_PORT);
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
  const server=createManagerServer({manager,token:'fixture-token',frontPort:config.frontPort,managerPort:config.runtimeManagerPort,onMaintenance:options.onMaintenance,openLogs:options.openLogs});
  await new Promise(r=>server.listen(config.runtimeManagerPort,'127.0.0.1',r));
  let gateway; if(options.gateway) {gateway=createGateway({manager,token:'fixture-token',frontPort:config.frontPort,managerPort:config.runtimeManagerPort,onMaintenance:options.onMaintenance,openLogs:options.openLogs});await new Promise(r=>gateway.listen(config.frontPort,'127.0.0.1',r))}
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
 await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify(config));await fs.writeFile(path.join(root,'builder.fail'),'fail');manager.restart({scope:'backend'});await manager.operation;assert.equal(manager.phase,'failed');assert.equal(manager.error.service,'builder');assert.equal(manager.children.get('front').pid,before.services.find(x=>x.name==='front').pid);assert.equal((await request('/api/runtime/status')).status,200);
 await fs.unlink(path.join(root,'builder.fail'));manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.generation,2);
});
test('allocated ports stay fixed; changed public preferences retain the live origin and internal preferences can reload', async t => {
 const {manager,root,config}=await fixture(t);
 const assigned={frontPort:await port(),agentPort:await port()};
 manager.portOverrides=assigned;
 const loaded=await manager.loadConfig();assert.equal(loaded.frontPort,assigned.frontPort);assert.equal(loaded.agentPort,assigned.agentPort);
 await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify({...config,preferredModel:'fixture-model'}));
 assert.equal((await manager.loadConfig()).preferredModel,'fixture-model');
 await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify({...config,frontPort:await port()}));
 assert.equal((await manager.loadConfig()).frontPort,assigned.frontPort);
 const agentPort=await port();await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify({...config,agentPort}));
 assert.equal((await manager.loadConfig()).agentPort,agentPort);
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
 manager.restart({scope:'backend'});await manager.operation;assert.equal(manager.error.code,'PORT_OCCUPIED');assert.equal(foreign.listening,true);assert.equal(manager.children.get('front').pid,frontPid);
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

async function projectEntry(root, name, file = `backend/${name}/server.mjs`) {
 const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});
 await fs.writeFile(target,`import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';
const root=process.env.SEED_ROOT,name=${JSON.stringify(name)},port=Number(process.env.PORT);let prepared=false;
if(await fs.access(path.join(root,name+'.fail')).then(()=>true,()=>false))process.exit(2);
const version=await fs.readFile(path.join(root,name+'.version'),'utf8').catch(()=>'initial');
const s=http.createServer(async(req,res)=>{let status=200,body={ready:true,name,version,port,services:JSON.parse(process.env.SEED_SERVICE_PORTS),arg:process.argv[2],root:process.env.PROJECT_ROOT};
if(req.url==='/internal/runtime/prepare'){if(await fs.access(path.join(root,name+'.busy')).then(()=>true,()=>false)){status=409;body={error:{code:'RUNTIME_BUSY'}}}else prepared=true;}
if(req.url==='/internal/runtime/release')prepared=false;
if(req.url==='/mutate'&&prepared)status=503;
res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));});
s.listen(port,'127.0.0.1',()=>fs.appendFile(path.join(root,'project-starts.txt'),name+'\\n'));
process.on('SIGTERM',()=>{s.closeAllConnections();s.close(()=>process.exit(0));});`);
}
async function manifest(root, services) { await fs.writeFile(path.join(root,'config/services.json'),JSON.stringify({version:1,services})); }

test('default full restart discovers a new backend, reloads its content and retains the public control origin',async t=>{
 const {root,manager,config}=await fixture(t,{gateway:true});const before=manager.state();
 await projectEntry(root,'reports');manager.restart();await manager.operation;
 assert.equal(manager.phase,'ready');assert.equal(manager.generation,2);assert.equal(manager.instanceId,before.instanceId);
 for(const item of before.services)assert.notEqual(manager.children.get(item.name).pid,item.pid);
 const reports=manager.state().services.find(x=>x.name==='reports');assert.equal(reports.project,true);assert.ok(reports.port>=4500);
 assert.equal((await(await fetch(`http://127.0.0.1:${reports.port}/health`)).json()).version,'initial');
 await fs.writeFile(path.join(root,'reports.version'),'new source');await projectEntry(root,'analytics');manager.restart();await manager.operation;
 assert.equal(manager.phase,'ready');assert.equal(manager.state().services.find(x=>x.name==='reports').port,reports.port);
 assert.notEqual(manager.children.get('reports').pid,reports.pid);
 assert.equal((await(await fetch(`http://127.0.0.1:${reports.port}/health`)).json()).version,'new source');
 assert.equal((await fetch(`http://127.0.0.1:${config.frontPort}/api/runtime/status`)).status,200);
});

test('registered independent frontend/backend and worker start in dependency order and removed services stop',async t=>{
 const {root,manager}=await fixture(t,{gateway:true});
 await projectEntry(root,'demo-api','projects/demo/api/server.mjs');await projectEntry(root,'demo-ui','projects/demo/ui/server.mjs');
 await fs.writeFile(path.join(root,'projects/demo/ui/package.json'),JSON.stringify({name:'fixture-ui',private:true,scripts:{dev:'node server.mjs'}}));
 await fs.mkdir(path.join(root,'projects/demo/worker'));
 await fs.writeFile(path.join(root,'projects/demo/worker/worker.mjs'),`import fs from 'node:fs/promises';await fs.writeFile(process.env.SEED_ROOT+'/worker-started','yes');setInterval(()=>{},1000);`);
 await manifest(root,[{name:'demo-ui',cwd:'projects/demo/ui',command:['npm','run','dev','--','${PORT}'],dependsOn:['demo-api'],env:{PROJECT_ROOT:'${ROOT}',PRIVATE_TEST_VALUE:'fixture-only-secret'}},{name:'demo-api',cwd:'projects/demo/api',file:'server.mjs',dependsOn:['workspace']},{name:'demo-worker',cwd:'projects/demo/worker',command:['node','worker.mjs'],healthCheck:'process',dependsOn:['demo-api']}]);
 manager.restart();await manager.operation;assert.equal(manager.phase,'ready');
 const starts=(await fs.readFile(path.join(root,'project-starts.txt'),'utf8')).trim().split('\n');assert.ok(starts.indexOf('demo-api')<starts.indexOf('demo-ui'));
 const ui=manager.state().services.find(x=>x.name==='demo-ui');const data=await(await fetch(`http://127.0.0.1:${ui.port}/`)).json();assert.equal(data.arg,String(ui.port));assert.equal(data.root,root);assert.equal(data.services['demo-ui'],ui.port);assert.ok(data.services['demo-api']);
 assert.equal(await fs.readFile(path.join(root,'worker-started'),'utf8'),'yes');assert.ok(!JSON.stringify(manager.state()).includes('fixture-only-secret'));
 const pids=manager.state().services.filter(x=>x.project).map(x=>x.pid);await manifest(root,[]);manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.ok(!manager.state().services.some(x=>x.project));for(const pid of pids)assert.throws(()=>process.kill(pid,0));
});

test('invalid new service definitions leave all existing processes running and can be corrected in place',async t=>{
 const {root,manager,config}=await fixture(t,{gateway:true});const before=manager.state();
 await fs.writeFile(path.join(root,'config/services.json'),'{broken');manager.restart();await manager.operation;assert.equal(manager.error.code,'INVALID_SERVICES');assert.deepEqual(manager.state().services,before.services);assert.equal(manager.generation,1);
 await manifest(root,[{name:'missing',file:'not-created.mjs'}]);manager.restart();await manager.operation;assert.equal(manager.error.code,'INVALID_SERVICES');assert.deepEqual(manager.state().services,before.services);
 await projectEntry(root,'fixed');await manifest(root,[]);manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.ok(manager.children.has('fixed'));assert.equal((await fetch(`http://127.0.0.1:${config.frontPort}/api/runtime/status`)).status,200);
});

test('new project port allocation skips a foreign listener and project drain refuses busy work',async t=>{
 const {root,manager}=await fixture(t,{gateway:true});const foreign=net.createServer();await new Promise(r=>foreign.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>foreign.close(r)));
 const occupied=foreign.address().port;await projectEntry(root,'documents');await manifest(root,[{name:'documents',file:'backend/documents/server.mjs',port:occupied,drain:true}]);manager.restart();await manager.operation;assert.equal(manager.phase,'ready');
 const service=manager.state().services.find(x=>x.name==='documents');assert.ok(service.port>occupied);assert.equal(foreign.listening,true);
 const before=manager.state();await fs.writeFile(path.join(root,'documents.busy'),'busy');manager.restart();await manager.operation;assert.equal(manager.error.code,'RUNTIME_BUSY');assert.equal(manager.phase,'ready');assert.deepEqual(manager.state().services,before.services);
 await fs.unlink(path.join(root,'documents.busy'));manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.state().services.find(x=>x.name==='documents').port,service.port);assert.equal(foreign.listening,true);
});

test('disabled auto-discovered services are stopped without returning on the next restart',async t=>{
 const {root,manager}=await fixture(t);await projectEntry(root,'notes');manager.restart();await manager.operation;const pid=manager.children.get('notes').pid;
 await manifest(root,[{name:'notes',enabled:false}]);manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.children.has('notes'),false);assert.throws(()=>process.kill(pid,0));
});

test('failed new service keeps recovery available and retry loads its corrected source',async t=>{
 const {root,manager,config}=await fixture(t,{gateway:true});await projectEntry(root,'new-service');await fs.writeFile(path.join(root,'new-service.fail'),'fail');manager.restart();await manager.operation;assert.equal(manager.phase,'failed');assert.equal(manager.error.service,'new-service');assert.equal(manager.generation,1);
 const base=`http://127.0.0.1:${config.frontPort}`;assert.match(await(await fetch(base+'/',{headers:{Accept:'text/html'}})).text(),/Saplingagent runtime/);
 await fs.unlink(path.join(root,'new-service.fail'));manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.generation,2);
});

test('internal port edits apply on full restart without changing the browser origin or requiring launcher exit',async t=>{
 const {root,manager,config}=await fixture(t,{gateway:true});const before=manager.state();let workspacePort;do{workspacePort=await port();}while(Object.values(config).includes(workspacePort));
 await fs.mkdir(path.join(root,'.runtime'));await fs.writeFile(path.join(root,'.runtime/runtime-address.json'),JSON.stringify({instanceId:manager.instanceId,pid:process.pid,ports:before.ports,url:`http://127.0.0.1:${config.frontPort}/`}));
 await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify({...config,workspacePort,frontPort:await port()}));
 manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.config.workspacePort,workspacePort);assert.equal(manager.config.frontPort,config.frontPort);assert.equal(manager.instanceId,before.instanceId);assert.equal(manager.generation,2);
 assert.equal((await(await fetch(`http://127.0.0.1:${workspacePort}/health`)).json()).ready,true);
 assert.equal((await fetch(`http://127.0.0.1:${config.frontPort}/api/runtime/status`)).status,200);
 const saved=JSON.parse(await fs.readFile(path.join(root,'.runtime/runtime-address.json')));assert.equal(saved.ports.workspacePort,workspacePort);assert.equal(saved.url,`http://127.0.0.1:${config.frontPort}/`);
 manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.config.workspacePort,workspacePort);
});

test('maintenance drains atomically, blocks restart and releases all gates on failure',async t=>{
 const {root,manager,config}=await fixture(t);const before=manager.state().services;
 await fs.writeFile(path.join(root,'builder.busy'),'busy');
 await assert.rejects(manager.prepareMaintenance(),{code:'RUNTIME_BUSY'});
 assert.equal(manager.maintenance,false);assert.deepEqual(manager.state().services,before);
 assert.equal((await fetch(`http://127.0.0.1:${config.agentPort}/mutate`,{method:'POST'})).status,200);
 await fs.unlink(path.join(root,'builder.busy'));const undo=await manager.prepareMaintenance();
 assert.equal(manager.state().busy,true);assert.equal(manager.state().canRestart,false);
 assert.throws(()=>manager.restart(),{code:'KERNEL_BUSY'});
 assert.equal((await fetch(`http://127.0.0.1:${config.agentPort}/mutate`,{method:'POST'})).status,503);
 await undo();assert.equal(manager.state().canRestart,true);
 assert.equal((await fetch(`http://127.0.0.1:${config.agentPort}/mutate`,{method:'POST'})).status,200);
});
test('standalone kernel control works without an application frontend or Git',async t=>{
 const {config,manager}=await fixture(t,{gateway:true});await manager.stopChild('front');
 const response=await fetch(`http://127.0.0.1:${config.frontPort}/__saplingagent/kernel`);
 assert.equal(response.status,200);assert.match(await response.text(),/Upgrade kernel & restart/);
 const unauthorized=await fetch(`http://127.0.0.1:${config.frontPort}/api/runtime/kernel/check`,{method:'POST',body:'{}'});
 assert.equal(unauthorized.status,401);
});

test('status reads project metadata without initializing it and lists effective built-in and worker ports', async t => {
 const {root,manager,config,request}=await fixture(t,{gateway:true});
 const first=await (await request('/api/runtime/status')).json();
 assert.equal(first.projectName,path.basename(root));assert.equal(first.kernelVersion,null);assert.equal(first.canStop,true);
 await assert.rejects(fs.access(path.join(root,'config/project.json')),{code:'ENOENT'});
 await fs.writeFile(path.join(root,'config/project.json'),JSON.stringify({name:'A <sample> project',privateField:'never-return-this'}));
 await fs.mkdir(path.join(root,'kernel'));await fs.writeFile(path.join(root,'kernel/manifest.json'),JSON.stringify({version:'0.9.5',files:[]}));
 const current=await (await request('/api/runtime/status')).json();
 assert.equal(current.projectName,'A <sample> project');assert.equal(current.kernelVersion,'0.9.5');assert.equal(current.url,`http://127.0.0.1:${config.frontPort}/`);
 assert.equal(current.services.find(x=>x.name==='front').port,config.vitePort);assert.equal(current.services.find(x=>x.name==='agent').port,config.agentPort);
 assert.ok(!JSON.stringify(current).includes('never-return-this'));
 await fs.writeFile(path.join(root,'worker.mjs'),'setInterval(()=>{},1000)');
 await manifest(root,[{name:'worker',file:'worker.mjs',healthCheck:'process'}]);manager.restart();await manager.operation;
 const worker=(await (await request('/api/runtime/status')).json()).services.find(x=>x.name==='worker');
 assert.equal(worker.healthCheck,'process');assert.equal(worker.port,undefined);assert.equal(worker.running,true);assert.ok(worker.pid>0);
 const page=await (await fetch(`http://127.0.0.1:${config.frontPort}/__saplingagent/runtime`)).text();
 assert.match(page,/Assigned port/);assert.match(page,/Closing this browser tab does not stop/);assert.match(page,/Stop app/);assert.match(page,/Open logs/);
});

test('confirmed stop waits for owned exits and preserves foreign listeners', async t => {
 let callback=0;
 const {root,manager,request}=await fixture(t,{gateway:true,onMaintenance:()=>{callback++;assert.equal(manager.children.size,0)}});
 const pids=manager.state().services.map(x=>x.pid);
 const foreign=net.createServer();await new Promise(resolve=>foreign.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>foreign.close(resolve)));
 const body={instanceId:manager.instanceId}, headers={Authorization:'Bearer fixture-token'};
 await fs.writeFile(path.join(root,'agent.busy'),'1');
 assert.equal((await request('/api/runtime/stop-and-wait',headers,'POST',body)).status,409);assert.equal(callback,0);
 for(const pid of pids)assert.doesNotThrow(()=>process.kill(pid,0));
 await fs.unlink(path.join(root,'agent.busy'));
 assert.equal((await request('/api/runtime/stop-and-wait',headers,'POST',{instanceId:'other-instance'})).status,409);
 const response=await request('/api/runtime/stop-and-wait',headers,'POST',body);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{stopped:true,instanceId:manager.instanceId});
 for(const pid of pids)assert.throws(()=>process.kill(pid,0));assert.equal(foreign.listening,true);assert.equal(manager.phase,'stopped');
 await until(()=>callback===1);
});

test('failed owned shutdown is not acknowledged and can be retried', async t => {
 let callback=0;
 const {manager,request}=await fixture(t,{onMaintenance:()=>{callback++}});
 const stop=manager.stopChild.bind(manager);let failed=false;
 manager.stopChild=async name=>{if(!failed){failed=true;throw Object.assign(new Error('private diagnostic'),{code:'SERVICE_STOP_FAILED'})}return stop(name)};
 const headers={Authorization:'Bearer fixture-token'},body={instanceId:manager.instanceId};
 const bad=await request('/api/runtime/stop-and-wait',headers,'POST',body);assert.equal(bad.status,503);
 assert.ok(!JSON.stringify(await bad.json()).includes('private diagnostic'));assert.equal(callback,0);assert.ok(manager.children.size>0);
 assert.equal((await(await request('/api/runtime/status')).json()).canStop,true);
 const good=await request('/api/runtime/stop-and-wait',headers,'POST',body);assert.equal(good.status,200);assert.equal((await good.json()).stopped,true);await until(()=>callback===1);
});

test('a disconnected stop client does not abandon owned shutdown or the owner callback', async t => {
 let callback=0;
 const {manager,config}=await fixture(t,{onMaintenance:()=>{callback++}});
 const stop=manager.stopChild.bind(manager);let held=false;
 manager.stopChild=async name=>{if(!held){held=true;await delay(200)}return stop(name)};
 const controller=new AbortController();
 const response=fetch(`http://127.0.0.1:${config.runtimeManagerPort}/api/runtime/stop-and-wait`,{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json'},body:JSON.stringify({instanceId:manager.instanceId}),signal:controller.signal});
 const aborted=assert.rejects(response,{name:'AbortError'});
 await until(()=>held);controller.abort();await aborted;await until(()=>callback===1);
 assert.equal(manager.phase,'stopped');assert.equal(manager.children.size,0);
});

test('legacy Dock stop retries a failed confirmed stop without closing recovery on another failure', async t => {
 let callback=0;
 const {manager,request}=await fixture(t,{onMaintenance:()=>{callback++;assert.equal(manager.children.size,0)}});
 const pids=manager.state().services.map(service=>service.pid),stop=manager.stopChild.bind(manager);let failures=0;
 manager.stopChild=async name=>{if(failures++<2)throw Object.assign(new Error('synthetic refusal'),{code:'SERVICE_STOP_FAILED'});return stop(name)};
 const headers={Authorization:'Bearer fixture-token'};
 assert.equal((await request('/api/runtime/stop-and-wait',headers,'POST',{instanceId:manager.instanceId})).status,503);
 assert.equal(manager.closed,true);assert.equal(manager.closing,null);
 assert.equal((await request('/api/runtime/stop',headers,'POST')).status,503);assert.equal(callback,0);
 const failedStatus=await (await request('/api/runtime/status')).json();assert.equal(failedStatus.phase,'failed');assert.equal(failedStatus.canStop,true);
 for(const pid of pids)assert.doesNotThrow(()=>process.kill(pid,0));
 const success=await request('/api/runtime/stop',headers,'POST');assert.equal(success.status,202);assert.deepEqual(await success.json(),{stopping:true});
 for(const pid of pids)assert.throws(()=>process.kill(pid,0));assert.equal(manager.children.size,0);
 await until(()=>callback===1);
});

test('new controls enforce instance-only input, local auth and fixed logs destination; legacy stop remains202', async t => {
 let opened=null,callback=0;
 const {root,manager,request,config}=await fixture(t,{gateway:true,onMaintenance:()=>{callback++},openLogs:async directory=>{opened=directory;return{requested:true}}});
 const body={instanceId:manager.instanceId},headers={Authorization:'Bearer fixture-token'};
 assert.equal((await request('/api/runtime/restart',headers,'POST',{scope:'all',instanceId:'previous-project'})).status,409);
 for(const endpoint of ['stop-and-wait','open-logs']) {
   assert.equal((await request(`/api/runtime/${endpoint}`,{},'POST',body)).status,401);
   assert.equal((await request(`/api/runtime/${endpoint}`,{Origin:'https://example.invalid'},'POST',body)).status,403);
   for(const invalid of [{...body,path:'elsewhere'},{...body,command:'anything'},null])assert.equal((await request(`/api/runtime/${endpoint}`,headers,'POST',invalid)).status,400);
   assert.equal((await request(`/api/runtime/${endpoint}?path=elsewhere`,headers,'POST',body)).status,400);
 }
 const openedResponse=await fetch(`http://127.0.0.1:${config.frontPort}/api/runtime/open-logs`,{method:'POST',headers:{Origin:`http://127.0.0.1:${config.frontPort}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal(openedResponse.status,200);assert.deepEqual(await openedResponse.json(),{requested:true});assert.equal(opened,root);
 const response=await request('/api/runtime/stop',headers,'POST');assert.equal(response.status,202);assert.deepEqual(await response.json(),{stopping:true});await until(()=>callback===1);
});


test('external-only MCP mode starts healthy services without built-in model authentication', async t=>{
 const {root,manager}=await fixture(t);
 await fs.writeFile(path.join(root,'agent.not-ready'),'no model account');
 manager.restart();await manager.operation;assert.equal(manager.phase,'failed');
 await fs.writeFile(path.join(root,'config/mcp-access.json'),JSON.stringify({schemaVersion:1,revision:1,enabled:true,externalOnly:true}));
 manager.restart();await manager.operation;assert.equal(manager.phase,'ready');assert.equal(manager.state().aiConnection,'external-mcp');
 assert.equal(manager.state().services.find(s=>s.name==='agent').running,true);
 await fs.writeFile(path.join(root,'config/mcp-access.json'),JSON.stringify({schemaVersion:1,revision:2,enabled:true,externalOnly:false}));
 manager.restart();await manager.operation;assert.equal(manager.phase,'failed');
});

test('invalid MCP settings preserve current services and do not silently skip model readiness', async t=>{
 const {root,manager}=await fixture(t);const before=manager.state();
 await fs.writeFile(path.join(root,'config/mcp-access.json'),'{bad');
 manager.restart();await manager.operation;assert.equal(manager.phase,'failed');assert.equal(manager.error.code,'INVALID_MCP_CONFIG');
 assert.deepEqual(manager.state().services,before.services);
});
