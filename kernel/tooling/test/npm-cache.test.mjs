import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {npmFor} from '../tools.mjs';
import reviewed from '../public-npm-locks.json' with {type:'json'};

const run = promisify(execFile);
const project = fileURLToPath(new URL('../../../', import.meta.url));
const name = 'sapling-cache-fixture';
const tarball = 'https://registry.npmjs.org/'+name+'/-/'+name+'-1.0.0.tgz';
const hash = (algorithm, input, encoding) => createHash(algorithm).update(input).digest(encoding);
async function write(file, value) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  await fs.writeFile(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
}

test('the reviewed seed lock fingerprints match the public URL/integrity sets', async () => {
  for (const [group, fingerprint] of Object.entries(reviewed)) {
    const lock = JSON.parse(await fs.readFile(path.join(project, group, 'package-lock.json')));
    const entries = Object.values(lock.packages).filter(item => item.resolved);
    assert.ok(entries.every(item => item.resolved.startsWith('https://registry.npmjs.org/') && item.integrity.startsWith('sha512-')));
    const lines = [...new Set(entries.map(item => item.resolved+' '+item.integrity))].sort();
    assert.equal(hash('sha256', lines.join('\n'), 'hex'), fingerprint, group);
  }
});

test('two projects install with genuine offline npm ci using only reviewed tarball bytes', async t => {
  const parent = path.join(project, '.cache/npm-public-tests');
  await fs.mkdir(parent, {recursive:true});
  const dir = await fs.mkdtemp(path.join(parent, 'two-'));
  t.after(() => fs.rm(dir, {recursive:true, force:true}));
  const home = path.join(dir, 'library');
  const npm = npmFor();
  const npmRun = (root, args) => run(npm.command, [...npm.args,...args,'--offline','--ignore-scripts','--no-audit','--no-fund'], {
    cwd:root,
    env:{...process.env,npm_config_cache:path.join(root,'.cache/npm'),npm_config_userconfig:path.join(root,'user.npmrc'),npm_config_globalconfig:path.join(root,'global.npmrc')},
  });
  const pack = path.join(dir, 'pack');
  await write(path.join(pack, 'package.json'), {name,version:'1.0.0',main:'index.cjs',files:['index.cjs']});
  await write(path.join(pack, 'index.cjs'), 'module.exports = 42;');
  await npmRun(pack,['pack']);
  const bytes = await fs.readFile(path.join(pack,name+'-1.0.0.tgz'));
  const hex = hash('sha512', bytes, 'hex');
  const sri = 'sha512-'+hash('sha512', bytes, 'base64');
  const suffix = path.join(hex.slice(0,2),hex.slice(2,4),hex.slice(4));
  const published = path.join(home,'cache/public-npm-v1/sha512',suffix);
  const cached = root => path.join(root,'.cache/npm/_cacache/content-v2/sha512',suffix);
  // Only the fixture kernel approves this synthetic tarball.
  for (const file of ['tooling/bindings.mjs','tooling/npm-cache.mjs','contracts/local-storage.mjs']) {
    await write(path.join(dir,'kernel',file),await fs.readFile(path.join(project,'kernel',file)));
  }
  await write(path.join(dir,'kernel/tooling/public-npm-locks.json'),{fixture:hash('sha256',tarball+' '+sri,'hex')});
  const {withPublicNpmCache} = await import(pathToFileURL(path.join(dir,'kernel/tooling/npm-cache.mjs')));
  const prepare = async (id, {mode='shared', resolved=tarball}={}) => {
    const root = path.join(dir,id);
    const manifest = {name:'test-app',version:'1.0.0',dependencies:{[name]:'1.0.0'}};
    await write(path.join(root,'package.json'),manifest);
    await write(path.join(root,'package-lock.json'),{...manifest,lockfileVersion:3,packages:{
      '':manifest,['node_modules/'+name]:{version:'1.0.0',resolved,integrity:sri},
    }});
    await write(path.join(root,'.runtime/tool-bindings.json'),{schemaVersion:1,mode,home,root,homeKind:'override'});
    return root;
  };
  // Isolate library/mode even if the shell exporting the test suite sets them.
  const saved = ['SAPLING_RUNTIME_HOME','SAPLING_RUNTIME_MODE'].map(key=>[key,process.env[key]]);
  for (const [key] of saved) delete process.env[key];
  t.after(() => {for (const [key,value] of saved) {if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const first = await prepare('first'), second = await prepare('second');
  const appFile = root => path.join(root,'node_modules',name,'index.cjs');
  const install = root => withPublicNpmCache(root, root, () => npmRun(root,['ci']));

  const custom = await prepare('custom',{resolved:'https://private.invalid/private.tgz'});
  await write(cached(custom),bytes);
  await withPublicNpmCache(custom,custom,()=>{});
  assert.equal(await fs.stat(home).catch(()=>null),null);

  const mixed = await prepare('mixed');
  const mixedLockPath = path.join(mixed,'package-lock.json');
  const mixedLock = JSON.parse(await fs.readFile(mixedLockPath));
  mixedLock.packages['node_modules/private'] = {resolved:'https://private.invalid/private.tgz',integrity:sri};
  await write(mixedLockPath,mixedLock);
  await write(cached(mixed),bytes);
  await withPublicNpmCache(mixed,mixed,()=>{});
  assert.equal(await fs.stat(home).catch(()=>null),null);

  const unreviewed = await prepare('changed',{resolved:'https://registry.npmjs.org/changed/-/changed-1.tgz'});
  await write(cached(unreviewed),bytes);
  await withPublicNpmCache(unreviewed,unreviewed,()=>{});
  assert.equal(await fs.stat(home).catch(()=>null),null);

  const portable = await prepare('portable',{mode:'portable'});
  await write(cached(portable),bytes);
  await install(portable);
  assert.equal(await fs.stat(home).catch(()=>null),null);

  await write(cached(first),bytes);
  await write(path.join(first,'.cache/npm/_logs/private-data'),'local only');
  await install(first);
  assert.deepEqual(await fs.readFile(published),bytes);
  assert.deepEqual((await fs.readdir(home,{recursive:true,withFileTypes:true})).filter(x=>x.isFile()).map(x=>x.name),[path.basename(published)]);
  await assert.rejects(npmRun(second,['ci']), error => /ENOTCACHED/i.test(error.stderr));
  await install(second);
  assert.equal(await fs.readFile(appFile(second),'utf8'),'module.exports = 42;');
  await write(appFile(first),'project edit');
  assert.equal(await fs.readFile(appFile(second),'utf8'),'module.exports = 42;');

  const repair = await prepare('repair');
  await write(published,'corrupted blob');
  await withPublicNpmCache(repair,repair,async()=>{
    assert.equal(await fs.stat(cached(repair)).catch(()=>null),null);
    await write(cached(repair),bytes);
  });
  assert.deepEqual(await fs.readFile(published),bytes);
  await fs.rm(published);
  await assert.rejects(withPublicNpmCache(first,first,async()=>{throw Error('install failed');}),/install failed/);
  assert.equal(await fs.stat(published).catch(()=>null),null);

  await Promise.all([first,second].map(root=>withPublicNpmCache(root,root,()=>{})));
  assert.deepEqual(await fs.readFile(published),bytes);
  const privateApp=await prepare('private',{resolved:'https://private.invalid/private.tgz'});
  await withPublicNpmCache(privateApp,privateApp,()=>{});
  assert.equal(await fs.stat(cached(privateApp)).catch(()=>null),null);
  await fs.rm(cached(portable));
  await assert.rejects(install(portable),error=>/ENOTCACHED/i.test(error.stderr));
  await fs.rm(cached(first));
  await assert.rejects(withPublicNpmCache(first,first,()=>assert.fail('unexpected install'),{signal:AbortSignal.abort()}),{name:'AbortError'});
});
