import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createAgentServer } from '../server.mjs';
import { OpenCodeProvider } from '../../../kernel/engines/providers/opencode.mjs';
import { ConfigurationStore } from '../../../kernel/services/ai-config/store.mjs';
const project=fileURLToPath(new URL('../../../',import.meta.url));
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port;}
test('HTTP streaming and persisted/refreshed chat contain genuine OpenCode reply only; context travels as system', {timeout:15000},async t=>{
  const cache=path.join(project,'.cache/opencode-http');await fs.mkdir(cache,{recursive:true});const root=await fs.mkdtemp(path.join(cache,'app-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const sessions=new Map(),prompts=[];let rejectPrompt=false;
  const workspace=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;const input=body?JSON.parse(body):{};let output;
    if(req.url==='/preferences')output={preferences:[{key:'style',value:'Concise',evidence:'Synthetic explicit preference'}]};
    else if(req.url==='/sessions'&&req.method==='GET')output={sessions:[...sessions.values()].map(s=>({id:s.id}))};
    else if(req.url==='/sessions'&&req.method==='POST'){const session={...input,id:'session1',messages:[],requests:[],running:false};sessions.set(session.id,session);output={session};}
    else{const session=sessions.get(req.url.slice('/sessions/'.length));if(!session){res.writeHead(404);res.end('{}');return;}if(req.method==='PATCH')Object.assign(session,input);output={session};}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(output));
  });const workspacePort=await listen(workspace);t.after(()=>new Promise(resolve=>{workspace.closeAllConnections();workspace.close(resolve);}));
  const saved=await new ConfigurationStore(root).save({label:'Synthetic model',engine:'opencode',kind:'api',protocol:'chat',baseUrl:'http://127.0.0.1:1/v1',model:'MiniMax-M3',apiKey:'synthetic-only-key'});
  class ProtocolOpenCode extends OpenCodeProvider {
    constructor(options){super(options);this.client={session:{create:async()=>({data:{id:'ses_http'}}),get:async()=>({data:{id:'ses_http'}}),promptAsync:async request=>{prompts.push(request);return rejectPrompt?{error:{message:"Synthetic prompt rejected"}}:{data:true};}}};}
    async start(){this.ready=true;return this.catalog();}
    async catalog(){return {id:'opencode',ready:true,authenticated:true,mcp:{ready:true,tools:[]},providers:[{id:`sapling-${saved.activeId}`,models:[{id:'MiniMax-M3'}]}]};}
    async execute(run,text,options){await super.execute(run,text,options);const messageID=prompts.at(-1).body.messageID,sessionID=run.session.threadId;
      const send=(type,properties)=>this.handleEvent({type,properties});
      await send('message.updated',{info:{id:messageID,sessionID,role:'user'}});
      await send('message.part.updated',{part:{id:'userpart',messageID,sessionID,type:'text',text:text+options.context}});
      await send('message.updated',{info:{id:'msg_reply'+prompts.length,sessionID,role:'assistant',parentID:messageID}});
      await send('message.part.updated',{part:{id:'replypart',messageID:'msg_reply'+prompts.length,sessionID,type:'text',text:'Actual synthetic reply'}});
      await send('session.idle',{sessionID});
    }
  }
  await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.mkdir(path.join(root,'local-secrets/runtime'),{recursive:true});
  await fs.writeFile(path.join(root,'local-secrets/runtime/service-token'),'synthetic-service-token');await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify({workspacePort,turnTimeoutMs:0}));
  const server=await createAgentServer({root,OpenCodeProviderClass:ProtocolOpenCode,AppServerClass:class{constructor(){throw Error('Codex must not start');}}});const port=await listen(server);t.after(()=>server.shutdown());await server.startAgent();
  const base=`http://127.0.0.1:${port}`,selection={engine:'opencode',providerId:`sapling-${saved.activeId}`,modelId:'MiniMax-M3'};
  async function chat(requestId,sessionId){const response=await fetch(base+'/api/chat',{method:'POST',headers:{Authorization:'Bearer synthetic-service-token','Content-Type':'application/json'},body:JSON.stringify({...selection,text:'Hello user',requestId,sessionId})});assert.equal(response.status,200);const raw=await response.text();const events=raw.split('\n\n').filter(s=>s.startsWith('data: ')).map(s=>JSON.parse(s.slice(6)));assert.equal(events.filter(e=>e.type==='text_delta').map(e=>e.delta).join(''),'Actual synthetic reply');assert.equal(events.at(-1).status,'completed');return response.headers.get('x-session-id');}
  const sessionId=await chat('request1');await chat('request2',sessionId);
  assert.ok(prompts.every(p=>p.body.parts[0].text==='Hello user'));assert.ok(prompts.every(p=>p.body.system.includes('Current permissions: full-access')&&p.body.system.includes('Saved user preferences')&&p.body.system.includes('Completion-review receipt')));
  const {session}=await fetch(base+'/api/sessions/'+sessionId).then(r=>r.json());assert.equal(session.messages.length,4);assert.deepEqual(session.messages.map(m=>m.text),['Hello user','Actual synthetic reply','Hello user','Actual synthetic reply']);assert.equal(session.running,false);assert.equal(session.threadId,'ses_http');assert.ok(session.requests.every(r=>r.status==='completed'));
  rejectPrompt=true;const failed=await fetch(base+'/api/chat',{method:'POST',headers:{Authorization:'Bearer synthetic-service-token','Content-Type':'application/json'},body:JSON.stringify({...selection,text:'Synthetic failed prompt',requestId:'request3',sessionId})});
  const events=(await failed.text()).split('\n\n').filter(s=>s.startsWith('data: ')).map(s=>JSON.parse(s.slice(6)));
  assert.equal(events.at(-1).status,'failed');assert.ok(events.some(e=>e.type==='error'));assert.ok(!events.some(e=>e.type==='text_delta'));
  const restored=await fetch(base+'/api/sessions/'+sessionId).then(r=>r.json());assert.equal(restored.session.messages.length,5);assert.equal(restored.session.messages.at(-1).role,'user');assert.equal(restored.session.requests.at(-1).status,'failed');

});
