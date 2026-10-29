import * as uiMessages from '../localization/messages.ts';
import { codexModelSelectable } from './runtime-api.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformSync } from 'rolldown/utils';

const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text = node => !node || typeof node !== 'object' ? String(node ?? '') : [node.props?.children].flat(Infinity).map(text).join('');
async function fixture({ language = 'en', activeSessionId = 'same', ...overrides } = {}) {
  const slots=[],effects=[],calls=[];let cursor=0,tree,scheduled=false;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;render()})}};
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;schedule()}]},useEffect(effect,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=effect()})}}};
  const composer={text:'Retain my draft',attachments:[{id:'retained-file',status:{type:'running'},file:{name:'pending.txt'}}],getState(){return{text:this.text,attachments:this.attachments,submission:this.submission}},reset(){throw new Error('Changing AI must never reset composer')}};
  const agent={activeSessionId,selection:{engine:'codex',providerId:null,modelId:null},engineRevision:0,canSelectEngine:true,isChangingEngine:false,status:{ready:true,codexReady:true},engines:[{id:'codex',ready:true,authenticated:true},...['claude','opencode'].map(id=>({id,ready:true,authenticated:true,providers:[{id:`${id}-provider`,label:id,defaultModelId:'model-a',models:[{id:'model-a',label:'Model A'},{id:'model-b',label:'Model B'}]}]}))],setSelection(selection){calls.push({type:'selection',selection});this.selection=selection;render();return true},async changeEngine(selection){calls.push({type:'apply',selection});this.selection=selection;this.engineRevision++;this.handoff={status:'pending'};render();return true},...overrides};
  const jsx=(type,props)=>typeof type==='function'?type(props):({type,props}),context=vm.createContext({Error,Promise});
  const mocks={'./runtime-api':{codexModelSelectable},'../localization/LanguageProvider':{useLanguage:()=>({language, locale: uiMessages.localeFor(language), t:(key,params)=>uiMessages.translate(language,key,params), text:value=>uiMessages.resolveText(value,language)})},'../localization/messages':uiMessages,'../localization/ErrorNotice':{ErrorNotice:({error})=>jsx('div',{children:uiMessages.resolveText(error,language)})},react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'}};
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

test('Chinese controls keep provider/model values and pending attachment draft during AI selection',async()=>{
 const h=await fixture({language:'zh'});h.node('AI 引擎').props.onChange({target:{value:'claude'}});await h.settle();assert.equal(h.node('AI 模型').props.value,'model-a');assert.equal(h.composer.text,'Retain my draft');assert.equal(h.composer.attachments[0].id,'retained-file');assert.match(h.content,/会话/);
 h.node('将所选 AI 应用于当前会话').props.onClick();await h.settle();assert.equal(h.calls.length,1);assert.equal(h.agent.activeSessionId,'same');assert.match(h.content,/下一次发送/);
});

const accountEngine = () => ({id:'codex',ready:true,authenticated:true,modelSelection:'account',model:'project-default',defaultModelId:'project-default',requestedModel:'startup-preference',models:[{id:'project-default',label:'Project default'},{id:'account-alternative',label:'Alternative model'}]});

test('Codex account selection keeps the same conversation and composer, while actual model only uses a reported session observation',async()=>{
 const h=await fixture({engines:[accountEngine()],modelUsage:{requestedModel:'project-default',actualModel:'rerouted-model',requestId:'prior',updatedAt:'2026-10-29T00:00:00Z',source:'model/rerouted'}});const attachments=h.composer.attachments;
 assert.equal(h.node('Agent provider'),undefined);assert.match(h.content,/Chosen model: project-default/);assert.match(h.content,/Last confirmed model: rerouted-model/);
 h.node('Agent model').props.onChange({target:{value:'account-alternative'}});await h.settle();assert.equal(h.calls.length,0);assert.equal(h.agent.selection.modelId,null);assert.match(h.content,/Chosen model: account-alternative/);
 h.node('Apply AI to this conversation').props.onClick();await h.settle();assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].selection)),{engine:'codex',providerId:null,modelId:'account-alternative'});assert.equal(h.agent.activeSessionId,'same');assert.equal(h.composer.text,'Retain my draft');assert.equal(h.composer.attachments,attachments);
 h.agent.modelUsage={requestedModel:'account-alternative',actualModel:'must-not-be-reported',requestId:'next',updatedAt:'2026-10-29T00:01:00Z',source:'unreported'};h.render();assert.match(h.content,/Actual model: not reported yet/);assert.doesNotMatch(h.content,/Last confirmed/);assert.doesNotMatch(h.content,/must-not-be-reported/);
});

test('Codex catalog refresh preserves a missing selected model, shows stale errors and blocks unavailable changes',async()=>{
 const h=await fixture({engines:[accountEngine()],selection:{engine:'codex',providerId:null,modelId:'removed-choice'},refreshEngines:async(...args)=>h.calls.push({type:'refresh',args})});
 assert.equal(h.node('Agent model').props.value,'removed-choice');assert.match(h.content,/removed-choice \(unavailable\)/);h.node('Refresh models').props.onClick();await h.settle();assert.deepEqual(h.calls[0].args,[undefined,true]);assert.equal(h.agent.selection.modelId,'removed-choice');assert.equal(h.composer.text,'Retain my draft');
 h.agent.engines[0].modelCatalogError='fixture RPC failed';h.render();await h.settle();assert.match(h.content,/last saved catalog/);h.node('Agent model').props.onChange({target:{value:'account-alternative'}});await h.settle();assert.equal(h.node('Apply AI to this conversation').props.disabled,true);
 h.agent.enginesLoading=true;h.render();assert.equal(h.node('Agent model').props.disabled,true);assert.equal(h.node('Refresh models').props.disabled,true);assert.match(h.content,/Loading models/);
 h.agent.enginesLoading=false;h.agent.engines[0].modelCatalogError=null;h.agent.engines[0].models=[];h.render();assert.match(h.content,/returned no models/);assert.equal(h.node('Agent model').props.value,'account-alternative');
});

test('Codex API mode is fixed, and account busy/submission guards preserve pending contents',async()=>{
 const api=await fixture({engines:[{...accountEngine(),modelSelection:'api',models:[],model:'provider-fixed',defaultModelId:'provider-fixed'}]});assert.equal(api.node('Agent model'),undefined);assert.equal(api.node('Refresh models'),undefined);assert.match(api.content,/API model: provider-fixed/);assert.match(api.content,/Actual model: not reported yet/);
 const busy=await fixture({engines:[accountEngine()],canSelectEngine:false});assert.equal(busy.node('Agent model').props.disabled,true);assert.equal(busy.node('Refresh models').props.disabled,true);busy.node('Agent model').props.onChange({target:{value:'account-alternative'}});await busy.settle();assert.equal(busy.calls.length,0);
 const fresh=await fixture({engines:[accountEngine()],activeSessionId:null,refreshEngines:async()=>{throw Error('Do not refresh during pending submission')}});fresh.composer.submission={text:'already sent',attachments:[]};fresh.node('Agent model').props.onChange({target:{value:'account-alternative'}});fresh.node('Refresh models').props.onClick();await fresh.settle();assert.equal(fresh.calls.length,0);assert.equal(fresh.agent.selection.modelId,null);assert.equal(fresh.composer.submission.text,'already sent');
 fresh.composer.submission=null;fresh.node('Agent model').props.onChange({target:{value:'account-alternative'}});await fresh.settle();assert.equal(fresh.calls[0].type,'selection');assert.equal(fresh.agent.selection.modelId,'account-alternative');assert.equal(fresh.node('Apply AI to this conversation'),undefined);
});

test('Chinese Codex model labels distinguish a selection and unavailable actual usage',async()=>{
 const h=await fixture({language:'zh',engines:[{...accountEngine(),modelWarning:'ENGLISH warning that must not appear in Chinese'}]});assert.match(h.content,/所选模型：project-default/);assert.match(h.content,/实际模型：尚未报告/);assert.equal(h.node('刷新模型').props.disabled,undefined);assert.equal(h.node('AI 模型').props.value,'');assert.match(h.content,/预设模型 startup-preference 不可用/);assert.match(h.content,/自动模式将使用 project-default/);assert.doesNotMatch(h.content,/ENGLISH warning/);
 h.node('AI 模型').props.onChange({target:{value:'account-alternative'}});await h.settle();assert.match(h.content,/所选模型：account-alternative/);assert.doesNotMatch(h.content,/预设模型|自动模式将使用/);assert.equal(h.calls.length,0);
 h.node('AI 模型').props.onChange({target:{value:''}});await h.settle();assert.match(h.content,/预设模型 startup-preference 不可用/);assert.match(h.content,/自动模式将使用 project-default/);assert.equal(h.calls.length,0);
});

test('a former account choice in fixed API mode changes only after an explicit reset and Apply',async()=>{
 const h=await fixture({engines:[{...accountEngine(),modelSelection:'api',models:[],model:'provider-fixed',defaultModelId:'provider-fixed'}],selection:{engine:'codex',providerId:null,modelId:'old-account-choice'}});
 assert.equal(h.agent.selection.modelId,'old-account-choice');assert.equal(h.node('Agent model'),undefined);assert.equal(h.node('Apply AI to this conversation').props.disabled,true);
 const control=nodes(h.render()).find(node=>node.type==='button'&&text(node)==='Use API profile model');assert.ok(control);control.props.onClick();await h.settle();assert.equal(h.agent.selection.modelId,'old-account-choice');assert.equal(h.calls.length,0);assert.equal(h.node('Apply AI to this conversation').props.disabled,false);
 h.node('Apply AI to this conversation').props.onClick();await h.settle();assert.equal(h.agent.selection.modelId,null);assert.equal(h.composer.text,'Retain my draft');assert.equal(h.composer.attachments[0].id,'retained-file');
});
