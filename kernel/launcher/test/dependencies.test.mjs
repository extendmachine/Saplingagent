import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {applicationDependencyStatus,ensureApplicationDependencies} from '../dependencies.mjs';
import {codexBinary,openCodeBinary,claudeBinary} from '../../contracts/local-process.mjs';

const source=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const platform=process.platform==='win32'?'windows':'macos';
async function write(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof value==='string'?value:JSON.stringify(value));}
async function fixture(t){
  const base=path.join(source,'.cache/dependency-tests');await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,'app 中文 '));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await write(path.join(root,`kernel/config/${platform}.json`),{codexVersion:'1.2.3'});
  for(const name of ['kernel','front','backend/custom']){
    await write(path.join(root,name,'package.json'),{dependencies:{example:'1.0.0'}});
    await write(path.join(root,name,'package-lock.json'),{lockfileVersion:3,packages:{'':{dependencies:{example:'1.0.0'}},'node_modules/example':{version:'1.0.0'}}});
  }
  let calls=[];
  const install=async(root,group)=>{
    calls.push(group.name);
    if(group.name==='codex'){
      await write(path.join(root,'.runtime/codex/node_modules/@openai/codex/package.json'),{version:'1.2.3'});
      await write(codexBinary(root),'synthetic executable');return;
    }
    await write(path.join(root,group.name,'node_modules/example/package.json'),{version:'1.0.0',main:'index.js'});
    await write(path.join(root,group.name,'node_modules/example/index.js'),'export default true;');
    if(group.name==='kernel'){
      await write(path.join(root,'kernel/node_modules/vite/bin/vite.js'),'');
      await write(openCodeBinary(root),'');await write(claudeBinary(root),'');
    }
    if(group.name==='front')for(const f of ['vite/bin/vite.js','typescript/bin/tsc'])await write(path.join(root,'front/node_modules',f),'');
  };
  return {root,install,calls};
}
test('first launch installs missing groups; unchanged launches do not run installer or alter source/config/auth/Git',async t=>{
  const f=await fixture(t);await write(path.join(f.root,'local-secrets/auth.json'),'private sentinel');await write(path.join(f.root,'.git/config'),'git sentinel');await write(path.join(f.root,'config/project.json'),'identity sentinel');
  assert.equal((await ensureApplicationDependencies(f.root,{install:f.install})).changed,true);
  assert.deepEqual(f.calls,['codex','kernel','front','backend/custom']);f.calls.length=0;
  assert.equal((await ensureApplicationDependencies(f.root,{install:f.install})).changed,false);assert.deepEqual(f.calls,[]);
  assert.equal(await fs.readFile(path.join(f.root,'local-secrets/auth.json'),'utf8'),'private sentinel');assert.equal(await fs.readFile(path.join(f.root,'.git/config'),'utf8'),'git sentinel');assert.equal(await fs.readFile(path.join(f.root,'config/project.json'),'utf8'),'identity sentinel');
});
test('a changed transitive lock entry repairs only its service',async t=>{
  const f=await fixture(t);await ensureApplicationDependencies(f.root,{install:f.install});f.calls.length=0;
  const file=path.join(f.root,'backend/custom/package-lock.json'),lock=JSON.parse(await fs.readFile(file));lock.packages['node_modules/transitive']={version:'2.0.0'};await write(file,lock);
  await ensureApplicationDependencies(f.root,{install:f.install});assert.deepEqual(f.calls,['backend/custom']);
});
test('missing direct module entry and tool executable trigger repair despite matching receipt',async t=>{
  const f=await fixture(t);await ensureApplicationDependencies(f.root,{install:f.install});f.calls.length=0;
  await fs.rm(path.join(f.root,'front/node_modules/example/index.js'));await fs.rm(codexBinary(f.root));
  await ensureApplicationDependencies(f.root,{install:f.install});assert.deepEqual(f.calls,['codex','front']);
});
test('parallel launches serialize preparation and reuse completed work',async t=>{
  const f=await fixture(t);const install=async(...args)=>{await delay(40);return f.install(...args);};
  const results=await Promise.all([ensureApplicationDependencies(f.root,{install}),ensureApplicationDependencies(f.root,{install})]);
  assert.deepEqual(results.map(x=>x.changed).sort(),[false,true]);assert.equal(f.calls.length,4);
});
test('failed group retains completed group receipts and retries only unfinished groups',async t=>{
  const f=await fixture(t);await assert.rejects(ensureApplicationDependencies(f.root,{install:async(...args)=>{if(args[1].name==='front')throw Error('synthetic install failure');return f.install(...args);}}),/synthetic install failure/);
  assert.deepEqual(f.calls,['codex','kernel']);f.calls.length=0;
  await ensureApplicationDependencies(f.root,{install:f.install});assert.deepEqual(f.calls,['front','backend/custom']);
});
test('changed declaration during installation is rejected and not certified',async t=>{
  const f=await fixture(t);await assert.rejects(ensureApplicationDependencies(f.root,{install:async(...args)=>{await f.install(...args);if(args[1].name==='front')await write(path.join(f.root,'front/package.json'),{dependencies:{example:'2.0.0'}});}}),{code:'DEPENDENCY_SOURCE_CHANGED'});
  const receipt=JSON.parse(await fs.readFile(path.join(f.root,'.runtime/dependencies.json')));assert.equal(receipt.groups.front,undefined);
});
test('installer claiming success without required files fails verification',async t=>{
  const f=await fixture(t);await assert.rejects(ensureApplicationDependencies(f.root,{install:async()=>{}}),{code:'DEPENDENCY_INSTALL_INCOMPLETE'});
});
test('active runtime blocks replacement and preserves previous files; complete runtime can be reused',async t=>{
  const f=await fixture(t);await write(path.join(f.root,'.runtime/runtime-address.json'),{pid:process.pid,root:f.root});
  await assert.rejects(ensureApplicationDependencies(f.root,{install:f.install}),{code:'DEPENDENCY_APP_RUNNING'});assert.deepEqual(f.calls,[]);
  await fs.rm(path.join(f.root,'.runtime/runtime-address.json'));await ensureApplicationDependencies(f.root,{install:f.install});await write(path.join(f.root,'.runtime/runtime-address.json'),{pid:process.pid});
  assert.equal((await ensureApplicationDependencies(f.root,{install:f.install})).changed,false);
});
test('kernel maintenance interlock rejects dependency writes',async t=>{
  const f=await fixture(t);await write(path.join(f.root,'.runtime/kernel-operation.lock'),'owned by maintenance');
  await assert.rejects(ensureApplicationDependencies(f.root,{install:f.install}),{code:'DEPENDENCY_MAINTENANCE_BUSY'});assert.deepEqual(f.calls,[]);
});
test('foreign install lock waits boundedly and remains intact',async t=>{
  const f=await fixture(t);const lock=path.join(f.root,`.runtime/${platform}-install.lock/owner.json`);await write(lock,{pid:process.pid,id:'another'});
  await assert.rejects(ensureApplicationDependencies(f.root,{install:f.install,waitMs:30}),{code:'DEPENDENCY_INSTALL_BUSY'});assert.equal(JSON.parse(await fs.readFile(lock)).id,'another');
});
test('lockfile missing from a declared custom service is an actionable error without writes',async t=>{
  const f=await fixture(t);await fs.rm(path.join(f.root,'backend/custom/package-lock.json'));
  await assert.rejects(applicationDependencyStatus(f.root),{code:'DEPENDENCY_LOCK_MISSING'});
});

test('dependency-free services need no package lock or install',async t=>{
  const f=await fixture(t);await write(path.join(f.root,'backend/empty/package.json'),{name:'empty'});
  await ensureApplicationDependencies(f.root,{install:f.install});assert.equal(f.calls.includes('backend/empty'),false);
});
test('matching legacy core lock signature is adopted while damaged installed metadata is repaired',async t=>{
  const f=await fixture(t);await ensureApplicationDependencies(f.root,{install:f.install});await fs.rm(path.join(f.root,'.runtime/dependencies.json'));
  const settings=JSON.parse(await fs.readFile(path.join(f.root,`kernel/config/${platform}.json`)));
  const signature=createHash('sha256').update(await fs.readFile(path.join(f.root,'kernel/package-lock.json'))).update(JSON.stringify(settings)).update(process.platform+process.arch).digest('hex');
  await write(path.join(f.root,'.runtime/core-install.json'),{signature});
  assert.equal((await applicationDependencyStatus(f.root)).groups.find(g=>g.name==='kernel').ready,true);
  await write(path.join(f.root,'kernel/node_modules/example/package.json'),'broken json');
  assert.equal((await applicationDependencyStatus(f.root)).groups.find(g=>g.name==='kernel').ready,false);
});
test('real offline npm repairs a local-file service dependency without changing lock/source or running its scripts',{skip:process.platform==='win32'},async t=>{
  const f=await fixture(t);await ensureApplicationDependencies(f.root,{install:f.install});
  const directory=path.join(f.root,'backend/custom'),vendor=path.join(directory,'vendor/example');
  await write(path.join(vendor,'package.json'),{name:'example',version:'1.0.0',main:'index.js',scripts:{install:'node -e "require(\'fs\').writeFileSync(\'unexpected-script\',\'ran\')"'}});
  await write(path.join(vendor,'index.js'),'module.exports=true;');await write(path.join(directory,'package.json'),{name:'custom',dependencies:{example:'file:./vendor/example'}});
  await fs.rm(path.join(directory,'package-lock.json'));await fs.rm(path.join(directory,'node_modules'),{recursive:true});
  const npm=path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
  await promisify(execFile)(process.execPath,[npm,'install','--package-lock-only','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:directory,env:{...process.env,npm_config_cache:path.join(f.root,'.cache/npm')}});
  const before=await fs.readFile(path.join(directory,'package-lock.json'));
  assert.equal((await ensureApplicationDependencies(f.root)).changed,true);
  assert.deepEqual(await fs.readFile(path.join(directory,'package-lock.json')),before);
  await assert.rejects(fs.access(path.join(vendor,'unexpected-script')));
  assert.equal((await ensureApplicationDependencies(f.root)).changed,false);
});

test('Node package-main resolution accepts extensionless files, directory indexes and package fallback without running code',async t=>{
  const f=await fixture(t);await ensureApplicationDependencies(f.root,{install:f.install});f.calls.length=0;
  const directory=path.join(f.root,'backend/custom/node_modules/example');
  const cases=[
    ['index','index.js'],['data','data.json'],['binding','binding.node'],
    ['lib','lib/index.js'],['lib','lib/index.json'],['lib','lib/index.node'],
    ['missing-main','index.js'],['main.mjs','main.mjs'],['package.json','package.json'],
  ];
  for(const [main,file]of cases){
    await fs.rm(directory,{recursive:true});
    await write(path.join(directory,'package.json'),{name:'example',version:'1.0.0',main});
    if(file!=='package.json')await write(path.join(directory,file),"throw Error('package code must never execute during dependency checks');");
    assert.equal((await applicationDependencyStatus(f.root)).groups.find(g=>g.name==='backend/custom').ready,true,`${main} -> ${file}`);
    assert.equal((await ensureApplicationDependencies(f.root,{install:f.install})).changed,false,`${main} -> ${file}`);
  }
  assert.deepEqual(f.calls,[]);
});
test('empty main directory and a removed resolved file require repair, rather than passing an existence check or resolution cache',async t=>{
  const f=await fixture(t);await ensureApplicationDependencies(f.root,{install:f.install});f.calls.length=0;
  const directory=path.join(f.root,'backend/custom/node_modules/example');
  await fs.rm(path.join(directory,'index.js'));await write(path.join(directory,'package.json'),{version:'1.0.0',main:'lib'});await write(path.join(directory,'lib/index.js'),'export default true;');
  assert.equal((await applicationDependencyStatus(f.root)).groups.find(g=>g.name==='backend/custom').ready,true);
  await fs.rm(path.join(directory,'lib/index.js'));
  assert.equal((await applicationDependencyStatus(f.root)).groups.find(g=>g.name==='backend/custom').ready,false);
  await ensureApplicationDependencies(f.root,{install:f.install});assert.deepEqual(f.calls,['backend/custom']);
});
test('package bin entries require exact regular files despite valid main resolution',async t=>{
  const f=await fixture(t);await ensureApplicationDependencies(f.root,{install:f.install});
  const directory=path.join(f.root,'backend/custom/node_modules/example');
  await write(path.join(directory,'package.json'),{version:'1.0.0',main:'index',bin:{example:'bin/tool'}});
  await write(path.join(directory,'bin/tool.js'),'console.log("not run")');
  assert.equal((await applicationDependencyStatus(f.root)).groups.find(g=>g.name==='backend/custom').ready,false);
  await fs.mkdir(path.join(directory,'bin/tool'));
  assert.equal((await applicationDependencyStatus(f.root)).groups.find(g=>g.name==='backend/custom').ready,false);
  await fs.rm(path.join(directory,'bin/tool'),{recursive:true});await write(path.join(directory,'bin/tool'),'#!/bin/sh\nexit 0');
  assert.equal((await applicationDependencyStatus(f.root)).groups.find(g=>g.name==='backend/custom').ready,true);
});

test('copied discovery for a different project never blocks local dependency repair',async t=>{
  const f=await fixture(t);await write(path.join(f.root,'.runtime/runtime-address.json'),{pid:process.pid,root:path.join(f.root,'other-project')});
  assert.equal((await ensureApplicationDependencies(f.root,{install:f.install})).changed,true);
});


test('dependency replacement refuses active external MCP before any installer writes',async t=>{
 const f=await fixture(t),id='01234567-1234-4321-8234-123456789abc';
 const file=path.join(f.root,'.runtime/mcp-access/clients',id+'.json');
 await write(file,{schemaVersion:1,id,root:await fs.realpath(f.root),pid:process.pid});
 await assert.rejects(ensureApplicationDependencies(f.root,{install:f.install}),{code:'MCP_CLIENTS_ACTIVE'});
 assert.deepEqual(f.calls,[]);assert.equal(await fs.access(file).then(()=>true,()=>false),true);
 assert.equal(await fs.access(path.join(f.root,`.runtime/${platform}-install.lock`)).then(()=>true,()=>false),false);
});

test('standalone kernel dependency repair also refuses connected MCP clients',async t=>{
 const f=await fixture(t),id='01234567-1234-4321-8234-123456789abc';
 await write(path.join(f.root,'.runtime/mcp-access/clients',id+'.json'),{schemaVersion:1,id,root:await fs.realpath(f.root),pid:process.pid});
 const before=await fs.readFile(path.join(f.root,'kernel/package-lock.json'));
 await assert.rejects(promisify(execFile)(process.execPath,[path.join(source,'kernel/install-dependencies.mjs'),f.root],{timeout:10000}),error=>error.code===1&&error.stderr.includes('MCP_CLIENTS_ACTIVE'));
 assert.deepEqual(await fs.readFile(path.join(f.root,'kernel/package-lock.json')),before);
 assert.equal(await fs.access(path.join(f.root,'.runtime/kernel-operation.lock')).then(()=>true,()=>false),false);
});
