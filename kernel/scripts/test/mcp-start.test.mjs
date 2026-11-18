import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureApplicationDependencies} from '../../launcher/dependencies.mjs';
import {promisify} from 'node:util';
import {execFile,spawn} from 'node:child_process';
import {npmCommand} from '../../contracts/local-process.mjs';
import {prepareFixtureBindings} from '../../tooling/test/fixture-bindings.mjs';

const source=fileURLToPath(new URL('../../../',import.meta.url));
const platforms=['darwin','win32'];
async function write(root,file,value){const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,value);}

async function fixture(t,externalOnly,{subscription=false}={}){
  const parent=path.join(source,'.cache/mcp-cli-start-tests');await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'app-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.cp(path.join(source,'kernel'),path.join(root,'kernel'),{recursive:true,filter:file=>!file.split(path.sep).some(part=>['node_modules','.cache'].includes(part))});
  // Exercise the grouped receipts produced by first native launch. There is no
  // platform-install.json or network dependency in this project.
  await prepareFixtureBindings(root,process.execPath,externalOnly?[]:[subscription?'claude':'opencode']);
  const dependencies={example:'1.0.0'};
  for(const service of ['kernel','front']){
    await write(root,service+'/package.json',JSON.stringify({private:true,dependencies}));
    await write(root,service+'/package-lock.json',JSON.stringify({lockfileVersion:3,packages:{'':{dependencies},'node_modules/example':{version:'1.0.0'}}}));
  }
  await write(root,'config/runtime.json',JSON.stringify({frontPort:5173,agentPort:0}));
  await write(root,'config/mcp-access.json',JSON.stringify({schemaVersion:1,revision:1,enabled:externalOnly,externalOnly}));
  if(!externalOnly)await write(root,'local-secrets/ai-config/connections.json',JSON.stringify({schemaVersion:1,revision:1,activeId:'synthetic',profiles:[{id:'synthetic',label:'Synthetic endpoint',engine:'opencode',kind:'api',protocol:'chat',baseUrl:'https://provider.example/v1',model:'synthetic',noAuth:true,contextWindow:128000,maxOutput:16384}]}));
  if(subscription){
    await write(root,'local-secrets/ai-config/connections.json',JSON.stringify({schemaVersion:1,revision:1,activeId:'personal',profiles:[{id:'personal',label:'Personal Claude',engine:'claude',kind:'subscription',model:'fixture-model'}]}));
    await write(root,'local-secrets/api-keys/ai-personal.json',JSON.stringify({oauthToken:'synthetic-subscription-token'}));
  }
  await ensureApplicationDependencies(root,{install:async(_root,group)=>{
    assert.ok(['kernel','front'].includes(group.name),'Only synthetic npm groups may be installed');
    await write(root,group.name+'/node_modules/example/package.json',JSON.stringify({version:'1.0.0'}));
    await write(root,group.name+'/node_modules/vite/bin/vite.js','');
    if(group.name==='front')await write(root,'front/node_modules/typescript/bin/tsc','');
  }});
  await write(root,'scripts/dev.mjs',`import http from 'node:http';import fs from 'node:fs';
fs.writeFileSync('runtime.pid',String(process.pid));
let checks=0,closing=false;
const close=()=>{if(closing)return;closing=true;server.closeAllConnections();server.close(()=>process.exit(0));};
const server=http.createServer((req,res)=>{
 fs.appendFileSync('requests.jsonl',JSON.stringify(req.url)+'\\n');
 res.setHeader('Content-Type','application/json');
 if(req.url==='/api/runtime/status')res.end(JSON.stringify({phase:'ready',busy:false,aiConnection:${JSON.stringify(externalOnly?'external-mcp':'builtin')}}));
 else if(req.url==='/api/status'){
  res.end(JSON.stringify({ready:${subscription},authenticated:${subscription},provider:'Claude Agent',model:'fixture-model',mcp:{ready:${subscription},tools:[]},skills:[]}));
  if(++checks===3)setTimeout(close,120);
 }else if(req.url==='/'){res.end('synthetic frontend');setTimeout(close,150);}
 else{res.statusCode=404;res.end('{}');}
});
server.listen(0,'127.0.0.1',()=>console.log('Saplingagent: http://127.0.0.1:'+server.address().port+'/'));
process.on('SIGTERM',close);process.on('SIGINT',close);setTimeout(close,6000).unref();
`);
  return root;
}

async function execute(t,root){
  const child=spawn(process.execPath,[path.join(root,'kernel/scripts/launcher/cli.mjs'),'start','--no-open'],{
    cwd:root,env:{PATH:process.env.PATH,...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),SAPLING_LANG:'en',SAPLING_NO_OPEN:'1',SEED_ROOT:root,NODE_COMPILE_CACHE:path.join(root,'.cache/node-compile')},stdio:['ignore','pipe','pipe'],
  });
  let output='';child.stdout.on('data',value=>{output+=value;});child.stderr.on('data',value=>{output+=value;});
  const timeout=setTimeout(()=>child.kill('SIGTERM'),10000);
  t.after(()=>{clearTimeout(timeout);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');});
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(timeout);
  assert.equal(result.code,0,output);assert.equal(result.signal,null,output);
  const requests=(await fs.readFile(path.join(root,'requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const pid=Number(await fs.readFile(path.join(root,'runtime.pid'),'utf8'));
  assert.throws(()=>process.kill(pid,0),{code:'ESRCH'},'synthetic runtime must exit with the CLI');
  return {...result,output,requests};
}

test('real CLI start accepts external-only runtime readiness without a model account',{skip:!platforms.includes(process.platform),timeout:15000},async t=>{
  const root=await fixture(t,true),result=await execute(t,root);
  assert.equal(result.code,0,result.output);assert.equal(result.signal,null,result.output);
  assert.match(result.output,/Web page: http:\/\/127\.0\.0\.1:\d+\//);assert.match(result.output,/External AI \/ MCP/);
  assert.ok(result.requests.includes('/api/runtime/status'));assert.ok(result.requests.includes('/'));assert.equal(result.requests.includes('/api/status'),false);
  assert.doesNotMatch(result.output,/not ready|Connected to (?:Agent|Codex|OpenCode)/);
  assert.equal(await fs.access(path.join(root,'local-secrets/codex/auth.json')).then(()=>true,()=>false),false);
  assert.equal(await fs.access(path.join(root,'local-secrets/ai-config/connections.json')).then(()=>true,()=>false),false);
});

test('real CLI start never claims built-in chat readiness when its Agent is unauthenticated',{skip:!platforms.includes(process.platform),timeout:15000},async t=>{
  const root=await fixture(t,false),result=await execute(t,root);
  assert.equal(result.code,0,result.output);assert.equal(result.signal,null,result.output);
  assert.ok(result.requests.includes('/api/runtime/status'));assert.equal(result.requests.filter(route=>route==='/api/status').length,3);
  assert.equal(result.requests.includes('/'),false);assert.doesNotMatch(result.output,/Web page:|External AI \/ MCP|Connected to/);
  assert.equal(await fs.access(path.join(root,'local-secrets/codex/auth.json')).then(()=>true,()=>false),false);
});


test('real CLI start accepts a Claude subscription without Codex login',{skip:!platforms.includes(process.platform),timeout:15000},async t=>{
  const root=await fixture(t,false,{subscription:true}),result=await execute(t,root);
  assert.match(result.output,/Connected to Claude Agent: fixture-model/);
  assert.match(result.output,/Web page: http:\/\/127\.0\.0\.1:\d+\//);
  assert.ok(result.requests.includes('/api/status'));assert.ok(result.requests.includes('/'));
  assert.equal(await fs.access(path.join(root,'local-secrets/codex/auth.json')).then(()=>true,()=>false),false);
  assert.doesNotMatch(result.output,/synthetic-subscription-token/);
});

test('doctor recognizes native group receipts with no legacy installation stamp',{skip:!platforms.includes(process.platform)},async t=>{
  const root=await fixture(t,true);
  const cli=path.join(root,'kernel/scripts/launcher/cli.mjs');
  const {stdout}=await promisify(execFile)(process.execPath,[cli,'doctor'],{cwd:root,env:{...process.env,SAPLING_LANG:'en'}});
  assert.match(stdout,/Project dependencies:\s*installed/);
  assert.doesNotMatch(stdout,/not installed|install --repair/);
});

test('shell start installs an optional local package added after native preparation',{skip:!platforms.includes(process.platform),timeout:25000},async t=>{
  const root=await fixture(t,true);
  const service='backend/local-feature';
  const vendor=service+'/vendor/feature-support';
  await write(root,vendor+'/package.json',JSON.stringify({name:'feature-support',version:'1.0.0'}));
  await write(root,service+'/package.json',JSON.stringify({name:'local-feature',optionalDependencies:{'feature-support':'file:vendor/feature-support'}}));
  const npm=npmCommand();
  await promisify(execFile)(npm.command,[...npm.args,'install','--package-lock-only','--offline','--ignore-scripts','--no-audit','--no-fund'],{
    cwd:path.join(root,service),env:{...process.env,npm_config_cache:path.join(root,'.cache/npm')},
  });
  const {output}=await execute(t,root);
  assert.match(output,/Preparing dependencies: backend\/local-feature/);
  const installed=JSON.parse(await fs.readFile(path.join(root,service,'node_modules/feature-support/package.json'),'utf8'));
  assert.equal(installed.version,'1.0.0');
  const receipt=JSON.parse(await fs.readFile(path.join(root,'.runtime/dependencies.json'),'utf8'));
  assert.ok(receipt.groups[service]);
});
