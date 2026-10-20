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

test('restart bridge records the displayed conversation, not another tab selection', async () => {
 const {default:vm}=await import('node:vm');const{transformSync}=await import('rolldown/utils');const events=new EventTarget(),saved=storage();let effect,activeRef;
 const mocks={react:{useRef(value){return activeRef||={current:value}},useEffect(fn){effect=fn}},'@assistant-ui/react':{useAui:()=>({composer:()=>({getState:()=>({text:'visible draft'}),setText(){}})})}};
 const context=vm.createContext({window:events,sessionStorage:saved,localStorage:{getItem:()=> 'other-tab-session'},Date,JSON});
 const modules=new Map();async function load(name){if(modules.has(name))return modules.get(name);if(mocks[name]){const mock=mocks[name];const mod=new vm.SyntheticModule(Object.keys(mock),function(){for(const[k,v]of Object.entries(mock))this.setExport(k,v)},{context});modules.set(name,mod);return mod;}const file=name==='entry'?'RestartDraft.tsx':'restart-draft.ts';const mod=new vm.SourceTextModule(transformSync(file,await fs.readFile(new URL(file,import.meta.url),'utf8'),{jsx:{runtime:'automatic'}}).code,{context});modules.set(name,mod);await mod.link(load);return mod;}
 const mod=await load('entry');await mod.evaluate();mod.namespace.RestartDraft({sessionId:'displayed-a'});const cleanup=effect();events.dispatchEvent(new Event('pagehide'));assert.equal(JSON.parse(saved.getItem(DRAFT_KEY)).sessionId,'displayed-a');
 mod.namespace.RestartDraft({sessionId:'displayed-b'});events.dispatchEvent(new Event('saplingagent:before-restart'));assert.equal(JSON.parse(saved.getItem(DRAFT_KEY)).sessionId,'displayed-b');cleanup();
});
