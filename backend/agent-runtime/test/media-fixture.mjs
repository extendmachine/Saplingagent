import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createAgentServer } from '../server.mjs';
import { createWorkspaceServer } from '../../workspace/server.mjs';
import { createBuilderServer } from '../../app-builder/server.mjs';
export const fixtureToken = 'synthetic-media-token-12345678901234567890';
export const fixtureImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
export const listen = async server => { await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); return server.address().port; };
export async function createMediaFixture(root, { frontPort = 5173 } = {}) {
  await fs.mkdir(root,{recursive:true});await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.mkdir(path.join(root,'local-secrets/runtime'),{recursive:true});
  await fs.writeFile(path.join(root,'local-secrets/runtime/service-token'),fixtureToken);
  const workspace=await createWorkspaceServer({root,token:fixtureToken}),builder=await createBuilderServer({root,token:fixtureToken});
  const workspacePort=await listen(workspace),builderPort=await listen(builder),calls=[],timers=new Set();let thread=0,turn=0;
  await fs.writeFile(path.join(root,'config/runtime.json'),JSON.stringify({workspacePort,builderPort,frontPort,preferredModel:'synthetic-media',reasoningEffort:'medium',turnTimeoutMs:0}));
  class FakeCodex extends EventEmitter {
    send(){}
    async close(){for(const timer of timers)clearTimeout(timer);}
    async call(method,params){
      calls.push({method,params});
      if(method==='account/read')return {account:null,requiresOpenaiAuth:false};
      if(method==='model/list')return {data:[{model:'synthetic-media',supportedReasoningEfforts:[{reasoningEffort:'medium'}],defaultReasoningEffort:'medium'}]};
      if(method==='thread/start')return {thread:{id:'media-thread-'+(++thread)},sandbox:{type:'dangerFullAccess'},approvalPolicy:'never'};
      if(method==='skills/list')return {data:[]};
      if(method==='mcpServerStatus/list')return {data:[{name:'seedagent',tools:{page_read:{description:'Read current page'}}}]};
      if(method==='turn/start'){
        const id='media-turn-'+(++turn),timer=setTimeout(()=>{
          timers.delete(timer);this.emit('notification',{method:'item/agentMessage/delta',params:{threadId:params.threadId,turnId:id,itemId:'media-answer-'+turn,delta:'Synthetic reply: attachment transport accepted.'}});
          this.emit('notification',{method:'turn/completed',params:{threadId:params.threadId,turn:{id,status:'completed'}}});
        },20);timers.add(timer);return {turn:{id}};
      }
      return {};
    }
  }
  class OptionalProvider { ready=false; async start(){return {ready:false,authenticated:false,mcp:{ready:false,tools:[]},providers:[]};} async close(){} }
  const agent=await createAgentServer({root,AppServerClass:FakeCodex,OpenCodeProviderClass:OptionalProvider,ClaudeProviderClass:OptionalProvider});
  const agentPort=await listen(agent);await agent.startAgent();
  return {root,agent,workspace,builder,agentPort,workspacePort,builderPort,calls,base:`http://127.0.0.1:${agentPort}`,
    async close(){await agent.shutdown();for(const server of [builder,workspace]){server.closeAllConnections();await new Promise(r=>server.close(r));}}
  };
}
