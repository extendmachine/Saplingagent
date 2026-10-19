import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setup} from '../../../scripts/setup.mjs';
import {ConfigurationStore} from '../store.mjs';
import {withConfigurationWrite,acquireConfigurationWrite} from '../../../contracts/configuration-write.mjs';

async function fixture(t) {
  const parent=fileURLToPath(new URL('../../../../.cache/config-write-tests/',import.meta.url));
  await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'project-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await setup({projectRoot:root,importExistingAuth:false});
  return root;
}
test('reopening setup cannot overwrite an in-flight profile ledger update', async t => {
  const root=await fixture(t),store=new ConfigurationStore(root);
  let unblock,started;const gate=new Promise(r=>unblock=r),ready=new Promise(r=>started=r);
  const saving=store.write(async(data,ledger)=>{ledger.credentials.push({id:'synthetic-reference'});started();await gate;});
  await ready;
  try {await assert.rejects(setup({projectRoot:root,importExistingAuth:false}),e=>e.code==='CONFIG_BUSY');}
  finally {unblock();await saving;}
  await setup({projectRoot:root,importExistingAuth:false});
  const ledger=JSON.parse(await fs.readFile(path.join(root,'local-secrets/notes/project-secrets.json')));
  assert.equal(ledger.credentials[0].id,'synthetic-reference');
  assert.equal(ledger.runtime.serviceToken,'local-secrets/runtime/service-token');
  assert.equal(await fs.access(path.join(root,'local-secrets/ai-config/write.lock')).then(()=>true,()=>false),false);
});
test('a failed writer releases its own lock; a replaced lock is not deleted', async t => {
  const root=await fixture(t),file=path.join(root,'local-secrets/ai-config/write.lock');
  await assert.rejects(withConfigurationWrite(root,async()=>{throw Error('synthetic failure');}),/synthetic failure/);
  assert.equal(await fs.access(file).then(()=>true,()=>false),false);
  await withConfigurationWrite(root,async()=>{await fs.writeFile(file,JSON.stringify({id:'another-writer',pid:process.pid}));});
  assert.equal(JSON.parse(await fs.readFile(file)).id,'another-writer');
  await assert.rejects(withConfigurationWrite(root,async()=>{}),e=>e.code==='CONFIG_BUSY');
});
test('setup refuses a linked secrets ancestor before creating external files', async t => {
  const root=await fixture(t),outside=path.join(root,'elsewhere');await fs.mkdir(outside);
  await fs.rm(path.join(root,'local-secrets'),{recursive:true});
  await fs.symlink(outside,path.join(root,'local-secrets'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(setup({projectRoot:root,importExistingAuth:false}),e=>e.code==='PROJECT_STORAGE_LOCATION');
  assert.deepEqual(await fs.readdir(outside),[]);
});

test('configuration rename lease excludes setup and releases at the relocated root', async t => {
  const root=await fixture(t),release=await acquireConfigurationWrite(root),moved=root+'-renamed';
  await assert.rejects(setup({projectRoot:root,importExistingAuth:false}),e=>e.code==='CONFIG_BUSY');
  await fs.rename(root,moved);t.after(()=>fs.rm(moved,{recursive:true,force:true}));
  await assert.rejects(setup({projectRoot:moved,importExistingAuth:false}),e=>e.code==='CONFIG_BUSY');
  await release(moved);
  await setup({projectRoot:moved,importExistingAuth:false});
  assert.equal(await fs.access(root).then(()=>true,()=>false),false);
  assert.equal(await fs.access(path.join(moved,'local-secrets/ai-config/write.lock')).then(()=>true,()=>false),false);
});
