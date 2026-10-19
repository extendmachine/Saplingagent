import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigurationStore } from '../store.mjs';
import { CredentialImport } from '../credentials.mjs';
import { createConfigurationServer } from '../server.mjs';
import { readConnections, codexConnection, claudeConnections } from '../../../contracts/ai-configuration.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const auth={tokens:{id_token:'synthetic-id',access_token:'synthetic-access',refresh_token:'synthetic-refresh',account_id:'synthetic-account'},last_refresh:'2026-10-13T00:00:00Z',unrelated:'do-not-copy'};
async function fixture(t){await fs.mkdir(path.join(root,'.cache/auth-tests'),{recursive:true});const target=await fs.mkdtemp(path.join(root,'.cache/auth-tests/import-'));t.after(()=>fs.rm(target,{recursive:true,force:true}));return target;}
const upload=(json,revision=0)=>({engine:'codex',source:'upload',json:JSON.stringify(json),revision});
test('Codex upload selects project-private account; no credential in state or ledger and runtime reads this account',async t=>{
 const target=await fixture(t),store=new ConfigurationStore(target),imports=new CredentialImport(store);
 const state=await imports.run(upload(auth));assert.equal(state.activeId,'codex-account');assert.equal(state.codex.chatgpt,true);
 assert.doesNotMatch(JSON.stringify(state),/synthetic-/);const file=path.join(target,'local-secrets/codex/auth.json');
 const saved=JSON.parse(await fs.readFile(file));assert.equal(saved.tokens.refresh_token,auth.tokens.refresh_token);assert.equal(saved.unrelated,undefined);
 if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600);
 const ledger=JSON.parse(await fs.readFile(path.join(target,'local-secrets/notes/project-secrets.json')));assert.doesNotMatch(JSON.stringify(ledger),/synthetic-/);assert.equal(ledger.credentials[0].credential_file,'../codex/auth.json');
 assert.equal((await codexConnection(target,await readConnections(target))).profile.kind,'chatgpt');
});
test('explicit local import honors custom/default home and preserves source bytes',async t=>{
 for(const override of [false,true]){const target=await fixture(t),home=path.join(target,'source-home'),directory=override?path.join(home,'custom'):path.join(home,'.codex');await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'auth.json'),content=JSON.stringify(auth);await fs.writeFile(file,content);
 await fs.mkdir(path.join(target,'app'));
 const imports=new CredentialImport(new ConfigurationStore(path.join(target,'app')),{home,env:override?{CODEX_HOME:directory}:{}});
 const state=await imports.run({engine:'codex',source:'local',revision:0,path:'/ignored-untrusted-path'});assert.equal(state.codex.chatgpt,true);assert.equal(await fs.readFile(file,'utf8'),content);}
});
test('missing/keychain local credentials do not create or claim project auth',async t=>{
 const target=await fixture(t),store=new ConfigurationStore(target),imports=new CredentialImport(store,{home:target,env:{}});
 await assert.rejects(imports.run({engine:'codex',source:'local',revision:0}),e=>e.code==='LOCAL_AUTH_NOT_FOUND'&&/Keychain/.test(e.message));assert.equal((await store.state()).activeId,null);
});
test('replacement is explicit; stale requests and writer locks preserve credentials',async t=>{
 const target=await fixture(t),store=new ConfigurationStore(target),imports=new CredentialImport(store);await imports.run(upload(auth));const file=path.join(target,'local-secrets/codex/auth.json'),before=await fs.readFile(file,'utf8');
 const next={...auth,tokens:{...auth.tokens,refresh_token:'synthetic-next'}};
 await assert.rejects(imports.run(upload(next,1)),e=>e.code==='CREDENTIAL_EXISTS');await assert.rejects(imports.run({...upload(next,0),replace:true}),e=>e.code==='CONFIG_CHANGED');assert.equal(await fs.readFile(file,'utf8'),before);
 const lock=path.join(target,'local-secrets/ai-config/write.lock');await fs.writeFile(lock,'other');await assert.rejects(imports.run({...upload(next,1),replace:true}),e=>e.code==='CONFIG_BUSY');assert.equal(await fs.readFile(file,'utf8'),before);await fs.rm(lock);
 const state=await imports.run({...upload(next,1),replace:true});assert.equal(state.revision,2);assert.equal(JSON.parse(await fs.readFile(file)).tokens.refresh_token,'synthetic-next');
});
test('invalid, oversized, API-only and OAuth mixed documents never write or echo their values',async t=>{
 const target=await fixture(t),store=new ConfigurationStore(target),imports=new CredentialImport(store);
 for(const json of ['{broken-secret','[]',JSON.stringify({OPENAI_API_KEY:'synthetic-api'}),JSON.stringify({tokens:{...auth.tokens,refresh_token:'secret\ninvalid'}}),JSON.stringify({...auth,last_refresh:'secret-invalid'}),' '.repeat(32769)]){
 await assert.rejects(imports.run({engine:'codex',source:'upload',json,revision:0}),e=>!e.message.includes('secret-invalid')&&!e.message.includes('broken-secret'));}
 assert.equal((await store.state()).profiles.length,0);await assert.rejects(fs.access(path.join(target,'local-secrets/codex/auth.json')));
});
test('malformed existing auth needs explicit replacement; symlink targets never receive credentials',async t=>{
 const target=await fixture(t),store=new ConfigurationStore(target),imports=new CredentialImport(store);await fs.mkdir(path.join(target,'local-secrets/codex'),{recursive:true});const file=path.join(target,'local-secrets/codex/auth.json');await fs.writeFile(file,'{broken');
 await assert.rejects(imports.run(upload(auth)),e=>e.code==='CREDENTIAL_EXISTS');assert.equal(await fs.readFile(file,'utf8'),'{broken');await imports.run({...upload(auth),replace:true});
 if(process.platform==='win32')return;await fs.rm(file);const unrelated=path.join(target,'unrelated');await fs.writeFile(unrelated,'keep');await fs.symlink(unrelated,file);await assert.rejects(imports.run({...upload(auth,1),replace:true}),e=>e.code==='CONFIG_STORAGE_ERROR');assert.equal(await fs.readFile(unrelated,'utf8'),'keep');
});
test('Claude upload saves private API scheme and custom transport; subscription tokens are rejected',async t=>{
 const target=await fixture(t),store=new ConfigurationStore(target),imports=new CredentialImport(store);
 const json=JSON.stringify({apiKey:'synthetic-claude-key',baseUrl:'https://gateway.example/v1',model:'synthetic-claude-model'});
 const state=await imports.run({engine:'claude',source:'upload',json,revision:0,profile:{label:'My Claude'}});assert.equal(state.profiles[0].engine,'claude');assert.equal(state.profiles[0].baseUrl,'https://gateway.example/v1');assert.doesNotMatch(JSON.stringify(state),/synthetic-claude-key/);
 const runtime=(await claudeConnections(target,await readConnections(target)))[0];assert.equal(runtime.apiKey,'synthetic-claude-key');assert.equal(runtime.sdkBaseUrl,'https://gateway.example');
 for(const value of [{claudeAiOauth:{accessToken:'synthetic-oauth'}},{CLAUDE_CODE_OAUTH_TOKEN:'synthetic-oauth'},{apiKey:'synthetic-key',tokens:{access_token:'synthetic-oauth'}}])await assert.rejects(imports.run({engine:'claude',source:'upload',json:JSON.stringify(value),revision:state.revision}),e=>e.code==='UNSUPPORTED_AUTH');
});
test('Claude local env and settings imports extract only API fields and never run helpers',async t=>{
 for(const fromEnv of [true,false]){const target=await fixture(t),home=path.join(target,'home'),directory=path.join(home,'custom-claude');await fs.mkdir(directory,{recursive:true});const value={env:{ANTHROPIC_API_KEY:'synthetic-local',ANTHROPIC_BASE_URL:'https://local-provider.example/v1'},model:'synthetic-model',apiKeyHelper:'never-run',hooks:{never:'copy'}};const file=path.join(directory,'settings.json'),before=JSON.stringify(value);await fs.writeFile(file,before);
 await fs.mkdir(path.join(target,'app'));
 const imports=new CredentialImport(new ConfigurationStore(path.join(target,'app')),{home,env:fromEnv?{ANTHROPIC_API_KEY:'synthetic-local',ANTHROPIC_BASE_URL:'https://local-provider.example/v1',ANTHROPIC_MODEL:'synthetic-model'}:{CLAUDE_CONFIG_DIR:directory}});
 const state=await imports.run({engine:'claude',source:'local',revision:0});assert.equal(state.profiles[0].model,'synthetic-model');assert.equal(await fs.readFile(file,'utf8'),before);assert.doesNotMatch(JSON.stringify(state),/never-run|synthetic-local/);}
});
test('Claude model validation precedes writes and explicit editor values override JSON hints',async t=>{
 const target=await fixture(t),store=new ConfigurationStore(target),imports=new CredentialImport(store),json=JSON.stringify({ANTHROPIC_API_KEY:'synthetic-key'});
 await assert.rejects(imports.run({engine:'claude',source:'upload',json,revision:0}),e=>e.code==='INVALID_CONFIG');assert.equal((await store.state()).revision,0);
 const state=await imports.run({engine:'claude',source:'upload',json:JSON.stringify({env:{ANTHROPIC_API_KEY:'synthetic-key'},baseUrl:'https://ignored.example/v1',model:'ignored'}),revision:0,profile:{baseUrl:'https://chosen.example/v1',model:'chosen'}});assert.equal(state.profiles[0].model,'chosen');assert.equal(state.profiles[0].baseUrl,'https://chosen.example/v1');
 const id=state.activeId;await assert.rejects(imports.run({engine:'claude',source:'upload',json,revision:1,profile:{...state.profiles[0],id}}),e=>e.code==='CREDENTIAL_EXISTS');
 await imports.run({engine:'claude',source:'upload',json,revision:1,replace:true,profile:{...state.profiles[0],id}});assert.equal((await store.state()).profiles.length,1);
});
test('missing Claude API settings have actionable fallback; invalid local source stays untouched',async t=>{
 const target=await fixture(t),imports=new CredentialImport(new ConfigurationStore(path.join(target,'app')),{home:target,env:{}});
 await assert.rejects(imports.run({engine:'claude',source:'local',revision:0}),e=>e.code==='LOCAL_API_NOT_FOUND');await fs.mkdir(path.join(target,'.claude'));await fs.writeFile(path.join(target,'.claude/settings.json'),'{private-broken');await assert.rejects(imports.run({engine:'claude',source:'local',revision:0}),e=>e.code==='INVALID_CREDENTIALS'&&!e.message.includes('private-broken'));assert.equal(await fs.readFile(path.join(target,'.claude/settings.json'),'utf8'),'{private-broken');
});
test('configuration HTTP blocks unauthorized imports and OAuth/import races, returns sanitized state',async t=>{
 const target=await fixture(t),assets=path.join(target,'ui');await fs.mkdir(assets);await fs.writeFile(path.join(assets,'index.html'),'<meta name="config-token" content="__SAPLING_CONFIG_TOKEN__">');
 const server=createConfigurationServer({root:target,assets,importOptions:{home:target,env:{}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.shutdown());const url=`http://127.0.0.1:${server.address().port}`,html=await fetch(url).then(r=>r.text()),token=html.match(/content="([a-f0-9]+)"/)[1];
 const endpoint=url+'/api/config/credentials/import',headers={'Content-Type':'application/json',Origin:url,'X-Sapling-Config':token},body=JSON.stringify(upload(auth));
 assert.equal((await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body})).status,401);assert.equal((await fetch(endpoint,{method:'POST',headers:{...headers,Origin:'https://foreign.example'},body})).status,403);
 server.accountSetup.login={phase:'pending'};assert.equal((await fetch(endpoint,{method:'POST',headers,body})).status,409);server.accountSetup.login={phase:'idle'};
 const prepared=await fetch(url+'/api/config/project/prepare',{method:'POST',headers,body:JSON.stringify({name:'Credential fixture',folderName:path.basename(target),renameFolder:false})});assert.equal(prepared.status,200);
 const response=await fetch(endpoint,{method:'POST',headers,body});assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/synthetic-/);assert.equal((await fetch(url+'/local-secrets/codex/auth.json')).status,404);
 assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({...upload(auth,1),json:' '.repeat(70000)})})).status,413);
});
test('imports reject simultaneous submissions, reset busy after failure and require a current revision',async t=>{
 const target=await fixture(t),store=new ConfigurationStore(target),imports=new CredentialImport(store);const first=imports.run(upload(auth));await assert.rejects(imports.run(upload(auth)),e=>e.code==='IMPORT_BUSY');await first;
 await assert.rejects(imports.run({...upload(auth),revision:undefined}),e=>e.code==='INVALID_CONFIG');assert.equal(imports.busy,false);
});
