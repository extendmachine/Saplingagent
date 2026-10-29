import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'rolldown/utils';
import { createLanguageController } from '../localization/language-controller.ts';
import { catalog } from '../localization/catalog.ts';
import * as messages from '../localization/messages.ts';
import * as shared from '../../kernel/localization/public.mjs';
import { contextUsageView } from '../features/context-usage/context-usage.ts';
import { codexModelSelectable } from './runtime-api.ts';
const json = (body,status=200)=>new Response(JSON.stringify(body),{status});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const locale=language=>({language,locale:messages.localeFor(language),t:(key,params)=>messages.translate(language,key,params),text:value=>messages.resolveText(value,language),receive(){},select(){},saving:false,error:null});

test('all front catalog keys have both languages and matching interpolation fields',()=>{
 assert.deepEqual(Object.keys(catalog.en).sort(),Object.keys(catalog.zh).sort());
 for(const[key,value]of Object.entries(catalog.en)){
  assert.ok(catalog.zh[key]);
  const fields=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();assert.deepEqual(fields(value),fields(catalog.zh[key]),key);
 }
 assert.equal(messages.resolveText('User-authored English remains unchanged','zh'),'User-authored English remains unchanged');
});
test('browser fallback works without storage and persisted project language takes precedence',async()=>{
 const h=createLanguageController({browserLanguage:'zh-TW',storage:()=>{throw Error('denied')},request:async()=>json({language:'en'})});
 assert.equal(h.getSnapshot().language,'zh');await h.load();assert.equal(h.getSnapshot().language,'en');
 const offline=createLanguageController({browserLanguage:'zh',request:async()=>{throw Error('offline')}});await offline.load();assert.equal(offline.getSnapshot().language,'zh');
});
test('late initial GET cannot undo an explicit language choice',async()=>{
 const get=deferred(),requests=[];const h=createLanguageController({request:async(url,options)=>{requests.push(options);return options.method?json({language:JSON.parse(options.body).language}):get.promise}});
 const loading=h.load();await h.select('zh');get.resolve(json({language:'en'}));await loading;
 assert.equal(h.getSnapshot().language,'zh');assert.equal(h.getSnapshot().saving,false);assert.equal(requests.filter(x=>x.method==='POST').length,1);
});
test('rapid selections are serialized and obsolete queued writes are skipped',async()=>{
 const first=deferred(),sent=[];const h=createLanguageController({request:async(url,options)=>{const language=JSON.parse(options.body).language;sent.push(language);return sent.length===1?first.promise:json({language})}});
 const a=h.select('zh');await turn();const b=h.select('en');const c=h.select('zh');first.resolve(json({language:'zh'}));await Promise.all([a,b,c]);
 assert.deepEqual(sent,['zh','zh']);assert.equal(h.getSnapshot().language,'zh');assert.equal(h.getSnapshot().saving,false);
});
test('failed project save keeps current UI and exposes a retryable original error',async()=>{
 let fail=true;const saved=new Map();const h=createLanguageController({storage:()=>({getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)}),request:async()=>fail?json({error:{code:'ENOSPC',message:'disk fixture full'}},507):json({language:'zh'})});
 await h.select('zh');assert.equal(h.getSnapshot().language,'zh');assert.equal(h.getSnapshot().error.code,'ENOSPC');assert.equal(h.getSnapshot().saving,false);
 fail=false;await h.select('zh');assert.equal(h.getSnapshot().error,null);assert.equal([...saved.values()][0],'zh');
});
test('trusted frame receive is local only and invalid values cannot mutate language',async()=>{
 const requests=[];const h=createLanguageController({request:async(...args)=>{requests.push(args);return json({language:'en'})}});
 h.receive('fr');assert.equal(h.getSnapshot().language,'en');h.receive('zh');assert.equal(h.getSnapshot().language,'zh');assert.equal(requests.length,0);
 const pending=h.select('en');h.receive('zh');await pending;assert.equal(requests.length,1);assert.equal(h.getSnapshot().language,'en');
});

test('old iframe poll and same-language echoes cannot override a pending or failed explicit save',async()=>{
 const post=deferred();const h=createLanguageController({request:async()=>post.promise});const pending=h.select('zh');await turn();
 h.receive('en');h.receive('zh');assert.equal(h.getSnapshot().language,'zh');assert.equal(h.getSnapshot().saving,true);
 post.resolve(json({error:{code:'ENOSPC',message:'cannot save fixture'}},507));await pending;const failure=h.getSnapshot().error;assert.equal(failure.code,'ENOSPC');
 h.receive('en');h.receive('zh');assert.equal(h.getSnapshot().language,'zh');assert.equal(h.getSnapshot().error,failure);
});

async function loadComponent(file,language='zh',extra={}){
 const context=vm.createContext({console,Error,Intl,Date,URL,Map,Set,Promise,AbortSignal});
 const jsx=(type,props)=>React.createElement(type,props);
 const primitive=new Proxy({}, {get:(_,name)=>({children,...props})=>React.createElement(name==='AddAttachment'||name==='Remove'?'button':'div',props,children)});
 const mocks={react:React,'react/jsx-runtime':jsxRuntime,'./runtime-api':{codexModelSelectable},'lucide-react':new Proxy({}, {get:()=>()=>null}),...extra};
 const cache=new Map();
 const synthetic=value=>new vm.SyntheticModule(Object.keys(value),function(){for(const[key,item]of Object.entries(value))this.setExport(key,item)},{context});
 async function load(url){const key=url.href;if(cache.has(key))return cache.get(key);const source=await readFile(url,'utf8');const mod=new vm.SourceTextModule(transformSync(url.pathname,source,{jsx:{runtime:'automatic'}}).code,{context,identifier:key});cache.set(key,mod);await mod.link(async spec=>{
  if(spec.endsWith('.css'))return synthetic({});
  if(spec.endsWith('LanguageProvider'))return synthetic({useLanguage:()=>locale(language)});
  if(spec.endsWith('/messages'))return synthetic(messages);
  if(spec.endsWith('/public.mjs'))return synthetic(shared);
  if(spec==='lucide-react'){const names=[...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/g)].flatMap(match=>match[1].split(',').map(name=>name.trim()));return synthetic(Object.fromEntries(names.map(name=>[name,()=>null])));}
  if(spec==='@assistant-ui/react')return synthetic({ComposerPrimitive:primitive,AttachmentPrimitive:primitive,useAui:()=>({composer:()=>({getState:()=>({attachments:[]})})}),useAuiState:()=>({name:'original English file.txt',status:{type:'running'},content:[]})});
  if(mocks[spec])return synthetic(mocks[spec]);
  const relative=new URL(spec,url);if(!/\.(?:tsx?|mjs)$/.test(relative.pathname))relative.pathname+='.tsx';return load(relative);
 });return mod;}
 const module=await load(new URL(file,import.meta.url));await module.evaluate();return module.namespace;
}
test('localized error offers an action and expandable sanitized original code/details',async()=>{
 const {ErrorNotice}=await loadComponent('../localization/ErrorNotice.tsx');const html=renderToStaticMarkup(React.createElement(ErrorNotice,{error:Object.assign(new Error('fixture login rejected; Bearer private-fixture-token'),{code:'AUTH_REQUIRED'})}));
 assert.match(html,/AI 账号认证失败/);assert.match(html,/重新登录/);assert.match(html,/<details>/);assert.match(html,/AUTH_REQUIRED/);assert.match(html,/fixture login rejected/);assert.doesNotMatch(html,/private-fixture-token/);
});
test('Chinese engine, attachment and token labels leave user file/provider/model data intact',async()=>{
 const {EngineControls}=await loadComponent('./EngineControls.tsx');const agent={selection:{engine:'claude',providerId:'p',modelId:'m'},engines:[{id:'claude',ready:true,authenticated:true,providers:[{id:'p',label:'My English provider',models:[{id:'m',label:'Original model'}]}]}],canSelectEngine:true,activeSessionId:'same',status:{},handoff:{status:'pending'}};
 const html=renderToStaticMarkup(React.createElement(EngineControls,{agent,composer:{},changingSession:false}));assert.match(html,/AI 引擎/);assert.match(html,/My English provider/);assert.match(html,/Original model/);assert.match(html,/下一次发送/);
 const {AttachFilesButton,MessageAttachment}=await loadComponent('./AttachmentControls.tsx');assert.match(renderToStaticMarkup(React.createElement(AttachFilesButton)),/添加文件或图片/);const attachment=renderToStaticMarkup(React.createElement(MessageAttachment));assert.match(attachment,/正在上传/);
 const usage=contextUsageView({usedTokens:90000,contextWindow:100000},'zh');assert.match(usage.label,/90,000/);assert.match(usage.label,/上下文/);assert.match(usage.value,/万/);
});
