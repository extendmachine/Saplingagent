import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ClaudeProvider,claudeEnvironment} from '../providers/claude.mjs';

const project=fileURLToPath(new URL('../../../',import.meta.url));
const token='synthetic-subscription-token-only';
const apiKey='synthetic-api-key-only';
const sub={id:'subscription-fixture',label:'Synthetic subscription',engine:'claude',kind:'subscription',model:'synthetic-model'};
const api={id:'api-fixture',label:'Synthetic API',engine:'claude',kind:'api',model:'synthetic-model',protocol:'anthropic',baseUrl:'http://127.0.0.1:1/v1',noAuth:false,contextWindow:128000,maxOutput:16384};
async function json(root,file,value){const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,JSON.stringify(value));}
async function configure(root,profiles=[sub,api]){
  await json(root,'local-secrets/ai-config/connections.json',{schemaVersion:1,revision:1,activeId:profiles[0].id,profiles});
  for(const profile of profiles)await json(root,`local-secrets/api-keys/ai-${profile.id}.json`,profile.kind==='subscription'?{oauthToken:token}:{apiKey});
}
async function fixture(t,profiles){const base=path.join(project,'.cache/claude-tests');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'subscription-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await configure(root,profiles);return root;}
function queryFactory(capture,{initializeError,resultError,closeError}={}){return args=>{
  capture.push(args);
  return {
    async initializationResult(){if(initializeError)throw initializeError;return {};},
    async mcpServerStatus(){return [{name:'seedagent',status:'connected',tools:[{name:'synthetic_tool'}]}];},
    async supportedCommands(){return [{name:'saplingagent:synthetic',description:'Synthetic'}];},
    async *[Symbol.asyncIterator](){yield {type:'system',subtype:'init',session_id:'fixture-native-thread'};yield resultError?{type:'result',subtype:'error_during_execution',is_error:true,errors:[resultError]}:{type:'result',subtype:'success',is_error:false};},
    close(){if(closeError)throw closeError;},
  };
};}
const run=profile=>({session:{providerId:'sapling-'+profile.id,modelId:profile.model,threadId:null},async save(){}});
function adapter(root,capture,events,options){return new ClaudeProvider({root,mcpEnv:{SEED_ROOT:root,SEED_SERVICE_TOKEN:'synthetic-project-tool-token',CLAUDE_CODE_OAUTH_TOKEN:'synthetic-inherited',ANTHROPIC_API_KEY:'synthetic-inherited',AWS_PROFILE:'synthetic-cloud'},instructions:'Synthetic only',queryFactory:queryFactory(capture,options),onEvent:(_,event)=>events.push(event)});}
const withoutCredential=value=>{const text=JSON.stringify(value,Object.getOwnPropertyNames(value));assert.ok(!text.includes(token)&&!text.includes(apiKey),text);};

test('subscription environment is exclusive, removes inherited auth/routing and rejects absent tokens',()=>{
  const inherited={PATH:'synthetic-path',ANTHROPIC_API_KEY:'inherited-key',ANTHROPIC_AUTH_TOKEN:'inherited-bearer',ANTHROPIC_BASE_URL:'https://ignored.invalid',CLAUDE_CODE_OAUTH_TOKEN:'inherited-token',CLAUDE_CODE_SESSION_ACCESS_TOKEN:'inherited-session',CLAUDE_CODE_GATEWAY_TOKEN_FILE_DESCRIPTOR:'3',CLAUDE_CODE_USE_BEDROCK:'1',CLAUDE_CODE_USE_VERTEX:'1',CLAUDE_CODE_USE_FOUNDRY:'1',AWS_PROFILE:'inherited-cloud',GOOGLE_APPLICATION_CREDENTIALS:'inherited-cloud',GOOGLE_CLOUD_PROJECT:'inherited-cloud',claude_config_dir:'inherited-directory'};
  const env=claudeEnvironment(project,{...sub,oauthToken:token,apiKey,sdkBaseUrl:'https://ignored.invalid'},inherited);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN,token);assert.equal(env.PATH,'synthetic-path');assert.equal(env.CLAUDE_CONFIG_DIR,path.join(project,'local-secrets/claude'));
  for(const key of Object.keys(inherited).filter(key=>key!=='PATH'&&key!=='CLAUDE_CODE_OAUTH_TOKEN'))assert.equal(env[key],undefined,key);
  assert.equal(inherited.ANTHROPIC_API_KEY,'inherited-key');
  for(const oauthToken of [undefined,null,'',' ',token+' value',token+'\n'])assert.throws(()=>claudeEnvironment(project,{...sub,oauthToken,apiKey,sdkBaseUrl:'https://ignored.invalid'},inherited),{code:'CLAUDE_AUTH_REQUIRED'});
  assert.throws(()=>claudeEnvironment(project,{...sub,kind:'unknown',oauthToken:token},inherited),{code:'CLAUDE_AUTH_REQUIRED'});
});

test('API schemes ignore subscription credentials and preserve the explicit anonymous endpoint mode',()=>{
  const configured={...api,apiKey,oauthToken:token,sdkBaseUrl:'http://127.0.0.1:1'};
  const env=claudeEnvironment(project,configured,{CLAUDE_CODE_OAUTH_TOKEN:'inherited',ANTHROPIC_AUTH_TOKEN:'inherited'});
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN,undefined);assert.equal(env.ANTHROPIC_AUTH_TOKEN,undefined);assert.equal(env.ANTHROPIC_API_KEY,apiKey);assert.equal(env.ANTHROPIC_BASE_URL,configured.sdkBaseUrl);
  const anonymous=claudeEnvironment(project,{...configured,noAuth:true,apiKey:null},{});assert.equal(anonymous.ANTHROPIC_API_KEY,'anonymous-local-endpoint');
  assert.throws(()=>claudeEnvironment(project,{...configured,apiKey:null},{}),{code:'CLAUDE_AUTH_REQUIRED'});
});

test('mixed schemes select their own SDK environment and never put auth in registered MCP settings or public catalog',async t=>{
  const root=await fixture(t),capture=[],events=[],p=adapter(root,capture,events);t.after(()=>p.close());
  const catalog=await p.start();assert.equal(catalog.ready,true);assert.equal(capture.length,1);assert.notEqual(typeof capture[0].prompt,'string');withoutCredential(catalog);
  await p.execute(run(sub),'Synthetic manual subscription turn');await p.execute(run(api),'Synthetic manual API turn');
  assert.equal(capture[1].options.env.CLAUDE_CODE_OAUTH_TOKEN,token);assert.equal(capture[1].options.env.ANTHROPIC_API_KEY,undefined);assert.equal(capture[1].options.env.ANTHROPIC_BASE_URL,undefined);
  assert.equal(capture[2].options.env.ANTHROPIC_API_KEY,apiKey);assert.equal(capture[2].options.env.CLAUDE_CODE_OAUTH_TOKEN,undefined);
  for(const {options} of capture){assert.equal(options.permissionMode,'bypassPermissions');assert.equal(options.sandbox.enabled,false);assert.equal(options.mcpServers.seedagent.env.CLAUDE_CODE_OAUTH_TOKEN,'');assert.equal(options.mcpServers.seedagent.env.ANTHROPIC_API_KEY,'');assert.equal(options.mcpServers.seedagent.env.AWS_PROFILE,'');assert.equal(options.mcpServers.seedagent.env.SEED_SERVICE_TOKEN,'synthetic-project-tool-token');assert.ok(!JSON.stringify(options.mcpServers).includes(token));}
  assert.deepEqual(events.map(event=>event.status),['completed','completed']);
});

test('a same-profile kind change loads only after explicit provider restart and retains the native session binding',async t=>{
  const original={...api,id:'same-profile'},changed={...sub,id:'same-profile'},root=await fixture(t,[original]),first=[],second=[],events=[];
  const p=adapter(root,first,events);t.after(()=>p.close());await p.start();const saved=run(original);
  await configure(root,[changed]);await p.execute(saved,'Synthetic still-loaded API turn');assert.equal(first[1].options.env.ANTHROPIC_API_KEY,apiKey);await p.close();
  const next=adapter(root,second,events);t.after(()=>next.close());await next.start();await next.execute(saved,'Synthetic restarted subscription turn');
  assert.equal(second[1].options.env.CLAUDE_CODE_OAUTH_TOKEN,token);assert.equal(second[1].options.env.ANTHROPIC_API_KEY,undefined);assert.equal(second[1].options.resume,'fixture-native-thread');assert.equal(saved.session.threadId,'fixture-native-thread');assert.equal(events.length,2);
});

test('SDK initialization and execution errors redact all loaded credentials without forwarding causes or properties',async t=>{
  const root=await fixture(t),raw=Object.assign(new Error(`Synthetic denied ${token} / ${apiKey}`),{cause:new Error(token),credential:token});
  const failing=adapter(root,[],[],{initializeError:raw});await assert.rejects(failing.start(),error=>{withoutCredential(error);assert.match(error.message,/\[redacted\]/);assert.equal(error.cause,undefined);assert.equal(error.credential,undefined);return true;});await failing.close();
  const events=[],p=adapter(root,[],events,{resultError:raw.message});t.after(()=>p.close());await p.start();await p.execute(run(sub),'Synthetic failed turn');const error=events.at(-1).error;withoutCredential(error);assert.equal(error.code,'CLAUDE_AGENT_ERROR');assert.equal(events.at(-1).type,'error');
});

test('missing stored subscription credential fails before opening the SDK and never falls back to a saved API key',async t=>{
  const root=await fixture(t,[sub]),capture=[];await json(root,`local-secrets/api-keys/ai-${sub.id}.json`,{apiKey});
  const p=adapter(root,capture,[]);await assert.rejects(p.start(),/credential is unavailable/);assert.equal(capture.length,0);await p.close();
});

test('SDK disposal errors use the same redacted error surface',async t=>{
  const root=await fixture(t),p=adapter(root,[],[],{closeError:Object.assign(new Error(`Synthetic close ${token}`),{cause:token})});
  await assert.rejects(p.start(),error=>{withoutCredential(error);assert.equal(error.cause,undefined);return true;});
});
