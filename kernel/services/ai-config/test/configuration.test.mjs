import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { ConfigurationStore } from '../store.mjs';
import { AccountSetup } from '../auth.mjs';
import { createConfigurationServer } from '../server.mjs';
import { readConnections,readCredential,codexConnection,openCodeConnections,defaultSelection } from '../../../contracts/ai-configuration.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
async function fixture(t){const directory=path.join(root,'.cache/configuration-tests');await fs.mkdir(directory,{recursive:true});const target=await fs.mkdtemp(path.join(directory,"中文 app's "));t.after(()=>fs.rm(target,{recursive:true,force:true}));return target;}
const draft={label:'My endpoint',engine:'opencode',kind:'api',protocol:'chat',baseUrl:'https://provider.example/v1',model:'coder-model',apiKey:'synthetic-only-key'};
test('schemes persist private keys, retain blank edits, preserve ledger and switch default independently',async t=>{
 const target=await fixture(t);const store=new ConfigurationStore(target);
 await fs.mkdir(path.join(target,'local-secrets/notes'),{recursive:true});await fs.writeFile(path.join(target,'local-secrets/notes/project-secrets.json'),JSON.stringify({schema_version:1,credentials:[{id:'unrelated',custom:'retained'}],runtime:{unchanged:true}}));
 const first=await store.save(draft);const profile=first.profiles[0];assert.equal(profile.hasKey,true);assert.equal(first.activeId,profile.id);assert.doesNotMatch(JSON.stringify(first),/synthetic-only-key|"apiKey"/);
 const edited=await store.save({...draft,id:profile.id,apiKey:'',label:'New label',revision:first.revision});assert.equal(await readCredential(target,edited.profiles[0]),draft.apiKey);
 const second=await store.save({...draft,engine:'codex',protocol:'responses',label:'Responses',activate:false});assert.equal(second.activeId,profile.id);assert.equal(second.profiles.length,2);
 const selected=await store.activate({id:second.profiles[1].id,revision:second.revision});assert.equal(defaultSelection(await readConnections(target)).engine,'codex');
 const args=await codexConnection(target,await readConnections(target));assert.equal(args.env.SAPLING_CODEX_API_KEY,draft.apiKey);assert.doesNotMatch(JSON.stringify(args.args),/synthetic-only-key/);assert.match(args.args.join(' '),/wire_api="responses"/);
 const native=await openCodeConnections(target,await readConnections(target));assert.equal(native[`sapling-${profile.id}`].options.apiKey,draft.apiKey);assert.equal(native[`sapling-${profile.id}`].npm,'@ai-sdk/openai-compatible');
 const ledger=JSON.parse(await fs.readFile(path.join(target,'local-secrets/notes/project-secrets.json'),'utf8'));assert.equal(ledger.credentials[0].custom,'retained');assert.deepEqual(ledger.runtime,{unchanged:true});assert.doesNotMatch(JSON.stringify(ledger),/synthetic-only-key/);
 assert.equal(selected.revision,4);assert.equal((await fs.stat(path.join(target,'local-secrets/ai-config/connections.json'))).mode&0o777,0o600);
});
test('validation rejects wrong protocol/full endpoint/missing key and malformed or stale state is preserved',async t=>{
 const target=await fixture(t);const store=new ConfigurationStore(target);
 for(const change of [{engine:'codex'},{baseUrl:'file:///tmp/data'},{baseUrl:'https://user:pass@example.com/v1'},{baseUrl:'https://example.com/v1/responses'},{apiKey:''},{maxOutput:200000}])await assert.rejects(store.save({...draft,...change}));
 const state=await store.save({...draft,noAuth:true,apiKey:''});assert.equal(state.profiles[0].hasKey,false);await assert.rejects(store.activate({id:state.activeId,revision:0}),e=>e.code==='CONFIG_CHANGED');
 const file=path.join(target,'local-secrets/ai-config/connections.json');const damaged=await readConnections(target);damaged.profiles[0].baseUrl='file:///outside';const damagedText=JSON.stringify(damaged);await fs.writeFile(file,damagedText);await assert.rejects(readConnections(target));assert.equal(await fs.readFile(file,'utf8'),damagedText);await fs.writeFile(file,'{broken');await assert.rejects(store.save(draft));assert.equal(await fs.readFile(file,'utf8'),'{broken');
});
test('exclusive writers refuse concurrency without discarding a lock or changing the scheme',async t=>{
 const target=await fixture(t);const store=new ConfigurationStore(target);const initial=await store.save(draft);const lock=path.join(target,'local-secrets/ai-config/write.lock');await fs.writeFile(lock,'owned');
 await assert.rejects(store.activate({id:initial.activeId}),e=>e.code==='CONFIG_BUSY');assert.equal(await fs.readFile(lock,'utf8'),'owned');assert.equal((await store.state()).revision,initial.revision);
});
test('explicit model discovery contacts only /models, sends correct auth and never forwards redirects or error bodies',async t=>{
 const target=await fixture(t);const store=new ConfigurationStore(target);let requests=[];
 const upstream=http.createServer((req,res)=>{requests.push({url:req.url,key:req.headers.authorization});if(req.url.includes('redirect')){res.writeHead(302,{Location:'https://outside.example/'});res.end('synthetic-secret-body');}else if(req.url.includes('error')){res.writeHead(401);res.end('synthetic-secret-body');}else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'coder'},{id:55}]}));}});await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>upstream.close(resolve)));
 const base=`http://127.0.0.1:${upstream.address().port}`;assert.deepEqual(await store.models({...draft,baseUrl:base+'/v1'}),{models:[{id:'coder',name:'coder'}]});assert.deepEqual(requests,[{url:'/v1/models',key:'Bearer synthetic-only-key'}]);
 for(const p of ['redirect','error'])await assert.rejects(store.models({...draft,baseUrl:base+'/'+p}),e=>e.code==='PROVIDER_HTTP_ERROR'&&!e.message.includes('synthetic-secret-body'));
 assert.equal((await store.state()).profiles.length,0);
});
class FakeClient extends EventEmitter{
 constructor(options){super();this.options=options;FakeClient.last=this;this.methods=[];}
 send(){} async close(){this.closed=true;} async call(method,params){this.methods.push([method,params]);if(method==='account/login/start')return {type:params.type,loginId:'owned-login',authUrl:'https://auth.openai.com/synthetic',verificationUrl:'https://auth.openai.com/codex/device',userCode:'TEST-ONLY'};return {};}
}
test('official account flow matches login IDs, saves only completed auth and ignores late cancelled notifications',async t=>{
 const target=await fixture(t);const store=new ConfigurationStore(target);const setup=new AccountSetup(target,store,{Client:FakeClient,command:'fake-codex'});
 const login=await setup.begin('chatgptDeviceCode');assert.equal(login.userCode,'TEST-ONLY');assert.equal(login.phase,'pending');await setup.completed({loginId:'another',success:true},setup.epoch);assert.equal((await store.state()).profiles.length,0);
 await setup.cancel();await setup.completed({loginId:'owned-login',success:true},setup.epoch-1);assert.equal((await store.state()).profiles.length,0);
 await setup.begin('chatgpt');await fs.writeFile(path.join(target,'local-secrets/codex/auth.json'),JSON.stringify({tokens:{access_token:'synthetic-access',refresh_token:'synthetic-refresh'}}));
 await setup.completed({loginId:'owned-login',success:true},setup.epoch);assert.equal(setup.snapshot().phase,'completed');assert.equal((await store.state()).activeId,'codex-account');assert.equal(FakeClient.last.closed,true);assert.equal(FakeClient.last.options.env.CODEX_HOME,path.join(target,'local-secrets/codex'));
});
test('API rejects cross-site/tokenless writes, exposes no private files and closes only its own setup service',async t=>{
 const target=await fixture(t);const assets=path.join(target,'ui');await fs.mkdir(assets);await fs.writeFile(path.join(assets,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__">');let closed=false;
 const server=createConfigurationServer({root:target,assets,authOptions:{Client:FakeClient,command:'fake'},onClose:()=>closed=true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.shutdown());
 const url=`http://127.0.0.1:${server.address().port}`;const html=await fetch(url).then(r=>r.text());const token=html.match(/content="([a-f0-9]+)"/)[1];
 assert.equal((await fetch(url+'/api/config/state')).status,401);assert.equal((await fetch(url+'/local-secrets/codex/auth.json')).status,404);
 const headers={'Content-Type':'application/json','X-Sapling-Config':token,Origin:'https://outside.example'};assert.equal((await fetch(url+'/api/config/profiles',{method:'POST',headers,body:JSON.stringify(draft)})).status,403);
 headers.Origin=url;const preparation=await fetch(url+'/api/config/project/prepare',{method:'POST',headers,body:JSON.stringify({name:'HTTP fixture',folderName:path.basename(target),renameFolder:false})});assert.equal(preparation.status,200);
 const response=await fetch(url+'/api/config/profiles',{method:'POST',headers,body:JSON.stringify(draft)});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/synthetic-only-key/);
 const summary=await fetch(url+'/api/config/state',{headers:{'X-Sapling-Config':token}}).then(r=>r.json());assert.equal(summary.profiles[0].hasKey,true);
 await fetch(url+'/api/config/close',{method:'POST',headers,body:'{}'});await new Promise(resolve=>setTimeout(resolve,25));assert.equal(closed,true);
});
test('cancelling startup before storage initialization prevents a late login process',async t=>{
 const target=await fixture(t);let constructions=0;class Client extends FakeClient{constructor(o){super(o);constructions++;}}
 const setup=new AccountSetup(target,new ConfigurationStore(target),{Client,command:'fake'});const starting=setup.begin('chatgpt');await setup.cancel();await assert.rejects(starting,e=>e.code==='LOGIN_CANCELLED');assert.equal(constructions,0);assert.equal(setup.snapshot().phase,'cancelled');
});
test('a failed old login cannot clear a newer login while its child finishes closing',async t=>{
 const target=await fixture(t);const setup=new AccountSetup(target,new ConfigurationStore(target),{Client:FakeClient,command:'fake'});await setup.begin('chatgpt');const old=setup.client;let release;old.close=()=>new Promise(resolve=>release=resolve);
 const failure=setup.completed({loginId:'owned-login',success:false},setup.epoch);await setup.begin('chatgptDeviceCode');const current=setup.client;release();await failure;assert.equal(setup.client,current);assert.equal(setup.snapshot().phase,'pending');await setup.close();
});
test('completion received before login-start response still selects only saved official account credentials',async t=>{
 const target=await fixture(t);class EarlyClient extends FakeClient{async call(method,params){if(method==='account/login/start'){await fs.writeFile(path.join(target,'local-secrets/codex/auth.json'),JSON.stringify({tokens:{access_token:'synthetic',refresh_token:'synthetic'}}));this.emit('notification',{method:'account/login/completed',params:{loginId:'owned-login',success:true}});}return super.call(method,params);}}
 const setup=new AccountSetup(target,new ConfigurationStore(target),{Client:EarlyClient,command:'fake'});const login=await setup.begin('chatgpt');assert.equal(login.phase,'completed');assert.equal((await new ConfigurationStore(target).state()).activeId,'codex-account');await setup.close();
});

test('Claude API profile discovers Anthropic models with private headers, retains blank keys and rejects account/protocol mismatches',async t=>{
 const target=await fixture(t),store=new ConfigurationStore(target);const upstream=http.createServer((req,res)=>{assert.equal(req.url,'/v1/models');assert.equal(req.headers['x-api-key'],'synthetic-only-key');assert.equal(req.headers['anthropic-version'],'2023-06-01');res.setHeader('Content-Type','application/json');res.end('{"data":[{"id":"synthetic-claude","display_name":"Synthetic Claude"}]}');});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>upstream.close(r)));
 const input={...draft,engine:'claude',protocol:'anthropic',model:'synthetic-claude',baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`};const state=await store.save(input);const updated=await store.save({...input,id:state.activeId,revision:state.revision,apiKey:''});assert.equal(updated.profiles[0].hasKey,true);assert.doesNotMatch(JSON.stringify(updated),/synthetic-only-key/);const models=await store.models({...input,id:state.activeId,apiKey:''});assert.equal(models.models[0].id,'synthetic-claude');await assert.rejects(store.save({...input,protocol:'responses'}));await assert.rejects(store.save({engine:'claude',kind:'chatgpt',label:'Invalid'}));
});
