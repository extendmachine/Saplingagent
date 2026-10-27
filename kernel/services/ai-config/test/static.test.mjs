import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConfigurationServer} from '../server.mjs';
const project=fileURLToPath(new URL('../../../../',import.meta.url));
async function fixture(t){const parent=path.join(project,'.cache/configuration-tests');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'static-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function serve(t,root){const server=createConfigurationServer({root,token:'synthetic-test-token'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.shutdown());return 'http://127.0.0.1:'+server.address().port;}
test('configuration distinguishes missing document, stale asset and unreadable file',async t=>{
  const root=await fixture(t),base=await serve(t,root);
  let response=await fetch(base);assert.equal(response.status,503);assert.equal((await response.json()).error.code,'UI_NOT_BUILT');
  response=await fetch(base+'/assets/previous.js');assert.equal(response.status,404);assert.equal((await response.json()).error.code,'UI_ASSET_NOT_FOUND');
  await fs.mkdir(path.join(root,'kernel/.cache/setup/index.html'),{recursive:true});
  response=await fetch(base);assert.equal(response.status,500);assert.equal((await response.json()).error.code,'UI_UNREADABLE');
});

test('browser navigation shows localized standalone setup errors while program clients keep JSON',async t=>{
 const root=await fixture(t),base=await serve(t,root);
 for(const [language,title,summary,action]of [['en','Configuration page unavailable','A required local component','Install / repair'],['zh-CN','配置页面暂时无法显示','所需的本地组件','安装／修复']]){
  const response=await fetch(base,{headers:{Accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8','Accept-Language':language}});assert.equal(response.status,503);assert.match(response.headers.get('content-type'),/^text\/html/);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
  const html=await response.text();assert.ok(html.includes(title));assert.ok(html.includes(summary));assert.ok(html.includes(action));assert.match(html,/<details><summary>/);assert.match(html,/UI_NOT_BUILT/);assert.match(html,/<a href="\/">/);assert.match(html,/<a href="\/help\?lang=(en|zh)">/);assert.doesNotMatch(html,/<script|<details open/);
 }
 for(const accept of ['application/json','*/*','text/html;q=0,application/json']){
  const response=await fetch(base,{headers:{Accept:accept}});assert.match(response.headers.get('content-type'),/^application\/json/);assert.equal((await response.json()).error.code,'UI_NOT_BUILT');
 }
 const api=await fetch(base+'/api/config/language',{headers:{Accept:'text/html'}});assert.equal(api.status,401);assert.match(api.headers.get('content-type'),/^application\/json/);
 const asset=await fetch(base+'/assets/missing.js',{headers:{Accept:'text/html'}});assert.equal(asset.status,404);assert.match(asset.headers.get('content-type'),/^application\/json/);
});

test('stored language controls the recovery page and unreadable UI remains a failed response',async t=>{
 const root=await fixture(t);await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/ui-language.json'),JSON.stringify({schemaVersion:1,language:'zh'}));await fs.mkdir(path.join(root,'kernel/.cache/setup/index.html'),{recursive:true});const base=await serve(t,root);
 const response=await fetch(base,{headers:{Accept:'text/html','Accept-Language':'en'}});assert.equal(response.status,500);const html=await response.text();assert.match(html,/<html lang="zh">/);assert.match(html,/配置页面暂时无法显示/);assert.match(html,/UI_UNREADABLE/);
});

test('HTML navigation escapes build error details instead of turning them into executable markup',async t=>{
 const root=await fixture(t);await fs.mkdir(path.join(root,'config'));const languageFile=path.join(root,'config/ui-language.json');await fs.writeFile(languageFile,'{"schemaVersion":1,"language":"en"}');await fs.mkdir(path.join(root,'kernel/.cache/setup'),{recursive:true});await fs.writeFile(path.join(root,'kernel/.cache/setup/index.html'),'__SAPLING_CONFIG_LANGUAGE__');
 const original=fs.readFile.bind(fs),attack='</pre></details><script>alert("synthetic")</script><img src=x onerror="alert(1)">&';
 t.mock.method(fs,'readFile',async(file,...args)=>{if(file===languageFile)throw Object.assign(Error(attack),{code:'UI_BUILD_FAILED',status:503});return original(file,...args);});
 const base=await serve(t,root),response=await fetch(base,{headers:{Accept:'text/html','Accept-Language':'zh'}});assert.equal(response.status,503);const html=await response.text();assert.match(html,/配置页面暂时无法显示/);assert.match(html,/UI_BUILD_FAILED/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot;synthetic&quot;/);assert.doesNotMatch(html,/<script|<img|<\/pre><\/details><script/);
});
