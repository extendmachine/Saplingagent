import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {copyConfigurationBundle} from '../bundle.mjs';
import {saveSession,readSession,storedSession,removeSessionDirectory} from '../session.mjs';
import {moveProject} from '../move.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
async function fixture(t){
 const parent=path.join(repo,'.cache/configuration-tests');await fs.mkdir(parent,{recursive:true});
 const base=await fs.mkdtemp(path.join(parent,'location-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'项目'),directory=path.join(base,'sapling-config-fixture');await fs.mkdir(root);await fs.mkdir(directory);
 const session={schemaVersion:2,id:randomUUID(),nonce:'a'.repeat(64),pid:process.pid,root,directory,projectId:null};
 await saveSession(session);return {base,root,directory,session};
}
test('session storage uses sibling names and preserves identity through same-parent rename',async t=>{
 const {root,directory,session,base}=await fixture(t);
 const receipt=JSON.parse(await fs.readFile(path.join(root,'.runtime/configuration-session.json'),'utf8'));
 assert.equal(receipt.root,undefined);assert.equal(receipt.directory,undefined);assert.equal(receipt.configurationDirectory,'sapling-config-fixture');assert.equal(receipt.projectDirectory,'项目');
 const renamed=path.join(base,'上课用');await fs.rename(root,renamed);session.root=renamed;await saveSession(session);
 assert.equal((await storedSession(renamed)).directory,directory);assert.equal((await readSession(directory,renamed)).projectIdentity.inode,receipt.projectIdentity.inode);
});
test('cleanup rejects live owners, unrelated sessions, and replaced sibling directories',async t=>{
 const {session,directory,root}=await fixture(t);
 await assert.rejects(removeSessionDirectory(session),{code:'CONFIGURATION_OWNERSHIP'});await fs.access(directory);
 const second=path.join(path.dirname(root),'sapling-config-second');await fs.mkdir(second);
 await fs.copyFile(path.join(directory,'session.json'),path.join(second,'session.json'));
 await assert.rejects(readSession(second,root),{code:'CONFIGURATION_OWNERSHIP'});
 await fs.rename(directory,directory+'-original');await fs.mkdir(directory);
 await fs.copyFile(path.join(directory+'-original','session.json'),path.join(directory,'session.json'));
 await assert.rejects(readSession(directory,root),{code:'CONFIGURATION_OWNERSHIP'});
});
test('symlinked capsule, receipt and runtime storage never redirect configuration writes',async t=>{
 const {root,directory,base}=await fixture(t);
 const outside=path.join(base,'unrelated');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'sentinel'),'keep');
 await fs.rename(directory,directory+'-saved');await fs.symlink(outside,directory,'dir');
 await assert.rejects(readSession(directory,root),{code:'CONFIGURATION_OWNERSHIP'});assert.equal(await fs.readFile(path.join(outside,'sentinel'),'utf8'),'keep');
 await fs.rm(directory);await fs.rename(directory+'-saved',directory);
 await fs.rename(path.join(directory,'session.json'),path.join(directory,'saved.json'));await fs.symlink(path.join(directory,'saved.json'),path.join(directory,'session.json'));
 await assert.rejects(readSession(directory,root),{code:'CONFIGURATION_OWNERSHIP'});
 await fs.rename(path.join(root,'.runtime'),path.join(root,'saved-runtime'));await fs.symlink(outside,path.join(root,'.runtime'),'dir');
 await assert.rejects(storedSession(root),{code:'CONFIGURATION_OWNERSHIP'});assert.deepEqual(await fs.readdir(outside),['sentinel']);
});
test('legacy or non-sibling absolute receipts are preserved instead of deleting external paths',async t=>{
 const {root,base}=await fixture(t),file=path.join(root,'.runtime/configuration-session.json');
 const legacy={schemaVersion:1,id:randomUUID(),root,directory:path.join(base,'unrelated')};await fs.writeFile(file,JSON.stringify(legacy));
 await assert.rejects(storedSession(root),{code:'CONFIGURATION_LEGACY_SESSION'});assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),legacy);
 const distant=path.join(base,'other/sapling-config-fixture');await fs.mkdir(distant,{recursive:true});
 await assert.rejects(readSession(distant,root),{code:'CONFIGURATION_OWNERSHIP'});
});
test('capsule copying ignores system temp variables and rejects arbitrary destination overrides',async t=>{
 const {root,base}=await fixture(t);const bundle=path.join(root,'bundle');await fs.mkdir(bundle);await fs.writeFile(path.join(bundle,'bundle.json'),JSON.stringify({files:[]}));
 const node=path.join(root,'synthetic-node');await fs.writeFile(node,'fixture');
 const copy=await copyConfigurationBundle(root,bundle,{node});assert.equal(path.dirname(copy.directory),base);assert.match(path.basename(copy.directory),/^sapling-config-/);assert.equal(await fs.readFile(copy.executable,'utf8'),'fixture');
 await assert.rejects(copyConfigurationBundle(root,bundle,{node,tempParent:path.join(base,'elsewhere')}),{code:'CONFIGURATION_LOCATION'});await assert.rejects(fs.access(path.join(base,'elsewhere')),{code:'ENOENT'});
});
test('rename refuses a different parent before platform mutation',async t=>{
 const {root,base}=await fixture(t);const second=path.join(base,'other');await fs.mkdir(second);
 await assert.rejects(moveProject(root,path.join(second,'Moved')),{code:'PROJECT_RENAME_FAILED'});await fs.access(root);
});

test('a spawned B that has not published its PID is never removed as a stale parent session',async t=>{
 const {session,root,directory}=await fixture(t);const exited=spawn(process.execPath,['-e',''],{stdio:'ignore'});await once(exited,'exit');
 session.pid=exited.pid;await saveSession(session);await fs.writeFile(path.join(directory,'process.json'),JSON.stringify({id:session.id,nonce:session.nonce,pid:process.pid}));
 await assert.rejects(removeSessionDirectory(session),{code:'CONFIGURATION_OWNERSHIP'});await fs.access(directory);assert.equal((await storedSession(root)).id,session.id);
});
