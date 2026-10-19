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
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(t,{prepare,state,real=false}={}){
 const parent=path.join(source,'.cache/setup-directory-tests');await fs.mkdir(parent,{recursive:true});
 const holder=await fs.mkdtemp(path.join(parent,'flow-')),root=path.join(holder,'Before');await fs.mkdir(root);
 t.after(()=>fs.rm(holder,{recursive:true,force:true}));
 const assets=path.join(root,'kernel/.cache/setup');await fs.mkdir(assets,{recursive:true});
 await fs.writeFile(path.join(assets,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__">');
 const controller=real?new ProjectLauncher(root):{root,busy:false,ready:false,prepareCalls:0,renameCalls:0,
  async state(){return state?state.call(this):{root:this.root,directoryReady:this.ready};},
  async prepare(input){this.prepareCalls++;if(prepare)return prepare.call(this,input);this.ready=true;return {root:this.root,renamed:false,project:{name:input.name,folderName:input.folderName}};},
  async rename(){this.renameCalls++;throw Error('Unexpected rename');},async cancel(){},
 };
 const moves=[];const server=createConfigurationServer({root,assets,projectController:controller,onProjectRename:(before,after)=>moves.push({before,after})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.shutdown());
 const base=`http://127.0.0.1:${server.address().port}`,html=await fetch(base).then(r=>r.text()),token=html.match(/content="([a-f0-9]+)"/)[1];
 const headers={Origin:base,'Content-Type':'application/json','X-Sapling-Config':token};
 const post=(route,body={})=>fetch(base+'/api/config/'+route,{method:'POST',headers,body:JSON.stringify(body)});
 const get=route=>fetch(base+'/api/config/'+route,{headers:{'X-Sapling-Config':token}});
 return {root,holder,controller,server,base,post,get,moves};
}
const preparation={name:'After',folderName:'After',renameFolder:true};

test('AI actions and build require actual directory confirmation; closing never renames',async t=>{
 const f=await fixture(t);
 for(const [route,body] of [['profiles',profile],['activate',{id:'missing'}],['login',{mode:'chatgpt'}],['models',profile],['credentials/import',{engine:'codex',source:'upload',revision:0,json:JSON.stringify(credentials)}],['project/build',{}]]){
  const r=await f.post(route,body);assert.equal(r.status,409,route);assert.equal((await r.json()).error.code,'PROJECT_DIRECTORY_REQUIRED');
 }
 assert.equal(await fs.access(path.join(f.root,'local-secrets')).then(()=>true,()=>false),false);
 assert.equal((await f.post('close')).status,200);assert.equal(f.controller.prepareCalls,0);assert.equal(f.controller.renameCalls,0);
});

test('directory preparation closes auth before moving, serializes requests and rebinds all project-local stores/assets',async t=>{
 const entered=deferred(),release=deferred();let closed=false;
 const f=await fixture(t,{async prepare(){assert.equal(closed,true);entered.resolve();await release.promise;const target=path.join(path.dirname(this.root),'After');await fs.rename(this.root,target);this.root=target;this.ready=true;return {root:target,renamed:true,project:{name:'After',folderName:'After'}};}});
 f.server.accountSetup.close=async()=>{closed=true;};
 const preparing=f.post('project/prepare',preparation);await entered.promise;
 for(const route of ['profiles','credentials/import','login','project/prepare','close']){const r=await f.post(route,profile);assert.equal(r.status,409,route);assert.equal((await r.json()).error.code,'PROJECT_BUSY');}
 assert.equal((await f.get('state')).status,409);
 release.resolve();assert.equal((await preparing).status,200);
 const target=f.controller.root;assert.notEqual(target,f.root);assert.deepEqual(f.moves,[{before:f.root,after:target}]);
 assert.equal(f.server.configStore.root,target);assert.equal(f.server.accountSetup.root,target);
 assert.equal((await fetch(f.base)).status,200,'setup assets follow the renamed folder');
 assert.equal((await f.post('profiles',profile)).status,200);
 assert.equal(await fs.access(path.join(target,'local-secrets/ai-config/connections.json')).then(()=>true,()=>false),true);
 const imported=await f.post('credentials/import',{engine:'codex',source:'upload',revision:1,json:JSON.stringify(credentials)});assert.equal(imported.status,200);
 assert.equal(await fs.access(path.join(target,'local-secrets/codex/auth.json')).then(()=>true,()=>false),true);
 assert.equal(await fs.access(f.root).then(()=>true,()=>false),false,'no request recreates the obsolete root');
 assert.doesNotMatch(JSON.stringify(await (await f.get('state')).json()),/synthetic-(?:id|access|refresh|only-key)/);
});

test('an AI request already in progress prevents a concurrent directory operation',async t=>{
 const entered=deferred(),release=deferred();let block=false;
 const f=await fixture(t,{async state(){if(block){entered.resolve();await release.promise;}return {root:this.root,directoryReady:true};}});
 block=true;const saving=f.post('profiles',profile);await entered.promise;
 const preparing=await f.post('project/prepare',preparation);assert.equal(preparing.status,409);assert.equal((await preparing.json()).error.code,'PROJECT_BUSY');assert.equal(f.controller.prepareCalls,0);
 release.resolve();assert.equal((await saving).status,200);
});

test('directory confirmation waits until a cancelled native login has actually closed',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();
 f.controller.ready=true;f.server.accountSetup.login={phase:'pending'};f.server.accountSetup.loginId='synthetic-login';
 f.server.accountSetup.client={async call(){},async close(){entered.resolve();await release.promise;}};
 const cancelling=f.post('login/cancel');await entered.promise;
 assert.equal(f.server.accountSetup.login.phase,'cancelled');
 const preparing=await f.post('project/prepare',preparation);assert.equal(preparing.status,409);assert.equal((await preparing.json()).error.code,'PROJECT_BUSY');assert.equal(f.controller.prepareCalls,0);
 release.resolve();assert.equal((await cancelling).status,200);assert.equal((await f.post('project/prepare',preparation)).status,200);
});

for(const success of [false,true])test(`directory confirmation waits for native close after ${success?'successful':'failed'} asynchronous sign-in completion`,async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred(),setup=f.server.accountSetup;
 f.controller.ready=true;setup.login={phase:'pending'};setup.loginId='synthetic-login';
 setup.client={async close(){entered.resolve();await release.promise;}};
 if(success){await fs.mkdir(path.join(f.root,'local-secrets/codex'),{recursive:true});await fs.writeFile(path.join(f.root,'local-secrets/codex/auth.json'),JSON.stringify(credentials));}
 const completed=setup.completed({loginId:'synthetic-login',success},setup.epoch);await entered.promise;
 assert.equal(setup.login.phase,success?'completed':'failed');
 const preparationEntered=deferred(),close=setup.close.bind(setup);setup.close=()=>{preparationEntered.resolve();return close();};
 const preparing=f.post('project/prepare',preparation);await preparationEntered.promise;assert.equal(f.controller.prepareCalls,0,'native auth must close before moving the folder');
 const response=await f.post('profiles',profile);assert.equal(response.status,409);assert.equal((await response.json()).error.code,'PROJECT_BUSY');
 release.resolve();await completed;assert.equal((await preparing).status,200);assert.equal(f.controller.prepareCalls,1);
 const before=(await f.server.configStore.state()).revision;await setup.completed({loginId:'synthetic-login',success:true},setup.epoch-1);assert.equal((await f.server.configStore.state()).revision,before,'late callbacks never write after preparation');
});

test('metadata failure after a successful move still rebinds setup and allows a deliberate retry',async t=>{
 const f=await fixture(t,{async prepare(){const target=path.join(path.dirname(this.root),'After');await fs.rename(this.root,target);this.root=target;throw Object.assign(Error('Synthetic metadata failure'),{status:500,code:'PROJECT_METADATA_INVALID'});}});
 const r=await f.post('project/prepare',preparation);assert.equal(r.status,500);assert.equal((await r.json()).error.code,'PROJECT_METADATA_INVALID');
 assert.equal(f.server.configStore.root,f.controller.root);assert.equal(f.server.accountSetup.root,f.controller.root);
 assert.equal((await fetch(f.base)).status,200);assert.equal((await f.get('state')).status,200);assert.equal((await f.post('profiles',profile)).status,409);
 f.controller.prepare=async()=>{f.controller.ready=true;return {root:f.controller.root,renamed:false,project:{name:'After',folderName:'After'}};};
 assert.equal((await f.post('project/prepare',preparation)).status,200);assert.equal((await f.post('profiles',profile)).status,200);
 assert.equal(await fs.access(f.root).then(()=>true,()=>false),false);assert.equal(f.moves.length,1);
});

test('real launcher confirmation moves the directory before AI persistence and later build/finish keep that location',async t=>{
 const f=await fixture(t,{real:true});
 assert.equal((await (await f.get('project')).json()).directoryReady,false);
 const prepared=await f.post('project/prepare',preparation);assert.equal(prepared.status,200);const value=await prepared.json();assert.equal(value.renamed,true);
 const target=path.join(f.holder,'After');assert.equal(value.root,target);assert.equal((await (await f.get('project')).json()).directoryReady,true);
 assert.equal((await f.post('profiles',profile)).status,200);assert.equal(f.server.configStore.root,target);
 const calls=[];f.controller.run=async(root,exe,args)=>calls.push({root,exe,args});f.controller.compiler=async(root)=>{assert.equal(root,target);return {artifact:'After.app'};};
 const built=await f.post('project/build');assert.equal(built.status,202);await f.controller.completion;assert.equal(f.controller.job.phase,'completed');assert.ok(calls.every(c=>c.root===target));
 assert.equal(f.moves.length,1);assert.equal((await f.post('close')).status,200);assert.equal(f.moves.length,1);
 assert.equal(await fs.access(f.root).then(()=>true,()=>false),false);assert.equal(await fs.access(path.join(target,'local-secrets/ai-config/connections.json')).then(()=>true,()=>false),true);
});
