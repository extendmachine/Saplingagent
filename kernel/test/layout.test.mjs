import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PUBLIC_BRIDGE_FILES,isContainedKernelPath,validateKernelManifest} from '../contracts/kernel.mjs';
import {scanKernelFiles} from '../build-manifest.mjs';
import {checkKernel} from '../manager.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const manifest=JSON.parse(await fs.readFile(new URL('../manifest.json',import.meta.url)));
test('contained layout owns all core source but only finite thin adapters outside kernel',async()=>{
 assert.equal(manifest.layoutVersion,1);
 const files=await scanKernelFiles(root);
 assert.deepEqual(files.filter(f=>!f.path.startsWith('kernel/')).map(f=>f.path).sort(),[...PUBLIC_BRIDGE_FILES].sort());
 for(const file of files.filter(f=>!f.path.startsWith('kernel/'))){
  const text=await fs.readFile(path.join(root,file.path),'utf8');
  assert.ok(file.bytes<1100,'implementation escaped into '+file.path);
  assert.match(text,/kernel\//);
 }
 for(const prefix of ['kernel/ui/setup/','kernel/services/ai-config/','kernel/services/runtime-manager/','kernel/engines/providers/','kernel/scripts/','kernel/config/'])assert.ok(files.some(f=>f.path.startsWith(prefix)),prefix);
 assert.ok(!files.some(f=>f.path.startsWith('front/')));
});
test('contained manifests cannot claim unrelated application scripts or obsolete core directories',()=>{
 const file={path:'scripts/customer-feature.mjs',bytes:1,sha256:'a'.repeat(64),executable:false};
 assert.throws(()=>validateKernelManifest({...manifest,files:[...manifest.files,file]}),{code:'INVALID_KERNEL'});
 assert.throws(()=>validateKernelManifest({...manifest,layoutVersion:2}),{code:'INVALID_KERNEL'});
});
test('contained installations reject updating backwards into distributed source ownership',async t=>{
 const parent=path.join(root,'.cache/layout-tests');await fs.mkdir(parent,{recursive:true});
 const fixture=await fs.mkdtemp(path.join(parent,'app-'));t.after(()=>fs.rm(fixture,{recursive:true,force:true}));
 await fs.mkdir(path.join(fixture,'kernel'));await fs.writeFile(path.join(fixture,'kernel/manifest.json'),JSON.stringify(manifest));
 const distributed={...manifest};delete distributed.layoutVersion;
 await assert.rejects(checkKernel(fixture,{source:{resolve:async()=>'a'.repeat(40),read:async()=>Buffer.from(JSON.stringify(distributed))}}),{code:'KERNEL_INCOMPATIBLE'});
 assert.equal(await fs.readFile(path.join(fixture,'kernel/manifest.json'),'utf8'),JSON.stringify(manifest));
});

test('contained ownership still excludes private installed and historical task records',()=>{
 for(const file of ['kernel/services/ai-config/ai-tasks/handoff.md','kernel/.cache/setup/index.html','kernel/node_modules/react/index.js','kernel/data/customer.json','kernel/local-secrets/auth.json'])assert.equal(isContainedKernelPath(file),false,file);
});

test('old native launchers keep compatible Node metadata; canonical device defaults stay in kernel',async()=>{
 for(const platform of ['macos','windows']){
  const canonical=JSON.parse(await fs.readFile(path.join(root,'kernel/config/'+platform+'.json')));
  const bridge=JSON.parse(await fs.readFile(path.join(root,'config/'+platform+'.json')));
  assert.equal(bridge.nodeVersion,canonical.nodeVersion);assert.deepEqual(Object.keys(bridge).sort(),['$comment','nodeVersion']);
 }
});
