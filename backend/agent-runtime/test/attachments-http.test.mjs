import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath}from'node:url';import{randomUUID}from'node:crypto';
import {createMediaFixture,fixtureToken,fixtureImage}from'./media-fixture.mjs';
import {OpenCodeProvider}from'../../../kernel/engines/providers/opencode.mjs';
async function fixture(t){const parent=fileURLToPath(new URL('../../../.cache/media-http/',import.meta.url));await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'app-'));const f=await createMediaFixture(root);t.after(async()=>{await f.close();await fs.rm(root,{recursive:true,force:true})});return f;}
const headers={Authorization:`Bearer ${fixtureToken}`,'Content-Type':'application/json'};
test('real local upload, native Codex image, file-only send, persisted recovery and retry identity work together',async t=>{
 const f=await fixture(t),request=async(route,body)=>fetch(f.base+route,{method:'POST',headers,body:JSON.stringify(body)});
 const uploaded=await request('/api/attachments',{id:randomUUID(),name:'参考图.png',contentType:'image/png',data:fixtureImage});assert.equal(uploaded.status,201);const{attachment}=await uploaded.json();assert.equal(attachment.path,undefined);assert.equal(attachment.kind,'image');
 const image=await fetch(f.base+attachment.url);assert.equal(image.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'),fixtureImage);
 const input={text:'',attachmentIds:[attachment.id],requestId:'image-request'},sent=await request('/api/chat',input);assert.equal(sent.status,200);const sessionId=sent.headers.get('x-session-id');const stream=await sent.text();assert.match(stream,/'?completed'?/);
 const turns=f.calls.filter(call=>call.method==='turn/start');assert.equal(turns.length,1);const native=turns[0].params.input.find(item=>item.type==='localImage');assert.ok(native.path.startsWith(path.join(f.root,'data/attachments',attachment.id)));assert.equal(await fs.readFile(native.path,'base64'),fixtureImage);assert.ok(turns[0].params.input[0].text.includes('User attachments'));
 const saved=await(await fetch(f.base+'/api/sessions/'+sessionId)).json();assert.equal(saved.session.messages[0].text,'');assert.equal(saved.session.messages[0].attachments[0].id,attachment.id);assert.equal(saved.session.messages[0].attachments[0].path,undefined);
 const retry=await request('/api/chat',{...input,sessionId});await retry.text();assert.equal(f.calls.filter(call=>call.method==='turn/start').length,1);
 const changed=await request('/api/chat',{...input,sessionId,attachmentIds:[]});assert.equal(changed.status,400);
 const file=await(await request('/api/attachments',{name:'notes.txt',data:Buffer.from('Attachment content').toString('base64')})).json();const conflict=await request('/api/chat',{...input,sessionId,attachmentIds:[file.attachment.id]});assert.equal(conflict.status,409);assert.equal((await conflict.json()).error.code,'IDEMPOTENCY_CONFLICT');
 const missing=await request('/api/chat',{text:'Inspect',attachmentIds:[randomUUID()],requestId:'missing-file'});assert.equal(missing.status,404);
 const cross=await fetch(f.base+'/api/attachments',{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);
});
test('same-origin page bridge forwards fresh rendered results without extra approval or model inference',async t=>{
 const f=await fixture(t),pageId=randomUUID();const post=(base,route,body)=>fetch(base+route,{method:'POST',headers,body:JSON.stringify(body)});
 assert.equal((await post(f.base,'/api/page/heartbeat',{pageId,url:'http://127.0.0.1:5173/',title:'Modified project',visible:true})).status,200);
 const read=post(`http://127.0.0.1:${f.builderPort}`,'/page/read',{includeImage:false}),poll=await fetch(f.base+'/api/page/requests?pageId='+pageId);const{request}=await poll.json();assert.ok(request.requestId);
 const complete=await post(f.base,'/api/page/results',{pageId,requestId:request.requestId,snapshot:{capturedAt:new Date().toISOString(),text:'Current modified heading',elements:[],viewport:{width:1280,height:720}}});assert.equal(complete.status,200);assert.equal((await(await read).json()).snapshot.text,'Current modified heading');assert.equal(f.calls.filter(call=>call.method==='turn/start').length,0);
});
test('OpenCode native prompt sends image file parts rather than embedding binary in user text',async()=>{
 let captured;const provider=new OpenCodeProvider({root:process.cwd(),mcpEnv:{},instructions:'Synthetic',onEvent(){}});provider.ready=true;provider.client={session:{create:async()=>({data:{id:'native-image'}}),promptAsync:async input=>{captured=input;return{data:true}}}};
 const run={session:{title:'image',providerId:'fixture',modelId:'fixture'},save:async()=>{}};await provider.execute(run,'Inspect image',{images:[{name:'image.png',contentType:'image/png',data:fixtureImage}]});assert.equal(captured.body.parts[0].text,'Inspect image');assert.equal(captured.body.parts[1].type,'file');assert.equal(captured.body.parts[1].url,'data:image/png;base64,'+fixtureImage);await provider.close();
});
