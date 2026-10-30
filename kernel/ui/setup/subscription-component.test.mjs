import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './app-test-fixture.mjs';

const savedApi = {id:'api-one',label:'Existing API',engine:'claude',kind:'api',protocol:'anthropic',baseUrl:'https://provider.example/v1',model:'model-one',noAuth:false,hasKey:true};
const savedSubscription = {id:'subscription-one',label:'Existing subscription',engine:'claude',kind:'subscription',model:'sonnet',hasKey:true};


async function subscription(h){await h.click('Claude');await h.click('Subscription token (personal use)');}
const writes=h=>h.calls.filter(call=>call.route==='profiles');

test('subscription form hides API/import/discovery controls and sends only the subscription contract',async()=>{
 const h=await fixture();await subscription(h);
 assert.equal(h.hasImport(),false);assert.equal(h.field('API Base URL'),undefined);assert.equal(h.field('Start from'),undefined);assert.equal(h.field('Agent engine'),undefined);assert.equal(h.button('Fetch models'),undefined);assert.doesNotMatch(h.text(),/This endpoint does not require/);assert.equal(h.password().props.required,true);
 await h.change('Subscription token','synthetic-subscription-token');await h.change('Model ID','sonnet');await h.save();
 assert.deepEqual(writes(h)[0].body,{label:'Claude subscription',model:'sonnet',apiKey:'synthetic-subscription-token',revision:4,activate:true,engine:'claude',kind:'subscription'});
 assert.equal(h.password().props.value,'');assert.equal(h.password().props.required,false);assert.match(h.text(),/Token saved/);assert.equal(h.project().aiDirty,false);assert.equal(h.calls.some(call=>['models','credentials/import','login'].includes(call.route)),false);
});

test('API to subscription and back clears typed secrets and cannot retain a credential of the other kind',async()=>{
 const h=await fixture({profiles:[savedApi]});await h.click('Existing API');assert.equal(h.password().props.required,false);await h.change('API key','synthetic-api-secret');await h.click('Subscription token (personal use)');assert.equal(h.password().props.value,'');assert.equal(h.password().props.required,true);
 await h.change('Subscription token','synthetic-subscription-secret');await h.click('API key');assert.equal(h.password().props.value,'');assert.equal(h.password().props.required,true);assert.equal(h.hasImport(),true);await h.change('API key','fresh-api-credential');await h.save();assert.equal(writes(h)[0].body.kind,'api');assert.equal(writes(h)[0].body.apiKey,'fresh-api-credential');assert.equal(writes(h)[0].body.id,'api-one');assert.doesNotMatch(JSON.stringify(writes(h)),/synthetic-subscription-secret/);
});

test('editing a saved subscription retains its kind and permits blank token only while that kind is unchanged',async()=>{
 const h=await fixture({profiles:[savedSubscription]});await h.click('Existing subscription');assert.equal(h.password().props.required,false);assert.equal(h.button('Subscription token (personal use)').props['aria-checked'],true);assert.equal(h.field('API Base URL'),undefined);await h.change('Scheme name','Renamed subscription');await h.save();assert.deepEqual(writes(h)[0].body,{id:'subscription-one',label:'Renamed subscription',model:'sonnet',apiKey:'',revision:4,activate:true,engine:'claude',kind:'subscription'});
 await h.click('API key');assert.equal(h.password().props.required,true);await h.click('Subscription token (personal use)');assert.equal(h.password().props.required,true);
});

test('tab, preset and engine changes discard typed credentials instead of sending them under another scheme',async()=>{
 const h=await fixture();await subscription(h);await h.change('Subscription token','synthetic-token-tab');await h.click('API / custom provider');assert.equal(h.password().props.value,'');await h.change('API key','synthetic-api-engine');await h.change('Agent engine','codex');assert.equal(h.password().props.value,'');await h.change('API key','synthetic-api-preset');await h.change('Start from','anthropic');assert.equal(h.password().props.value,'');
 await h.click('Subscription token (personal use)');await h.change('Subscription token','synthetic-token-mcp');await h.click('External AI / MCP');await h.click('Claude');assert.equal(h.password().props.value,'');await h.change('API key','synthetic-token-account');await h.click('ChatGPT account');await h.click('API / custom provider');assert.equal(h.password().props.value,'');assert.equal(writes(h).length,0);
});

test('Save and build validates and persists a dirty subscription before project finalization',async()=>{
 const h=await fixture();await subscription(h);assert.equal(h.project().aiDirty,true);assert.throws(()=>h.project().onValidateSettings(),/Complete the AI scheme fields/);assert.equal(writes(h).length,0);await h.change('Subscription token','synthetic-build-token');await h.change('Model ID','opus');h.project().onValidateSettings();await h.project().onSaveSettings();await h.settle();assert.equal(writes(h).length,1);assert.equal(writes(h)[0].body.kind,'subscription');assert.equal(h.project().aiDirty,false);assert.equal(h.project().aiReady,true);
});

test('subscription errors and guidance are localized without claiming token validation or lifetime',async()=>{
 const h=await fixture({lang:'zh'});await h.click('Claude');await h.click('订阅 Token（本人自用）');assert.match(h.text(),/不验证 Token、资格或额度/);assert.doesNotMatch(h.text(),/一年|免费/);h.fail('KEY_REQUIRED');await h.save();assert.match(h.text(),/凭据/);h.fail('INVALID_CONFIG');await h.save();assert.match(h.text(),/配置/);
});

test('language selection persists independently, updates document accessibility and preserves typed credentials/drafts',async()=>{
 const h=await fixture();await subscription(h);await h.change('Scheme name','My unchanged scheme');await h.change('Subscription token','synthetic-unsaved-token');await h.change('Model ID','my-model-id');
 const beforeWrites=writes(h).length;await h.language('zh');
 assert.equal(h.document.documentElement.lang,'zh');assert.match(h.document.title,/项目配置/);assert.equal(h.password().props.value,'synthetic-unsaved-token');assert.equal(h.field('方案名称').props.value,'My unchanged scheme');assert.equal(h.field('模型 ID').props.value,'my-model-id');assert.equal(writes(h).length,beforeWrites);
 assert.deepEqual(h.calls.filter(call=>call.route==='language'&&call.body).map(call=>call.body),[{language:'zh'}]);
 await h.language('en');assert.equal(h.password().props.value,'synthetic-unsaved-token');assert.equal(h.document.documentElement.lang,'en');assert.ok(h.button('Save & use'));
});

test('a slow initial project preference cannot undo a newer explicit language choice',async()=>{
 let release;const initialLanguage=new Promise(resolve=>{release=resolve;});const h=await fixture({initialLanguage});await h.language('zh');release({language:'en'});await h.settle();assert.equal(h.document.documentElement.lang,'zh');assert.ok(h.button('刷新状态'));assert.equal(writes(h).length,0);
});

test('existing error and success messages rerender in the selected language without repeating a configuration write',async()=>{
 const h=await fixture();await subscription(h);await h.change('Subscription token','synthetic-unsaved-token');await h.change('Model ID','sonnet');await h.save();const count=writes(h).length;assert.match(h.text(),/AI scheme saved/);await h.language('zh');assert.match(h.text(),/AI 方案已保存/);assert.equal(writes(h).length,count);
 h.fail('CONFIG_CHANGED');await h.save();assert.match(h.text(),/等待期间项目或对话已发生变化/);const failures=writes(h).length;await h.language('en');assert.match(h.text(),/The project or conversation changed/);assert.match(h.text(),/Technical details/);assert.match(h.text(),/CONFIG_CHANGED/);assert.equal(writes(h).length,failures);
});


test('failed preference save is explicit, retryable and never clears a credential draft',async()=>{
 const h=await fixture();await subscription(h);await h.change('Subscription token','synthetic-language-retry-token');h.failLanguage('CONFIG_BUSY');await h.language('zh');assert.match(h.text(),/尚未成功保存到项目/);assert.equal(h.password().props.value,'synthetic-language-retry-token');assert.ok(h.button('重新保存语言'));h.failLanguage(null);await h.click('重新保存语言');assert.equal(h.button('重新保存语言'),undefined);assert.equal(h.password().props.value,'synthetic-language-retry-token');assert.equal(writes(h).length,0);
});
