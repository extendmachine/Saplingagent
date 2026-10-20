import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {buildEnv,prepareBuildStorage,compileLauncher,command,publishArtifact} from '../build.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
async function fixture(t){const base=path.join(repo,'.cache/relative-storage');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'app-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('build environment resets inherited capsule storage and disables telemetry locally',async t=>{
 const root=await fixture(t);await prepareBuildStorage(root);const previous=process.env.NODE_COMPILE_CACHE;process.env.NODE_COMPILE_CACHE='/foreign/cache';
 const env=buildEnv(root);if(previous===undefined)delete process.env.NODE_COMPILE_CACHE;else process.env.NODE_COMPILE_CACHE=previous;
 for(const key of ['TMP','TEMP','TMPDIR','GOTMPDIR','GOCACHE','GOMODCACHE','GOPATH','TEST_TELEMETRY_DIR','NODE_COMPILE_CACHE','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME','npm_config_cache'])assert.ok(env[key].startsWith(root+path.sep),key);
 assert.equal(await fs.readFile(path.join(root,'.cache/go-telemetry/mode'),'utf8'),'off\n');
 assert.equal(env.HOME,process.env.HOME);assert.equal(env.GOENV,'off');
});

test('managed cache symlinks refuse writes without touching their target',async t=>{
 const root=await fixture(t),outside=await fixture(t);await fs.symlink(outside,path.join(root,'.cache'));
 await assert.rejects(prepareBuildStorage(root),e=>e.code==='PROJECT_STORAGE_LOCATION');assert.deepEqual(await fs.readdir(outside),[]);
});

test('launcher commands and staged artifacts cannot select unrelated output folders',async t=>{
 const root=await fixture(t),outside=await fixture(t);await fs.writeFile(path.join(outside,'stage.exe'),'synthetic');
 await assert.rejects(command(root,process.execPath,['-e','process.exit(0)'],{cwd:outside}),e=>e.code==='PROJECT_STORAGE_LOCATION');
 await fs.symlink(outside,path.join(root,'redirect'));await assert.rejects(command(root,process.execPath,['-e','process.exit(0)'],{cwd:path.join(root,'redirect','must-not-exist')}),e=>e.code==='PROJECT_STORAGE_LOCATION');await assert.rejects(fs.access(path.join(outside,'must-not-exist')));
 await assert.rejects(publishArtifact(root,path.join(outside,'stage.exe'),'App.exe'),e=>e.code==='PROJECT_STORAGE_LOCATION');
 assert.equal(await fs.readFile(path.join(outside,'stage.exe'),'utf8'),'synthetic');
});

test('compiler refuses existing compile and operation owners and preserves their leases',async t=>{
 const root=await fixture(t);await fs.mkdir(path.join(root,'.runtime'));const compile=path.join(root,'.runtime/launcher-compile.lock'),operation=path.join(root,'.runtime/kernel-operation.lock');
 await fs.writeFile(compile,'foreign-compile');await assert.rejects(compileLauncher(root,{}),e=>e.code==='LAUNCHER_BUILD_BUSY');assert.equal(await fs.readFile(compile,'utf8'),'foreign-compile');await fs.rm(compile);
 await fs.writeFile(operation,'foreign-operation');await assert.rejects(compileLauncher(root,{}),e=>e.code==='LAUNCHER_BUILD_BUSY');assert.equal(await fs.readFile(operation,'utf8'),'foreign-operation');await assert.rejects(fs.access(compile));
});

test('compiler allows only its explicit same-process setup owner and closes operation handles on failure',async t=>{
 const root=await fixture(t),id=randomUUID();await fs.mkdir(path.join(root,'.runtime'));const setup=path.join(root,'.runtime/project-finalization.json');await fs.writeFile(setup,JSON.stringify({id,pid:process.pid}));
 await assert.rejects(compileLauncher(root,{}),e=>e.code==='LAUNCHER_BUILD_BUSY');
 await assert.rejects(compileLauncher(root,{},{setupId:randomUUID()}),e=>e.code==='LAUNCHER_BUILD_BUSY');
 await assert.rejects(compileLauncher(root,{},{setupId:id}),e=>e.code==='ENOENT');
 assert.equal(JSON.parse(await fs.readFile(setup)).id,id);await assert.rejects(fs.access(path.join(root,'.runtime/launcher-compile.lock')));await assert.rejects(fs.access(path.join(root,'.runtime/kernel-operation.lock')));
});

test('offline helper refuses an arbitrary external parent before spawning and releases only its leases',async t=>{
 const root=await fixture(t),outside=await fixture(t);await fs.mkdir(path.join(root,'.runtime'));const management={pid:process.pid,port:62025,instanceId:randomUUID()};await fs.writeFile(path.join(root,'.runtime/management-address.json'),JSON.stringify({...management,root}));
 const {beginFinalization}=await import('../finalization.mjs');let spawned=false;
 await assert.rejects(beginFinalization(root,{project:{projectId:randomUUID(),folderName:path.basename(root)},management,node:path.join(root,'.runtime/node'),tempParent:outside,platform:'darwin',spawnHelper:()=>{spawned=true;}}),e=>e.code==='PROJECT_HELPER_LOCATION');
 assert.equal(spawned,false);assert.deepEqual(await fs.readdir(outside),[]);await assert.rejects(fs.access(path.join(root,'.runtime/project-finalization.json')));await assert.rejects(fs.access(path.join(root,'.runtime/kernel-operation.lock')));
});

for(const busy of ['operation','runtime'])test(`offline finalization preserves a competing ${busy} and removes its own lease`,async t=>{
 const root=await fixture(t);await fs.mkdir(path.join(root,'.runtime'));const management={pid:process.pid,port:62025,instanceId:randomUUID()};await fs.writeFile(path.join(root,'.runtime/management-address.json'),JSON.stringify({...management,root}));
 const foreign=path.join(root,'.runtime',busy==='operation'?'kernel-operation.lock':'runtime-address.json'),value=busy==='operation'?'foreign-operation':JSON.stringify({pid:process.pid,root,instanceId:randomUUID()});await fs.writeFile(foreign,value);
 const {beginFinalization}=await import('../finalization.mjs');let spawned=false;
 await assert.rejects(beginFinalization(root,{project:{projectId:randomUUID(),folderName:path.basename(root)},management,node:path.join(root,'.runtime/node'),platform:'darwin',spawnHelper:()=>{spawned=true;}}),e=>e.code===(busy==='operation'?'PROJECT_BUSY':'KERNEL_BUSY'));
 assert.equal(spawned,false);assert.equal(await fs.readFile(foreign,'utf8'),value);await assert.rejects(fs.access(path.join(root,'.runtime/project-finalization.json')));
 if(busy==='runtime')await assert.rejects(fs.access(path.join(root,'.runtime/kernel-operation.lock')));
});

test('pinned compiler runs with local disabled telemetry and cannot populate inherited configuration',async t=>{
 const root=await fixture(t),home=await fixture(t),go=path.join(repo,'.runtime/go1.27.2-darwin-arm64/go/bin/go');
 if(!await fs.access(go).then(()=>true,()=>false)){t.skip('Pinned local Go toolchain is unavailable');return;}
 const env={...buildEnv(root),HOME:home,APPDATA:home,LOCALAPPDATA:home};await command(root,go,['version'],{env});
 assert.deepEqual(await fs.readdir(home),[]);assert.deepEqual(await fs.readdir(path.join(root,'.cache/go-telemetry')),['mode']);
});

for(const failingName of ['launcher-compile.lock','kernel-operation.lock'])test(`partial ${failingName} initialization closes handles and removes only created files`,async t=>{
 const root=await fixture(t),originalOpen=fs.open;let closed=0;const failure=Object.assign(Error('Synthetic storage write failure'),{code:'ENOSPC'});
 fs.open=async function(file,...args){
  const handle=await originalOpen.call(fs,file,...args);
  if(path.basename(String(file))!==failingName)return handle;
  return {stat:options=>handle.stat(options),writeFile:async()=>{await handle.writeFile('{"id":');throw failure;},close:async()=>{await handle.close();closed++;}};
 };
 try{await assert.rejects(compileLauncher(root,{}),error=>error===failure);}finally{fs.open=originalOpen;}
 assert.equal(closed,1);for(const name of ['launcher-compile.lock','kernel-operation.lock'])await assert.rejects(fs.access(path.join(root,'.runtime',name)));
});

test('partial lease failure never deletes a replacement created under the same pathname',async t=>{
 const root=await fixture(t),originalOpen=fs.open;let closed=0;const failure=Object.assign(Error('Synthetic storage write failure'),{code:'ENOSPC'}),name=path.join(root,'.runtime/launcher-compile.lock');
 fs.open=async function(file,...args){
  const handle=await originalOpen.call(fs,file,...args);if(String(file)!==name)return handle;
  return {stat:options=>handle.stat(options),writeFile:async()=>{await handle.writeFile('{"id":');await fs.rename(name,name+'.owned-original');await fs.writeFile(name,'replacement-owned-elsewhere');throw failure;},close:async()=>{await handle.close();closed++;}};
 };
 try{await assert.rejects(compileLauncher(root,{}),error=>error===failure);}finally{fs.open=originalOpen;}
 assert.equal(closed,1);assert.equal(await fs.readFile(name,'utf8'),'replacement-owned-elsewhere');
});
