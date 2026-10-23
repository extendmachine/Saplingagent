import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadComponentModule} from './component-test-loader.mjs';
import {formatMessage} from '../../localization/public.mjs';
import {setupMessages} from '../../localization/setup-messages.mjs';
const children=node=>[node?.props?.children].flat(Infinity);
const nodes=node=>!node||typeof node!=='object'?[]:[node,...children(node).flatMap(nodes)];
const text=node=>typeof node==='string'||typeof node==='number'?String(node):!node||typeof node!=='object'?'':children(node).map(text).join('');
async function fixture(){
 const slots=[],effects=[],calls=[];let cursor=0,tree,scheduled=false,failure;
 const snapshot={root:'/synthetic/project',configurationHost:'external',directoryReady:true,canRename:true,settingsSaved:true,exportReady:false,project:{name:'User-owned name',folderName:'User-owned folder'},kernelVersion:'0.9.6',device:{platform:'darwin',arch:'arm64'},runtime:{phase:'ready'}};
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
 const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;render();});}};
 const react={default:{},useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;schedule();}];},useRef(initial){const i=cursor++;return slots[i]||={current:initial};},useEffect(effect,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=effect();});}}};
 const props={language:'en',t:(key,params)=>formatMessage(setupMessages,props.language,key,params),aiReady:true,async request(route,body){calls.push({route,body});if(failure&&body)throw failure;return structuredClone(snapshot);}};
 const jsx=(type,props)=>['ErrorNotice','Notice'].includes(type?.name)?type(props):{type,props};
 const context=vm.createContext({Promise,Error,Date,JSON,setTimeout(){return 1;},clearTimeout(){},window:{location:{reload(){throw Error('Unexpected reload');}}}});
 const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'}};
 const module=await loadComponentModule('./ProjectSetup.tsx',{context,mocks});await module.evaluate();
 function render(){cursor=0;tree=module.namespace.ProjectSetup(props);while(effects.length)effects.shift()();}
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};render();await settle();
 return {calls,props,render,settle,text:()=>text(tree),button(label){return nodes(tree).find(n=>n.type==='button'&&text(n)===label);},field(label){const parent=nodes(tree).find(n=>n.type==='label'&&children(n)[0]===label);return nodes(parent).find(n=>n.type==='input');},fail(value){failure=value;},tree:()=>tree};
}
test('project localization preserves unsaved names and state while updating accessible labels',async()=>{
 const h=await fixture();h.field('Project and launcher name').props.onChange({target:{value:'Unsaved 用户项目'}});await h.settle();const reads=h.calls.length;
 h.props.language='zh';h.render();await h.settle();assert.equal(h.field('项目与启动器名称').props.value,'Unsaved 用户项目');assert.equal(h.field('项目文件夹名称').props.value,'User-owned folder');assert.ok(h.button('保存项目设置'));assert.match(h.text(),/内核/);assert.match(h.text(),/User-owned folder|源码/);assert.equal(h.calls.length,reads);assert.ok(nodes(h.tree()).some(n=>n.props?.['aria-label']==='项目配置与启动器'));
});
test('project failures keep edits and localize summary/action while retaining raw details',async()=>{
 const h=await fixture();h.field('Project and launcher name').props.onChange({target:{value:'Keep my draft'}});await h.settle();h.fail(Object.assign(Error('Synthetic operation currently busy'),{code:'PROJECT_BUSY'}));h.button('Save project settings').props.onClick();await h.settle();assert.match(h.text(),/Another task is still using this project/);
 const writes=h.calls.filter(c=>c.body).length;h.props.language='zh';h.render();assert.equal(h.field('项目与启动器名称').props.value,'Keep my draft');assert.match(h.text(),/其他任务仍在使用这个项目/);assert.match(h.text(),/技术详情/);assert.match(h.text(),/PROJECT_BUSY/);assert.equal(h.calls.filter(c=>c.body).length,writes);
 const detail=nodes(h.tree()).find(n=>n.type==='details'&&text(n).includes('Synthetic operation currently busy'));assert.ok(detail);assert.equal(detail.props.open,undefined);
});
