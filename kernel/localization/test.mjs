import test from 'node:test';
import http from 'node:http';
import {RuntimeManager} from '../services/runtime-manager/manager.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeLanguage,formatMessage,describeError} from './public.mjs';
import {readLanguage,writeLanguage} from './store.mjs';
import {createManagerServer} from '../services/runtime-manager/server.mjs';
const cache=fileURLToPath(new URL('../../.cache/language-tests/',import.meta.url));
async function project(t){await fs.mkdir(cache,{recursive:true});const root=await fs.mkdtemp(path.join(cache,'fixture-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('language normalization and interpolation preserve unknown user content',()=>{
 assert.equal(normalizeLanguage('zh-TW'),'zh');assert.equal(normalizeLanguage('en_US'),'en');assert.equal(normalizeLanguage('fr'),'en');
 const catalog={en:{greet:'Hi {name}: {missing}'},zh:{greet:'你好 {name}：{missing}'}};
 assert.equal(formatMessage(catalog,'zh','greet',{name:'$& <user>'}),'你好 $& <user>：{missing}');
 assert.equal(formatMessage(catalog,'zh','no-key'),'no-key');
});
test('preferences are project-local, atomic and do not overwrite surrounding configuration',async t=>{
 const root=await project(t);assert.equal(await readLanguage(root,'zh'),'zh');
 await assert.rejects(fs.access(path.join(root,'config')));
 await writeLanguage(root,'en');await fs.writeFile(path.join(root,'config/project.json'),'keep');
 await writeLanguage(root,'zh');assert.equal(await readLanguage(root,'en'),'zh');
 assert.equal(await fs.readFile(path.join(root,'config/project.json'),'utf8'),'keep');
 await assert.rejects(writeLanguage(root,'fr'),{code:'INVALID_LANGUAGE'});
 assert.equal(await readLanguage(root),'zh');assert.deepEqual((await fs.readdir(path.join(root,'config'))).sort(),['project.json','ui-language.json']);
 for(const raw of ['{broken','null','[]','42']) {
 await fs.writeFile(path.join(root,'config/ui-language.json'),raw);assert.equal(await readLanguage(root,'zh'),'zh');
 assert.equal(await fs.readFile(path.join(root,'config/ui-language.json'),'utf8'),raw);
 }
});
test('known and unknown errors always retain code plus localized explanation and next action',()=>{
 for(const language of ['en','zh'])for(const issue of [{code:'KERNEL_CONFLICT',message:'kernel/file.mjs'},Error('Your refresh token was already used'),{code:'SOME_NEW_CODE',message:'future problem'}]){
  const value=describeError(issue,language);assert.ok(value.summary);assert.ok(value.action);assert.equal(value.details,issue.message);
  assert.equal(value.code,issue.code||'');if(language==='zh')assert.match(value.action,/[\u4e00-\u9fff]/);
 }
 assert.doesNotMatch(describeError('Authorization: Bearer secret-value api_key=my-secret','zh').details,/secret-value|my-secret/);
});
test('runtime language endpoint respects local auth, browser fallback, validation and restart persistence',async t=>{
 const root=await project(t);const manager={root};const options={manager,token:'fixture-token',frontPort:5173,managerPort:4314};
 const server=createManagerServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 options.frontPort=server.address().port;
 const url=`http://127.0.0.1:${options.frontPort}/api/runtime/language`;
 const headers={host:`127.0.0.1:${options.frontPort}`,origin:`http://127.0.0.1:${options.frontPort}`,'content-type':'application/json','accept-language':'zh-CN,zh;q=0.9'};
 assert.equal((await (await fetch(url,{headers})).json()).language,'zh');
 await assert.rejects(fs.access(path.join(root,'config/ui-language.json')));
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,origin:'https://foreign.example'},body:'{"language":"en"}'})).status,403);
 for(const body of ['{}','{"language":"xx"}','{"language":"zh","extra":1}','null'])assert.equal((await fetch(url,{method:'POST',headers,body})).status,400);
 assert.equal((await (await fetch(url,{method:'POST',headers,body:'{"language":"en"}'})).json()).language,'en');
 assert.equal((await (await fetch(url,{headers})).json()).language,'en');assert.equal(await readLanguage(root,'zh'),'en');
});
test('language writes respect configuration relocation lease and refuse external managed paths',async t=>{
 const root=await project(t);
 await fs.mkdir(path.join(root,'local-secrets/ai-config'),{recursive:true});
 await fs.writeFile(path.join(root,'local-secrets/ai-config/write.lock'),'other-owner');
 await assert.rejects(writeLanguage(root,'zh'),{code:'CONFIG_BUSY'});
 assert.equal(await fs.readFile(path.join(root,'local-secrets/ai-config/write.lock'),'utf8'),'other-owner');
 await fs.rm(path.join(root,'local-secrets/ai-config/write.lock'));
 const elsewhere=await project(t);await fs.symlink(elsewhere,path.join(root,'config'),'dir');
 await assert.rejects(writeLanguage(root,'zh'),{code:'PROJECT_STORAGE_LOCATION'});
 assert.deepEqual(await fs.readdir(elsewhere),[]);
});
test('standalone error helper uses the same classifier as the imported contract',async()=>{
 const {browserErrorSource}=await import('./public.mjs');const {runInNewContext}=await import('node:vm');
 const result=runInNewContext(browserErrorSource()+`;describeError({code:'KERNEL_CONFLICT',message:'file'},'zh')`);
 assert.equal(result.summary,describeError({code:'KERNEL_CONFLICT',message:'file'},'zh').summary);
});


test('independent help renders both complete languages without executing user markup',async()=>{
 const {renderHelpPage,helpMessages}=await import('./help.mjs');
 assert.equal(helpMessages.en.sections.length,helpMessages.zh.sections.length);
 for(const language of ['en','zh']){
  const html=renderHelpPage(language,{endpoint:'/api/config/language',token:'</script><unsafe>'});
  assert.ok(html.includes(language==='zh'?'lang="zh-CN"':'lang="en"'));
  assert.ok(!html.includes('</script><unsafe>'));
  for(const section of helpMessages[language].sections)assert.ok(html.includes(section[0]));
 }
});

test('language writes block maintenance until completion and release their count on aborted bodies',async t=>{
 const root=await project(t),manager={root,gatewayWrites:0};
 const options={manager,token:'fixture-token',frontPort:0,managerPort:0};
 const server=createManagerServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 options.frontPort=server.address().port;
 const request=()=>http.request({host:'127.0.0.1',port:options.frontPort,path:'/api/runtime/language',method:'POST',headers:{origin:`http://127.0.0.1:${options.frontPort}`,'content-type':'application/json'}});
 async function count(expected){for(let i=0;i<100&&manager.gatewayWrites!==expected;i++)await new Promise(r=>setTimeout(r,5));assert.equal(manager.gatewayWrites,expected);}
 const first=request();const response=new Promise((resolve,reject)=>{first.on('error',reject);first.on('response',res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});});
 first.write('{"language":');await count(1);
 await assert.rejects(RuntimeManager.prototype.prepareMaintenance.call(manager),{code:'KERNEL_BUSY'});
 first.end('"zh"}');assert.equal(await response,200);await count(0);assert.equal(await readLanguage(root),'zh');
 const aborted=request();aborted.on('error',()=>{});aborted.write('{"language":');await count(1);aborted.destroy();await count(0);
 assert.equal(await readLanguage(root),'zh');
 manager.closed=true;const closed=await fetch(`http://127.0.0.1:${options.frontPort}/api/runtime/language`,{method:'POST',headers:{origin:`http://127.0.0.1:${options.frontPort}`},body:'{"language":"en"}'});assert.equal(closed.status,409);assert.equal(manager.gatewayWrites,0);
});
