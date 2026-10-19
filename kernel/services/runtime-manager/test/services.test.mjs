import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadProjectServices,serviceCommand} from '../services.mjs';
async function fixture(t){const parent=fileURLToPath(new URL('../../../../.cache/service-plan-tests/',import.meta.url));await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'fixture-'));await fs.mkdir(path.join(root,'config'));await fs.mkdir(path.join(root,'backend'));await fs.writeFile(path.join(root,'worker.mjs'),'setInterval(()=>{},1000)');t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function write(root,services){await fs.writeFile(path.join(root,'config/services.json'),JSON.stringify({version:1,services}));}
test('discovery excludes control, MCP and demand-started setup, and explicit commands use the local Node',async t=>{
 const root=await fixture(t);for(const name of ['runtime-manager','mcp-runtime','ai-config','notes']){await fs.mkdir(path.join(root,'backend',name));await fs.writeFile(path.join(root,'backend',name,'server.mjs'),'');}
 const plan=await loadProjectServices(root,[]);assert.deepEqual(plan.map(x=>x.name),['notes']);
 await write(root,[{name:'worker',command:['node','worker.mjs'],args:['${ROOT}','${PORT}'],env:{ROOT_PATH:'${ROOT}'},healthCheck:'process'}]);const next=await loadProjectServices(root,[]);const worker=next.find(x=>x.name==='worker');const spec=await serviceCommand(root,worker);assert.equal(spec.command,process.execPath);assert.equal(spec.args[1],root);assert.equal(spec.args[2],'');assert.equal(spec.env.ROOT_PATH,root);assert.ok(spec.env.PATH.startsWith(path.dirname(process.execPath)));
});
test('dependency cycles, unknown dependencies and disabled dependencies fail before launch',async t=>{
 const root=await fixture(t);
 for(const services of [[{name:'a',file:'worker.mjs',dependsOn:['b']},{name:'b',file:'worker.mjs',dependsOn:['a']}],[{name:'a',file:'worker.mjs',dependsOn:['missing']}],[{name:'a',file:'worker.mjs',dependsOn:['b']},{name:'b',enabled:false}]]){await write(root,services);await assert.rejects(loadProjectServices(root,[]),{code:'INVALID_SERVICES'});}
});
test('invalid manifests, duplicate IDs, ambiguous port environment names and invalid readiness are rejected',async t=>{
 const root=await fixture(t);const entry={name:'reports',file:'worker.mjs'};
 for(const services of [[entry,entry],[{...entry,name:'front'}],[{...entry,name:'a-b'},{...entry,name:'a_b'}],[{...entry,healthCheck:'guess'}],[{...entry,port:0}],[{...entry,env:{VALUE:123}}],[{...entry,cwd:'missing'}],[{...entry,file:'missing.mjs'}],[{...entry,command:['node']}],[{...entry,healthPath:'https://example.invalid/'}]]){await write(root,services);await assert.rejects(loadProjectServices(root,[]),{code:'INVALID_SERVICES'});}
 await fs.writeFile(path.join(root,'config/services.json'),'null');await assert.rejects(loadProjectServices(root,[]),{code:'INVALID_SERVICES'});
});
test('missing executable is identified in preflight instead of stopping a working application first',async t=>{
 const root=await fixture(t);await write(root,[{name:'broken',command:['./does-not-exist'],healthCheck:'process'}]);const [entry]=await loadProjectServices(root,[]);await assert.rejects(serviceCommand(root,entry),{code:'INVALID_SERVICES',service:'broken'});
});
