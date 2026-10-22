import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createConfigurationServer} from '../server.mjs';
import {ConfigurationController} from '../../../configuration/controller.mjs';
import {saveSession} from '../../../configuration/session.mjs';
import {moduleClosure} from '../../../configuration/bundle.mjs';
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const profile={label:'Synthetic local provider',engine:'opencode',kind:'api',protocol:'chat',baseUrl:'https://provider.example/v1',model:'synthetic-model',noAuth:true};
const enabled={revision:0,enabled:true,externalOnly:true};
async function fixture(t){
  const parent=path.join(repo,'.cache/mcp-configuration-tests');await fs.mkdir(parent,{recursive:true});
  const holder=await fs.mkdtemp(path.join(parent,'flow-')),root=path.join(holder,'Before'),directory=path.join(holder,'sapling-config-fixture');
  await fs.mkdir(root);await fs.mkdir(directory);
  const session={schemaVersion:1,id:randomUUID(),nonce:'a'.repeat(64),root,directory,pid:process.pid,projectId:null,bootstrapPids:[]};await saveSession(session);
  const device=process.platform==='win32'?'windows':'macos';
  await fs.mkdir(path.join(root,'kernel/config'),{recursive:true});await fs.writeFile(path.join(root,`kernel/config/${device}.json`),JSON.stringify({nodeVersion:'24.21.0'}));
  const assets=path.join(directory,'ui');await fs.mkdir(assets);await fs.writeFile(path.join(assets,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__">');
  let server,compiled=0;
  const controller=new ConfigurationController(root,{session,closeNative:async()=>{},onRelocate:async value=>server.relocate(value),compiler:async(current,project)=>{
    compiled++;const receipt={artifact:project.name+'.app'};await fs.mkdir(path.join(current,receipt.artifact),{recursive:true});await fs.writeFile(path.join(current,'.runtime/launcher.json'),JSON.stringify(receipt));return receipt;
  }});
  server=createConfigurationServer({root,assets,projectController:controller,instanceId:session.id});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await server.shutdown();await fs.rm(holder,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`,token=(await fetch(base).then(r=>r.text())).match(/content="([a-f0-9]+)"/)[1];
  const headers={Origin:base,'Content-Type':'application/json','X-Sapling-Config':token};
  const post=(route,body={})=>fetch(base+'/api/config/'+route,{method:'POST',headers,body:JSON.stringify(body)});
  const get=route=>fetch(base+'/api/config/'+route,{headers:{'X-Sapling-Config':token}});
  const save=()=>post('project/save',{name:'Before',renameFolder:false});
  return {root,holder,server,controller,base,headers,post,get,save,get compiled(){return compiled;}};
}

test('MCP access reads are authenticated, read-only, and writes require saved project settings',async t=>{
  const f=await fixture(t),url=f.base+'/api/config/mcp';
  assert.equal((await fetch(url)).status,401);
  assert.equal((await fetch(url,{headers:{...f.headers,Origin:'https://foreign.example'}})).status,403);
  assert.equal((await fetch(url,{headers:{...f.headers,'Sec-Fetch-Site':'cross-site'}})).status,403);
  const state=await (await f.get('mcp')).json();assert.equal(state.enabled,false);assert.equal(state.revision,0);assert.equal(state.transport,'stdio');assert.equal(state.permissionMode,'full-access');
  assert.equal(state.available,false);assert.ok(state.warnings.every(w=>typeof w.code==='string'&&typeof w.message==='string'));
  assert.equal(await fs.access(path.join(f.root,'config/mcp-access.json')).then(()=>true,()=>false),false);
  const denied=await f.post('mcp',enabled);assert.equal(denied.status,409);assert.equal((await denied.json()).error.code,'PROJECT_SETTINGS_REQUIRED');
  assert.equal(await fs.access(path.join(f.root,'local-secrets')).then(()=>true,()=>false),false);
});

test('external-only MCP completes configuration and rebuild without a model profile or credentials',async t=>{
  const f=await fixture(t);assert.equal((await f.save()).status,200);
  const response=await f.post('mcp',enabled);assert.equal(response.status,200);const saved=await response.json();
  assert.equal(saved.revision,1);assert.equal(saved.externalOnly,true);assert.equal(saved.transport,'stdio');
  const state=await (await f.get('state')).json();assert.equal(state.activeId,null);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.mcp,{revision:1,enabled:true,externalOnly:true,available:false});
  assert.equal((await f.post('project/finalize')).status,202);await f.controller.completion;assert.equal(f.controller.job.phase,'completed');assert.equal(await f.controller.exportReady(),true);assert.equal(f.compiled,1);
  assert.equal((await f.post('project/build')).status,202);await f.controller.completion;assert.equal(f.compiled,2);
  for(const relative of ['local-secrets/ai-config/connections.json','local-secrets/codex/auth.json'])assert.equal(await fs.access(path.join(f.root,relative)).then(()=>true,()=>false),false);
  assert.doesNotMatch(JSON.stringify(saved),/"(?:apiKey|token|auth)"/);
});

test('MCP revisions and provider profiles remain independent; explicit disable invalidates completed setup',async t=>{
  const f=await fixture(t);await f.save();await f.post('mcp',enabled);
  const provider=await (await f.post('profiles',profile)).json();assert.ok(provider.activeId);assert.equal(provider.revision,1);assert.equal(provider.mcp.externalOnly,true);
  await f.post('project/finalize');await f.controller.completion;assert.equal(await f.controller.exportReady(),true);
  const before=await fs.readFile(path.join(f.root,'config/mcp-access.json'),'utf8');
  const stale=await f.post('mcp',{revision:0,enabled:false,externalOnly:false});assert.equal(stale.status,409);assert.equal((await stale.json()).error.code,'CONFIG_CHANGED');
  assert.equal(await fs.readFile(path.join(f.root,'config/mcp-access.json'),'utf8'),before);assert.equal(await f.controller.exportReady(),true);
  assert.equal((await f.post('mcp',{revision:1,enabled:false,externalOnly:false})).status,200);assert.equal(await f.controller.exportReady(),false);
  const state=await (await f.get('state')).json();assert.equal(state.activeId,provider.activeId);assert.equal(state.revision,1);assert.equal(state.mcp.revision,2);
  assert.equal((await f.post('project/finalize')).status,202);await f.controller.completion;assert.equal(await f.controller.exportReady(),true);
});

test('MCP schema, request budgets and missing external-only selection do not bypass model readiness',async t=>{
  const f=await fixture(t);await f.save();
  for(const value of [{enabled:true,externalOnly:true},{...enabled,externalOnly:'true'},{...enabled,enabled:false},{...enabled,command:'/arbitrary/command'}]){
    const r=await f.post('mcp',value);assert.equal(r.status,400);assert.equal((await r.json()).error.code,'INVALID_CONFIG');
  }
  const large=await f.post('mcp',{...enabled,extra:'x'.repeat(65536)});assert.equal(large.status,413);
  assert.equal((await f.post('mcp',{...enabled,externalOnly:false})).status,200);
  for(const route of ['project/finalize','project/build']){const r=await f.post(route);assert.equal(r.status,409);assert.equal((await r.json()).error.code,'AI_NOT_CONFIGURED');}
  assert.equal(f.compiled,0);
});

test('in-flight MCP save reserves setup against directory changes, export and close',async t=>{
  const f=await fixture(t);await f.save();const entered=deferred(),release=deferred(),invalidate=f.controller.invalidateSetup.bind(f.controller);
  f.controller.invalidateSetup=async()=>{entered.resolve();await release.promise;return invalidate();};
  const saving=f.post('mcp',enabled);await entered.promise;
  try{for(const route of ['project/save','project/finalize','project/build','close'])assert.equal((await f.post(route)).status,409,route);}
  finally{release.resolve();}
  assert.equal((await saving).status,200);assert.equal((await f.post('project/finalize')).status,202);await f.controller.completion;
});

test('pending OAuth and credential imports refuse MCP changes without modifying access',async t=>{
  const f=await fixture(t);await f.save();f.server.accountSetup.login={phase:'pending'};
  let r=await f.post('mcp',enabled);assert.equal(r.status,409);assert.equal((await r.json()).error.code,'LOGIN_BUSY');f.server.accountSetup.login={phase:'idle'};
  const entered=deferred(),release=deferred(),write=f.server.configStore.write.bind(f.server.configStore);
  f.server.configStore.write=async(...args)=>{entered.resolve();await release.promise;return write(...args);};
  const importing=f.post('credentials/import',{engine:'codex',source:'upload',revision:0,json:JSON.stringify({tokens:{id_token:'synthetic-id',access_token:'synthetic-access',refresh_token:'synthetic-refresh'}})});
  await entered.promise;
  try{r=await f.post('mcp',enabled);assert.equal(r.status,409);assert.equal((await r.json()).error.code,'IMPORT_BUSY');}
  finally{release.resolve();}
  assert.equal((await importing).status,200);assert.equal((await (await f.get('mcp')).json()).revision,0);
});

test('MCP export follows the final renamed root and later writes never recreate the old directory',{skip:process.platform!=='darwin'},async t=>{
  const f=await fixture(t),target=path.join(f.holder,'After 中文');
  assert.equal((await f.post('project/save',{name:'After 中文',folderName:'After 中文',renameFolder:true})).status,200);await f.post('mcp',enabled);
  const before=await (await f.get('mcp')).json();assert.ok(before.configuration.mcpServers.saplingagent.command.startsWith(f.root+path.sep));
  assert.equal((await f.post('project/finalize')).status,202);await f.controller.completion;assert.equal(f.controller.job.phase,'completed',JSON.stringify(f.controller.job.error));
  const after=await (await f.get('mcp')).json();assert.equal(f.controller.root,target);assert.ok(after.configuration.mcpServers.saplingagent.command.startsWith(target+path.sep));assert.deepEqual(after.configuration.mcpServers.saplingagent.args,[path.join(target,'kernel/services/mcp-access/server.mjs')]);
  assert.equal((await f.post('mcp',{revision:1,enabled:true,externalOnly:false})).status,200);assert.equal((await (await f.get('state')).json()).mcp.externalOnly,false);
  assert.equal(await fs.access(f.root).then(()=>true,()=>false),false);assert.equal(JSON.parse(await fs.readFile(path.join(target,'config/mcp-access.json'))).revision,2);
  assert.doesNotMatch(await fs.readFile(path.join(target,'config/mcp-access.json'),'utf8'),/Before|After|command|args/);
});

test('configuration capsule closes over only kernel builtin modules and excludes MCP protocol runtime',async()=>{
  const modules=await moduleClosure(repo);assert.ok(modules.has('kernel/contracts/mcp-access.mjs'));assert.equal(modules.has('kernel/services/mcp-access/server.mjs'),false);
  for(const name of modules.keys())assert.ok(name.startsWith('kernel/'));
});
