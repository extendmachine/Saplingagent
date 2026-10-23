import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import vm from 'node:vm';
import {launcherMessages} from '../../localization/launcher-messages.mjs';
import {runtimeMessages} from '../../localization/runtime-messages.mjs';
import {kernelControlPage} from '../../control-page.mjs';
import {buildEnv,prepareBuildStorage} from '../build.mjs';
const project=fileURLToPath(new URL('../../../',import.meta.url));
const exec=promisify(execFile);

test('native and runtime catalogs have complete English/Chinese keys',()=>{
 for(const catalog of [launcherMessages,runtimeMessages]){
  assert.deepEqual(Object.keys(catalog.en).sort(),Object.keys(catalog.zh).sort());
  for(const [key,value] of Object.entries(catalog.zh)){assert.ok(value.trim(),key);assert.deepEqual(value.match(/\{\w+\}/g)||[],catalog.en[key].match(/\{\w+\}/g)||[])}
 }
});

function controlsHarness({getLanguage=async()=>'zh',setLanguage=async value=>value,standalone=false,footer=false}={}){
 const elements=new Map(),calls=[],messages=[],listeners={};
 const element=id=>{if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',hidden:false,dataset:{},disabled:false,checked:false,replaceChildren(...values){this.children=values}});return elements.get(id)};
 for(const match of kernelControlPage.matchAll(/<[^<>]+id="([^"]+)"[^<>]*data-i18n="([^"]+)"[^<>]*>/g))element(match[1]).dataset.i18n=match[2].replaceAll('&amp;','&');
 const parent={postMessage:(data,origin)=>messages.push({data,origin})},location={origin:'http://127.0.0.1:12345',search:footer?'?footer':'?embed',assign(){throw Error('language must not navigate')}};
 const document={documentElement:{lang:'en'},body:{classList:{add(){},remove(){}}},getElementById:element,querySelectorAll(selector){if(selector==='[data-i18n]')return [...elements.values()].filter(e=>e.dataset.i18n);if(selector==='[data-language]')return [element('language')];return []}};
 const window={parent,addEventListener:(name,fn)=>listeners[name]=fn};if(standalone)window.parent=window;
 const fetch=async(route,options)=>{calls.push({route,options});const data=route.endsWith('/language')?{language:options.method==='POST'?await setLanguage(JSON.parse(options.body).language):await getLanguage()}:{kernel:{state:'managed',version:'0.9.6'},backups:[]};return {ok:true,json:async()=>data}};
 const context=vm.createContext({document,window,parent,location,navigator:{language:'en-US'},URLSearchParams,Option:class{constructor(text,value){this.text=text;this.value=value}},fetch,console,setInterval(){},confirm(){return false}});
 vm.runInContext(kernelControlPage.match(/<script>([\s\S]*)<\/script>/)[1],context);
 return {elements,calls,messages,listeners,parent,location,document,run:code=>vm.runInContext(code,context),flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('kernel controls use stored language, update footer, and accept only the parent at the same origin',async()=>{
 const h=controlsHarness();await h.flush();assert.equal(h.document.documentElement.lang,'zh');assert.equal(h.elements.get('restart').textContent,'重启应用');assert.equal(h.elements.get('footer').textContent,'内核 0.9.6');
 const send=(origin,source,language)=>h.listeners.message({origin,source,data:{type:'saplingagent:language',language}});
 send('https://untrusted.invalid',h.parent,'en');send(h.location.origin,{},'en');send(h.location.origin,h.parent,'unsupported');assert.equal(h.document.documentElement.lang,'zh');
 const before=h.calls.length;send(h.location.origin,h.parent,'en');assert.equal(h.document.documentElement.lang,'en');assert.equal(h.elements.get('restart').textContent,'Restart app');assert.equal(h.elements.get('footer').textContent,'Kernel 0.9.6');assert.equal(h.calls.length,before);assert.equal(h.messages.length,0);
 h.elements.get('language').value='zh';await h.elements.get('language').onchange();assert.equal(h.document.documentElement.lang,'zh');assert.equal(h.messages.length,1);assert.equal(h.messages[0].data.type,'saplingagent:language');assert.equal(h.messages[0].origin,h.location.origin);assert.equal(h.calls.at(-1).options.body,JSON.stringify({language:'zh'}));
});

test('Go launcher uses explicit choice, saved project preference, then OS locale; catalog stays read-only',{skip:process.platform!=='darwin',timeout:120000},async t=>{
 const go=path.join(project,'.runtime/go1.27.2-darwin-arm64/go/bin/go');if(!await fs.access(go).then(()=>true,()=>false)){t.skip('project-local Go unavailable');return}
 const base=path.join(project,'.cache/native-language-tests');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'locale-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await prepareBuildStorage(root);
 await fs.copyFile(path.join(project,'kernel/launcher/native/localization.go'),path.join(root,'localization.go'));
 await fs.writeFile(path.join(root,'localization_generated.go'),'package main\nfunc init(){launcherMessagesJSON = '+JSON.stringify(JSON.stringify(launcherMessages))+'}\n');
 await fs.writeFile(path.join(root,'language_test.go'),`package main
import("testing";"os";"path/filepath")
func systemLanguage()string{return "zh_CN.UTF-8"}
func TestPreference(t *testing.T){
 root:=t.TempDir();t.Setenv("SAPLING_LANG_EXPLICIT","0");t.Setenv("SAPLING_LANG","en");loadLanguage(root);if launcherLanguage!="zh"{t.Fatal("OS locale fallback")};if translated("Restart app")!="Restart app"{t.Fatal("unknown key fallback")};if translated("Project launcher")!="项目启动器"{t.Fatal("generated catalog")}
 os.Mkdir(filepath.Join(root,"config"),0700);file:=filepath.Join(root,"config/ui-language.json");os.WriteFile(file,[]byte("{\\"schemaVersion\\":1,\\"language\\":\\"en\\"}"),0600);loadLanguage(root);if launcherLanguage!="en"{t.Fatal("saved preference")}
 t.Setenv("SAPLING_LANG_EXPLICIT","1");t.Setenv("SAPLING_LANG","zh");loadLanguage(root);if launcherLanguage!="zh"{t.Fatal("explicit override")};data,_:=os.ReadFile(file);if string(data)!="{\\"schemaVersion\\":1,\\"language\\":\\"en\\"}"{t.Fatal("launcher rewrote preference")}
}
`);
 const result=await exec(go,['test','-count=1','-v','.'],{cwd:root,env:buildEnv(root),timeout:110000});assert.match(result.stdout,/PASS/);
});


test('an older language GET cannot undo a saved selector choice or a trusted parent update',async()=>{
 let pending,delay=false;const h=controlsHarness({getLanguage:()=>delay?new Promise(resolve=>pending=resolve):Promise.resolve('zh')});await h.flush();delay=true;
 const oldRead=h.run('syncLanguage()');h.elements.get('language').value='en';await h.elements.get('language').onchange();pending('zh');await oldRead;assert.equal(h.document.documentElement.lang,'en');assert.equal(h.elements.get('language').disabled,false);
 const second=h.run('syncLanguage()');h.listeners.message({origin:h.location.origin,source:h.parent,data:{type:'saplingagent:language',language:'zh'}});pending('en');await second;assert.equal(h.document.documentElement.lang,'zh');
});


test('a late language save acknowledgement does not replace a newer parent choice',async()=>{
 let finish;const h=controlsHarness({setLanguage:()=>new Promise(resolve=>finish=resolve)});await h.flush();h.elements.get('language').value='en';const save=h.elements.get('language').onchange();
 h.listeners.message({origin:h.location.origin,source:h.parent,data:{type:'saplingagent:language',language:'zh'}});finish('en');await save;assert.equal(h.document.documentElement.lang,'zh');assert.equal(h.messages.length,0);assert.equal(h.elements.get('language').disabled,false);
});


test('embedded controls and footer hide their language toolbar while standalone controls keep it',async()=>{
 assert.match(kernelControlPage,/\.language-tools\[hidden\]\{display:none\}/);
 assert.doesNotMatch(kernelControlPage,/<nav[^>]*style=/);
 for(const options of [{},{footer:true},{standalone:true,footer:true}]){
  const h=controlsHarness(options);await h.flush();assert.equal(h.elements.get('language-tools').hidden,true);assert.equal(h.elements.get('restart-bar').textContent,'重启应用');assert.equal(h.elements.get('open').textContent,'内核');
  h.elements.get('open').onclick();assert.equal(h.elements.get('language-tools').hidden,true);
 }
 const standalone=controlsHarness({standalone:true});await standalone.flush();assert.equal(standalone.elements.get('language-tools').hidden,false);assert.equal(standalone.elements.get('language').value,'zh');
});
