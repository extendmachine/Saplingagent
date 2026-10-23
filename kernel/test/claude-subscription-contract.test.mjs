import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import { readConnections, readCredential, claudeConnections, defaultSelection } from '../contracts/ai-configuration.mjs';
const subscription = {id:'personal-claude',label:'Personal Claude',engine:'claude',kind:'subscription',model:'fixture-model'};
async function fixture(t, profile=subscription, credential={oauthToken:'synthetic-personal-token'}) {
  const directory=fileURLToPath(new URL('../../.cache/claude-contract-tests/',import.meta.url));
  await fs.mkdir(directory,{recursive:true});
  const root=await fs.mkdtemp(path.join(directory,'fixture-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'local-secrets/ai-config'),{recursive:true});
  await fs.mkdir(path.join(root,'local-secrets/api-keys'),{recursive:true});
  const connections={schemaVersion:1,revision:1,activeId:profile.id,profiles:[profile]};
  await fs.writeFile(path.join(root,'local-secrets/ai-config/connections.json'),JSON.stringify(connections));
  await fs.writeFile(path.join(root,`local-secrets/api-keys/ai-${profile.id}.json`),JSON.stringify(credential));
  return root;
}
test('personal subscription selects Claude and resolves only its OAuth credential',async t=>{
  const root=await fixture(t);const saved=await readConnections(root);
  assert.deepEqual(defaultSelection(saved),{engine:'claude',providerId:'sapling-personal-claude',modelId:'fixture-model'});
  const [runtime]=await claudeConnections(root,saved);
  assert.equal(runtime.oauthToken,'synthetic-personal-token');assert.equal(runtime.sdkBaseUrl,null);
  assert.equal(Object.hasOwn(runtime,'apiKey'),false);assert.equal(Object.hasOwn(runtime,'baseUrl'),false);
});
test('saved subscription rejects API endpoint/auth fields and non-Claude engines',async t=>{
  for(const extra of [{baseUrl:'https://example.invalid/v1'},{protocol:'anthropic'},{noAuth:false},{noAuth:true},{contextWindow:128000},{apiKey:'synthetic'},{oauthToken:'synthetic'},{engine:'opencode'},{model:''}]){
    const root=await fixture(t,{...subscription,...extra});await assert.rejects(readConnections(root),/invalid structure/);
  }
});
test('subscription never reuses an API key or accepts damaged token storage',async t=>{
  for(const credential of [{apiKey:'synthetic-api-only'},{oauthToken:''},{oauthToken:' '},{oauthToken:123},{oauthToken:'synthetic\nline'},{oauthToken:'synthetic space'},{oauthToken:'a'.repeat(8193)}]){
    const root=await fixture(t,subscription,credential);
    await assert.rejects(readCredential(root,subscription),/credential is unavailable/);
  }
});
test('existing Claude API and no-auth profiles retain their transport behavior',async t=>{
  const api={...subscription,kind:'api',protocol:'anthropic',baseUrl:'https://example.invalid/v1',noAuth:false,contextWindow:128000,maxOutput:16384};
  const root=await fixture(t,api,{apiKey:'synthetic-api-key'});
  const [runtime]=await claudeConnections(root,await readConnections(root));
  assert.equal(runtime.apiKey,'synthetic-api-key');assert.equal(runtime.sdkBaseUrl,'https://example.invalid');assert.equal(Object.hasOwn(runtime,'oauthToken'),false);
  assert.equal(await readCredential(root,{...api,noAuth:true}),null);
});
