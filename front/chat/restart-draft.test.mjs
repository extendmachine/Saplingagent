import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source=stripTypeScriptTypes(await fs.readFile(new URL('./restart-draft.ts',import.meta.url),'utf8'));
const {saveDraft,restoreDraft,DRAFT_KEY}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function storage(){const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)}}
test('restart restores same-session draft exactly once and never overwrites newly typed text',()=>{
 const s=storage();saveDraft(s,'session','unsent text',100);assert.equal(restoreDraft(s,'session','',101),'unsent text');assert.equal(restoreDraft(s,'session','',102),null);
 saveDraft(s,'session','previous',100);assert.equal(restoreDraft(s,'session','new input',101),null);assert.equal(s.getItem(DRAFT_KEY),null);
});
test('draft recovery rejects different sessions, stale/malformed data and unavailable storage',()=>{
 const s=storage();saveDraft(s,'session','previous',100);assert.equal(restoreDraft(s,'other','',101),null);
 saveDraft(s,null,'fresh conversation',100);assert.equal(restoreDraft(s,null,'',101),'fresh conversation');
 saveDraft(s,'session','previous',100);assert.equal(restoreDraft(s,'session','',3600101),null);
 s.setItem(DRAFT_KEY,'broken');assert.equal(restoreDraft(s,'session','',101),null);
 const denied={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};assert.doesNotThrow(()=>saveDraft(denied,null,'text'));assert.equal(restoreDraft(denied,null,''),null);
});
