import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {managedEnvironment, prepareManagedEnvironment, ensureManagedDirectory} from '../contracts/local-storage.mjs';

async function fixture(t) {
  const parent = fileURLToPath(new URL('../../.cache/storage-tests/', import.meta.url));
  await fs.mkdir(parent,{recursive:true});
  const root = await fs.mkdtemp(path.join(parent,'project-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  return root;
}
test('managed subprocess writes use project-relative storage despite inherited global destinations', async t => {
  const root = await fixture(t), foreign = path.join(root,'foreign');
  await fs.mkdir(foreign);
  const env = await prepareManagedEnvironment(root,{...process.env,HOME:foreign,TMPDIR:foreign,TEMP:foreign,TMP:foreign,npm_config_cache:foreign,XDG_CONFIG_HOME:foreign,XDG_CACHE_HOME:foreign});
  assert.equal(env.HOME,foreign); // Existing account discovery is still read-only and unchanged.
  const code = `const f=require('node:fs'),p=require('node:path');for(const k of ['TMPDIR','TEMP','TMP','npm_config_cache','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME'])f.writeFileSync(p.join(process.env[k],k),'synthetic');`;
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',code],{cwd:root,env,stdio:'ignore'});child.on('error',reject);child.on('exit',n=>n===0?resolve():reject(Error('fixture child failed')));});
  assert.deepEqual(await fs.readdir(foreign),[]);
  assert.equal(await fs.readFile(path.join(root,'.runtime/tmp/TMPDIR'),'utf8'),'synthetic');
  const renamed = root+'-moved';await fs.rename(root,renamed);t.after(()=>fs.rm(renamed,{recursive:true,force:true}));
  const moved = await prepareManagedEnvironment(renamed,env);
  assert.equal(moved.npm_config_cache,path.join(await fs.realpath(renamed),'.cache/npm'));
  assert.equal(await fs.access(root).then(()=>true,()=>false),false);
});
test('a symlinked storage parent cannot cause writes outside the project', async t => {
  const root = await fixture(t), foreign = await fixture(t);
  await fs.symlink(foreign,path.join(root,'.runtime'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(prepareManagedEnvironment(root),e=>e.code==='PROJECT_STORAGE_LOCATION');
  assert.deepEqual(await fs.readdir(foreign),[]);
});
test('relative storage rejects absolute paths and traversal; concurrent preparation is safe', async t => {
  const root = await fixture(t);
  for(const value of ['/tmp/out','../out','a/../out','C:\\Temp','a//b']) await assert.rejects(ensureManagedDirectory(root,value),e=>e.code==='PROJECT_STORAGE_LOCATION');
  const envs=await Promise.all([prepareManagedEnvironment(root),prepareManagedEnvironment(root)]);
  assert.equal(envs[0].TMPDIR,envs[1].TMPDIR);
  assert.equal(managedEnvironment(root,{CODEX_HOME:'read-only-import-source'}).CODEX_HOME,'read-only-import-source');
});
