import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ConfigurationStore} from '../store.mjs';
import {claudeConnections,codexConnection,credentialPath,openCodeConnections,readConnections,readCredential} from '../../../contracts/ai-configuration.mjs';

const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const draft={label:'Synthetic',engine:'opencode',kind:'api',protocol:'chat',baseUrl:'https://example.invalid/v1',model:'model',apiKey:'prior-fixture'};
async function fixture(t){
  const directory=path.join(repo,'.cache/configuration-transactions');
  await fs.mkdir(directory,{recursive:true});
  const root=await fs.mkdtemp(path.join(directory,'project-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  return {root,store:new ConfigurationStore(root)};
}
const keyChanged=error=>error.code==='KEY_ORIGIN_CHANGED';

test('save and discovery require a fresh key for a new origin; a stale runtime binding cannot read the replacement',async t=>{
  const {root,store}=await fixture(t);
  const initial=await store.save(draft),id=initial.activeId;
  const edit={...draft,id,apiKey:'',revision:1};
  const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({data:[]})));
  for(const baseUrl of ['http://example.invalid/v1','https://gateway.invalid/v1','https://example.invalid:8443/v1']){
    await assert.rejects(store.models({...edit,baseUrl}),keyChanged);
    await assert.rejects(store.save({...edit,baseUrl}),keyChanged);
  }
  assert.equal(fetch.mock.callCount(),0);
  await store.models({...edit,baseUrl:'https://EXAMPLE.invalid:443/group'});
  assert.equal(fetch.mock.callCount(),1);
  const old=(await readConnections(root)).profiles[0];
  await store.save({...edit,baseUrl:'https://gateway.invalid/v1',apiKey:'new-fixture'});
  await assert.rejects(readCredential(root,old),e=>e.code==='CREDENTIAL_UNAVAILABLE');
  assert.equal(await readCredential(root,(await readConnections(root)).profiles[0]),'new-fixture');
});

test('an unavailable scheme is isolated from healthy profiles, and a damaged Codex account is replaceable',async t=>{
  const {root,store}=await fixture(t);
  for(const engine of ['opencode','claude']){
    const scheme={...draft,engine,protocol:engine==='claude'?'anthropic':'chat'};
    const healthy=(await store.save(scheme)).activeId;
    const damaged=(await store.save({...scheme,activate:false})).profiles.at(-1).id;
    await fs.rm(credentialPath(root,damaged)); // A malformed file, including a directory, is isolated too.
    if(engine==='claude' && process.platform!=='win32')await fs.symlink(credentialPath(root,healthy),credentialPath(root,damaged));
    else await fs.mkdir(credentialPath(root,damaged));
    const connections=await readConnections(root);
    const listed=engine==='claude'?(await claudeConnections(root,connections)).map(p=>p.providerId):Object.keys(await openCodeConnections(root,connections));
    assert.ok(listed.includes('sapling-'+healthy));assert.ok(!listed.includes('sapling-'+damaged));
    assert.equal((await store.state()).profiles.find(p=>p.id===damaged).hasKey,false);
    await assert.rejects(store.activate({id:damaged}),e=>e.code==='KEY_REQUIRED');
    await store.activate({id:healthy});
  }
  const folder=path.join(root,'local-secrets/codex');
  await fs.mkdir(folder);await fs.writeFile(path.join(folder,'auth.json'),'{');
  const state=await store.state();assert.equal(state.codex.repairRequired,true);
  const credential={tokens:{access_token:'fake-account',refresh_token:'fake-refresh'}};
  await assert.rejects(store.importCodex({revision:state.revision},credential),e=>e.code==='CREDENTIAL_EXISTS');
  const repaired=await store.importCodex({revision:state.revision,replace:true},credential);
  assert.equal(repaired.codex.chatgpt,true);assert.equal(repaired.activeId,'codex-account');
});

test('every failed replacement restores the exact credential, ledger and configuration',async t=>{
  const {root,store}=await fixture(t),initial=await store.save(draft),id=initial.activeId;
  const files=[credentialPath(root,id),path.join(root,'local-secrets/notes/project-secrets.json'),path.join(root,'local-secrets/ai-config/connections.json')];
  const journal=path.join(root,'local-secrets/ai-config/configuration-journal.json');
  const before=await Promise.all(files.map(file=>fs.readFile(file,'utf8')));
  for(const [target,occurrence] of [[journal,1],...files.map(file=>[file,1]),[journal,2]]){
    let renames=0;const rename=fs.rename;
    const mock=t.mock.method(fs,'rename',async(from,to)=>{
      if(to===target && ++renames===occurrence)throw Object.assign(Error('fixture write failure'),{code:'ENOSPC'});
      return rename(from,to);
    });
    try{await assert.rejects(store.save({...draft,id,baseUrl:'https://new.invalid/v1',apiKey:'new-fixture'}),e=>e.code==='CONFIG_STORAGE_ERROR');}
    finally{mock.mock.restore();}
    assert.deepEqual(await Promise.all(files.map(file=>fs.readFile(file,'utf8'))),before);
    assert.equal((await store.state()).revision,initial.revision);
    assert.equal(await readCredential(root,initial.profiles[0]),draft.apiKey);
    assert.doesNotMatch(await fs.readFile(journal,'utf8'),/fixture/);
  }
});

test('independent readers keep using the committed scheme during publication',async t=>{
  const {root,store}=await fixture(t),initial=await store.save(draft),id=initial.activeId;
  const rename=fs.rename;let signal,unblock;
  const reached=new Promise(r=>signal=r),resume=new Promise(r=>unblock=r);
  t.mock.method(fs,'rename',async(from,to)=>{
    if(path.basename(to)==='project-secrets.json'){signal();await resume;}
    await rename(from,to);
  });
  const saving=store.save({...draft,id,apiKey:'next-fixture',baseUrl:'https://next.invalid'});
  await reached;
  try{
    const fresh=new ConfigurationStore(root);
    assert.deepEqual(await fresh.state(),initial);
    assert.equal(await readCredential(root,initial.profiles[0]),draft.apiKey);
    await assert.rejects(fresh.activate({id}),e=>e.code==='CONFIG_BUSY');
  }finally{unblock();await saving;}
  await assert.rejects(readCredential(root,initial.profiles[0]),e=>e.code==='CREDENTIAL_UNAVAILABLE');
});

test('a process exit mid-import preserves the old account and recovers before native Codex starts',async t=>{
  const {root,store}=await fixture(t);
  const original={tokens:{access_token:'old-fixture',refresh_token:'old-refresh'}};
  const prior=await store.importCodex({},original),file=path.join(root,'local-secrets/codex/auth.json');
  const child=spawnSync(process.execPath,['--input-type=module','-'],{cwd:repo,encoding:'utf8',env:{...process.env,SAPLING_FIXTURE:root},input:`
    import fs from 'node:fs/promises';
    import path from 'node:path';
    import {ConfigurationStore} from './kernel/services/ai-config/store.mjs';
    const rename=fs.rename;
    fs.rename=async(from,to)=>{await rename(from,to);if(path.basename(to)==='auth.json')process.exit(86);};
    await new ConfigurationStore(process.env.SAPLING_FIXTURE).importCodex({replace:true},{tokens:{access_token:'new-fixture',refresh_token:'new-refresh'}});
  `});
  assert.equal(child.status,86,child.stderr);
  assert.match(await fs.readFile(file,'utf8'),/new-fixture/);
  assert.deepEqual(await new ConfigurationStore(root).state(),prior);
  await codexConnection(root,await readConnections(root));
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),original);
  assert.equal((await store.save({...draft,revision:prior.revision})).revision,prior.revision+1);
});

test('one settings response cannot mix a new account status with an older profile revision',async t=>{
  const {root,store}=await fixture(t);
  const old=await store.save(draft);
  let reached,release;
  const started=new Promise(r=>{reached=r;}),wait=new Promise(r=>{release=r;});
  const lstat=fs.lstat;
  let armed=true;
  const mock=t.mock.method(fs,'lstat',async(file,...args)=>{
    if(armed && file===path.join(root,'local-secrets/codex/auth.json')){armed=false;reached();await wait;}
    return lstat(file,...args);
  });
  const loading=store.state();
  await started;
  let committed;
  try{committed=await new ConfigurationStore(root).importCodex({revision:old.revision},{tokens:{access_token:'one',refresh_token:'two'}});}
  finally{release();mock.mock.restore();}
  assert.deepEqual(await loading,committed);
});
test('engine catalogs reject an old revision even if the new API key has the same origin',async t=>{
  const {root,store}=await fixture(t);
  const saved=await store.save(draft),old=await readConnections(root);
  await store.save({...draft,id:saved.activeId,model:'updated',apiKey:'rotated-fixture'});
  await assert.rejects(openCodeConnections(root,old),e=>e.code==='CONFIG_CHANGED');
  const providers=await openCodeConnections(root,await readConnections(root));
  const active=providers['sapling-'+saved.activeId];
  assert.equal(active.options.apiKey,'rotated-fixture');assert.deepEqual(Object.keys(active.models),['updated']);
});

test('a failed explicit replacement preserves malformed account bytes verbatim',async t=>{
  const {root,store}=await fixture(t);
  const directory=path.join(root,'local-secrets/codex');await fs.mkdir(directory,{recursive:true});
  const file=path.join(directory,'auth.json'),bytes=Buffer.from([255,123,0,192]);
  await fs.writeFile(file,bytes);
  const rename=fs.rename;
  t.mock.method(fs,'rename',(from,to)=>{
    if(path.basename(to)==='connections.json')throw Object.assign(Error('fixture denial'),{code:'EACCES'});
    return rename(from,to);
  });
  await assert.rejects(store.importCodex({replace:true},{tokens:{access_token:'fake',refresh_token:'fake'}}),e=>e.code==='CONFIG_STORAGE_ERROR');
  assert.deepEqual(await fs.readFile(file),bytes);
});
