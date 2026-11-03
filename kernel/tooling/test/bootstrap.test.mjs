import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ensureGo} from '../../launcher/build.mjs';
import {ensureShared} from '../store.mjs';
import {execute} from '../tools.mjs';

const source=fileURLToPath(new URL('../../../',import.meta.url)),exec=promisify(execFile);
async function fixture(t){
 const parent=path.join(source,'.cache/shared-bootstrap-tests');await fs.mkdir(parent,{recursive:true});
 const base=await fs.mkdtemp(path.join(parent,'case-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));return base;
}
test('two macOS projects reuse one Node installation through their canonical runtime paths',{skip:process.platform!=='darwin'},async t=>{
 const base=await fixture(t),home=path.join(base,'shared'),key=`node-v${process.versions.node}-darwin-${process.arch}`;
 await fs.mkdir(path.join(home,'runtimes'),{recursive:true});
 const original=path.resolve(path.dirname(process.execPath),'..');
 await fs.symlink(original,path.join(home,'runtimes',key));
 for(const name of ['first app','第二个项目']){
  const root=path.join(base,name);await fs.mkdir(path.join(root,'.runtime'),{recursive:true});
  await exec('/bin/bash',['-c','source "$HELPER"; SEED_PROJECT_DIR="$APP"; SEED_NODE_VERSION="$VERSION"; SEED_MAC_ARCH="$ARCH"; sapling_node_location; sapling_link_node'],{env:{...process.env,HELPER:path.join(source,'kernel/tooling/node-bootstrap.sh'),APP:root,VERSION:process.versions.node,ARCH:process.arch,PATH:'/usr/bin:/bin',SAPLING_RUNTIME_HOME:home},cwd:root});
  const alias=path.join(root,'.runtime',key);assert.ok((await fs.lstat(alias)).isSymbolicLink());assert.equal(await fs.realpath(alias),await fs.realpath(original));
 }
});
test('two project builds resolve the same checked shared Go compiler without downloading',{skip:process.platform==='win32'},async t=>{
 const previous=process.env.SAPLING_RUNTIME_HOME;delete process.env.SAPLING_RUNTIME_HOME;t.after(()=>{if(previous===undefined)delete process.env.SAPLING_RUNTIME_HOME;else process.env.SAPLING_RUNTIME_HOME=previous;});
 const base=await fixture(t),home=path.join(base,'shared'),pin=JSON.parse(await fs.readFile(path.join(source,'kernel/launcher/toolchain.json')));
 const arch=process.arch==='x64'?'amd64':process.arch;
 const directory=await ensureShared(home,`go-${pin.version}-${process.platform}-${arch}`,{
  validate:async dir=>fs.access(path.join(dir,'go/bin/go')).then(()=>true,()=>false),
  create:async dir=>{await fs.mkdir(path.join(dir,'go/bin'),{recursive:true});await fs.writeFile(path.join(dir,'go/bin/go'),`#!/bin/sh\necho 'go version ${pin.version} ${process.platform}/${arch}'\n`,{mode:0o755});}});
 for(const name of ['a','b']){
  const root=path.join(base,name);await fs.mkdir(path.join(root,'kernel/launcher'),{recursive:true});await fs.mkdir(path.join(root,'.runtime'),{recursive:true});
  await fs.copyFile(path.join(source,'kernel/launcher/toolchain.json'),path.join(root,'kernel/launcher/toolchain.json'));
  await fs.writeFile(path.join(root,'.runtime/tool-bindings.json'),JSON.stringify({schemaVersion:1,root,mode:'shared',home,tools:{}}));
  assert.equal(await ensureGo(root),path.join(directory,'go/bin/go'));
 }
});
test('a hung discovery command is stopped with a bounded timeout',async t=>{
 const root=await fixture(t);
 await assert.rejects(execute(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:root,timeout:150}),{code:'TOOL_TIMEOUT'});
});
