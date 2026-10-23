import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {initialProjectRecords, recordsForSource, initializeDownloadedRecords} from '../launcher/recipient-records.mjs';
const project=fileURLToPath(new URL('../../../',import.meta.url)),sha='a'.repeat(40);
const mit='MIT License\n\nCopyright (c) Synthetic test owner\nPermission is hereby granted, free of charge, to any person obtaining a copy\n';
const historical='PolyForm Noncommercial License 1.0.0\nSynthetic historical source license\n';
async function fixture(t,license){const cache=path.join(project,'.cache/recipient-license-tests');await fs.mkdir(cache,{recursive:true});const root=await fs.mkdtemp(path.join(cache,'source-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));if(license!==undefined)await fs.writeFile(path.join(root,'LICENSE'),license);return root;}
test('recipient records use the target source license rather than the current maintainer license',async t=>{
 const root=await fixture(t,historical);let goal=(await recordsForSource(root,sha,'macOS'))['FINAL_GOAL.md'];assert.match(goal,/LICENSE included with this exact source revision/);assert.doesNotMatch(goal,/use the MIT license|commercial use, modification and distribution are permitted/);assert.equal(await fs.readFile(path.join(root,'LICENSE'),'utf8'),historical);
 await fs.writeFile(path.join(root,'LICENSE'),mit);goal=(await recordsForSource(root,sha,'Windows'))['FINAL_GOAL.md'];assert.match(goal,/use the MIT license included in this package/);assert.match(goal,/commercial use, modification and distribution are permitted/);assert.match(goal,/upstream attribution/);assert.equal(await fs.readFile(path.join(root,'LICENSE'),'utf8'),mit);
});
test('unknown or missing license never becomes an inferred MIT grant',async t=>{
 const root=await fixture(t);const goal=(await recordsForSource(root,sha,'macOS'))['FINAL_GOAL.md'];assert.match(goal,/Read that file for commercial-use/);assert.doesNotMatch(goal,/use the MIT license/);await assert.rejects(fs.access(path.join(root,'LICENSE')));
 for(const value of ['', 'MIT License\nThis file contains no grant', historical])assert.doesNotMatch(initialProjectRecords(sha,'macOS',value)['FINAL_GOAL.md'],/use the MIT license/);
});
test('first installation reads its downloaded LICENSE and preserves that file and source provenance',async t=>{
 for(const [label,license]of [['historical',historical],['MIT',mit]]){
  const root=await fixture(t,license),recordHashes={};
  for(const name of ['AGENTS.md','FINAL_GOAL.md','TODO.md','AI_TASKS.md']){const value='Synthetic original '+name+'\n';await fs.writeFile(path.join(root,name),value);recordHashes[name]=createHash('sha256').update(value).digest('hex');}
  await fs.writeFile(path.join(root,'delivery.json'),JSON.stringify({initializeRecords:true,sourceCommit:sha,sourceRef:'release',platform:'macOS',recordHashes}));
  assert.equal(await initializeDownloadedRecords(root),true,label);const goal=await fs.readFile(path.join(root,'FINAL_GOAL.md'),'utf8');assert.match(goal,new RegExp('Commit: '+sha));
  if(label==='MIT')assert.match(goal,/use the MIT license included in this package/);else assert.doesNotMatch(goal,/use the MIT license|commercial use, modification and distribution are permitted/);
  assert.equal(await fs.readFile(path.join(root,'LICENSE'),'utf8'),license);assert.equal(await initializeDownloadedRecords(root),false);
 }
});
