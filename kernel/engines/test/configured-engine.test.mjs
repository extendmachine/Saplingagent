import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createAgentServer } from '../../../backend/agent-runtime/server.mjs';
import { OpenCodeProvider } from '../providers/opencode.mjs';
import { ConfigurationStore } from '../../services/ai-config/store.mjs';
const project=fileURLToPath(new URL('../../../',import.meta.url));
async function fixture(t){const directory=path.join(project,'.cache/configured-engine-tests');await fs.mkdir(directory,{recursive:true});const root=await fs.mkdtemp(path.join(directory,"中文 app's "));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
const profile={label:'Synthetic scheme',engine:'opencode',kind:'api',protocol:'chat',baseUrl:'http://127.0.0.1:1/v1',model:'synthetic-coder',apiKey:'synthetic-only-key'};
class FakeOpenCode{constructor({root}={}){this.root=root;this.ready=false;}async start(){this.ready=true;return this.catalog();}async catalog(){const data=JSON.parse(await fs.readFile(path.join(this.root,'local-secrets/ai-config/connections.json'),'utf8'));return {id:'opencode',ready:true,authenticated:true,mcp:{ready:true,tools:[]},providers:data.profiles.filter(p=>p.engine==='opencode').map(p=>({id:`sapling-${p.id}`,models:[{id:p.model}]}))};}async close(){this.ready=false;}}
class FakeCodex extends EventEmitter{constructor(options){super();this.options=options;this.closed=false;this.calls=[];FakeCodex.last=this;}send(){}async close(){this.closed=true;}async call(method,params){this.calls.push([method,params]);if(method==='account/read')return {account:null,requiresOpenaiAuth:false};if(method==='model/list')return {data:[{model:'bundled-default',supportedReasoningEfforts:[{reasoningEffort:'medium'}],defaultReasoningEffort:'medium'}]};if(method==='thread/start')return {thread:{id:'synthetic-thread'},sandbox:{type:'dangerFullAccess'},approvalPolicy:'never'};if(method==='skills/list')return {data:[]};if(method==='mcpServerStatus/list')return {data:[{name:'seedagent',tools:{synthetic:{description:'synthetic tool'}}}]};return {};}}
async function agentFixture(t,root,options){const workspace=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({sessions:[]}));});await new Promise(resolve=>workspace.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>workspace.close(resolve)));
 await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.mkdir(path.join(root,'local-secrets/runtime'),{recursive:true});await fs.writeFile(path.join(root,'local-secrets/runtime/service-token'),'synthetic-service-token');
 await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify({workspacePort:workspace.address().port,preferredModel:'bundled-default',reasoningEffort:'medium',turnTimeoutMs:0}));
 const server=await createAgentServer({root,...options});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.shutdown());return server;
}
test('saved OpenCode scheme starts independently, without creating a Codex process or requiring its login',async t=>{
 const root=await fixture(t);const saved=await new ConfigurationStore(root).save(profile);
 const server=await agentFixture(t,root,{OpenCodeProviderClass:FakeOpenCode,AppServerClass:class{constructor(){throw Error('Codex must not start');}}});await server.startAgent();
 const url=`http://127.0.0.1:${server.address().port}`;const status=await fetch(url+'/api/status').then(r=>r.json());assert.equal(status.ready,true);assert.equal(status.authenticated,true);assert.equal(status.mcp.ready,true);assert.equal(status.codexReady,false);assert.equal(status.defaultEngine,'opencode');assert.equal(status.model,profile.model);
 const catalog=await fetch(url+'/api/engines').then(r=>r.json());assert.deepEqual(catalog.defaultSelection,{engine:'opencode',providerId:`sapling-${saved.activeId}`,modelId:profile.model});assert.equal(catalog.engines[0].ready,false);
});
test('custom Codex model/API scheme uses private key environment, exact custom model and unchanged Full Access',async t=>{
 const root=await fixture(t);await new ConfigurationStore(root).save({...profile,engine:'codex',protocol:'responses'});
 const server=await agentFixture(t,root,{AppServerClass:FakeCodex,OpenCodeProviderClass:FakeOpenCode});await server.startAgent();const client=FakeCodex.last;
 assert.equal(client.options.env.SAPLING_CODEX_API_KEY,profile.apiKey);assert.doesNotMatch(JSON.stringify(client.options.args),/synthetic-only-key/);
 assert.match(client.options.args.join(' '),/model_providers.sapling_custom.base_url=/);const thread=client.calls.find(([m])=>m==='thread/start')[1];assert.equal(thread.model,profile.model);assert.equal(thread.sandbox,'danger-full-access');assert.equal(thread.approvalPolicy,'never');
 const status=await fetch(`http://127.0.0.1:${server.address().port}/api/status`).then(r=>r.json());assert.equal(status.ready,true);assert.equal(status.codexReady,true);assert.equal(status.model,profile.model);assert.doesNotMatch(JSON.stringify(status),/synthetic-only-key/);
});
test('pinned native OpenCode reads a saved custom scheme and connects its local MCP without sending a model prompt', {skip:process.platform!=='darwin'},async t=>{
 const root=await fixture(t);const probe=http.createServer((req,res)=>{probe.requests++;res.end('{}');});probe.requests=0;await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>probe.close(resolve)));
 const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 await new ConfigurationStore(root).save({...profile,baseUrl:`http://127.0.0.1:${probe.address().port}/v1`});
 await fs.mkdir(path.join(root,'backend/agent-runtime/node_modules/.bin'),{recursive:true});await fs.symlink(path.join(project,'kernel/node_modules/.bin/opencode'),path.join(root,'backend/agent-runtime/node_modules/.bin/opencode'));
 await fs.mkdir(path.join(root,'backend/mcp-runtime'),{recursive:true});await fs.writeFile(path.join(root,'backend/mcp-runtime/server.mjs'),`import readline from 'node:readline';for await(const line of readline.createInterface({input:process.stdin})){const m=JSON.parse(line);if(m.id===undefined)continue;let result={};if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'synthetic-mcp',version:'1'}};if(m.method==='tools/list')result={tools:[{name:'synthetic_tool',description:'Synthetic test tool',inputSchema:{type:'object',properties:{}}}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}`);
 const provider=new OpenCodeProvider({root,port,mcpEnv:{},instructions:'Synthetic test only',onEvent(){}});t.after(()=>provider.close());const catalog=await provider.start();const saved=catalog.providers.find(p=>p.label===profile.label);
 assert.ok(saved,'saved custom provider should be discoverable');assert.ok(saved.models.some(m=>m.id===profile.model));assert.equal(catalog.authenticated,true);assert.equal(catalog.mcp.ready,true);assert.equal(probe.requests,0);
 const pid=provider.process.pid;await provider.start();assert.equal(provider.process.pid,pid,'catalog refresh must not spawn a second process');
});

class FakeClaude extends FakeOpenCode { async catalog(){const data=await fs.readFile(path.join(this.root,'local-secrets/ai-config/connections.json'),'utf8').then(JSON.parse);return {id:'claude',label:'Claude Agent',ready:true,authenticated:true,mcp:{ready:true,tools:[{name:'synthetic'}]},skills:[{name:'saplingagent:synthetic'}],providers:data.profiles.filter(p=>p.engine==='claude').map(p=>({id:`sapling-${p.id}`,models:[{id:p.model}]}))};}}
test('saved Claude default starts and exposes its selection without Codex login',async t=>{
 const root=await fixture(t);const saved=await new ConfigurationStore(root).save({...profile,engine:'claude',protocol:'anthropic'});
 const server=await agentFixture(t,root,{ClaudeProviderClass:FakeClaude,OpenCodeProviderClass:FakeOpenCode,AppServerClass:class{constructor(){throw Error('Codex must not start');}}});await server.startAgent();
 const url=`http://127.0.0.1:${server.address().port}`;const status=await fetch(url+'/api/status').then(r=>r.json());assert.equal(status.ready,true);assert.equal(status.defaultEngine,'claude');assert.equal(status.codexReady,false);assert.equal(status.skills[0].name,'saplingagent:synthetic');
 const catalog=await fetch(url+'/api/engines').then(r=>r.json());assert.deepEqual(catalog.defaultSelection,{engine:'claude',providerId:`sapling-${saved.activeId}`,modelId:profile.model});assert.equal(catalog.engines.find(e=>e.id==='claude').ready,true);assert.doesNotMatch(JSON.stringify(catalog),/synthetic-only-key/);
});
