import test from 'node:test';
import assert from 'node:assert/strict';
import { readCredentialFile } from './import-file.ts';
test('browser upload accepts UTF-8/BOM JSON without retaining or changing the file',async()=>{
 const text='\uFEFF'+JSON.stringify({apiKey:'synthetic-browser-key',label:'示例'});const file=new File([text],'auth.json',{type:'application/json'});
 // File.text() decodes UTF-8 and strips its BOM; file bytes remain unchanged.
 assert.equal(await readCredentialFile(file),text.replace(/^\uFEFF/,''));assert.deepEqual(new Uint8Array(await file.arrayBuffer()),new TextEncoder().encode(text));
});
test('browser upload rejects invalid/scalar/oversized/unreadable files without exposing parse content',async()=>{
 for(const text of ['{synthetic-private-fragment','null','[]','true'])await assert.rejects(readCredentialFile(new File([text],'auth.json')),e=>!e.message.includes('synthetic-private'));
 let read=false;await assert.rejects(readCredentialFile({size:32769,text:async()=>{read=true;return '{}';}}),/32 KiB/);assert.equal(read,false);
 await assert.rejects(readCredentialFile({size:1,text:async()=>'中'.repeat(12000)}),/32 KiB/);
 await assert.rejects(readCredentialFile({size:1,text:async()=>{throw Error('synthetic-private');}}),e=>!e.message.includes('synthetic-private'));
});
