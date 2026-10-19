import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConfigurationServer} from '../server.mjs';
const project=fileURLToPath(new URL('../../../../',import.meta.url));
async function fixture(t){const parent=path.join(project,'.cache/configuration-tests');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'static-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function serve(t,root){const server=createConfigurationServer({root,token:'synthetic-test-token'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.shutdown());return 'http://127.0.0.1:'+server.address().port;}
test('configuration distinguishes missing document, stale asset and unreadable file',async t=>{
  const root=await fixture(t),base=await serve(t,root);
  let response=await fetch(base);assert.equal(response.status,503);assert.equal((await response.json()).error.code,'UI_NOT_BUILT');
  response=await fetch(base+'/assets/previous.js');assert.equal(response.status,404);assert.equal((await response.json()).error.code,'UI_ASSET_NOT_FOUND');
  await fs.mkdir(path.join(root,'kernel/.cache/setup/index.html'),{recursive:true});
  response=await fetch(base);assert.equal(response.status,500);assert.equal((await response.json()).error.code,'UI_UNREADABLE');
});
