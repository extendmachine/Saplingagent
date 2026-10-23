import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ConfigurationStore} from '../store.mjs';
import {createConfigurationServer} from '../server.mjs';
import {connectionsPath,credentialPath,readConnections,readCredential} from '../../../contracts/ai-configuration.mjs';

const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const token='synthetic-subscription-token';
const draft={label:'Personal Claude',engine:'claude',kind:'subscription',model:'synthetic-claude',apiKey:token};
const api={label:'Claude API',engine:'claude',kind:'api',protocol:'anthropic',baseUrl:'https://provider.example/v1',model:'synthetic-claude',apiKey:'synthetic-api-key'};
const rejectsCode=code=>error=>error.code===code&&!error.message.includes(token)&&!error.message.includes(api.apiKey);
async function fixture(t){
  const parent=path.join(repo,'.cache/subscription-configuration-tests');await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,"中文 app's "));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  return {root,store:new ConfigurationStore(root)};
}
async function privateJSON(root,id){return JSON.parse(await fs.readFile(credentialPath(root,id),'utf8'));}
async function ledger(root){return JSON.parse(await fs.readFile(path.join(root,'local-secrets/notes/project-secrets.json'),'utf8'));}
const safeJSON=value=>{const serialized=JSON.stringify(value);assert.ok(!serialized.includes(token));assert.ok(!serialized.includes(api.apiKey));assert.doesNotMatch(serialized,/"(?:apiKey|oauthToken)"/);};

test('subscription metadata is minimal, credentials private and ledger preserves unrelated entries',async t=>{
  const {root,store}=await fixture(t);await fs.mkdir(path.join(root,'local-secrets/notes'),{recursive:true});
  await fs.writeFile(path.join(root,'local-secrets/notes/project-secrets.json'),JSON.stringify({schema_version:1,credentials:[{id:'unrelated',custom:'keep'}],custom:{keep:true}}));
  const state=await store.save({...draft,apiKey:`  ${token}  `});const id=state.activeId;
  assert.equal(state.revision,1);assert.deepEqual(state.profiles,[{id,label:draft.label,engine:'claude',kind:'subscription',model:draft.model,hasKey:true}]);safeJSON(state);
  const persisted=await readConnections(root);assert.deepEqual(persisted.profiles,[{id,label:draft.label,engine:'claude',kind:'subscription',model:draft.model}]);safeJSON(persisted);
  assert.deepEqual(await privateJSON(root,id),{oauthToken:token});assert.equal(await readCredential(root,persisted.profiles[0]),token);
  const records=await ledger(root);assert.deepEqual(records.credentials[0],{id:'unrelated',custom:'keep'});assert.deepEqual(records.custom,{keep:true});safeJSON(records);
  assert.equal(records.credentials[1].category,'oauth-token');assert.match(records.credentials[1].purpose,/personal local use/);assert.equal(records.credentials[1].credential_file,`../api-keys/ai-${id}.json`);
  if(process.platform!=='win32')assert.equal((await fs.stat(credentialPath(root,id))).mode&0o777,0o600);
});

test('same-kind blank edits retain a valid token, explicit rotation and activation preserve other schemes',async t=>{
  const {root,store}=await fixture(t);const first=await store.save(draft),id=first.activeId;
  for(const apiKey of [undefined,'','   ']){
    const before=await store.state(),after=await store.save({...draft,id,revision:before.revision,apiKey,label:'Renamed personal Claude'});
    assert.equal(after.profiles[0].hasKey,true);assert.equal((await privateJSON(root,id)).oauthToken,token);safeJSON(after);
  }
  const other=await store.save({...api,activate:false});assert.equal(other.activeId,id);
  const rotated=await store.save({...draft,id,revision:other.revision,apiKey:'synthetic-rotated-token',activate:false});assert.equal(rotated.activeId,id);assert.equal((await privateJSON(root,id)).oauthToken,'synthetic-rotated-token');
  const selected=await store.activate({id:other.profiles[1].id,revision:rotated.revision});assert.equal(selected.activeId,other.profiles[1].id);assert.equal(selected.profiles[0].kind,'subscription');
});

test('subscription rejects incompatible fields, malformed token input and unknown engines without persisting a scheme',async t=>{
  const {root,store}=await fixture(t);
  const changes=[{engine:'codex'},{engine:'opencode'},{noAuth:false},{noAuth:true},{baseUrl:''},{baseUrl:api.baseUrl},{protocol:'anthropic'},{contextWindow:128000},{maxOutput:1000},{model:''},{model:'bad\tmodel'},
    {apiKey:null},{apiKey:4},{apiKey:'x'.repeat(8193)},{apiKey:token+'\n'},{apiKey:'\t'+token},{apiKey:token+'\x00'},{apiKey:token+'\x7f'},{apiKey:token+' space'},{apiKey:token+'\u00a0space'}];
  for(const change of changes)await assert.rejects(store.save({...draft,...change}),rejectsCode('INVALID_CONFIG'));
  for(const apiKey of [undefined,'','   '])await assert.rejects(store.save({...draft,apiKey}),rejectsCode('KEY_REQUIRED'));
  assert.deepEqual((await store.state()).profiles,[]);assert.equal(await fs.access(connectionsPath(root)).then(()=>true,()=>false),false);
  assert.deepEqual(await fs.readdir(path.dirname(credentialPath(root,'fixture'))),[]);
});

test('kind transitions require their own credential and replace the private type without borrowing previous auth',async t=>{
  const {root,store}=await fixture(t);const first=await store.save(api),id=first.activeId;
  await assert.rejects(store.save({...draft,id,revision:first.revision,apiKey:''}),rejectsCode('KEY_REQUIRED'));
  assert.deepEqual(await privateJSON(root,id),{apiKey:api.apiKey});assert.equal((await store.state()).revision,first.revision);
  const subscription=await store.save({...draft,id,revision:first.revision});assert.deepEqual(await privateJSON(root,id),{oauthToken:token});safeJSON(subscription);
  await assert.rejects(readCredential(root,{...api,id}));
  await assert.rejects(store.save({...api,id,revision:subscription.revision,apiKey:''}),rejectsCode('KEY_REQUIRED'));
  assert.deepEqual(await privateJSON(root,id),{oauthToken:token});assert.equal((await ledger(root)).credentials[0].category,'oauth-token');
  const restored=await store.save({...api,id,revision:subscription.revision});assert.deepEqual(await privateJSON(root,id),{apiKey:api.apiKey});assert.equal(restored.profiles[0].kind,'api');
  await assert.rejects(readCredential(root,{...draft,id}));assert.equal((await ledger(root)).credentials[0].category,'api-key');
});

test('blank edits reject missing, malformed and wrong-type saved tokens; state never treats them as usable',async t=>{
  const {root,store}=await fixture(t);const initial=await store.save(draft),id=initial.activeId,file=credentialPath(root,id);
  for(const content of [null,'{broken',JSON.stringify({apiKey:api.apiKey}),JSON.stringify({oauthToken:''}),JSON.stringify({oauthToken:token+'\n'}),JSON.stringify({oauthToken:token+' space'}),JSON.stringify({oauthToken:'x'.repeat(8193)})]){
    if(content===null)await fs.rm(file);else await fs.writeFile(file,content);
    const state=await store.state();assert.equal(state.profiles[0].hasKey,false);safeJSON(state);
    await assert.rejects(store.save({...draft,id,revision:initial.revision,apiKey:''}),rejectsCode('KEY_REQUIRED'));
    assert.equal((await store.state()).revision,initial.revision);
    if(content===null)assert.equal(await fs.access(file).then(()=>true,()=>false),false);else assert.equal(await fs.readFile(file,'utf8'),content);
  }
  const recovered=await store.save({...draft,id,revision:initial.revision});assert.equal(recovered.profiles[0].hasKey,true);assert.deepEqual(await privateJSON(root,id),{oauthToken:token});
});

test('stale revision and existing writer lock cannot rotate a subscription token',async t=>{
  const {root,store}=await fixture(t);const first=await store.save(draft),id=first.activeId;
  await assert.rejects(store.save({...draft,id,revision:0,apiKey:'synthetic-race-token'}),rejectsCode('CONFIG_CHANGED'));
  const lock=path.join(root,'local-secrets/ai-config/write.lock');await fs.writeFile(lock,'external-owner');
  await assert.rejects(store.save({...draft,id,revision:first.revision,apiKey:'synthetic-race-token'}),rejectsCode('CONFIG_BUSY'));
  assert.equal(await fs.readFile(lock,'utf8'),'external-owner');assert.deepEqual(await privateJSON(root,id),{oauthToken:token});assert.equal((await store.state()).revision,first.revision);
});

test('subscription model discovery fails before any fetch or private storage mutation',async t=>{
  const {root,store}=await fixture(t);const first=await store.save(draft);const before=await fs.readFile(connectionsPath(root),'utf8');let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Unexpected network');});
  for(const input of [draft,{...draft,id:first.activeId,apiKey:''},{...draft,baseUrl:api.baseUrl},{kind:'subscription'}])await assert.rejects(store.models(input),rejectsCode('INVALID_CONFIG'));
  assert.equal(calls,0);assert.equal(await fs.readFile(connectionsPath(root),'utf8'),before);assert.deepEqual(await privateJSON(root,first.activeId),{oauthToken:token});
});

test('Claude API import remains explicit and separate from a saved subscription scheme',async t=>{
  const {root,store}=await fixture(t);const initial=await store.save(draft),id=initial.activeId;
  await assert.rejects(store.importClaude({revision:initial.revision,profile:{id,model:api.model}},{apiKey:api.apiKey}),rejectsCode('CREDENTIAL_EXISTS'));
  assert.deepEqual(await privateJSON(root,id),{oauthToken:token});
  const imported=await store.importClaude({revision:initial.revision,replace:true,profile:{id,model:api.model}},{apiKey:api.apiKey});
  assert.equal(imported.profiles[0].kind,'api');assert.deepEqual(await privateJSON(root,id),{apiKey:api.apiKey});safeJSON(imported);
});

test('HTTP subscription create/edit/state/errors are redacted and retain origin, revision and pending-login guards',async t=>{
  const {root}=await fixture(t),assets=path.join(root,'ui');await fs.mkdir(assets);await fs.writeFile(path.join(assets,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__">');
  const server=createConfigurationServer({root,assets});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.shutdown());
  const url=`http://127.0.0.1:${server.address().port}`,html=await fetch(url).then(r=>r.text()),setupToken=html.match(/content="([a-f0-9]+)"/)[1];
  const headers={Origin:url,'Content-Type':'application/json','X-Sapling-Config':setupToken};
  const post=(route,body,extra={})=>fetch(url+'/api/config/'+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  const decode=async response=>{const body=await response.text();assert.ok(!body.includes(token));assert.ok(!body.includes(api.apiKey));assert.doesNotMatch(body,/"(?:apiKey|oauthToken)"/);return JSON.parse(body);};
  assert.equal((await post('profiles',draft,{'X-Sapling-Config':''})).status,401);
  assert.equal((await post('profiles',draft,{Origin:'https://foreign.example'})).status,403);
  assert.equal((await post('profiles',draft,{'Sec-Fetch-Site':'cross-site'})).status,403);
  const blocked=await post('profiles',draft);assert.equal(blocked.status,409);assert.equal((await decode(blocked)).error.code,'PROJECT_SETTINGS_REQUIRED');
  const prepare=await post('project/save',{name:'HTTP subscription fixture',folderName:path.basename(root),renameFolder:false});assert.equal(prepare.status,200);
  const response=await post('profiles',draft);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const created=await decode(response),id=created.activeId;
  const edited=await post('profiles',{...draft,id,revision:created.revision,apiKey:'',label:'Edited subscription'});assert.equal(edited.status,200);const next=await decode(edited);assert.equal(next.profiles[0].hasKey,true);
  const state=await decode(await fetch(url+'/api/config/state',{headers:{'X-Sapling-Config':setupToken}}));assert.equal(state.profiles[0].label,'Edited subscription');
  for(const [route,payload,status,code] of [['profiles',{...draft,id,revision:0},409,'CONFIG_CHANGED'],['profiles',{...draft,id,revision:next.revision,apiKey:token+'\n'},400,'INVALID_CONFIG'],['models',{...draft,id,apiKey:''},400,'INVALID_CONFIG']]){
    const rejected=await post(route,payload);assert.equal(rejected.status,status);assert.equal((await decode(rejected)).error.code,code);
  }
  server.accountSetup.login.phase='pending';const pending=await post('profiles',{...draft,id});assert.equal(pending.status,409);assert.equal((await decode(pending)).error.code,'LOGIN_BUSY');server.accountSetup.login.phase='idle';
  const secretURL=`/local-secrets/api-keys/ai-${id}.json`;assert.equal((await fetch(url+secretURL)).status,404);assert.deepEqual(await privateJSON(root,id),{oauthToken:token});
  assert.equal((await server.configStore.state()).revision,next.revision);
});
