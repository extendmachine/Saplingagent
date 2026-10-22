import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {ProjectLauncher,readProject} from '../manager.mjs';
import {saveMcpAccess} from '../../contracts/mcp-access.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
async function fixture(t){const parent=path.join(repo,'.cache/mcp-launcher-tests');await fs.mkdir(parent,{recursive:true});const holder=await fs.mkdtemp(path.join(parent,'fixture-')),root=path.join(holder,'Before');await fs.mkdir(root);t.after(()=>fs.rm(holder,{recursive:true,force:true}));return {root,holder,manager:new ProjectLauncher(root)};}
async function ready(manager){const root=manager.root,project=await readProject(root);await fs.writeFile(path.join(root,'.runtime/project-directory.json'),JSON.stringify({schemaVersion:1,root,projectId:project.projectId,folderName:project.folderName}));await fs.writeFile(path.join(root,'.runtime/setup-finalization.json'),JSON.stringify({phase:'ready',root,connectionsFingerprint:await manager.connectionsFingerprint()}));}
test('absent MCP settings preserve legacy setup hashes; every saved MCP edit invalidates readiness',async t=>{
  const {root,manager}=await fixture(t);await manager.stageSetup({name:'Before',renameFolder:false});
  assert.equal(await manager.connectionsFingerprint(),createHash('sha256').update('').digest('hex'));
  const file=path.join(root,'local-secrets/ai-config/connections.json');await fs.mkdir(path.dirname(file),{recursive:true});const bytes='{"schemaVersion":1,"revision":0,"activeId":null,"profiles":[]}\n';await fs.writeFile(file,bytes);
  assert.equal(await manager.connectionsFingerprint(),createHash('sha256').update(bytes).digest('hex'));await ready(manager);assert.equal(await manager.exportReady(),true);
  for(const settings of [{revision:0,enabled:true,externalOnly:true},{revision:1,enabled:true,externalOnly:false},{revision:2,enabled:false,externalOnly:false}]){
    await saveMcpAccess(root,settings);assert.equal(await manager.exportReady(),false);await ready(manager);assert.equal(await manager.exportReady(),true);
  }
  assert.equal(await fs.readFile(file,'utf8'),bytes);
});
test('legacy rename checks MCP ownership under its operation lease and preserves active connections',async t=>{
  const {root,holder,manager}=await fixture(t);await manager.stageSetup({name:'Before',renameFolder:false});const id=randomUUID(),directory=path.join(root,'.runtime/mcp-access/clients');await fs.mkdir(directory,{recursive:true});const file=path.join(directory,id+'.json'),receipt={schemaVersion:1,id,pid:process.pid,root};await fs.writeFile(file,JSON.stringify(receipt));
  await assert.rejects(manager.rename('After'),{code:'MCP_CLIENTS_ACTIVE'});assert.equal(manager.root,root);assert.deepEqual(JSON.parse(await fs.readFile(file)),receipt);assert.equal(await fs.access(path.join(holder,'After')).then(()=>true,()=>false),false);assert.equal(await fs.access(path.join(root,'.runtime/kernel-operation.lock')).then(()=>true,()=>false),false);
});
