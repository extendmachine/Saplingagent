import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { openProjectLogs } from '../status.mjs';
import { renderRuntimeStatusPage } from '../status-page.mjs';

test('logs dispatch opens only the project folder with argv on Mac and Windows, refusing symlinks', async t => {
  const cache = fileURLToPath(new URL('../../../../.cache/runtime-status-tests/', import.meta.url));
  await fs.mkdir(cache,{recursive:true});
  const root=await fs.mkdtemp(path.join(cache,'logs-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const calls=[];
  const launch=(command,args,options)=>{calls.push({command,args,options});const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child};
  await assert.rejects(openProjectLogs(root,{platform:'darwin',launch}),{code:'LOGS_UNAVAILABLE'});
  await fs.mkdir(path.join(root,'logs'));
  for(const platform of ['darwin','win32'])assert.deepEqual(await openProjectLogs(root,{platform,launch}),{requested:true});
  assert.equal(calls[0].command,'/usr/bin/open');assert.equal(calls[1].command,'explorer.exe');
  for(const call of calls){assert.deepEqual(call.args,[path.join(root,'logs')]);assert.equal(call.options.shell,false);assert.equal(call.options.cwd,path.dirname(root))}
  await fs.rename(path.join(root,'logs'),path.join(root,'elsewhere'));await fs.symlink(path.join(root,'elsewhere'),path.join(root,'logs'),'dir');
  await assert.rejects(openProjectLogs(root,{platform:'darwin',launch}),{code:'LOGS_UNAVAILABLE'});assert.equal(calls.length,2);
});

function pageHarness(fetch) {
  const elements=new Map();
  const element=()=>({textContent:'',disabled:false,hidden:false,children:[],attrs:{},appendChild(child){this.children.push(child)},replaceChildren(...children){this.children=children},setAttribute(key,value){this.attrs[key]=value},removeAttribute(key){delete this.attrs[key];delete this[key]}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element,title:'',documentElement:{lang:'en'},querySelectorAll(){return []}};
  const timers=[];
  const context=vm.createContext({document,fetch,URL,AbortSignal,Date,console,setTimeout(fn){const timer={fn,cancelled:false};timers.push(timer);return timer},clearTimeout(timer){if(timer)timer.cancelled=true}});
  vm.runInContext(renderRuntimeStatusPage({state:()=>({applicationRoot:'/project'})}).match(/<script>([\s\S]*)<\/script>/)[1],context);
  return{context,elements,timers,flush:()=>new Promise(resolve=>setImmediate(resolve)),run:code=>vm.runInContext(code,context)};
}
const state={instanceId:'fixture-instance',projectName:'<script>unsafe</script>',kernelVersion:'0.9.5',applicationRoot:'/project',url:'http://127.0.0.1:5178/',phase:'ready',canRestart:true,canStop:true,ports:{runtimeManagerPort:4319},services:[{name:'worker',pid:1234,running:true,healthCheck:'process'}]};
const response=data=>({ok:true,json:async()=>data});

test('status page confirms the matching stop response then halts polling without navigating', async()=>{
  const calls=[];const h=pageHarness(async(route,options)=>{calls.push({route,options});return response(route.endsWith('/status')?state:{stopped:true,instanceId:state.instanceId})});
  await h.flush();assert.equal(h.elements.get('name').textContent,state.projectName);assert.equal(h.elements.get('stop').disabled,false);
  assert.equal(h.elements.get('services').children[0].children[3].textContent,'None (worker)');
  await h.elements.get('stop').onclick();
  assert.equal(h.elements.get('phase').textContent,'Stopped');assert.match(h.elements.get('message').textContent,/all managed project services exited/);
  assert.equal(h.timers.filter(x=>!x.cancelled).length,0);assert.equal(h.elements.get('open').attrs['aria-disabled'],'true');
  const sent=JSON.parse(calls.find(x=>x.route.endsWith('/stop-and-wait')).options.body);assert.deepEqual(sent,{instanceId:state.instanceId});
});

test('status page never treats transport failure or a different stop receipt as confirmed shutdown', async()=>{
  for(const result of ['disconnect','wrong-instance']){
    const h=pageHarness(async route=>{if(route.endsWith('/status'))return response(state);if(result==='disconnect')throw Error('Connection lost');return response({stopped:true,instanceId:'other'})});
    await h.flush();await h.elements.get('stop').onclick();
    assert.equal(h.elements.get('phase').textContent,'Stop unconfirmed');assert.match(h.elements.get('message').textContent,/Stop not confirmed/);assert.equal(h.elements.get('reconnect').hidden,false);
    assert.equal(h.elements.get('stop').disabled,true);
  }
});

test('an old status page refuses a different project after its port is reused', async()=>{
  let different=false;const calls=[];
  const h=pageHarness(async route=>{calls.push(route);return response(different?{...state,instanceId:'another-runtime',applicationRoot:'/another-project',projectName:'Other project'}:state)});
  await h.flush();different=true;await h.run('update()');
  assert.equal(h.elements.get('phase').textContent,'Different project');assert.equal(h.elements.get('stop').disabled,true);assert.equal(h.elements.get('restart').disabled,true);
  assert.equal(h.elements.get('name').textContent,state.projectName);assert.match(h.elements.get('message').textContent,/original project/);
  await h.elements.get('stop').onclick();assert.ok(calls.every(route=>(route.endsWith('/status')||route.endsWith('/language'))));
});

test('same-project replacement is visible and restart uses the newly observed instance', async()=>{
  let changed=false;let body;
  const h=pageHarness(async(route,options)=>{if(route.endsWith('/status'))return response({...state,instanceId:changed?'new-instance':state.instanceId});body=JSON.parse(options.body);return response({jobId:'job'})});
  await h.flush();changed=true;await h.run('update()');assert.match(h.elements.get('message').textContent,/new runtime/);
  await h.elements.get('restart').onclick();assert.deepEqual(body,{scope:'all',instanceId:'new-instance'});
});

test('an older failed poll cannot overwrite confirmed stop or restart polling', async()=>{
  let statusRequests=0,rejectPoll;
  const deferred=new Promise((resolve,reject)=>{rejectPoll=reject});
  const h=pageHarness(async route=>{
    if(route.endsWith('/status'))return ++statusRequests===1?response(state):deferred;
    return response({stopped:true,instanceId:state.instanceId});
  });
  await h.flush();
  const oldPoll=h.run('update()');
  await h.elements.get('stop').onclick();
  assert.equal(h.elements.get('phase').textContent,'Stopped');
  rejectPoll(Error('Host exited after confirmed stop'));
  await oldPoll;
  assert.equal(h.elements.get('phase').textContent,'Stopped');
  assert.match(h.elements.get('message').textContent,/all managed project services exited/);
  assert.equal(h.timers.filter(x=>!x.cancelled).length,0);
  assert.equal(h.elements.get('stop').disabled,true);
  assert.equal(h.elements.get('open').attrs['aria-disabled'],'true');
});

test('an older failed poll does not replace progress while stop confirmation is pending', async()=>{
  let statusRequests=0,rejectPoll,confirmStop;
  const deferredPoll=new Promise((resolve,reject)=>{rejectPoll=reject});
  const deferredStop=new Promise(resolve=>{confirmStop=resolve});
  const h=pageHarness(async route=>route.endsWith('/status')?(++statusRequests===1?response(state):deferredPoll):deferredStop);
  await h.flush();const oldPoll=h.run('update()');const stopping=h.elements.get('stop').onclick();
  rejectPoll(Error('Connection closed during shutdown'));await oldPoll;
  assert.match(h.elements.get('message').textContent,/Waiting for confirmed exit/);
  assert.equal(h.elements.get('stop').disabled,true);
  confirmStop(response({stopped:true,instanceId:state.instanceId}));await stopping;
  assert.equal(h.elements.get('phase').textContent,'Stopped');assert.equal(h.timers.filter(x=>!x.cancelled).length,0);
});

test('runtime status changes language without navigation or changing the stop receipt',async()=>{
 const calls=[];let language='zh';const h=pageHarness(async(route,options)=>{calls.push({route,options});if(route.endsWith('/status'))return response(state);if(route.endsWith('/language')){if(options.method==='POST')language=JSON.parse(options.body).language;return response({language})}return response({stopped:true,instanceId:state.instanceId})});
 await h.flush();assert.equal(h.elements.get('phase').textContent,'就绪');assert.match(h.elements.get('version').textContent,/内核/);assert.equal(h.elements.get('services').children[0].children[1].textContent,'运行中');
 h.elements.get('language').value='en';await h.elements.get('language').onchange();assert.equal(h.elements.get('phase').textContent,'Ready');await h.elements.get('stop').onclick();assert.equal(h.elements.get('phase').textContent,'Stopped');assert.equal(h.timers.filter(x=>!x.cancelled).length,0);assert.deepEqual(JSON.parse(calls.find(x=>x.route.endsWith('/stop-and-wait')).options.body),{instanceId:state.instanceId});
});
