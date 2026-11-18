import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {acquireConfigurationWrite} from '../../../contracts/configuration-write.mjs';

const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const busy=error=>error.code==='CONFIG_BUSY';
async function fixture(t) {
  const parent=path.join(repo,'.cache/config-write-tests');
  await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'reaper-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const directory=path.join(root,'local-secrets/ai-config');
  await fs.mkdir(directory,{recursive:true});
  const file=path.join(directory,'write.lock');
  return {root,file};
}

async function seedLegacy(file) {
  const pid=Number(execFileSync(process.execPath,['-p','process.pid'],{encoding:'utf8'}));
  const owner={id:randomUUID(),pid};
  await fs.writeFile(file,JSON.stringify(owner));
  return file+'.'+owner.id+'.reclaim';
}

test('an interrupted older reaper is distinguishable from one still holding its anonymous guard',
{skip:!['darwin','win32'].includes(process.platform)}, async t=>{
  const {root,file}=await fixture(t),claim=await seedLegacy(file);
  const held=await fs.open(claim,'wx');
  try {await assert.rejects(acquireConfigurationWrite(root),busy);}
  finally {await held.close();}
  const release=await acquireConfigurationWrite(root);
  assert.equal((await fs.stat(file)).isFile(),true);
  assert.match(JSON.parse(await fs.readFile(file,'utf8')).id,/^v2:/);
  await release();
  assert.deepEqual((await fs.readdir(path.dirname(file))).filter(n=>n.includes('lock')),[]);
});

test('legacy cleanup failure after publication still gives the new writer its releasable lease',async t=>{
  const {root,file}=await fixture(t),claim=await seedLegacy(file);
  const remove=fs.rmdir;
  const mock=t.mock.method(fs,'rmdir',async target=>{
    if(target===claim)throw Object.assign(Error('synthetic cleanup failure'),{code:'EACCES'});
    return remove(target);
  });
  const release=await acquireConfigurationWrite(root);
  mock.mock.restore();
  await assert.rejects(acquireConfigurationWrite(root),busy);
  await release();
  await (await acquireConfigurationWrite(root))();
});

test('an unknown lock directory or foreign recovery file is preserved',async t=>{
  const {root,file}=await fixture(t);
  await fs.mkdir(file);
  await assert.rejects(acquireConfigurationWrite(root),busy);
  assert.deepEqual(await fs.readdir(file),[]);
  await fs.rmdir(file);
  const claim=await seedLegacy(file);
  await fs.writeFile(claim,'unknown');
  await assert.rejects(acquireConfigurationWrite(root),busy);
  assert.equal(await fs.readFile(claim,'utf8'),'unknown');
});

test('a real publication collision stays retryable after the winning writer releases',async t=>{
  const {root,file}=await fixture(t),rename=fs.rename;
  let inject=true, collision;
  t.mock.method(fs,'rename',async(from,to)=>{
    if (!inject || to!==file) return rename(from,to);
    inject=false;
    const release=await acquireConfigurationWrite(root);
    try {return await rename(from,to);}
    catch (error) {collision=error;throw error;}
    finally {await release();}
  });
  await assert.rejects(acquireConfigurationWrite(root),error=>{
    assert.ok(collision);
    // Some Windows filesystems return a permission error for rename, which
    // alone cannot establish a collision after the destination disappears.
    if (process.platform==='win32' && ['EPERM','EACCES','EBUSY'].includes(collision.code)) return error===collision;
    return busy(error) && error.status===409;
  });
  await (await acquireConfigurationWrite(root))();
});

test('a real storage error during publication is preserved',async t=>{
  const {root,file}=await fixture(t),rename=fs.rename;
  const failure=Object.assign(Error('synthetic storage fault'),{code:'EIO'});
  t.mock.method(fs,'rename',(from,to)=>{if(to===file) throw failure;return rename(from,to);});
  await assert.rejects(acquireConfigurationWrite(root),error=>error===failure);
});

test('concurrent recovery processes elect one writer and exclude an active owner', {timeout:20000},async t=>{
  const {root,file}=await fixture(t);
  await seedLegacy(file);
  const script=`
    import {acquireConfigurationWrite} from './kernel/contracts/configuration-write.mjs';
    try {
      const release=await acquireConfigurationWrite(process.argv[1]);
      process.on('message',async()=>{await release();process.disconnect();});
      process.send('acquired');
    } catch(error) {process.send(error.code,()=>process.disconnect());}
  `;
  const children=Array.from({length:6},()=>{
    const child=spawn(process.execPath,['--input-type=module','-e',script,root],{cwd:repo,stdio:['ignore','ignore','inherit','ipc']});
    const exit=once(child,'exit');
    t.after(async()=>{if(child.exitCode===null && !child.signalCode){child.kill();await exit;}});
    return {child,exit,result:once(child,'message').then(([value])=>value)};
  });
  const results=await Promise.all(children.map(c=>c.result));
  assert.equal(results.filter(value=>value==='acquired').length,1);
  assert.equal(results.filter(value=>value==='CONFIG_BUSY').length,5);
  await assert.rejects(acquireConfigurationWrite(root),busy);
  children[results.indexOf('acquired')].child.send('release');
  await Promise.all(children.map(c=>c.exit));
  await (await acquireConfigurationWrite(root))();
});
