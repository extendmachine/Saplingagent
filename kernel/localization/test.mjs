import test from 'node:test';
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
 await fs.writeFile(path.join(root,'config/ui-language.json'),'{broken');assert.equal(await readLanguage(root,'zh'),'zh');
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
