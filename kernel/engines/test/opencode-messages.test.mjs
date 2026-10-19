import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { OpenCodeProvider } from '../providers/opencode.mjs';
import { ConfigurationStore } from '../../services/ai-config/store.mjs';
const project = fileURLToPath(new URL('../../../', import.meta.url));
const internal = 'Current permissions: full-access; synthetic internal context only.';
const run = () => ({session: {threadId:'ses_test',providerId:'synthetic',modelId:'MiniMax-M3'},save:async()=>{}});
async function provider(t, options = {}) {
  const events = [], prompts = [];
  const p = new OpenCodeProvider({root:project,instructions:'Synthetic system rules',onEvent:(r,e)=>events.push(e)});
  p.ready = true;
  p.client = {session:{get:async()=>({data:{id:'ses_test'}}),promptAsync:async args=>{prompts.push(args);return options.reject?{error:{message:'Synthetic prompt rejected'}}:{data:true};},abort:async()=>({data:true})}};
  t.after(()=>p.close());
  const r = run();await p.execute(r,'Hello user',{context:internal}).catch(error=>{if(!options.reject)throw error;});
  return {p,r,events,prompts,id:prompts[0].body.messageID};
}
const meta = (id, parentID, extra = {}) => ({type:'message.updated',properties:{info:{id,sessionID:'ses_test',role:'assistant',parentID,...extra}}});
const part = (messageID, text, extra = {}) => ({type:'message.part.updated',properties:{part:{id:'part_'+messageID,sessionID:'ses_test',messageID,type:'text',text,...extra},delta:text}});
const idle = {type:'session.idle',properties:{sessionID:'ses_test'}};
test('user echo including runtime context is never assistant output; raw user and system are separate', async t => {
  const {p,events,prompts,id} = await provider(t);
  assert.deepEqual(prompts[0].body.parts,[{type:'text',text:'Hello user'}]);
  assert.match(prompts[0].body.system,/Synthetic system rules/);assert.match(prompts[0].body.system,/Current permissions/);
  p.handleEvent(part(id,'Hello user\n\n'+internal));
  p.handleEvent({type:'message.updated',properties:{info:{id,sessionID:'ses_test',role:'user'}}});
  p.handleEvent(part(id,internal));assert.deepEqual(events,[]);
  p.handleEvent(meta('msg_reply',id));p.handleEvent(part('msg_reply','Actual reply'));p.handleEvent(idle);
  assert.equal(events[0].delta,'Actual reply');assert.deepEqual(events.at(-1),{type:'done',status:'completed'});assert.equal(p.runs.size,0);
});
test('late prior-turn text/tools/reasoning, other sessions and summary messages are ignored',async t=>{
  const {p,events,id} = await provider(t);
  for(const old of ['msg_previous','msg_summary']) {
    p.handleEvent(meta(old,old==='msg_previous'?'old_user':id,{summary:old==='msg_summary'}));
    p.handleEvent(part(old,'Old text'));p.handleEvent(part(old,'',{type:'tool',tool:'old_tool'}));p.handleEvent(part(old,'',{type:'reasoning'}));
  }
  p.handleEvent({type:'message.updated',properties:{info:{id:'msg_other',parentID:id,role:'assistant',sessionID:'ses_other'}}});
  p.handleEvent({type:'message.part.updated',properties:{part:{id:'part_other',sessionID:'ses_other',messageID:'msg_other',type:'text',text:'Other session'}}});
  p.handleEvent(idle);assert.deepEqual(events,[],'idle from before current message must not end it');assert.equal(p.runs.size,1);
  p.handleEvent(meta('msg_now',id));p.handleEvent(part('msg_now','New reply'));p.handleEvent(idle);assert.equal(events.filter(e=>e.type==='text').map(e=>e.delta).join(''),'New reply');
});
test('out-of-order cumulative parts wait for role/parent metadata and release exactly once',async t=>{
  const {p,events,id} = await provider(t);
  p.handleEvent(part('msg_reply','Hel'));p.handleEvent(part('msg_reply','Hello'));assert.deepEqual(events,[]);
  p.handleEvent(meta('msg_reply',id));p.handleEvent(part('msg_reply','Hello'));p.handleEvent(part('msg_reply','Hello world'));p.handleEvent(meta('msg_reply',id));
  assert.deepEqual(events.filter(e=>e.type==='text').map(e=>e.delta),['Hello',' world']);
  p.handleEvent(part('msg_unknown_user',internal));p.handleEvent(meta('msg_unknown_user',id,{role:'user'}));
  assert.equal(events.length,2);p.handleEvent(idle);assert.equal(p.runs.size,0);
});
test('synthetic/ignored parts never render; real tool lifecycle and reasoning still route',async t=>{
  const {p,events,id} = await provider(t);p.handleEvent(meta('msg_reply',id));
  p.handleEvent(part('msg_reply','Hidden',{synthetic:true}));p.handleEvent(part('msg_reply','Hidden',{ignored:true}));
  p.handleEvent(part('msg_reply','',{type:'reasoning'}));
  for(const status of ['running','completed'])p.handleEvent(part('msg_reply','',{type:'tool',tool:'seedagent_workspace_write_file',callID:'call1',state:{status,input:{path:'front/synthetic.txt',content:'Synthetic'}}}));
  p.handleEvent(part('msg_reply','Saved'));p.handleEvent(idle);
  assert.equal(events.filter(e=>e.type==='text').map(e=>e.delta).join(''),'Saved');assert.deepEqual(events.filter(e=>e.type==='tool').map(e=>e.status),['running','completed']);assert.equal(events[0].label,'Thinking…');
});
test('API errors and empty idle replies fail explicitly and clean state',async t=>{
  for(const kind of ['message','session','empty']){
    const {p,events,id}=await provider(t);
    if(kind==='message')p.handleEvent(meta('msg_reply',id,{error:{name:'APIError',data:{message:'Synthetic quota failure'}}}));
    if(kind==='session')p.handleEvent({type:'session.error',properties:{sessionID:'ses_test',error:{data:{message:'Synthetic API failure'}}}});
    if(kind==='empty'){p.handleEvent(meta(id,null,{role:'user'}));p.handleEvent(idle);}
    p.handleEvent(idle);assert.equal(events.length,1);assert.equal(events[0].type,'error');assert.equal(p.runs.size,0);
  }
});
test('prompt rejection leaves no event ownership or assistant echo',async t=>{const {p,events,id}=await provider(t,{reject:true});p.handleEvent(part(id,internal));assert.equal(p.runs.size,0);assert.deepEqual(events,[]);});
test('cancel suppresses late output and maps native abort errors to interruption',async t=>{
  const {p,r,events,id}=await provider(t);p.handleEvent(meta('msg_reply',id));await p.interrupt(r);p.handleEvent(part('msg_reply','Late text'));p.handleEvent(meta('msg_reply',id,{error:{name:'MessageAbortedError',data:{message:'Aborted'}}}));
  assert.deepEqual(events,[{type:'done',status:'interrupted'}]);assert.equal(p.runs.size,0);
});

async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port;}
async function fixture(t,beforeRemove=async()=>{}){const parent=path.join(project,'.cache/opencode-messages');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,"中文 app's "));t.after(async()=>{await beforeRemove();await fs.rm(root,{recursive:true,force:true});});return root;}
test('native pinned OpenCode streams an actual reply, MCP call and resumed turn through a synthetic Chat API', {skip:process.platform!=='darwin',timeout:60000},async t=>{
  let p;
  // Node after-hooks run in registration order. Stop the owned native process
  // before removing its still-writable dependencies, config and cache directory.
  const root=await fixture(t,async()=>{await p?.close();}),requests=[],received=[];let modelCalls=0, rejectNext=false;
  const api=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};requests.push({path:req.url,body});
    if(req.url!=='/v1/chat/completions'){res.writeHead(404);res.end('{}');return;}
    modelCalls++;if(rejectNext){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Synthetic credentials rejected',type:'invalid_api_key'}}));return;}const invoke=modelCalls===1;
    const delta=invoke?{role:'assistant',tool_calls:[{index:0,id:'call_synthetic',type:'function',function:{name:'seedagent_synthetic_tool',arguments:JSON.stringify({value:'Synthetic input'})}}]}:{role:'assistant',content:'Synthetic reply'};
    const base={id:'chatcmpl_synthetic'+modelCalls,object:'chat.completion.chunk',created:1,model:'MiniMax-M3'};
    if(!body.stream){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...base,object:'chat.completion',choices:[{index:0,message:delta,finish_reason:invoke?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:3,total_tokens:13}}));return;}
    res.setHeader('Content-Type','text/event-stream');const emit=x=>res.write(`data: ${JSON.stringify(x)}\n\n`);
    emit({...base,choices:[{index:0,delta,finish_reason:null}]});emit({...base,choices:[{index:0,delta:{},finish_reason:invoke?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:3,total_tokens:13}});res.end('data: [DONE]\n\n');
  });const apiPort=await listen(api);t.after(()=>new Promise(resolve=>{api.closeAllConnections();api.close(resolve);}));
  const saved=await new ConfigurationStore(root).save({label:'Synthetic MiniMax',engine:'opencode',kind:'api',protocol:'chat',baseUrl:`http://127.0.0.1:${apiPort}/v1`,model:'MiniMax-M3',apiKey:'synthetic-only-key'});
  await fs.mkdir(path.join(root,'backend/agent-runtime/node_modules/.bin'),{recursive:true});await fs.symlink(path.join(project,'kernel/node_modules/.bin/opencode'),path.join(root,'backend/agent-runtime/node_modules/.bin/opencode'));
  await fs.mkdir(path.join(root,'backend/mcp-runtime'),{recursive:true});await fs.writeFile(path.join(root,'backend/mcp-runtime/server.mjs'),`import readline from 'node:readline';for await(const line of readline.createInterface({input:process.stdin})){const m=JSON.parse(line);if(m.id===undefined)continue;let result={};if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'synthetic-mcp',version:'1'}};if(m.method==='tools/list')result={tools:[{name:'synthetic_tool',description:'Synthetic tool',inputSchema:{type:'object',properties:{value:{type:'string'}}}}]};if(m.method==='tools/call')result={content:[{type:'text',text:'Synthetic tool completed'}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}`);
  const reserve=http.createServer();const port=await listen(reserve);await new Promise(resolve=>reserve.close(resolve));
  let finish;const terminals=[];p=new OpenCodeProvider({root,port,mcpEnv:{},instructions:'Synthetic only',onEvent:(r,e)=>{received.push(e);if(e.type==='done'||e.type==='error'){terminals.push(e);finish?.();}}});
  await p.start();assert.equal(modelCalls,0);
  const r={session:{title:'Synthetic',providerId:`sapling-${saved.activeId}`,modelId:'MiniMax-M3'},save:async()=>{}};
  async function turn(text){received.length=0;const completed=new Promise(resolve=>finish=resolve);await p.execute(r,text,{context:internal});await completed;assert.equal(terminals.at(-1).type,'done',terminals.at(-1).error?.message);assert.equal(terminals.at(-1).status,'completed');assert.equal(received.filter(e=>e.type==='text').map(e=>e.delta).join(''),'Synthetic reply');assert.equal(p.runs.size,0);}
  await turn('Synthetic first input');assert.ok(received.some(e=>e.type==='tool'&&e.name==='seedagent_synthetic_tool'&&e.status==='completed'));
  const thread=r.session.threadId;await turn('Synthetic second input');assert.equal(r.session.threadId,thread);
  const input=requests.filter(x=>x.path==='/v1/chat/completions').at(-1).body;
  assert.ok(input.messages.some(m=>m.role==='system'&&JSON.stringify(m.content).includes(internal)));
  assert.ok(input.messages.some(m=>m.role==='user'&&JSON.stringify(m.content).includes('Synthetic second input')));
  assert.ok(input.messages.filter(m=>m.role==='user').every(m=>!JSON.stringify(m.content).includes(internal)));
  assert.ok(input.messages.some(m=>m.role==='assistant'&&JSON.stringify(m.content).includes('Synthetic reply')));
  rejectNext=true;received.length=0;const failed=new Promise(resolve=>finish=resolve);
  await p.execute(r,'Synthetic error input',{context:internal});await failed;
  assert.equal(terminals.at(-1).type,'error');assert.match(terminals.at(-1).error.message,/Synthetic credentials rejected/);
  assert.ok(!received.some(e=>e.type==='text'||(e.type==='done'&&e.status==='completed')));assert.equal(p.runs.size,0);
});

test('older text snapshots cannot rewind deduplication and repeat previously rendered content',async t=>{
  const {p,events,id}=await provider(t);await p.handleEvent(meta('msg_reply',id));
  for(const text of ['Hello','Hel','Hello','Hello world'])await p.handleEvent(part('msg_reply',text));
  assert.equal(events.filter(e=>e.type==='text').map(e=>e.delta).join(''),'Hello world');
});
test('idle recovers missing assistant metadata from native message storage, without exposing unknown/user text',async t=>{
  const {p,events,id}=await provider(t);
  p.client.session.message=async({path:request})=>({data:{info:{id:request.messageID,sessionID:'ses_test',role:request.messageID==='msg_reply'?'assistant':'user',parentID:id}}});
  await p.handleEvent(part('msg_user_echo',internal));await p.handleEvent(part('msg_reply','Recovered reply'));await p.handleEvent(idle);
  assert.equal(events.filter(e=>e.type==='text').map(e=>e.delta).join(''),'Recovered reply');assert.equal(events.at(-1).status,'completed');
});
test('unresolvable role at idle is a clear failure rather than a leaked prompt or false success',async t=>{
  const {p,events}=await provider(t);p.client.session.message=async()=>({error:{message:'Synthetic missing metadata'}});
  await p.handleEvent(part('msg_unknown',internal));await p.handleEvent(idle);
  assert.equal(events.length,1);assert.equal(events[0].type,'error');assert.equal(p.runs.size,0);
});
