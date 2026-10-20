import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {moduleClosure,prepareConfigurationBundle,copyConfigurationBundle} from '../bundle.mjs';
import {readSession,saveSession} from '../session.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
test('configuration import closure is self-contained and includes frontend/backend handoff modules',async()=>{
 const files=await moduleClosure(repo);for(const name of ['kernel/configuration/host.mjs','kernel/services/ai-config/server.mjs','kernel/services/ai-config/auth.mjs','kernel/configuration/move.mjs','kernel/configuration/handoff.mjs','kernel/launcher/public.mjs','kernel/launcher/dock.mjs'])assert.ok(files.has(name),name);
 assert.ok(files.size<40);assert.equal([...files.keys()].some(name=>name.includes('node_modules')),false);
});
test('bundle rejects third-party and project-external imports instead of relying on a developer checkout',async t=>{
 const dir=path.join(repo,'.cache/configuration-tests');await fs.mkdir(dir,{recursive:true});const root=await fs.mkdtemp(path.join(dir,'invalid-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'kernel/configuration'),{recursive:true});
 const file=path.join(root,'kernel/configuration/host.mjs');await fs.writeFile(file,"import 'uninstalled-sdk';");await assert.rejects(moduleClosure(root),e=>e.code==='CONFIGURATION_BUNDLE_INVALID');await fs.writeFile(file,"import '../../../outside.mjs';");await assert.rejects(moduleClosure(root),e=>e.code==='CONFIGURATION_BUNDLE_INVALID');
});
test('cleanup cannot accept a project-contained directory or changed handoff ownership',async t=>{
 const parent=path.join(repo,'.cache/configuration-tests');await fs.mkdir(parent,{recursive:true});const base=await fs.mkdtemp(path.join(parent,'ownership-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));const root=path.join(base,'project');await fs.mkdir(root);const directory=path.join(base,'sapling-config-fixture');await fs.mkdir(directory);
 const session={schemaVersion:1,id:'11111111-1111-4111-8111-111111111111',nonce:'a'.repeat(64),pid:process.pid,projectId:null,root,directory};await saveSession(session);assert.equal((await readSession(directory,root)).id,session.id);
 await fs.writeFile(path.join(directory,'session.json'),JSON.stringify({...session,nonce:'b'.repeat(64)}));await assert.rejects(readSession(directory,root),e=>e.code==='CONFIGURATION_OWNERSHIP');
 const internal=path.join(root,'sapling-config-fixture');await fs.mkdir(internal);await assert.rejects(readSession(internal,root),e=>e.code==='CONFIGURATION_OWNERSHIP');
});
