import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAttachmentStore } from '../attachments.mjs';
import { createStore } from '../store.mjs';
import { createWorkspaceServer } from '../server.mjs';
const parent = new URL('../../../.cache/attachment-tests/', import.meta.url);
async function fixture(t) { await fs.mkdir(parent,{recursive:true}); const root=await fs.mkdtemp(path.join(fileURLToPath(parent),'fixture-')); t.after(()=>fs.rm(root,{recursive:true,force:true})); return root; }
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
test('binary uploads preserve original bytes, sniff images, deduplicate retries and survive store restart',async t=>{
 const root=await fixture(t),store=await createAttachmentStore(root),id=randomUUID(),input={id,name:'参考图.png',contentType:'text/plain',data:png.toString('base64')};
 const first=await store.put(input),again=await store.put(input);assert.deepEqual(again,first);assert.equal(first.attachment.kind,'image');assert.equal(first.attachment.contentType,'image/png');assert.deepEqual(Buffer.from((await(await createAttachmentStore(root)).get(id,{data:true})).data,'base64'),png);
 await assert.rejects(store.put({...input,data:Buffer.from('different').toString('base64')}),{code:'ATTACHMENT_CONFLICT'});
 const svg=await store.put({name:'unsafe.svg',contentType:'image/svg+xml',data:Buffer.from('<svg onload="alert(1)"/>').toString('base64')});assert.equal(svg.attachment.kind,'file');assert.equal(svg.attachment.contentType,'application/octet-stream');
 const empty=await store.put({name:'empty.txt',contentType:'',data:''});assert.equal(empty.attachment.size,0);
});
test('invalid identifiers, forged metadata, broken base64 and missing/corrupt data fail without overwriting',async t=>{
 const root=await fixture(t),store=await createAttachmentStore(root);for(const id of ['../secret','not-an-id','/absolute'])await assert.rejects(store.get(id),{code:'INVALID_ATTACHMENT'});
 await assert.rejects(store.put({name:'file',data:'a!=='}),{code:'INVALID_ATTACHMENT'});await assert.rejects(store.put({name:'bad\nname',data:''}),{code:'INVALID_ATTACHMENT'});
 const {attachment}=await store.put({name:'a.txt',data:Buffer.from('original').toString('base64')});await fs.writeFile(path.join(root,attachment.path),'changed!');await assert.rejects(store.get(attachment.id,{data:true}),{code:'CORRUPT_ATTACHMENT'});
 await assert.rejects(store.get(randomUUID()),{code:'ATTACHMENT_NOT_FOUND'});
});
test('attachment message metadata persists alongside legacy messages and HTTP download stays authenticated',async t=>{
 const root=await fixture(t),server=await createWorkspaceServer({root,token:'synthetic-attachment-token-12345'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));const base=`http://127.0.0.1:${server.address().port}`,headers={Authorization:'Bearer synthetic-attachment-token-12345','Content-Type':'application/json'};
 const upload=await fetch(base+'/attachments',{method:'POST',headers,body:JSON.stringify({name:'a.txt',data:Buffer.from('hello').toString('base64')})});assert.equal(upload.status,201);const{attachment}=await upload.json();
 assert.equal((await fetch(base+`/attachments/${attachment.id}/content`)).status,401);const download=await fetch(base+`/attachments/${attachment.id}/content`,{headers});assert.equal(await download.text(),'hello');assert.match(download.headers.get('content-disposition'),/^attachment;/);
 const store=await createStore(root),session=await store.createSession({title:'files'});await store.patchSession(session.id,{messages:[{id:'old',role:'user',text:'legacy'},{id:'new',role:'user',text:'',attachments:[attachment]}]});const saved=await store.getSession(session.id);assert.equal(saved.messages[0].attachments,undefined);assert.equal(saved.messages[1].attachments[0].id,attachment.id);assert.equal(saved.messages[1].attachments[0].path,undefined);
});
