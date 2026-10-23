import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConfigurationServer} from '../server.mjs';
const source=fileURLToPath(new URL('../../../../',import.meta.url));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(t,options={}){
 const parent=path.join(source,'.cache/language-tests');await fs.mkdir(parent,{recursive:true});
 const holder=await fs.mkdtemp(path.join(parent,'setup-')),root=path.join(holder,'Before'),assets=path.join(holder,'ui');await fs.mkdir(root);await fs.mkdir(assets);
 await fs.writeFile(path.join(assets,'index.html'),'<html lang="__SAPLING_CONFIG_LANGUAGE__"><title>__SAPLING_CONFIG_TITLE__</title><meta name="config-token" content="__SAPLING_CONFIG_TOKEN__"></html>');
 const controller={root,busy:false,saved:false,invalidations:0,configurationHost:'external',async state(){return {root:this.root,settingsSaved:this.saved,configurationHost:this.configurationHost};},async cancel(){},async invalidateSetup(){this.invalidations++;},async stageSetup(){this.saved=true;return {};},async finalizeSetup(input){this.finalizeInput=input;return {id:'synthetic',phase:'completed'};}};
 const server=createConfigurationServer({root,assets,projectController:controller,token:'synthetic-language-token',...options});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await server.shutdown();await fs.rm(holder,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port,headers={'X-Sapling-Config':'synthetic-language-token',Origin:base,'Content-Type':'application/json'};
 const get=(route='language',extra={})=>fetch(base+'/api/config/'+route,{headers:{...headers,...extra}});
 const post=(body,route='language',extra={})=>fetch(base+'/api/config/'+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
 return {root,holder,controller,server,base,get,post};
}
test('setup HTML and protected preference use browser fallback then saved project language',async t=>{
 const f=await fixture(t);
 let response=await fetch(f.base,{headers:{'Accept-Language':'fr-FR,zh-CN;q=0.9,en;q=0.8'}});assert.match(await response.text(),/lang="zh"/);
 assert.deepEqual(await (await f.get('language',{'Accept-Language':'zh-TW'})).json(),{language:'zh',supported:['en','zh']});
 assert.equal((await f.post({language:'en'})).status,200);
 response=await fetch(f.base,{headers:{'Accept-Language':'zh-CN'}});const html=await response.text();assert.match(html,/lang="en"/);assert.match(html,/Saplingagent · Project setup/);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root,'config/ui-language.json'),'utf8')),{schemaVersion:1,language:'en'});
});
test('explicit launcher fallback does not override stored language',async t=>{
 const f=await fixture(t,{language:'zh-CN'});assert.equal((await (await f.get()).json()).language,'zh');
 await f.post({language:'en'});assert.equal((await (await f.get()).json()).language,'en');
});
test('language writes require normal origin/token/schema but do not require or rewrite AI setup',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.root,'local-secrets/ai-config'),{recursive:true});
 const file=path.join(f.root,'local-secrets/ai-config/connections.json'),bytes='{"schemaVersion":1,"revision":7,"activeId":null,"profiles":[]}\n';await fs.writeFile(file,bytes);
 assert.equal((await f.get('language',{'X-Sapling-Config':'wrong'})).status,401);
 assert.equal((await f.post({language:'zh'},'language',{Origin:'https://example.invalid'})).status,403);
 assert.equal((await f.get('language',{'Sec-Fetch-Site':'cross-site'})).status,403);
 for(const body of [{language:'zh-CN'},{language:'fr'},{language:'zh',apiKey:'synthetic-never-return'},[],{},null]){const response=await f.post(body);assert.equal(response.status,400);assert.doesNotMatch(await response.text(),/synthetic-never-return/);}
 assert.equal((await f.post({language:'zh'})).status,200);assert.equal(f.controller.saved,false);assert.equal(f.controller.invalidations,0);assert.equal(await fs.readFile(file,'utf8'),bytes);
 assert.equal(await fs.access(path.join(f.root,'local-secrets/notes/project-secrets.json')).then(()=>true,()=>false),false);
});
test('language follows relocated root and finalization uses the most recently saved selection',async t=>{
 const f=await fixture(t,{language:'en'});await f.post({language:'zh'});
 const moved=path.join(f.holder,'After');await fs.rename(f.root,moved);f.controller.root=moved;await f.server.relocate(moved);
 assert.equal((await (await f.get()).json()).language,'zh');assert.equal((await f.post({language:'en'})).status,200);
 assert.equal(await fs.access(f.root).then(()=>true,()=>false),false);assert.equal(JSON.parse(await fs.readFile(path.join(moved,'config/ui-language.json'))).language,'en');
 await fs.writeFile(path.join(moved,'config/mcp-access.json'),JSON.stringify({schemaVersion:1,revision:1,enabled:true,externalOnly:true}));f.controller.saved=true;
 await f.post({language:'zh'});assert.equal((await f.post({},'project/finalize')).status,202);assert.equal(f.controller.finalizeInput.language,'zh');
});
test('directory operation rejects language reads and writes until ownership is released',async t=>{
 const f=await fixture(t),entered=deferred(),release=deferred();f.controller.stageSetup=async()=>{entered.resolve();await release.promise;return {};};
 const saving=f.post({},'project/save');await entered.promise;
 assert.equal((await f.get()).status,409);assert.equal((await f.post({language:'zh'})).status,409);
 release.resolve();assert.equal((await saving).status,200);assert.equal((await f.post({language:'zh'})).status,200);
});
test('known and unexpected errors expose localized guidance with sanitized original details',async t=>{
 const f=await fixture(t);await f.post({language:'zh'});
 let response=await f.post({language:'invalid'});let {error}=await response.json();assert.equal(error.code,'INVALID_LANGUAGE');assert.match(error.summary,/[\u4e00-\u9fff]/);assert.match(error.action,/[\u4e00-\u9fff]/);assert.equal(error.details,'Choose English or Chinese.');
 f.controller.state=async()=>{throw Error('synthetic-private-file-content');};response=await f.get('project');assert.equal(response.status,500);error=(await response.json()).error;assert.equal(error.code,'CONFIG_STORAGE_ERROR');assert.doesNotMatch(JSON.stringify(error),/synthetic-private-file-content/);assert.match(error.summary,/[\u4e00-\u9fff]/);
});

test('setup help uses the same protected language endpoint and permits only its nonce-bound script',async t=>{
 const f=await fixture(t);const response=await fetch(f.base+'/help?lang=zh');assert.equal(response.status,200);const html=await response.text();assert.match(html,/使用帮助/);assert.match(html,/\/api\/config\/language/);assert.match(html,/synthetic-language-token/);const nonce=html.match(/<script nonce="([^"]+)"/)[1];assert.ok(response.headers.get('content-security-policy').includes("'nonce-"+nonce+"'"));assert.equal(response.headers.get('cache-control'),'no-store');
});
