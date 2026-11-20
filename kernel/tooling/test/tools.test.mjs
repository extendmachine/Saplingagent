import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureTools,toolSetStatus,bindAlias,npmFor} from '../tools.mjs';
import {readBindings,runtimeHome} from '../bindings.mjs';
import {ensureShared,atomicJSON,sharedEntry} from '../store.mjs';

const source=fileURLToPath(new URL('../../../',import.meta.url));
async function write(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof value==='string'?value:JSON.stringify(value));}
async function localNode(root){
  const directory=path.join(root,`.runtime/node-v${process.versions.node}-${process.platform==='win32'?'win':'darwin'}-${process.arch}`);
  const node=path.join(directory,process.platform==='win32'?'node.exe':'bin/node');
  await write(node,'portable Node fixture');await write(npmFor(node).args[0],'npm fixture');
  return directory;
}
async function fixture(t){
  await fs.mkdir(path.join(source,'.cache/shared-runtime-tests'),{recursive:true});
  const base=await fs.mkdtemp(path.join(source,'.cache/shared-runtime-tests/case-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const home=path.join(base,'shared'),calls=[];
  const app=async name=>{
    const root=path.join(base,name);await fs.mkdir(root,{recursive:true});
    await write(path.join(root,`kernel/config/${process.platform==='win32'?'windows':'macos'}.json`),{nodeVersion:process.versions.node,codexVersion:'0.146.1'});
    for(const name of ['sdk/package.json','sdk/package-lock.json','versions.json'])await fs.mkdir(path.dirname(path.join(root,'kernel/tooling',name)),{recursive:true}).then(()=>fs.copyFile(path.join(source,'kernel/tooling',name),path.join(root,'kernel/tooling',name)));
    await write(path.join(root,'local-secrets/auth-sentinel'),'private fixture');await write(path.join(root,'data/session-sentinel'),'conversation fixture');
    return root;
  };
  const run=async(command,args,{cwd}={})=>{
    if(args.includes('ci')||args.includes('install')){
      calls.push({args,cwd});const m=JSON.parse(await fs.readFile(path.join(cwd,'package.json')));
      for(const [name,version]of Object.entries(m.dependencies)){
        const dir=path.join(cwd,'node_modules',name);await write(path.join(dir,'package.json'),{version,main:'index.mjs'});await write(path.join(dir,'index.mjs'),'export default true;');
        if(name.startsWith('@anthropic-ai/claude-agent-sdk-'))await write(path.join(dir,process.platform==='win32'?'claude.exe':'claude'),'2.1.296 (Claude Code)');
        if(name==='opencode-ai')await write(path.join(dir,'bin/opencode.exe'),'1.19.0');
        if(name==='@openai/codex'){
          const binary=process.platform==='win32'?path.join(cwd,`node_modules/@openai/codex-win32-${process.arch}/vendor/${process.arch==='arm64'?'aarch64':'x86_64'}-pc-windows-msvc/bin/codex.exe`):path.join(cwd,'node_modules/.bin/codex');
          await write(binary,'codex-cli 0.146.1');
        }
      }
      return 'prepared';
    }
    if(args[0]==='app-server')return 'stdio app-server';
    return fs.readFile(command,'utf8');
  };
  return {base,home,calls,app,run,options:{home,run,candidates:()=>[]}};
}
test('two projects share tool programs and SDK but retain their own auth, sessions and bindings',async t=>{
  const f=await fixture(t),a=await f.app('app 中文 A'),b=await f.app('app B');
  assert.equal((await ensureTools(a,f.options)).ready,true);assert.equal(f.calls.length,4);
  assert.equal((await ensureTools(b,f.options)).ready,true);assert.equal(f.calls.length,4);
  assert.equal(readBindings(a).tools.codex.path,readBindings(b).tools.codex.path);
  assert.equal(readBindings(a).sdk.path,readBindings(b).sdk.path);
  assert.equal(await fs.readFile(path.join(b,'local-secrets/auth-sentinel'),'utf8'),'private fixture');
  assert.equal(await fs.readFile(path.join(a,'data/session-sentinel'),'utf8'),'conversation fixture');
  assert.ok(f.calls.find(c=>c.args.includes('ci')).args.includes('--omit=optional'));
  assert.equal((await toolSetStatus(b)).ready,true);
});
test('compatible local CLIs skip every native CLI installation; only the SDK is prepared',async t=>{
  const f=await fixture(t),a=await f.app('app'),candidates={};
  for(const [name,text]of Object.entries({codex:'codex-cli 0.146.1',claude:'2.1.296 (Claude Code)',opencode:'1.19.0'})){
    candidates[name]=path.join(f.base,'local',name);await write(candidates[name],text);
  }
  await ensureTools(a,{...f.options,candidates:name=>[candidates[name]]});
  assert.equal(f.calls.length,1);assert.ok(f.calls[0].args.includes('ci'));
  assert.equal(readBindings(a).tools.claude.source,'local');
});
test('missing, broken or incompatible system detections fall back instead of stopping installation',async t=>{
  const f=await fixture(t),a=await f.app('app');const bad=path.join(f.base,'bad');await write(bad,'0.0.1');
  await ensureTools(a,{...f.options,candidates:()=>[path.join(f.base,'missing'),bad]});
  assert.equal(f.calls.length,4);assert.equal((await toolSetStatus(a)).ready,true);
});
test('concurrent project installs publish each shared version only once',async t=>{
  const f=await fixture(t),a=await f.app('a'),b=await f.app('b');
  await Promise.all([ensureTools(a,f.options),ensureTools(b,f.options)]);
  assert.equal(f.calls.length,4);assert.equal(readBindings(a).tools.claude.path,readBindings(b).tools.claude.path);
});
test('deleted or changed external program invalidates readiness and is repaired on next preparation',async t=>{
  const f=await fixture(t),a=await f.app('app');await ensureTools(a,f.options);
  const previous=readBindings(a).tools.codex.path;await fs.unlink(previous);
  assert.equal((await toolSetStatus(a)).ready,false);await ensureTools(a,f.options);
  assert.equal(f.calls.length,5);assert.notEqual(readBindings(a).tools.codex.path,previous);
  assert.equal((await toolSetStatus(a)).ready,true);
});
test('shared install failure never replaces the previously published version',async t=>{
  const f=await fixture(t);let good=true;
  const first=await ensureShared(f.home,'example-1',{validate:async dir=>good&&await fs.readFile(path.join(dir,'ok'),'utf8').then(x=>x==='yes',()=>false),create:dir=>write(path.join(dir,'ok'),'yes')});
  good=false;
  await assert.rejects(ensureShared(f.home,'example-1',{validate:async()=>false,create:async()=>{throw Error('fixture network failure');}}),/fixture network/);
  assert.equal(await fs.readFile(path.join(first,'ok'),'utf8'),'yes');
  const index=JSON.parse(await fs.readFile(path.join(f.home,'index/example-1.json')));assert.equal(path.resolve(f.home,index.directory),first);
});
test('portable mode keeps shared-store machinery inside the project',async t=>{
  const f=await fixture(t),a=await f.app('portable');
  await write(path.join(a,'.runtime/runtime-mode'),'portable\n');
  await localNode(a);
  assert.equal(runtimeHome(a),path.join(a,'.runtime/tool-store'));
  await ensureTools(a,{run:f.run,candidates:()=>{throw Error('portable must not probe external CLI');}});
  assert.equal(readBindings(a).mode,'portable');assert.ok(readBindings(a).sdk.path.startsWith(a+path.sep));
});
test('ordinary preexisting alias directories are retained; explicit bindings work without symlinks',async t=>{
  const f=await fixture(t),a=await f.app('app'),target=path.join(f.base,'tool');await write(target,'native executable');
  await write(path.join(a,'.runtime/tools/custom/sentinel'),'retain');
  assert.deepEqual(await bindAlias(a,'custom',target),{status:'path-only'});
  assert.equal(await fs.readFile(path.join(a,'.runtime/tools/custom/sentinel'),'utf8'),'retain');
});
test('a shared-store index cannot escape the runtime directory',async t=>{
  const f=await fixture(t);await atomicJSON(path.join(f.home,'index/escape.json'),{directory:f.base});
  assert.equal(await sharedEntry(f.home,'escape',async()=>true),null);
});

test('portable folder rename rebinds programs and SDK without reinstalling them',async t=>{
 const f=await fixture(t),a=await f.app('portable before');
 await write(path.join(a,'.runtime/runtime-mode'),'portable\n');
 await localNode(a);
 await ensureTools(a,{run:f.run,candidates:()=>[]});assert.equal(f.calls.length,4);
 const b=path.join(f.base,'portable after');await fs.rename(a,b);
 assert.equal((await toolSetStatus(b)).ready,true);
 await ensureTools(b,{run:f.run,candidates:()=>[]});assert.equal(f.calls.length,4);
 assert.equal((await toolSetStatus(b)).ready,true);assert.ok(readBindings(b).tools.claude.path.startsWith(b+path.sep));
});

test('bootstrap mode marker supersedes existing receipts and returning to shared reuses the previous library',async t=>{
  const f=await fixture(t),root=await f.app('mode switch'),marker=path.join(root,'.runtime/runtime-mode');
  const receiptFile=path.join(root,'.runtime/tool-bindings.json');
  await ensureTools(root,f.options);
  const shared=readBindings(root),go=path.join(f.home,'bin/go');
  await write(go,'Go fixture');shared.tools.go={path:go};await write(receiptFile,shared);
  await bindAlias(root,'go',go);
  await write(marker,'portable\n');
  assert.equal((await toolSetStatus(root)).ready,false);
  assert.equal(runtimeHome(root),path.join(root,'.runtime/tool-store'));
  const nodeDirectory=await localNode(root);
  const options={run:f.run,candidates:()=>[]};
  assert.equal((await ensureTools(root,options)).ready,true);
  const portable=readBindings(root);
  assert.equal(portable.mode,'portable');assert.equal(portable.tools.go,undefined);
  assert.equal(await fs.lstat(path.join(root,'.runtime/tools/go')).then(()=>true,()=>false),false);
  for(const tool of Object.values(portable.tools))assert.ok((await fs.realpath(tool.path)).startsWith(root+path.sep));
  assert.ok((await fs.realpath(portable.sdk.path)).startsWith(root+path.sep));
  const count=f.calls.length;
  await write(marker,'shared\n');
  assert.equal((await toolSetStatus(root)).ready,false);assert.equal(runtimeHome(root),f.home);
  await fs.rm(nodeDirectory,{recursive:true}); // Shared bootstrap can now use Node on PATH.
  assert.equal((await ensureTools(root,options)).ready,true);
  assert.equal(f.calls.length,count);
  assert.equal(readBindings(root).sdk.path,shared.sdk.path);
  assert.equal(readBindings(root).tools.codex.path,shared.tools.codex.path);
});

test('portable readiness detects external SDK contents or aliases left pointing at the original project',async t=>{
  const f=await fixture(t),root=await f.app('original portable'),copy=path.join(f.base,'copy');
  await write(path.join(root,'.runtime/runtime-mode'),'portable\n');
  await localNode(root);
  await ensureTools(root,{run:f.run,candidates:()=>[]});
  await fs.cp(root,copy,{recursive:true,verbatimSymlinks:true,preserveTimestamps:true});
  const options={run:f.run,candidates:()=>[]};
  await ensureTools(copy,options); // Copies can legitimately have different mtimes.
  const receipt=readBindings(copy),old=readBindings(root);
  const cli=receipt.tools.codex;
  if(cli.alias.status==='linked'){
    const alias=path.dirname(cli.alias.path);
    await fs.unlink(alias);await fs.symlink(path.dirname(old.tools.codex.path),alias,process.platform==='win32'?'junction':'dir');
    assert.equal((await toolSetStatus(copy)).ready,false);
    assert.equal((await ensureTools(copy,options)).ready,true);
  }
  const pkg=path.join(receipt.sdk.path,'@anthropic-ai/claude-agent-sdk');
  const outside=path.join(old.sdk.path,'@anthropic-ai/claude-agent-sdk');
  await fs.rm(pkg,{recursive:true});await fs.symlink(outside,pkg,process.platform==='win32'?'junction':'dir');
  assert.equal((await toolSetStatus(copy)).ready,false);
  assert.equal((await ensureTools(copy,options)).ready,true);
  assert.equal((await toolSetStatus(root)).ready,true);
});

test('external-only setup prepares just Node; switching providers prepares only the requested CLI and SDK',async t=>{
  const f=await fixture(t),root=await f.app('selected engines');
  await write(path.join(root,'config/mcp-access.json'),{schemaVersion:1,revision:1,enabled:true,externalOnly:true});
  const {runtimeEngines}=await import('../providers.mjs');
  assert.deepEqual(await runtimeEngines(root),[]);
  assert.equal((await ensureTools(root,{...f.options,engines:[]})).ready,true);
  assert.deepEqual(f.calls,[]);
  assert.deepEqual(Object.keys(readBindings(root).tools),['node']);
  await ensureTools(root,{...f.options,engines:['codex']});
  const codex=readBindings(root).tools.codex.path;
  assert.equal(f.calls.length,1);
  assert.equal((await toolSetStatus(root,['claude'])).ready,false);
  await ensureTools(root,{...f.options,engines:['opencode']});
  const partial=readBindings(root);
  assert.equal(partial.tools.codex.path,codex);
  assert.equal(partial.tools.claude,undefined);
  assert.ok(partial.sdks.opencode.path);
  await assert.rejects(fs.access(path.join(partial.sdks.opencode.path,'@anthropic-ai/claude-agent-sdk')));
  await ensureTools(root,{...f.options,engines:['claude']});
  assert.equal((await toolSetStatus(root)).ready,true);
  assert.equal(readBindings(root).sdks.opencode.path,partial.sdks.opencode.path);
});

test('cancelled waiting installer preserves the current owner and does not run any install',async t=>{
  const f=await fixture(t),root=await f.app('waiting');
  const lock=path.join(root,'.runtime/tool-setup.lock/owner.json');
  await write(lock,{id:'active-fixture',pid:process.pid});
  const controller=new AbortController();
  const pending=ensureTools(root,{...f.options,engines:['codex'],signal:controller.signal});
  setTimeout(()=>controller.abort(),10);
  await assert.rejects(pending,error=>error.name==='AbortError');
  assert.equal(JSON.parse(await fs.readFile(lock)).id,'active-fixture');
  assert.deepEqual(f.calls,[]);
});

test('browser Codex login prepares only its engine and cancels while waiting for an existing tool owner',async t=>{
  const {AccountSetup}=await import('../../services/ai-config/auth.mjs');
  const f=await fixture(t),root=await f.app('login wait'),lock=path.join(root,'.runtime/tool-setup.lock/owner.json');
  await write(lock,{pid:process.pid,id:'other-operation'});
  let started=0;
  class Client{constructor(){started++;throw Error('no program before preparation');}}
  const auth=new AccountSetup(root,{},{Client});
  const pending=auth.begin('chatgpt');
  const outcome=assert.rejects(pending,{code:'LOGIN_CANCELLED'});
  for(let i=0;i<150&&!auth.preparing;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(auth.preparing);
  await auth.close();
  await outcome;
  assert.equal(started,0);
  assert.equal(auth.snapshot().phase,'cancelled');
  assert.equal(JSON.parse(await fs.readFile(lock)).id,'other-operation');
});
