import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';
import {readReleaseMetadata} from '../contracts/release.mjs';import {checkKernel,prepareKernel,applyKernel} from '../manager.mjs';import {restoreKernel} from '../recover.mjs';
const project=fileURLToPath(new URL('../../',import.meta.url));const current=JSON.parse(await fs.readFile(new URL('../manifest.json',import.meta.url)));const revision='a'.repeat(40);const source={resolve:async()=>revision,read:async(_,name)=>fs.readFile(path.join(project,name))};
async function fixture(t,version='0.9.4'){const parent=path.join(project,'.cache/unified-version');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'app-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'kernel'));await fs.writeFile(path.join(root,'kernel/manifest.json'),JSON.stringify({...current,version}));return root;}
test('installed kernel is authoritative over stale legacy metadata, malformed core never falls back',async t=>{
 const root=await fixture(t);await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'config/release.json'),'{"schemaVersion":1,"version":"0.9.1"}');
 assert.deepEqual(await readReleaseMetadata(root),{schemaVersion:1,version:'0.9.4'});
 await fs.writeFile(path.join(root,'kernel/manifest.json'),'{bad');await assert.rejects(readReleaseMetadata(root));
});
test('historical labels and previous kernel can advance to current release without changing their baseline; true downgrades fail',async t=>{
 for(const version of ['0.90','0.91','0.92','0.9.4']){const root=await fixture(t,version),before=await fs.readFile(path.join(root,'kernel/manifest.json'));assert.equal((await checkKernel(root,{source})).target.version,current.version);assert.deepEqual(await fs.readFile(path.join(root,'kernel/manifest.json')),before);}
 const newer=await fixture(t,`${Number(current.version.split('.')[0])+1}.0.0`);await assert.rejects(checkKernel(newer,{source}),{code:'KERNEL_INCOMPATIBLE'});
});
test('new CLI explicitly targets old project rather than its downloaded tooling folder',async t=>{
 const root=await fixture(t);const {stdout}=await promisify(execFile)(process.execPath,[path.join(project,'kernel/cli.mjs'),'--root',root,'status'],{cwd:project});assert.match(stdout,/"version": "0\.9\.4"/);
});
test('legacy-number apply and explicit restore preserve app/data/Git and stale compatibility mirror',async t=>{
 const root=await fixture(t,'0.92');const old=structuredClone(current);old.version='0.92';
 for(const f of current.files){const to=path.join(root,f.path);await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(path.join(project,f.path),to);await fs.chmod(to,f.executable?0o755:0o644);}
 const changed='kernel/control-page.mjs',before=Buffer.from('// historical custom-free core source\n');await fs.writeFile(path.join(root,changed),before);const item=old.files.find(f=>f.path===changed);item.bytes=before.length;item.sha256=createHash('sha256').update(before).digest('hex');
 const original=JSON.stringify(old);await fs.writeFile(path.join(root,'kernel/manifest.json'),original);
 const keep={'front/App.tsx':'customer app','data/session.json':'customer conversation','.git/config':'customer Git','config/release.json':'{"schemaVersion":1,"version":"0.9.3"}'};for(const [name,value]of Object.entries(keep)){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),value);}
 const plan=await prepareKernel(root,{source});assert.deepEqual(plan.conflicts,[]);const result=await applyKernel(root,plan.id,{acceptRisk:true});assert.equal(result.version,current.version);assert.equal((await readReleaseMetadata(root)).version,current.version);
 for(const [name,value]of Object.entries(keep))assert.equal(await fs.readFile(path.join(root,name),'utf8'),value);
 await restoreKernel(root,result.backupId);assert.equal(await fs.readFile(path.join(root,'kernel/manifest.json'),'utf8'),original);assert.deepEqual(await fs.readFile(path.join(root,changed)),before);
});
