import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {scanKernelFiles} from '../build-manifest.mjs';
import {fileURLToPath} from 'node:url';
// Exact original0.9.2 module at84c985e; never update this fixture when changing current ownership.
import {validateKernelManifest as legacyValidate,isKernelPath as legacyOwns} from './fixtures/kernel-contract-0.91.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('new manifest paths are accepted by the shipped0.9.2 validator; numeric migration needs new tooling',async()=>{
 assert.equal(createHash('sha256').update(await fs.readFile(new URL('./fixtures/kernel-contract-0.91.mjs',import.meta.url))).digest('hex'),'c9323967fd91a63ad1500781fc43c4d6fa739c2f1d95bd490aa87ed50df258b8');
 const manifest=JSON.parse(await fs.readFile(new URL('../manifest.json',import.meta.url)));
 assert.equal(legacyValidate(manifest),manifest);
 const files=await scanKernelFiles(root);
 assert.deepEqual(files.map(f=>f.path),manifest.files.map(f=>f.path));
 for(const file of files)assert.equal(legacyOwns(file.path),true,'old updater rejects '+file.path);
 assert.ok(files.some(f=>f.path==='kernel/launcher/public.mjs'));
 assert.ok(!files.some(f=>f.path==='contracts/project-launcher.mjs'));
});
test('frozen0.91 validator reproduces the original0.9.3 singleton regression',async()=>{
 const manifest=JSON.parse(await fs.readFile(new URL('../manifest.json',import.meta.url)));
 assert.throws(()=>legacyValidate({...manifest,files:[...manifest.files,{path:'contracts/project-launcher.mjs',bytes:1,sha256:'a'.repeat(64),executable:false}]}),e=>e.code==='INVALID_KERNEL'&&e.message==='Invalid kernel file entry.');
});
