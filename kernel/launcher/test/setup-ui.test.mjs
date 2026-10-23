import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareSetupUI} from '../setup-ui.mjs';
import {createConfigurationServer} from '../../services/ai-config/server.mjs';

const project=fileURLToPath(new URL('../../../',import.meta.url));
async function fixture(t) {
  const parent=path.join(project,'.cache/setup-ui-tests');await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'中文 app '));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'kernel/ui/setup'),{recursive:true});
  await fs.writeFile(path.join(root,'kernel/ui/setup/main.tsx'),'version one');
  for(const name of ['package.json','package-lock.json'])await fs.writeFile(path.join(root,'kernel',name),'{}');
  return root;
}
async function output(stage,version='one') {
  await fs.mkdir(path.join(stage,'assets'),{recursive:true});
  await fs.writeFile(path.join(stage,'index.html'),`<meta name="token" content="__SAPLING_CONFIG_TOKEN__"><script src="/assets/${version}.js"></script><link href="/assets/${version}.css" rel="stylesheet">`);
  await fs.writeFile(path.join(stage,'assets',version+'.js'),`/* ${version} */`);
  await fs.writeFile(path.join(stage,'assets',version+'.css'),`/* ${version} */`);
  await fs.writeFile(path.join(stage,'assets',version+'.woff2'),'transitive-resource');
}
async function serve(t,root) {
  const server=createConfigurationServer({root,token:'synthetic-test-token'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.shutdown());
  return 'http://127.0.0.1:'+server.address().port;
}
test('cold preparation builds once and verifies all generated resources before reuse',async t=>{
  const root=await fixture(t);let builds=0;const build=async(_,stage)=>{builds++;await output(stage);};
  assert.deepEqual(await prepareSetupUI(root,{build}),{rebuilt:true});
  assert.deepEqual(await prepareSetupUI(root,{build}),{rebuilt:false});assert.equal(builds,1);
  const receipt=JSON.parse(await fs.readFile(path.join(root,'kernel/.cache/setup/build.json')));assert.equal(receipt.files.length,4);
  await fs.rm(path.join(root,'kernel/.cache/setup/assets/one.woff2'));
  assert.deepEqual(await prepareSetupUI(root,{build}),{rebuilt:true});assert.equal(builds,2);
  await fs.writeFile(path.join(root,'kernel/.cache/setup/assets/one.js'),'corrupt');
  assert.deepEqual(await prepareSetupUI(root,{build}),{rebuilt:true});assert.equal(builds,3);
});
test('live document survives a paused rebuild and both generations remain readable',async t=>{
  const root=await fixture(t);await prepareSetupUI(root,{build:(_,stage)=>output(stage)});
  const base=await serve(t,root);const old=await fetch(base).then(r=>r.text());
  await fs.writeFile(path.join(root,'kernel/ui/setup/main.tsx'),'version two');
  let resume,started;const gate=new Promise(resolve=>resume=resolve),ready=new Promise(resolve=>started=resolve);
  const pending=prepareSetupUI(root,{build:async(_,stage)=>{await output(stage,'two');started();await gate;}});
  await ready;
  try {assert.equal(await fetch(base).then(r=>r.text()),old);assert.equal((await fetch(base+'/assets/one.js')).status,200);}
  finally {resume();}
  await pending;
  assert.match(await fetch(base).then(r=>r.text()),/two\.js/);
  for(const name of ['one.js','one.css','two.js','two.css'])assert.equal((await fetch(base+'/assets/'+name)).status,200);
});
test('failed and incomplete builds preserve the previous document and resources',async t=>{
  const root=await fixture(t);await prepareSetupUI(root,{build:(_,stage)=>output(stage)});
  const index=path.join(root,'kernel/.cache/setup/index.html'),previous=await fs.readFile(index,'utf8');
  await fs.writeFile(path.join(root,'kernel/ui/setup/main.tsx'),'changed');
  await assert.rejects(prepareSetupUI(root,{build:async()=>{throw Error('synthetic compile failure');}}),/synthetic compile failure/);
  await assert.rejects(prepareSetupUI(root,{build:async(_,stage)=>{await output(stage,'two');await fs.rm(path.join(stage,'assets/two.js'));}}));
  assert.equal(await fs.readFile(index,'utf8'),previous);assert.equal(await fs.readFile(path.join(root,'kernel/.cache/setup/assets/one.js'),'utf8'),'/* one */');
  assert.deepEqual((await fs.readdir(path.join(root,'kernel/.cache'))).sort(),['setup']);
});
test('concurrent builders serialize and reuse the same successful publication',async t=>{
  const root=await fixture(t);let resume,started,count=0;const gate=new Promise(r=>resume=r),ready=new Promise(r=>started=r);
  const build=async(_,stage)=>{count++;started();await gate;await output(stage);};
  const first=prepareSetupUI(root,{build});await ready;const second=prepareSetupUI(root,{build});resume();
  assert.deepEqual(await Promise.all([first,second]),[{rebuilt:true},{rebuilt:false}]);assert.equal(count,1);
});
test('source changing during build retains previous output and retries current source',async t=>{
  const root=await fixture(t);await prepareSetupUI(root,{build:(_,stage)=>output(stage)});
  const source=path.join(root,'kernel/ui/setup/main.tsx');await fs.writeFile(source,'two');
  await assert.rejects(prepareSetupUI(root,{build:async(_,stage)=>{await output(stage,'two');await fs.writeFile(source,'three');}}),e=>e.code==='UI_BUILD_CHANGED');
  assert.match(await fs.readFile(path.join(root,'kernel/.cache/setup/index.html'),'utf8'),/one\.js/);
  await prepareSetupUI(root,{build:(_,stage)=>output(stage,'three')});
  assert.match(await fs.readFile(path.join(root,'kernel/.cache/setup/index.html'),'utf8'),/three\.js/);
});
test('interrupted and active builder locks remain owned and report explicit recovery',async t=>{
  const root=await fixture(t),lock=path.join(root,'kernel/.cache/setup-build.lock');await fs.mkdir(lock,{recursive:true});
  const owner=path.join(lock,'owner.json');await fs.writeFile(owner,JSON.stringify({id:'dead',pid:2147483647}));
  await assert.rejects(prepareSetupUI(root,{waitMs:0}),e=>e.code==='UI_BUILD_INTERRUPTED');
  assert.equal(JSON.parse(await fs.readFile(owner)).id,'dead');
  await fs.writeFile(owner,JSON.stringify({id:'active',pid:process.pid}));
  await assert.rejects(prepareSetupUI(root,{waitMs:0}),e=>e.code==='UI_BUILD_BUSY');
  assert.equal(JSON.parse(await fs.readFile(owner)).id,'active');
});


test('a shared language catalog change rebuilds setup even when setup TSX is unchanged',async t=>{
  const root=await fixture(t);let count=0;const build=async(_,stage)=>{count++;await output(stage);};
  await fs.mkdir(path.join(root,'kernel/localization'));
  const catalog=path.join(root,'kernel/localization/setup-messages.mjs');
  await fs.writeFile(catalog,'export const messages={en:{save:"Save"},zh:{save:"保存"}};');
  await prepareSetupUI(root,{build});assert.equal(count,1);
  await fs.writeFile(catalog,'export const messages={en:{save:"Save settings"},zh:{save:"保存设置"}};');
  assert.deepEqual(await prepareSetupUI(root,{build}),{rebuilt:true});assert.equal(count,2);
});
