import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadComponentModule} from './component-test-loader.mjs';

const children = node => [node?.props?.children].flat(Infinity);
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...children(node).flatMap(nodes)];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : !node || typeof node !== 'object' ? '' : children(node).map(text).join('');
const savedApi = {id:'api-one',label:'Existing API',engine:'claude',kind:'api',protocol:'anthropic',baseUrl:'https://provider.example/v1',model:'model-one',noAuth:false,hasKey:true};
const savedSubscription = {id:'subscription-one',label:'Existing subscription',engine:'claude',kind:'subscription',model:'sonnet',hasKey:true};

async function fixture({profiles=[],lang='en',initialLanguage}={}) {
 const slots=[],effects=[],calls=[];let cursor=0,tree,App,scheduled=false,failure,languageFailure;
 let state={revision:4,activeId:profiles[0]?.id||null,profiles,codex:{saved:false,chatgpt:false,type:null},login:{phase:'idle'},mcp:{revision:0,enabled:false,externalOnly:false,available:false}};
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
 const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;render();});}};
 const react={default:{},useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;schedule();}];},useRef(initial){const i=cursor++;return slots[i]||=( {current:initial});},useCallback(fn){cursor++;return fn;},useEffect(effect,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=effect();});}}};
 const ProjectSetup=()=>null,McpAccess=()=>null,jsx=(type,props)=>['ErrorNotice','Notice','LanguageSelector'].includes(type?.name)?type(props):({type,props});
 const context=vm.createContext({Error,Promise,JSON,setInterval,clearInterval,window:{open(){throw Error('Unexpected sign-in');}},document:{documentElement:{lang},title:'',querySelector(selector){return {content:selector.includes('language')?lang:'fixture-page-token'};},getElementById(){return {}; }},async fetch(url,options){const route=url.replace('/api/config/',''),body=options.body?JSON.parse(options.body):undefined;calls.push({route,body});if(route==='language'){if(body&&languageFailure)return {ok:false,json:async()=>({error:languageFailure})};if(!body&&initialLanguage)return {ok:true,json:()=>initialLanguage};if(body)lang=body.language;return {ok:true,json:async()=>({language:lang,supported:['en','zh']})};}if(failure&&body)return {ok:false,json:async()=>({error:failure})};if(route==='profiles') {const {apiKey,revision,activate,...profile}=body;profile.id||='new-subscription';profile.hasKey=!!apiKey||state.profiles.some(p=>p.id===profile.id&&p.kind===profile.kind&&p.hasKey);state={...state,revision:state.revision+1,activeId:profile.id,profiles:[profile]};}else assert.equal(route,'state');return {ok:true,json:async()=>structuredClone(state)};}});
 const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'react-dom/client':{createRoot:()=>({render(element){App=element.type;}})},'./styles.css':{},'./import-file':{readCredentialFile(){throw Error('Unexpected credential import');}},'./ProjectSetup':{ProjectSetup},'./setup-flow':{configurationClosed:()=>false},'./McpAccess':{McpAccess},'./mcp-access':{aiConnectionReady:(id,mcp)=>!!id||!!(mcp?.enabled&&mcp.externalOnly)}};
 const module=await loadComponentModule('./main.tsx',{context,mocks});await module.evaluate();
 function render(){cursor=0;tree=App();const form=nodes(tree).find(node=>node.type==='form');if(form)form.props.ref.current={reportValidity:()=>nodes(form).filter(node=>node.type==='input'&&node.props.required&&!node.props.disabled).every(node=>!!node.props.value)};while(effects.length)effects.shift()();}
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};render();await settle();
 return {calls,settle,document:context.document,async language(value){const control=nodes(tree).find(node=>node.type==='select'&&['Interface language','界面语言'].includes(node.props['aria-label']));assert.ok(control);control.props.onChange({target:{value}});await settle();},button(label){return nodes(tree).find(node=>node.type==='button'&&(text(node)===label||children(node).some(child=>child?.type==='strong'&&text(child)===label)));},field(label){const parent=nodes(tree).find(node=>node.type==='label'&&children(node)[0]===label);return nodes(parent).find(node=>['input','select'].includes(node.type));},form(){return nodes(tree).find(node=>node.type==='form');},project(){return nodes(tree).find(node=>node.type===ProjectSetup).props;},hasImport(){return nodes(tree).some(node=>typeof node.type==='function'&&node.type.name==='CredentialButtons'&&node.props.engine==='claude');},text:()=>text(tree),password:()=>nodes(tree).find(node=>node.type==='input'&&node.props.type==='password'),async click(label){const button=this.button(label);assert.ok(button,label);assert.ok(!button.props.disabled,label);button.props.onClick();await settle();},async change(label,value){const field=this.field(label);assert.ok(field,label);field.props.onChange({target:{value,checked:!!value}});this.form()?.props.onChange();await settle();},async save(){this.form().props.onSubmit({preventDefault(){}});await settle();},fail(code){failure={code,message:'Sanitized configuration error'};},failLanguage(code){languageFailure=code?{code,message:'Synthetic language write failure'}:undefined;}};
}

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
