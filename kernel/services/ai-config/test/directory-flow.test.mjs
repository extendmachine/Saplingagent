import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConfigurationServer} from '../server.mjs';
import {ProjectLauncher} from '../../../launcher/public.mjs';
const source=fileURLToPath(new URL('../../../../',import.meta.url));
const profile={label:'Synthetic endpoint',engine:'opencode',kind:'api',protocol:'chat',baseUrl:'https://provider.example/v1',model:'synthetic-model',apiKey:'synthetic-only-key'};
const credentials={tokens:{id_token:'synthetic-id',access_token:'synthetic-access',refresh_token:'synthetic-refresh'}};
const settings={name:'After',folderName:'After',renameFolder:true};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(t,{stage,state,finalize,beforeClose,real=false}={}){
 const parent=path.join(source,'.cache/setup-directory-tests');await fs.mkdir(parent,{recursive:true});
 const holder=await fs.mkdtemp(path.join(parent,'flow-')),root=path.join(holder,'Before');await fs.mkdir(root);
 t.after(()=>fs.rm(holder,{recursive:true,force:true}));
 const assets=path.join(root,'kernel/.cache/setup');await fs.mkdir(assets,{recursive:true});await fs.writeFile(path.join(assets,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__">');
 const controller=real?new ProjectLauncher(root):{root,busy:false,saved:false,ready:false,stageCalls:0,finalizeCalls:0,invalidations:0,
  async state(){return state?state.call(this):{root:this.root,settingsSaved:this.saved,exportReady:this.ready,finalization:this.finalization};},
  async stageSetup(input){this.stageCalls++;if(stage)return stage.call(this,input);this.saved=true;this.ready=false;return {name:input.name,folderName:input.folderName};},
  async invalidateSetup(){this.invalidations++;this.ready=false;},
  async finalizeSetup(input){this.finalizeCalls++;if(finalize)return finalize.call(this,input);throw Error('Unexpected finalization');},async cancel(){},
 };
 const server=createConfigurationServer({root,assets,projectController:controller,instanceId:'synthetic-management',beforeClose});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.shutdown());
 const base=`http://127.0.0.1:${server.address().port}`,html=await fetch(base).then(r=>r.text()),token=html.match(/content="([a-f0-9]+)"/)[1];
 const headers={Origin:base,'Content-Type':'application/json','X-Sapling-Config':token};
 const post=(route,body={})=>fetch(base+'/api/config/'+route,{method:'POST',headers,body:JSON.stringify(body)});
 const get=route=>fetch(base+'/api/config/'+route,{headers:{'X-Sapling-Config':token}});
 return {root,holder,controller,server,base,post,get};
}
test('AI writes require saved settings; export requires a separately verified restart',async t=>{
 const f=await fixture(t);
 for(const [route,body] of [['profiles',profile],['activate',{id:'missing'}],['login',{mode:'chatgpt'}],['models',profile],['credentials/import',{engine:'codex',source:'upload',revision:0,json:JSON.stringify(credentials)}]]){
  const r=await f.post(route,body);assert.equal(r.status,409,route);assert.equal((await r.json()).error.code,'PROJECT_SETTINGS_REQUIRED');
 }
 assert.equal((await (await f.post('project/build')).json()).error.code,'PROJECT_RESTART_REQUIRED');
 assert.equal(await fs.access(path.join(f.root,'local-secrets')).then(()=>true,()=>false),false);
});
test('real settings save keeps the physical directory while AI credentials persist at the current root',async t=>{
 const f=await fixture(t,{real:true});const r=await f.post('project/save',settings);assert.equal(r.status,200);const saved=await r.json();
 assert.equal(saved.root,f.root);assert.equal(saved.renamed,false);assert.equal(saved.project.name,'After');
 const state=await (await f.get('project')).json();assert.equal(state.settingsSaved,true);assert.equal(state.exportReady,false);
 assert.equal((await f.post('profiles',profile)).status,200);assert.equal(await fs.access(path.join(f.root,'local-secrets/ai-config/connections.json')).then(()=>true,()=>false),true);
 assert.equal(await fs.access(path.join(f.holder,'After')).then(()=>true,()=>false),false);assert.equal((await f.post('project/build')).status,409);assert.equal((await f.post('close')).status,200);
});
test('compatibility prepare stages only; live immediate rename is rejected',async t=>{
 const f=await fixture(t);assert.equal((await f.post('project/prepare',settings)).status,200);assert.equal(f.controller.stageCalls,1);
 const r=await f.post('project/rename',{folderName:'After'});assert.equal(r.status,409);assert.equal((await r.json()).error.code,'PROJECT_FINALIZATION_REQUIRED');assert.equal(await fs.access(f.root).then(()=>true,()=>false),true);
});
test('settings staging awaits auth closure and serializes other mutations',async t=>{
 const entered=deferred(),release=deferred();let closed=false;
 const f=await fixture(t,{async stage(input){assert.equal(closed,true);entered.resolve();await release.promise;this.saved=true;return input;}});f.server.accountSetup.close=async()=>{closed=true;};
 const saving=f.post('project/save',settings);await entered.promise;
 for(const route of ['profiles','credentials/import','login','project/save','project/finalize','close'])assert.equal((await f.post(route,profile)).status,409,route);
 assert.equal((await f.get('state')).status,409);release.resolve();assert.equal((await saving).status,200);assert.equal(f.controller.root,f.root);
});
test('an in-progress AI write prevents concurrent settings staging and finalization',async t=>{
 const entered=deferred(),release=deferred();let block=false,reads=0;
 const f=await fixture(t,{async state(){if(block&&++reads===2){entered.resolve();await release.promise;}return {root:this.root,settingsSaved:true};}});
 block=true;const saving=f.post('profiles',profile);await entered.promise;
 for(const route of ['project/save','project/finalize'])assert.equal((await f.post(route,settings)).status,409);
 assert.equal(f.controller.stageCalls,0);release.resolve();assert.equal((await saving).status,200);
});
test('settings staging waits for cancelled native login closure',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();f.controller.saved=true;
 const setup=f.server.accountSetup;setup.login={phase:'pending'};setup.loginId='synthetic-login';setup.client={async call(){},async close(){entered.resolve();await release.promise;}};
 const cancelling=f.post('login/cancel');await entered.promise;assert.equal((await f.post('project/save',settings)).status,409);assert.equal(f.controller.stageCalls,0);
 release.resolve();assert.equal((await cancelling).status,200);assert.equal((await f.post('project/save',settings)).status,200);
});
for(const success of [false,true])test(`settings staging awaits native closure after ${success?'successful':'failed'} asynchronous login completion`,async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred(),setup=f.server.accountSetup;f.controller.saved=true;setup.login={phase:'pending'};setup.loginId='synthetic-login';setup.client={async close(){entered.resolve();await release.promise;}};
 if(success){await fs.mkdir(path.join(f.root,'local-secrets/codex'),{recursive:true});await fs.writeFile(path.join(f.root,'local-secrets/codex/auth.json'),JSON.stringify(credentials));}
 const completed=setup.completed({loginId:'synthetic-login',success},setup.epoch);await entered.promise;
 const closeEntered=deferred(),close=setup.close.bind(setup);setup.close=()=>{closeEntered.resolve();return close();};
 const saving=f.post('project/save',settings);await closeEntered.promise;assert.equal(f.controller.stageCalls,0);release.resolve();await completed;assert.equal((await saving).status,200);
 const revision=(await f.server.configStore.state()).revision;await setup.completed({loginId:'synthetic-login',success:true},setup.epoch-1);assert.equal((await f.server.configStore.state()).revision,revision);
});
test('finalization requires a selected scheme and rejects browser-supplied process parameters',async t=>{
 const f=await fixture(t);assert.equal((await f.post('project/finalize')).status,409);await f.post('project/save',settings);
 let r=await f.post('project/finalize');assert.equal(r.status,409);assert.equal((await r.json()).error.code,'AI_NOT_CONFIGURED');r=await f.post('project/finalize',{pid:1,command:'not-allowed'});assert.equal(r.status,400);assert.equal(f.controller.finalizeCalls,0);
});
test('accepted handoff derives server ownership, returns202 and closes without cancelling the helper',async t=>{
 const closed=deferred();let input,cancelled=0;
 const f=await fixture(t,{async finalize(options){input=options;return {id:'synthetic-finalize',phase:'restarting',targetRoot:path.join(this.root,'..','After'),privatePlan:'never-public'};}});
 f.controller.cancel=async()=>{cancelled++;};await f.post('project/save',settings);await f.post('profiles',profile);
 const original=f.server.shutdown;let shutdownPromise;f.server.shutdown=()=>shutdownPromise||=(async()=>{await original();closed.resolve();})();
 const r=await f.post('project/finalize');assert.equal(r.status,202);const body=await r.json();assert.equal(body.finalization.id,'synthetic-finalize');assert.equal(body.finalization.privatePlan,undefined);
 assert.deepEqual(input.management,{pid:process.pid,instanceId:'synthetic-management',port:Number(new URL(f.base).port)});await closed.promise;assert.equal(cancelled,0);
});
test('failed helper preflight leaves management available for correction',async t=>{
 const f=await fixture(t,{async finalize(){throw Object.assign(Error('Synthetic busy project'),{code:'PROJECT_BUSY',status:409});}});await f.post('project/save',settings);await f.post('profiles',profile);
 assert.equal((await f.post('project/finalize')).status,409);assert.equal((await f.get('project')).status,200);assert.equal(await fs.access(f.root).then(()=>true,()=>false),true);
});
test('AI mutations invalidate export readiness without exposing credentials',async t=>{
 const f=await fixture(t);await f.post('project/save',settings);f.controller.ready=true;assert.equal((await f.post('profiles',profile)).status,200);assert.equal(f.controller.ready,false);assert.equal(f.controller.invalidations,1);
 f.controller.ready=true;assert.equal((await f.post('credentials/import',{engine:'codex',source:'upload',revision:1,json:JSON.stringify(credentials)})).status,200);assert.equal(f.controller.ready,false);
 assert.doesNotMatch(JSON.stringify(await (await f.get('state')).json()),/synthetic-(?:id|access|refresh|only-key)/);
});
test('new management rejects mutations during resume and exposes only minimal unauthenticated status',async t=>{
 const f=await fixture(t);f.controller.saved=true;f.controller.finalization={id:'synthetic-finalize',phase:'restarting',privatePlan:'never-public'};
 for(const route of ['profiles','project/save','project/finalize','close'])assert.equal((await f.post(route,profile)).status,409,route);
 const health=await fetch(f.base+'/health/project-launcher').then(r=>r.json());assert.deepEqual(health.finalization,{id:'synthetic-finalize',phase:'restarting'});assert.equal(health.root,f.root);assert.equal(f.controller.stageCalls,0);assert.equal(f.controller.invalidations,0);
});

test('export reserves setup while the owned runtime stops and releases its reservation after failure',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();await f.post('project/save',settings);await f.post('profiles',profile);f.controller.ready=true;
 f.controller.build=async()=>{entered.resolve();await release.promise;throw Object.assign(Error('Synthetic stop blocked'),{status:409,code:'PROJECT_BUSY'});};
 const exporting=f.post('project/build');await entered.promise;
 for(const route of ['close','project/save','project/finalize','profiles'])assert.equal((await f.post(route,profile)).status,409,route);
 release.resolve();assert.equal((await exporting).status,409);assert.equal((await f.post('project/save',settings)).status,200);
});


test('external close reserves mutations until handoff and a failed handoff can be retried',async t=>{
 const entered=deferred(),release=deferred();let attempts=0;
 const f=await fixture(t,{async beforeClose(){attempts++;if(attempts===1){entered.resolve();await release.promise;throw Object.assign(Error('Synthetic return failure'),{code:'CONFIGURATION_RETURN_FAILED',status:409});}}});
 f.controller.configurationHost='external';f.controller.saved=true;
 const closing=f.post('close');await entered.promise;
 assert.equal((await f.post('profiles',profile)).status,503);
 assert.equal((await f.post('project/save',settings)).status,503);
 release.resolve();assert.equal((await closing).status,409);
 assert.equal((await f.post('profiles',profile)).status,200);
 const retried=await f.post('close');assert.equal(retried.status,200);assert.deepEqual(await retried.json(),{closed:true,handoff:true});assert.equal(attempts,2);
});
