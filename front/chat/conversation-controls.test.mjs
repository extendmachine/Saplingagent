import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformSync } from 'rolldown/utils';

const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
async function fixture() {
  const slots=[], effects=[];let cursor=0,tree,scheduled=false;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;render()})}};
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;schedule()}]},useRef(initial){const i=cursor++;return slots[i]||=( {current:initial})},useEffect(effect,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=effect()})}}};
  const composer={text:'A draft',attachments:[{id:'a-file',name:'a.txt',type:'file',status:{type:'complete'},content:[{type:'file',data:'/api/attachments/a-file/content'}]}],getState(){return{text:this.text,attachments:this.attachments,submission:this.submission}},setText(text){this.text=text},async reset(){this.text='';this.attachments=[]},async addAttachment(a){this.attachments.push({...a,status:{type:'complete'}})}};
  const calls=[],agent={activeSessionId:'a',sessions:[{id:'a',title:'Alpha'},{id:'b',title:'Beta'}],isLoading:false,isRunning:false,sessionsLoading:false,sessionsError:'',async refreshSessions(){calls.push('list')},switchSession(id){calls.push(id);this.activeSessionId=id;return true},startNew(){calls.push('new');this.activeSessionId=null;return true},async renameSession(id,title){calls.push({id,title});return title}};
  const jsx=(type,props)=>({type,props}),context=vm.createContext({Map,Error,Promise});
  const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':Object.fromEntries(['LoaderCircle','Pencil','Plus','RotateCcw','Save','X'].map(name=>[name,name]))};
  async function load(name){if(mocks[name]){const mock=mocks[name];return new vm.SyntheticModule(Object.keys(mock),function(){for(const[k,v]of Object.entries(mock))this.setExport(k,v)},{context})}const file=name==='controls'?'ConversationControls.tsx':'conversation-drafts.ts';const mod=new vm.SourceTextModule(transformSync(file,await readFile(new URL(file,import.meta.url),'utf8'),{jsx:{runtime:'automatic'}}).code,{context});await mod.link(load);return mod;}
  const mod=await load('controls');await mod.evaluate();
  function render(){cursor=0;tree=mod.namespace.ConversationControls({agent,composer,onChanging(){}});while(effects.length)effects.shift()();return tree}
  render();const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))};
  return{agent,composer,calls,render,settle,node(label){return nodes(tree).find(node=>node.props?.['aria-label']===label)},button(text){return nodes(tree).find(node=>node.type==='button'&&[node.props.children].flat().includes(text))}};
}
test('switching and returning restores complete conversation drafts without cross-session attachments',async()=>{
 const h=await fixture();h.node('Switch conversation').props.onChange({target:{value:'b'}});await h.settle();assert.equal(h.agent.activeSessionId,'b');assert.equal(h.composer.text,'');assert.equal(h.composer.attachments.length,0);
 h.composer.text='B draft';h.node('Switch conversation').props.onChange({target:{value:'a'}});await h.settle();assert.equal(h.composer.text,'A draft');assert.equal(h.composer.attachments[0].id,'a-file');
 h.node('Switch conversation').props.onChange({target:{value:'b'}});await h.settle();assert.equal(h.composer.text,'B draft');assert.equal(h.composer.attachments.length,0);assert.deepEqual(h.calls,['b','a','b']);
});
test('late rename result cannot close another conversation title editor, and new clears editing',async()=>{
 const h=await fixture();let resolve;h.agent.renameSession=()=>new Promise(done=>{resolve=done});h.node('Rename conversation').props.onClick();await h.settle();h.node('Conversation title').props.onChange({target:{value:'Edited A'}});await h.settle();h.node('Save conversation title').props.onClick();await h.settle();
 h.node('Switch conversation').props.onChange({target:{value:'b'}});await h.settle();h.node('Rename conversation').props.onClick();await h.settle();assert.equal(h.node('Conversation title').props.value,'Beta');resolve('Edited A');await h.settle();assert.equal(h.node('Conversation title').props.value,'Beta');
 h.button('New conversation').props.onClick();await h.settle();assert.equal(h.agent.activeSessionId,null);assert.equal(h.node('Conversation title'),undefined);
});


test('refused switch preserves source composer and target draft during a runtime restart',async()=>{
 const h=await fixture();h.node('Switch conversation').props.onChange({target:{value:'b'}});await h.settle();h.composer.text='B only draft';h.composer.attachments=[{id:'b-file',name:'b.txt',type:'file',status:{type:'complete'},content:[{type:'file',data:'/api/attachments/b-file/content'}]}];
 h.node('Switch conversation').props.onChange({target:{value:'a'}});await h.settle();const original=h.agent.switchSession;h.agent.switchSession=()=>false;h.node('Switch conversation').props.onChange({target:{value:'b'}});await h.settle();
 assert.equal(h.agent.activeSessionId,'a');assert.equal(h.composer.text,'A draft');assert.equal(h.composer.attachments[0].id,'a-file');
 h.agent.switchSession=original;h.node('Switch conversation').props.onChange({target:{value:'b'}});await h.settle();assert.equal(h.composer.text,'B only draft');assert.equal(h.composer.attachments[0].id,'b-file');
});


test('switch cannot discard an attachment submission still preparing to send',async()=>{
 const h=await fixture();h.composer.submission={text:'pending sent text',attachments:[{id:'pending-upload'}]};
 h.node('Switch conversation').props.onChange({target:{value:'b'}});await h.settle();
 assert.equal(h.agent.activeSessionId,'a');assert.equal(h.calls.length,0);assert.equal(h.composer.submission.text,'pending sent text');assert.equal(h.composer.text,'A draft');assert.equal(h.composer.attachments[0].id,'a-file');
});
