import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listenAscending, portKeys } from '../../services/runtime-manager/ports.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { const end = Date.now() + 8000; while (Date.now() < end) { if (await check()) return; await delay(30); } throw new Error('Runtime fixture timed out'); }

// Exercise the delivered runtime graph, including setup imports, without copying
// application code, credentials, installed dependencies or other test fixtures.
async function copyRuntimeFixture(root) {
  const manifest = JSON.parse(await fs.readFile(path.join(project, 'kernel/manifest.json'), 'utf8'));
  for (const {path: file} of manifest.files) {
    if (file.includes('/test/') || file.endsWith('.md')) continue;
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.copyFile(path.join(project, file), target);
  }
}


test('real launcher skips foreign ports, routes actual addresses, retains them across restart and cleans discovery', { timeout: 20000 }, async t => {
  const parent = path.join(project, '.cache/runtime-ports-tests'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "运行 app's "));
  const foreign = http.createServer((req, res) => res.end('foreign'));
  const start = await listenAscending(foreign, 33000);
  const foreignBackend = http.createServer((req, res) => res.end('foreign backend'));
  await listenAscending(foreignBackend, start + 3);
  let child, takeover;
  t.after(async () => {
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await until(() => child.exitCode !== null); }
    for (const server of [foreign, foreignBackend, takeover].filter(Boolean)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await fs.rm(root, { recursive: true, force: true });
  });
  await copyRuntimeFixture(root);
  const config = Object.fromEntries(portKeys.map((key, index) => [key, start + index]));
  const configText = JSON.stringify(config);
  await fs.mkdir(path.join(root, 'config'), {recursive: true}); await fs.writeFile(path.join(root, 'config/runtime.json'), configText);
  const code = `import http from 'node:http';
const i=process.argv.indexOf('--port');const port=i>=0?Number(process.argv[i+1]):Number(process.env.SEED_WORKSPACE_PORT || process.env.SEED_BUILDER_PORT || process.env.SEED_AGENT_PORT);
const s=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ready:true,authenticated:true,mcp:{ready:true,tools:[]},skills:[],pid:process.pid,frontPort:Number(process.env.SEED_FRONT_PORT),agentPort:Number(process.env.SEED_AGENT_PORT),port}))});s.listen(port,'127.0.0.1');process.on('SIGTERM',()=>{s.closeAllConnections();s.close(()=>process.exit(0))});`;
  for (const [file, envKey] of [['backend/workspace/server.mjs', 'SEED_WORKSPACE_PORT'], ['backend/app-builder/server.mjs', 'SEED_BUILDER_PORT'], ['backend/agent-runtime/server.mjs', 'SEED_AGENT_PORT'], ['front/node_modules/vite/bin/vite.js', null]]) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), envKey ? code.replace('process.env.SEED_WORKSPACE_PORT || process.env.SEED_BUILDER_PORT || process.env.SEED_AGENT_PORT', `process.env.${envKey}`) : code);
  }
  const sdk = path.join(root, 'backend/mcp-runtime/node_modules/@modelcontextprotocol/sdk/package.json'); await fs.mkdir(path.dirname(sdk), { recursive: true }); await fs.writeFile(sdk, '{}');
  child = spawn(process.execPath, [path.join(root, 'scripts/dev.mjs')], { cwd: root, env: { ...process.env, SEED_ROOT: root, SEED_IMPORT_EXISTING_AUTH: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  const file = path.join(root, '.runtime/runtime-address.json'); let address;
  await until(async () => { try { address = JSON.parse(await fs.readFile(file)); return true; } catch { assert.equal(child.exitCode, null, output); return false; } });
  const base = address.url.slice(0, -1), status = () => fetch(base + '/api/runtime/status').then(r => r.json());
  await until(async () => (await status()).phase === 'ready');
  assert.ok(address.ports.frontPort > start); assert.match(output, new RegExp(`Saplingagent: http://127.0.0.1:${address.ports.frontPort}/`));
  assert.deepEqual((await status()).ports, address.ports);
  const api = await (await fetch(base + '/api/status')).json(); assert.equal(api.frontPort, address.ports.frontPort); assert.equal(api.port, address.ports.agentPort);
  assert.equal(await fs.readFile(path.join(root, 'config/runtime.json'), 'utf8'), configText);
  assert.equal(await (await fetch(`http://127.0.0.1:${start}/`)).text(), 'foreign');
  const before = await status();
  assert.equal((await fetch(base + '/api/runtime/restart', { method: 'POST', headers: { Origin: base }, body: JSON.stringify({ scope: 'all' }) })).status, 202);
  await until(async () => (await status()).generation === 2);
  const after = await status(); assert.deepEqual(after.ports, before.ports); assert.equal(after.instanceId, address.instanceId);
  for (const service of before.services) assert.notEqual(after.services.find(x => x.name === service.name).pid, service.pid);
  assert.equal((await fetch(base + '/api/runtime/restart', { method: 'POST', headers: { Origin: 'https://example.invalid' }, body: '{}' })).status, 403);
  assert.equal((await status()).applicationRoot,path.resolve(root));
  // The old Agent exits while its persistent controller remains alive; another
  // project claims that address before a backend restart is requested.
  const oldAgent=after.services.find(service=>service.name==='agent');
  process.kill(oldAgent.pid,'SIGTERM');
  await until(async()=>!(await status()).services.find(service=>service.name==='agent').running);
  takeover=http.createServer((req,res)=>res.end('other project'));
  await new Promise((resolve,reject)=>{takeover.once('error',reject);takeover.listen(after.ports.agentPort,'127.0.0.1',resolve)});
  assert.equal((await fetch(base+'/api/runtime/restart',{method:'POST',headers:{Origin:base},body:JSON.stringify({scope:'backend'})})).status,202);
  await until(async()=>{const current=await status();assert.notEqual(current.phase==='failed'&&!current.busy,true,JSON.stringify(current.error));return current.generation===3});
  const recovered=await status();assert.equal(recovered.phase,'ready');assert.equal(recovered.scope,'all');assert.ok(recovered.ports.agentPort>after.ports.agentPort);
  assert.equal(recovered.ports.frontPort,after.ports.frontPort);assert.equal(recovered.ports.runtimeManagerPort,after.ports.runtimeManagerPort);assert.equal(recovered.instanceId,after.instanceId);
  assert.notEqual(recovered.services.find(s=>s.name==='front').pid,after.services.find(s=>s.name==='front').pid);
  assert.equal((await(await fetch(base+'/api/status')).json()).port,recovered.ports.agentPort);
  assert.equal((await(await fetch(base+'/')).json()).agentPort,recovered.ports.agentPort);
  assert.deepEqual(JSON.parse(await fs.readFile(file)).ports,recovered.ports);
  assert.equal(await fs.readFile(path.join(root,'config/runtime.json'),'utf8'),configText);
  assert.equal(await(await fetch(`http://127.0.0.1:${after.ports.agentPort}/`)).text(),'other project');
  const token=await fs.readFile(path.join(root,'local-secrets/runtime/service-token'),'utf8');
  assert.equal((await fetch(`http://127.0.0.1:${address.ports.runtimeManagerPort}/api/runtime/stop`,{method:'POST',headers:{Authorization:'Bearer '+token.trim()},body:'{}'})).status,202);
  await until(() => child.exitCode !== null); assert.equal(child.exitCode, 0, output);
  assert.equal(await fs.access(file).then(() => true, () => false), false);
  assert.equal(foreign.listening, true); assert.equal(foreignBackend.listening, true);
});

test('startup publishes recovery controls even when the application frontend is missing', {timeout:15000}, async t=>{
 const parent=path.join(project,'.cache/runtime-core-only');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'app-'));
 await copyRuntimeFixture(root);
 const control=http.createServer();const start=await listenAscending(control,35000);await new Promise(r=>control.close(r));await fs.mkdir(path.join(root,'config'), {recursive:true});await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify(Object.fromEntries(portKeys.map((k,i)=>[k,start+i]))));
 const child=spawn(process.execPath,[path.join(root,'scripts/dev.mjs')],{cwd:root,env:{...process.env,SEED_ROOT:root,SEED_IMPORT_EXISTING_AUTH:'0'},stdio:'ignore'});
 t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await until(()=>child.exitCode!==null);}await fs.rm(root,{recursive:true,force:true});});
 let address;await until(async()=>{try{address=JSON.parse(await fs.readFile(path.join(root,'.runtime/runtime-address.json'),'utf8'));return true;}catch{return false;}});
 const r=await fetch(new URL('/__saplingagent/kernel',address.url));assert.equal(r.status,200);assert.match(await r.text(),/Upgrade kernel & restart/);
 await until(async()=>{const s=await fetch(new URL('/api/runtime/status',address.url)).then(r=>r.json());return s.phase==='failed'&&!s.busy;});
 assert.equal((await fetch(new URL('/__saplingagent/kernel',address.url))).status,200);
});
