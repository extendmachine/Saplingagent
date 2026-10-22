import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {saveMcpAccess,assertMcpClientsStopped} from '../../../contracts/mcp-access.mjs';
import {createNativeTools} from '../native.mjs';
import {createMcpAccessServer} from '../server.mjs';

const parent=fileURLToPath(new URL('../../../../.cache/mcp-access-tests/',import.meta.url));
const source=fileURLToPath(new URL('../server.mjs',import.meta.url));
const result=value=>value.structuredContent??JSON.parse(value.content[0].text);
const clients=new Map();
const posixOnly={skip:process.platform==='win32'?'POSIX shell/symlink fixture; native Windows acceptance is separate':false};
async function fixture(t) {
  await fs.mkdir(parent,{recursive:true});const area=await fs.mkdtemp(path.join(parent,'protocol-')),root=path.join(area,'project');await fs.mkdir(root);
  clients.set(root,[]);
  t.after(async()=>{for(const client of clients.get(root)||[])await client.close();clients.delete(root);await fs.rm(area,{recursive:true,force:true,maxRetries:3,retryDelay:30});});return {root,area};
}
async function write(root,file,value) {const dest=path.join(root,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,value);}
async function until(predicate) {for(let i=0;i<100;i++){const value=await predicate();if(value)return value;await delay(25);}throw new Error('Fixture condition timed out');}
async function connect(t,root) {
  const entry=path.join(root,'fixture-entry.mjs');await fs.writeFile(entry,`import {main} from ${JSON.stringify(pathToFileURL(source).href)};await main({root:${JSON.stringify(root)}});`);
  const transport=new StdioClientTransport({command:process.execPath,args:[entry],cwd:root,stderr:'pipe',env:{PATH:process.env.PATH||'',SHELL:'/bin/sh'}});
  let stderr='';transport.stderr?.on('data',data=>stderr+=data);
  const client=new Client({name:'isolated-external-mcp-check',version:'1.0.0'});await client.connect(transport);
  clients.get(root)?.push(client);return {client,transport,stderr:()=>stderr};
}
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";

test('real stdio exposes eight tools without app backends, credentials or model account; Full Access outside project',posixOnly,async t=>{
  const {root,area}=await fixture(t);await saveMcpAccess(root,{revision:0,enabled:true,externalOnly:true});
  await write(root,'kernel/manifest.json',JSON.stringify({version:'0.9.5'}));
  for(const file of ['AGENTS.md','FINAL_GOAL.md','TODO.md','AI_TASKS.md','rules/README.md'])await write(root,file,'Synthetic public context');
  await write(root,'.agents/skills/check-one/SKILL.md','---\nname: check-one\ndescription: Synthetic project workflow\n---\nOnly the requested operation.');
  await write(root,'.agents/skills/bad-one/SKILL.md','broken');
  const {client,stderr}=await connect(t,root);assert.equal((await client.listTools()).tools.length,8);
  assert.equal(client.getServerVersion().version,'0.9.5');
  const call=async(name,args={})=>result(await client.callTool({name,arguments:args}));
  const outside=path.join(area,'other-project','data.bin');
  assert.equal((await call('workspace_write_file',{path:outside,content:'AAEC/w==',encoding:'base64'})).status,'applied');
  const read=await call('workspace_read_file',{path:'../other-project/data.bin',encoding:'base64',maxBytes:2});assert.equal(read.content,'AAE=');assert.equal(read.truncated,true);assert.equal(read.hashScope,'returnedBytes');
  assert.equal((await call('workspace_read_file',{path:outside,offset:2,encoding:'base64'})).content,'Av8=');
  await fs.symlink('../other-project',path.join(root,'linked'));
  await call('workspace_write_file',{path:'linked/text.txt',content:'outside symlink fixture'});assert.equal(await fs.readFile(path.join(area,'other-project/text.txt'),'utf8'),'outside symlink fixture');
  const listed=await call('workspace_list_files',{path:'linked',limit:1});assert.equal(listed.files.length,1);assert.equal(listed.truncated,true);assert.equal((await call('workspace_list_files',{path:'linked',cursor:listed.nextCursor,limit:1})).files.length,1);
  assert.equal((await call('workspace_delete_file',{path:'linked/text.txt'})).status,'applied');
  assert.equal((await call('workspace_read_file',{path:'missing.txt'})).error.code,'ENOENT');
  const context=await call('project_context',{modification:true});assert.equal(context.permissionMode,'full-access');assert.equal(context.files.length,5);assert.equal(context.taskId,undefined);
  const skills=await call('skills_list');assert.equal(skills.skills.length,1);assert.equal(skills.errors.length,1);assert.match((await call('skills_read',{name:'check-one'})).content,/Synthetic/);
  const command=await call('workspace_run_command',{command:'printf fixture-output; printf fixture-error >&2; exit 7',cwd:'../other-project'});assert.equal(command.exitCode,7);assert.equal(command.stdout,'fixture-output');assert.equal(command.stderr,'fixture-error');
  await assert.rejects(assertMcpClientsStopped(root),{code:'MCP_CLIENTS_ACTIVE'});
  await saveMcpAccess(root,{revision:1,enabled:false,externalOnly:false});assert.equal((await call('workspace_write_file',{path:'disabled.txt',content:'no'})).error.code,'MCP_DISABLED');await assert.rejects(fs.stat(path.join(root,'disabled.txt')),{code:'ENOENT'});
  await client.close();await until(async()=>{try{await assertMcpClientsStopped(root);return true;}catch{return false;}});
  assert.equal(stderr(),'');
  const logdir=path.join(root,'logs/mcp-access'),logs=(await Promise.all((await fs.readdir(logdir)).map(name=>fs.readFile(path.join(logdir,name),'utf8')))).join('');
  assert.ok(!logs.includes('fixture-output')&&!logs.includes('Synthetic')&&!logs.includes(outside));
  for(const line of logs.trim().split('\n'))assert.deepEqual(Object.keys(JSON.parse(line)).sort(),['code','level','time','tool']);
});

test('stdio cancellation stops its owned command while unrelated process survives',posixOnly,async t=>{
  const {root}=await fixture(t);await saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false});
  const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});t.after(()=>unrelated.kill());
  const {client}=await connect(t,root),controller=new AbortController(),marker=path.join(root,'owned-pid');
  const request=client.callTool({name:'workspace_run_command',arguments:{command:`echo $$ > ${quote(marker)}; sleep 60`,timeoutMs:60000}},undefined,{signal:controller.signal,timeout:10000}).then(()=>null,error=>error);
  const pid=Number(await until(()=>fs.readFile(marker,'utf8').catch(()=>null)));controller.abort();assert.ok(await request);
  await until(()=>{try{process.kill(pid,0);return false;}catch(error){return error.code==='ESRCH';}});process.kill(unrelated.pid,0);
});

test('client exit cleans owned commands and only its own receipt across multiple clients',posixOnly,async t=>{
  const {root}=await fixture(t);await saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false});
  const first=await connect(t,root),second=await connect(t,root),marker=path.join(root,'exit-owned-pid');
  const pending=first.client.callTool({name:'workspace_run_command',arguments:{command:`echo $$ > ${quote(marker)}; sleep 60`}},undefined,{timeout:10000}).catch(()=>null);
  const pid=Number(await until(()=>fs.readFile(marker,'utf8').catch(()=>null)));await first.client.close();await pending;
  await until(()=>{try{process.kill(pid,0);return false;}catch(error){return error.code==='ESRCH';}});
  assert.equal((await fs.readdir(path.join(root,'.runtime/mcp-access/clients'))).length,1);await assert.rejects(assertMcpClientsStopped(root),{code:'MCP_CLIENTS_ACTIVE'});
  assert.equal((await second.client.listTools()).tools.length,8);await second.client.close();
});

test('native command timeout, output caps and nonzero status remain truthful',posixOnly,async t=>{
  const {root}=await fixture(t),native=createNativeTools(root);t.after(()=>native.close());
  const timeout=await native.runCommand({command:'sleep 60',timeoutMs:80});assert.equal(timeout.timedOut,true);assert.equal(timeout.exitCode,null);assert.ok(timeout.signal);
  const output=await native.runCommand({command:`${quote(process.execPath)} -e 'process.stdout.write("x".repeat(1100000));process.stderr.write("y".repeat(1100000));process.exitCode=9;'`});assert.equal(output.exitCode,9);assert.equal(output.stdout.length,1024*1024);assert.equal(output.stderr.length,1024*1024);assert.equal(output.stdoutTruncated,true);assert.equal(output.stderrTruncated,true);
});

test('stdio startup fails disabled or during maintenance without exposing protocol garbage',async t=>{
  const {root}=await fixture(t);const entry=path.join(root,'blocked-entry.mjs');
  await fs.writeFile(entry,`import {main} from ${JSON.stringify(pathToFileURL(source).href)};try{await main({root:${JSON.stringify(root)}});}catch(e){process.stderr.write(e.code);process.exitCode=1;}`);
  async function rejected(){return new Promise(resolve=>{const child=spawn(process.execPath,[entry],{stdio:['ignore','pipe','pipe']}),chunks={stdout:'',stderr:''};for(const key of ['stdout','stderr'])child[key].on('data',x=>chunks[key]+=x);child.once('close',code=>resolve({code,...chunks}));});}
  assert.deepEqual(await rejected(),{code:1,stdout:'',stderr:'MCP_DISABLED'});
  await saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false});await write(root,'.runtime/kernel-operation.lock','fixture-owned-maintenance');assert.deepEqual(await rejected(),{code:1,stdout:'',stderr:'KERNEL_BUSY'});
});

test('closing waits for an already dispatched write before allowing ownership cleanup',async t=>{
  const {root}=await fixture(t);await saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false});
  const started=Promise.withResolvers(),finish=Promise.withResolvers();
  const service=await createMcpAccessServer({root,logging:false,nativeFactory:()=>({writeFile:async()=>{started.resolve();await finish.promise;return {status:'applied'};},close:async()=>{}})});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  const client=new Client({name:'drain-fixture',version:'1'});await service.server.connect(serverTransport);await client.connect(clientTransport);
  assert.equal(client.getServerVersion().version,'unknown');
  const request=client.callTool({name:'workspace_write_file',arguments:{path:'fixture.txt',content:'fixture'}}).catch(()=>null);await started.promise;
  let closed=false;const closing=service.close().then(()=>{closed=true;});await delay(30);assert.equal(closed,false);
  finish.resolve();await closing;await request;assert.equal(closed,true);await client.close();
});

test('encoded command output remains bounded even when JSON expands control characters',posixOnly,async t=>{
  const {root}=await fixture(t);await saveMcpAccess(root,{revision:0,enabled:true,externalOnly:false});
  const {client}=await connect(t,root);
  const response=await client.callTool({name:'workspace_run_command',arguments:{command:`${quote(process.execPath)} -e 'process.stdout.write(Buffer.alloc(1048576));process.stderr.write(Buffer.alloc(1048576));process.exitCode=6;'`}});
  assert.ok(Buffer.byteLength(JSON.stringify(response))<=8*1024*1024);const value=result(response);assert.equal(value.exitCode,6);assert.equal(value.stdoutTruncated,true);assert.equal(value.stderrTruncated,true);
});
