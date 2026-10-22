import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readMcpAccess,saveMcpAccess,getMcpAccess,registerMcpClient,assertMcpClientsStopped} from '../../../contracts/mcp-access.mjs';
import {acquireKernelLock} from '../../../contracts/kernel.mjs';

const parent=fileURLToPath(new URL('../../../../.cache/mcp-access-tests/',import.meta.url));
async function fixture(t) {
  await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'config-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;
}
async function write(root,file,value) {const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,typeof value==='string'?value:JSON.stringify(value));}

test('missing config is disabled without writes; strict revisioned saves and external-only dependency',async t=>{
  const root=await fixture(t);assert.deepEqual(await readMcpAccess(root),{schemaVersion:1,revision:0,enabled:false,externalOnly:false});assert.deepEqual(await fs.readdir(root),[]);
  await assert.rejects(saveMcpAccess(root,{revision:0,enabled:false,externalOnly:true}),{code:'INVALID_CONFIG'});
  await assert.rejects(saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false,extra:true}),{code:'INVALID_CONFIG'});
  assert.deepEqual(await saveMcpAccess(root,{revision:0,enabled:true,externalOnly:true}),{schemaVersion:1,revision:1,enabled:true,externalOnly:true});
  await assert.rejects(saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false}),{code:'CONFIG_CHANGED'});
  const saved=await saveMcpAccess(root,{revision:1,enabled:false,externalOnly:false});assert.equal(saved.revision,2);
  await write(root,'config/mcp-access.json','broken');await assert.rejects(readMcpAccess(root),{code:'INVALID_MCP_CONFIG'});
});

test('configuration targets final project runtime, never this process or a configuration capsule',async t=>{
  const root=await fixture(t);const os=process.platform==='win32'?'windows':'macos';
  await write(root,`kernel/config/${os}.json`,{nodeVersion:'24.21.0'});
  const first=await getMcpAccess(root);assert.equal(first.enabled,false);assert.equal(first.available,false);
  const config=first.configuration.mcpServers.saplingagent;assert.ok(config.command.startsWith(root+path.sep));assert.equal(config.args[0],path.join(root,'kernel/services/mcp-access/server.mjs'));
  await write(root,path.relative(root,config.command),'fixture-node');await write(root,'kernel/services/mcp-access/server.mjs','fixture-server');await write(root,'kernel/node_modules/@modelcontextprotocol/sdk/package.json','{}');
  assert.equal((await getMcpAccess(root)).available,true);
});

test('managed config symlinks fail without affecting general tool path policy',{skip:process.platform==='win32'?'Directory symlink fixture requires Windows developer-mode privileges':false},async t=>{
  const root=await fixture(t);await fs.mkdir(path.join(root,'actual'));await fs.symlink('actual',path.join(root,'config'));
  await assert.rejects(saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false}),{code:'MCP_STORAGE_LOCATION'});
  assert.deepEqual(await fs.readdir(path.join(root,'actual')),[]);
});

test('client registration requires enabled, excludes maintenance, and preserves other instances',async t=>{
  const root=await fixture(t);await assert.rejects(registerMcpClient(root),{code:'MCP_DISABLED'});
  await saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false});
  const close1=await registerMcpClient(root),close2=await registerMcpClient(root);
  const directory=path.join(root,'.runtime/mcp-access/clients');assert.equal((await fs.readdir(directory)).length,2);
  await assert.rejects(assertMcpClientsStopped(root),{code:'MCP_CLIENTS_ACTIVE'});
  await close1();assert.equal((await fs.readdir(directory)).length,1);await assert.rejects(assertMcpClientsStopped(root),{code:'MCP_CLIENTS_ACTIVE'});
  await close2();await assertMcpClientsStopped(root);
  const release=await acquireKernelLock(root,'fixture-maintenance');await assert.rejects(registerMcpClient(root),{code:'KERNEL_BUSY'});await release();
  for(const name of ['macos-install.lock','windows-install.lock','node-install.lock','windows-node.lock']) {
    await write(root,'.runtime/'+name,'fixture');await assert.rejects(registerMcpClient(root),{code:'KERNEL_BUSY'});await fs.unlink(path.join(root,'.runtime',name));
  }
});

test('unknown ownership blocks maintenance and cleanup does not remove a replaced receipt',async t=>{
  const root=await fixture(t);await saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false});
  const close=await registerMcpClient(root),directory=path.join(root,'.runtime/mcp-access/clients');
  const name=(await fs.readdir(directory))[0],file=path.join(directory,name);
  await fs.rename(file,file+'.original');await fs.writeFile(file,'unknown');await close();assert.equal(await fs.readFile(file,'utf8'),'unknown');
  await assert.rejects(assertMcpClientsStopped(root),{code:'MCP_CLIENTS_ACTIVE'});
});
