import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createConfigurationServer } from '../server.mjs';
const source=fileURLToPath(new URL('../../../../',import.meta.url));
const profile={label:'Synthetic AI settings',engine:'opencode',kind:'api',protocol:'chat',baseUrl:'https://provider.example/v1',model:'synthetic-model',apiKey:'synthetic-only-key'};
const credentials={tokens:{id_token:'synthetic-id',access_token:'synthetic-access',refresh_token:'synthetic-refresh'}};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(t,{prepare,finish,beforeClose,mode='ai'}={}){
 const cache=path.join(source,'.cache/ai-only-config-tests');await fs.mkdir(cache,{recursive:true});const root=await fs.mkdtemp(path.join(cache,'app-'));
 const calls=[],clients=[];let prepared=false;
 await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/project.json'),'preserve-existing-identity');await fs.writeFile(path.join(root,'Existing.app'),'preserve-existing-launcher');
 const controller={root,configurationMode:mode,configurationHost:'external',busy:false,
  async state(){calls.push('state');if(mode==='ai')throw Error('AI settings must not initialize identity');return {settingsSaved:false};},
  async prepareAIChange(){calls.push('prepare');if(prepare)await prepare();prepared=true;},
  async prepareAIFinish(){calls.push('finish');if(finish)await finish();return {restartAfterClose:'runtime'};},
  async invalidateSetup(){throw Error('AI settings must not invalidate launcher setup');},
  async cancel(){calls.push('cancel');},
 };
 for(const method of ['stageSetup','finalizeSetup','build','openProject','restart','stop','reveal'])controller[method]=async()=>{throw Error('Forbidden project mutation '+method);};
 class FakeClient extends EventEmitter{
  constructor(options){super();assert.equal(prepared,true);this.options=options;clients.push(this);calls.push('client');}
  send(){} async close(){this.closed=true;calls.push('auth-close');}
  async call(method,p){if(method==='account/login/start')return {loginId:'synthetic-login',authUrl:'https://auth.openai.com/synthetic',verificationUrl:'https://auth.openai.com/device',userCode:'SYNTHETIC'};return {};}
 }
 const server=createConfigurationServer({root,configurationMode:mode,projectController:controller,token:'synthetic-config-token',authOptions:{Client:FakeClient,command:'synthetic'},beforeClose:async()=>{calls.push('handback');await beforeClose?.();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const headers={Origin:base,'Content-Type':'application/json','X-Sapling-Config':'synthetic-config-token'};
 const post=(route,body={})=>fetch(base+'/api/config/'+route,{method:'POST',headers,body:JSON.stringify(body)});
 const get=route=>fetch(base+'/api/config/'+route,{headers});
 t.after(async()=>{await server.shutdown();await fs.rm(root,{recursive:true,force:true});});
 const preserved=async()=>{assert.equal(await fs.readFile(path.join(root,'config/project.json'),'utf8'),'preserve-existing-identity');assert.equal(await fs.readFile(path.join(root,'Existing.app'),'utf8'),'preserve-existing-launcher');assert.equal(calls.includes('state'),false);};
 return {root,base,controller,server,calls,clients,post,get,preserved};
}

test('AI-only state, health, save, activate and close never initialize or rebuild project identity',async t=>{
 const f=await fixture(t);const state=await(await f.get('state')).json();assert.equal(state.configurationMode,'ai');assert.deepEqual(state.profiles,[]);
 assert.equal((await(await fetch(f.base+'/health/project-launcher')).json()).configurationMode,'ai');assert.equal((await(await f.get('project')).json()).configurationMode,'ai');
 const response=await f.post('profiles',profile);assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.configurationMode,'ai');assert.equal(saved.profiles[0].hasKey,true);assert.doesNotMatch(JSON.stringify(saved),/synthetic-only-key/);
 const activated=await f.post('activate',{id:saved.activeId,revision:saved.revision});assert.equal(activated.status,200);assert.equal((await activated.json()).configurationMode,'ai');
 await f.preserved();const closed=await f.post('close');assert.equal(closed.status,200);assert.deepEqual(await closed.json(),{closed:true,handoff:true});
 assert.deepEqual(f.calls,['prepare','prepare','finish','handback']);await f.preserved();
});

test('AI-only imports and repeat Codex sign-in use the prepared account writer without project setup',async t=>{
 const f=await fixture(t);const imported=await f.post('credentials/import',{engine:'codex',source:'upload',revision:0,json:JSON.stringify(credentials)});assert.equal(imported.status,200);assert.equal((await imported.json()).configurationMode,'ai');
 for(let i=0;i<2;i++){
  const login=await f.post('login',{mode:'chatgpt'});assert.equal(login.status,200);assert.equal((await login.json()).login.phase,'pending');
  assert.equal((await f.post('profiles',profile)).status,409);
  await f.server.accountSetup.completed({loginId:'synthetic-login',success:true},f.server.accountSetup.epoch);
  assert.equal(f.server.accountSetup.snapshot().phase,'completed');assert.equal(f.clients[i].closed,true);
 }
 assert.equal(f.clients.length,2);assert.equal((await(await f.get('state')).json()).activeId,'codex-account');await f.preserved();
});

test('AI-only rejects every forged project operation before accessing identity or stopping services',async t=>{
 const f=await fixture(t);
 for(const route of ['save','prepare','finalize','build','rename','open','restart','stop','reveal','unknown']){
  const response=await f.post('project/'+route,{name:'Changed',folderName:'Elsewhere'});assert.equal(response.status,409,route);assert.equal((await response.json()).error.code,'AI_CONFIGURATION_ONLY');
 }
 assert.deepEqual(f.calls,[]);await f.preserved();
});

test('failed AI preparation leaves schemes, credentials and MCP configuration untouched',async t=>{
 const f=await fixture(t,{prepare:async()=>{throw Object.assign(Error('Synthetic busy runtime'),{code:'PROJECT_BUSY',status:409});}});
 for(const [route,body] of [['profiles',profile],['activate',{id:'codex-account'}],['login',{mode:'chatgpt'}],['credentials/import',{engine:'codex',source:'upload',revision:0,json:JSON.stringify(credentials)}],['mcp',{enabled:true,externalOnly:true,revision:0}]]){
  const response=await f.post(route,body);assert.equal(response.status,409,route);assert.equal((await response.json()).error.code,'PROJECT_BUSY');
 }
 assert.equal(await fs.access(path.join(f.root,'local-secrets')).then(()=>true,()=>false),false);assert.equal(await fs.access(path.join(f.root,'config/mcp-access.json')).then(()=>true,()=>false),false);assert.equal(f.clients.length,0);await f.preserved();
});

test('AI operations reserve their slot before awaiting preparation and block close or a competing writer',async t=>{
 const entered=deferred(),release=deferred();const f=await fixture(t,{prepare:async()=>{entered.resolve();await release.promise;}});
 const saving=f.post('profiles',profile);await entered.promise;
 for(const route of ['profiles','login','credentials/import','models','login/cancel'])assert.equal((await f.post(route,profile)).status,409,route);
 assert.equal((await f.post('close')).status,409);assert.equal(await fs.access(path.join(f.root,'local-secrets')).then(()=>true,()=>false),false);
 release.resolve();assert.equal((await saving).status,200);assert.equal(f.calls.filter(c=>c==='prepare').length,1);await f.preserved();
});

test('direct shutdown waits for an existing configuration write before auth close and finish handback',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();const save=f.server.configStore.save.bind(f.server.configStore);
 f.server.configStore.save=async value=>{entered.resolve();await release.promise;const result=await save(value);f.calls.push('written');return result;};
 const saving=f.post('profiles',profile);await entered.promise;const stopping=f.server.shutdown();await new Promise(r=>setTimeout(r,15));assert.equal(f.calls.includes('finish'),false);
 release.resolve();await saving;await stopping;assert.ok(f.calls.indexOf('written')<f.calls.indexOf('finish'));assert.ok(f.calls.indexOf('finish')<f.calls.indexOf('handback'));await f.preserved();
});

test('AI model discovery remains read-only without pausing the application or changing saved profiles',async t=>{
 const f=await fixture(t);let requests=0;const provider=http.createServer((req,res)=>{requests++;assert.equal(f.calls.includes('prepare'),false);res.setHeader('Content-Type','application/json');res.end('{"data":[{"id":"synthetic-model"}]}');});
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>provider.close(r)));
 const response=await f.post('models',{...profile,baseUrl:`http://127.0.0.1:${provider.address().port}/v1`});assert.equal(response.status,200);assert.equal(requests,1);assert.deepEqual((await(await f.get('state')).json()).profiles,[]);await f.preserved();
});

test('AI close awaits owned authentication completion and exposes a failed finish for retry',async t=>{
 let failed=true;const f=await fixture(t,{finish:async()=>{if(failed)throw Object.assign(Error('Synthetic busy cleanup'),{code:'PROJECT_BUSY',status:409});}});
 const entered=deferred(),release=deferred();f.server.accountSetup.close=async()=>{entered.resolve();await release.promise;f.calls.push('auth-closed');};
 const closing=f.post('close');await entered.promise;assert.equal(f.calls.includes('finish'),false);release.resolve();assert.equal((await closing).status,409);assert.equal(f.calls.includes('handback'),false);
 failed=false;assert.equal((await f.post('close')).status,200);assert.ok(f.calls.indexOf('auth-closed')<f.calls.indexOf('finish'));await f.preserved();
});

test('omitted mode remains full setup and AI writes still require saved project settings',async t=>{
 const cache=path.join(source,'.cache/ai-only-config-tests');await fs.mkdir(cache,{recursive:true});const root=await fs.mkdtemp(path.join(cache,'setup-'));let reads=0;
 const projectController={root,busy:false,async state(){reads++;return {settingsSaved:false};},async cancel(){}};
 const server=createConfigurationServer({root,token:'synthetic',projectController});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await server.shutdown();await fs.rm(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;const response=await fetch(base+'/api/config/profiles',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Sapling-Config':'synthetic'},body:JSON.stringify(profile)});
 assert.equal(response.status,409);assert.equal((await response.json()).error.code,'PROJECT_SETTINGS_REQUIRED');assert.ok(reads>0);
 assert.throws(()=>createConfigurationServer({root,configurationMode:'ai',projectController}),e=>e.code==='CONFIGURATION_MODE_CONFLICT');
});
