import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformSync } from 'rolldown/utils';

const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text = node => !node || typeof node !== 'object' ? String(node ?? '') : [node.props?.children].flat(Infinity).map(text).join('');
async function fixture({ activeSessionId = 'same', ...overrides } = {}) {
  const slots=[],effects=[],calls=[];let cursor=0,tree,scheduled=false;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;render()})}};
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;schedule()}]},useEffect(effect,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=effect()})}}};
  const composer={text:'Retain my draft',attachments:[{id:'retained-file',status:{type:'running'},file:{name:'pending.txt'}}],getState(){return{text:this.text,attachments:this.attachments,submission:this.submission}},reset(){throw new Error('Changing AI must never reset composer')}};
  const agent={activeSessionId,selection:{engine:'codex',providerId:null,modelId:null},engineRevision:0,canSelectEngine:true,isChangingEngine:false,status:{ready:true,codexReady:true},engines:[{id:'codex',ready:true,authenticated:true},...['claude','opencode'].map(id=>({id,ready:true,authenticated:true,providers:[{id:`${id}-provider`,label:id,defaultModelId:'model-a',models:[{id:'model-a',label:'Model A'},{id:'model-b',label:'Model B'}]}]}))],setSelection(selection){calls.push({type:'selection',selection});this.selection=selection;render();return true},async changeEngine(selection){calls.push({type:'apply',selection});this.selection=selection;this.engineRevision++;this.handoff={status:'pending'};render();return true},...overrides};
  const jsx=(type,props)=>({type,props}),context=vm.createContext({Error,Promise});
  const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'}};
  const mod=new vm.SourceTextModule(transformSync('EngineControls.tsx',await readFile(new URL('./EngineControls.tsx',import.meta.url),'utf8'),{jsx:{runtime:'automatic'}}).code,{context});
  await mod.link(name=>{const mock=mocks[name];return new vm.SyntheticModule(Object.keys(mock),function(){for(const[k,v]of Object.entries(mock))this.setExport(k,v)},{context})});await mod.evaluate();
  function render(){cursor=0;tree=mod.namespace.EngineControls({agent,composer,changingSession:false});while(effects.length)effects.shift()();return tree}
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))};render();await settle();
  return{agent,composer,calls,render,settle,node(label){return nodes(tree).find(node=>node.props?.['aria-label']===label)},get content(){return text(tree)}};
}

test('existing conversation stages engine and model, then applies without touching composer or attachments',async()=>{
  const h=await fixture();const original=h.composer.attachments;
  h.node('Agent engine').props.onChange({target:{value:'claude'}});await h.settle();assert.equal(h.agent.selection.engine,'codex');assert.equal(h.calls.length,0);
  h.node('Agent model').props.onChange({target:{value:'model-b'}});await h.settle();assert.equal(h.node('Apply AI to this conversation').props.disabled,false);
  h.node('Apply AI to this conversation').props.onClick();await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].type,'apply');assert.equal(h.calls[0].selection.modelId,'model-b');assert.equal(h.agent.activeSessionId,'same');assert.equal(h.composer.text,'Retain my draft');assert.equal(h.composer.attachments,original);assert.equal(h.node('Apply AI to this conversation').props.disabled,true);assert.match(h.content,/with your next message/);
  h.node('Agent engine').props.onChange({target:{value:'codex'}});await h.settle();assert.equal(h.node('Agent model'),undefined);h.node('Apply AI to this conversation').props.onClick();await h.settle();assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1).selection)),{engine:'codex',providerId:null,modelId:null});
});

test('new conversations select immediately but never call the session mutation',async()=>{
  const h=await fixture({activeSessionId:null});h.node('Agent engine').props.onChange({target:{value:'opencode'}});await h.settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].type,'selection');assert.equal(h.node('Apply AI to this conversation'),undefined);assert.equal(h.composer.attachments[0].id,'retained-file');
});

test('pending attachment submission blocks both selection and apply without discarding sent contents',async()=>{
  const h=await fixture();h.node('Agent engine').props.onChange({target:{value:'claude'}});await h.settle();h.composer.submission={text:'already clicked send',attachments:[{id:'uploading'}]};h.node('Apply AI to this conversation').props.onClick();await h.settle();assert.equal(h.calls.length,0);assert.equal(h.agent.selection.engine,'codex');assert.match(h.content,/Wait for the pending attachment send/);assert.equal(h.composer.submission.text,'already clicked send');
  const fresh=await fixture({activeSessionId:null});fresh.composer.submission={text:'queued',attachments:[]};fresh.node('Agent engine').props.onChange({target:{value:'claude'}});await fresh.settle();assert.equal(fresh.calls.length,0);assert.equal(fresh.agent.selection.engine,'codex');
});

test('busy runtime disables changes, unavailable target cannot apply, and a rejected operation retains the draft',async()=>{
  const busy=await fixture({canSelectEngine:false});assert.equal(busy.node('Agent engine').props.disabled,true);busy.node('Agent engine').props.onChange({target:{value:'claude'}});await busy.settle();assert.equal(busy.calls.length,0);assert.equal(busy.node('Agent engine').props.value,'codex');
  const h=await fixture();h.agent.engines.find(x=>x.id==='claude').ready=false;h.node('Agent engine').props.onChange({target:{value:'claude'}});await h.settle();assert.equal(h.node('Apply AI to this conversation').props.disabled,true);
  h.agent.engines.find(x=>x.id==='claude').ready=true;h.agent.changeEngine=async()=>false;h.render();h.node('Apply AI to this conversation').props.onClick();await h.settle();assert.equal(h.agent.selection.engine,'codex');assert.equal(h.node('Agent engine').props.value,'claude');assert.match(h.content,/AI was not changed/);assert.equal(h.composer.text,'Retain my draft');
});

test('changing conversation or persisted revision resets only the selection draft',async()=>{
  const h=await fixture();h.node('Agent engine').props.onChange({target:{value:'claude'}});await h.settle();h.agent.activeSessionId='other';h.agent.selection={engine:'opencode',providerId:'opencode-provider',modelId:'model-b'};h.render();await h.settle();assert.equal(h.node('Agent engine').props.value,'opencode');assert.equal(h.node('Agent model').props.value,'model-b');assert.equal(h.calls.length,0);assert.equal(h.composer.text,'Retain my draft');
});
