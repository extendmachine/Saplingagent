import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './app-test-fixture.mjs';
import {describeError} from '../../localization/public.mjs';
const profile={id:'existing-api',label:'Existing API',engine:'opencode',kind:'api',protocol:'chat',baseUrl:'https://provider.example/v1',model:'model-one',hasKey:true,noAuth:false,contextWindow:128000,maxOutput:4096};
const writes=h=>h.calls.filter(call=>call.body!==undefined);

test('AI settings wait for the mode and never mount project setup, while absent mode retains full setup',async()=>{
 let release;const initialState=new Promise(resolve=>release=resolve);const h=await fixture({configurationMode:'ai',initialState});
 assert.equal(h.project(),undefined);assert.equal(h.button('Close setup'),undefined);assert.match(h.text(),/Reading local configuration/);
 release();await h.settle();assert.equal(h.project(),undefined);assert.equal(h.document.title,'AI settings');assert.ok(h.button('Finish & restart'));assert.ok(h.credential('codex'));assert.equal(h.mcp().configurationMode,'ai');assert.doesNotMatch(h.text(),/Set up your project|Save & build|Export app|2 ·/);assert.equal(h.calls.some(x=>x.route.startsWith('project')),false);
 const legacy=await fixture();assert.ok(legacy.project());assert.equal(legacy.document.title,'Saplingagent · Project setup');
});

test('AI finish requires no project artifact and acknowledges only a real restart handoff',async()=>{
 const h=await fixture({configurationMode:'ai'});await h.click('Finish & restart');assert.deepEqual(writes(h),[{route:'close',body:{}}]);assert.match(h.text(),/Returning to your app/);assert.match(h.text(),/launcher has accepted/);assert.doesNotMatch(h.text(),/Setup complete|export|built|ready/);
 for(const closeResult of [{closed:true},{closed:false,handoff:true},{handoff:true}]){
  const failed=await fixture({configurationMode:'ai',closeResult});await failed.click('Finish & restart');assert.ok(failed.button('Finish & restart'));assert.match(failed.text(),/not acknowledged the restart/);assert.doesNotMatch(failed.text(),/Returning to your app/);
 }
});

test('Finish validates a pending API form before busy can disable required inputs',async()=>{
 const h=await fixture({configurationMode:'ai'});await h.click('API / custom provider');await h.change('Scheme name','Unfinished draft');await h.click('Finish & restart');assert.equal(writes(h).length,0);assert.equal(h.field('Scheme name').props.value,'Unfinished draft');assert.equal(h.field('Scheme name').props.disabled,false);assert.match(h.text(),/Complete the AI scheme fields/);
});

test('Finish saves API and dirty MCP in order before close, without renaming or building',async()=>{
 const h=await fixture({configurationMode:'ai',profiles:[profile]});await h.click('Existing API');await h.change('Scheme name','Saved AI draft');await h.dirtyMcp();await h.click('Finish & restart');assert.deepEqual(writes(h).map(x=>x.route),['profiles','mcp','close']);assert.equal(writes(h)[0].body.label,'Saved AI draft');assert.match(h.text(),/Returning to your app/);assert.equal(h.calls.some(x=>x.route.startsWith('project')),false);
});

test('failed API save retains the form and prevents MCP save and restart',async()=>{
 const h=await fixture({configurationMode:'ai',profiles:[profile]});await h.click('Existing API');await h.change('Scheme name','Retain draft');await h.change('API key','synthetic-unsaved-key');await h.dirtyMcp();h.fail('CONFIG_BUSY');await h.click('Finish & restart');assert.deepEqual(writes(h).map(x=>x.route),['profiles']);assert.equal(h.password().props.value,'synthetic-unsaved-key');assert.equal(h.field('Scheme name').props.value,'Retain draft');assert.ok(h.button('Finish & restart'));
});

test('failed MCP save prevents close and the visible saved profile remains usable',async()=>{
 const h=await fixture({configurationMode:'ai',profiles:[profile]});await h.dirtyMcp();h.failMcp('CONFIG_CHANGED');await h.click('Finish & restart');assert.deepEqual(writes(h).map(x=>x.route),['mcp']);assert.ok(h.button('Finish & restart'));assert.match(h.text(),/changed while this action was pending/);
});

test('pending sign-in cannot finish; cancel and retained account controls remain available',async()=>{
 const h=await fixture({configurationMode:'ai',loginPhase:'pending'});try{
  const button=h.button('Finish & restart');assert.equal(button.props.disabled,true);button.props.onClick();await h.settle();assert.equal(writes(h).length,0);await h.click('Cancel sign-in');assert.equal(h.button('Finish & restart').props.disabled,false);assert.ok(h.credential('codex'));
 }finally{h.cleanup();}
});

test('AI profile/default/import notices use restart instructions and preserve mode on legacy-shaped mutation replies',async()=>{
 const h=await fixture({configurationMode:'ai',profiles:[profile],omitMutationMode:true});await h.click('Existing API');await h.change('Scheme name','Renamed scheme');await h.save();assert.match(h.text(),/AI scheme saved. Choose Finish & restart/);assert.equal(h.project(),undefined);assert.equal(h.document.title,'AI settings');
 await h.click('ChatGPT account');h.credential('codex').onImport('local');await h.settle();assert.match(h.credential('codex').notice.key,/setup.ai.credentials.saved/);assert.equal(h.project(),undefined);await h.click('Use saved account');assert.match(h.text(),/Saved account selected. Choose Finish & restart/);assert.doesNotMatch(h.text(),/Save & build|export the app/);
 const defaults=await fixture({configurationMode:'ai',profiles:[profile,{...profile,id:'other',label:'Other'}]});await defaults.click('Use');assert.match(defaults.text(),/Default AI changed. Choose Finish & restart/);
});

test('hidden unsaved API fields are brought back for review before finish, not silently discarded',async()=>{
 const h=await fixture({configurationMode:'ai',profiles:[profile]});await h.click('Existing API');await h.change('Scheme name','Keep hidden draft');await h.click('External AI / MCP');await h.click('Finish & restart');assert.equal(writes(h).length,0);assert.equal(h.field('Scheme name').props.value,'Keep hidden draft');assert.match(h.text(),/Review the unsaved AI scheme/);await h.click('Finish & restart');assert.deepEqual(writes(h).map(x=>x.route),['profiles','close']);
});

test('AI settings language and status refresh preserve the pending form and original technical errors',async()=>{
 const h=await fixture({configurationMode:'ai',profiles:[profile]});await h.click('Existing API');await h.change('Scheme name','Keep original title');await h.change('API key','synthetic-language-secret');await h.language('zh');assert.equal(h.document.title,'AI 设置');assert.equal(h.field('方案名称').props.value,'Keep original title');assert.equal(h.password().props.value,'synthetic-language-secret');assert.match(h.text(),/无需导出或重新编译/);await h.click('刷新状态');assert.equal(h.password().props.value,'synthetic-language-secret');h.fail('AI_CONFIGURATION_ONLY');await h.save();assert.match(h.text(),/此页面仅用于修改 AI 设置/);assert.match(h.text(),/AI_CONFIGURATION_ONLY/);assert.equal(h.password().props.value,'synthetic-language-secret');h.fail('CONFIGURATION_MODE_CONFLICT');await h.save();assert.match(h.text(),/另一种配置模式/);assert.doesNotMatch(h.text(),/synthetic-language-secret/);
});

test('a repeated Finish click issues one handoff request',async()=>{
 const h=await fixture({configurationMode:'ai'});const finish=h.button('Finish & restart');finish.props.onClick();finish.props.onClick();await h.settle();assert.deepEqual(writes(h),[{route:'close',body:{}}]);
});


test('an unsupported mode fails closed before project or AI forms mount',async()=>{
 const h=await fixture({configurationMode:'unsupported'});assert.equal(h.project(),undefined);assert.equal(h.credential('codex'),undefined);assert.equal(h.button('Finish & restart'),undefined);assert.match(h.text(),/CONFIGURATION_MODE_CONFLICT/);assert.equal(writes(h).length,0);
});


test('AI configuration lifecycle failures have specific bilingual summaries and next steps',()=>{
 for(const code of ['CONFIGURATION_MODE_CONFLICT','CONFIGURATION_MODE_INVALID','CONFIGURATION_CLOSING','CONFIGURATION_RESTART_FAILED','AI_CONFIGURATION_ONLY'])for(const language of ['en','zh']){
  const message=describeError({code,message:'Synthetic lifecycle detail'},language);assert.equal(message.code,code);assert.ok(message.action);assert.ok(message.summary);assert.doesNotMatch(message.summary,/operation could not finish|操作未能完成/);
 }
});
