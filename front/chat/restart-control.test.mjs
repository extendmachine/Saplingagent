import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformSync } from 'rolldown/utils';

async function control() {
  const requests = [], effects = [], slots = [];
  let cursor = 0, rendered, reloads = 0, poll;
  const status = { instanceId: 'owned-manager', generation: 1, phase: 'ready', busy: false, canRestart: true, jobId: null, scope: 'all', error: null };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=initial; return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}]; },
    useRef(initial) { const i=cursor++; return slots[i] ||= {current:initial}; },
    useEffect(effect) { const i=cursor++; if (!(i in slots)) {slots[i]=true;effects.push(effect);} },
  };
  const context=vm.createContext({Error,JSON,AbortSignal,Event,CustomEvent,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},window:{dispatchEvent(){},setInterval:callback=>{poll=callback;return 1;},clearInterval(){},location:{reload(){reloads++;}}},fetch:async(url,options)=>{
    requests.push({url,...options});return {ok:true,json:async()=>url.endsWith('/restart')?{jobId:'full-job',status:{...status,busy:true,phase:'preparing',jobId:'full-job'}}:{...status}};
  }});
  const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{AlertTriangle:'svg',LoaderCircle:'svg',RotateCw:'svg'}};
  async function load(name) {
    if (name in mocks) { const mock=mocks[name]; return new vm.SyntheticModule(Object.keys(mock),function(){for(const[k,v]of Object.entries(mock))this.setExport(k,v)},{context}); }
    const file=name==='control'?'../features/runtime-control/RestartServices.tsx':'../features/runtime-control/restart-reload.ts';
    const code=transformSync(file,await readFile(new URL(file,import.meta.url),'utf8'),{jsx:{runtime:'automatic'}}).code;
    const module=new vm.SourceTextModule(code,{context});await module.link(spec=>spec.endsWith('.css')?new vm.SyntheticModule([],function(){},{context}):load(spec));return module;
  }
  const module=await load('control');await module.evaluate();
  const render=()=>{cursor=0;rendered=module.namespace.RestartServices();return rendered;};render();for(const effect of effects)effect();for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));
  return {render,requests,status,async poll(){poll();for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));},get reloads(){return reloads}};
}
function nodes(node) { if (!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
test('sole restart button posts full scope and refreshes only after a ready replacement generation',async()=>{
 const h=await control();let tree=nodes(h.render());const buttons=tree.filter(n=>n.type==='button');assert.equal(buttons.length,1);assert.equal(buttons[0].props['aria-label'],'Restart app');assert.equal(tree.filter(n=>['details','summary','a'].includes(n.type)).length,0);
 await buttons[0].props.onClick();for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));
 const posts=h.requests.filter(v=>v.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].url,'/api/runtime/restart');assert.deepEqual(JSON.parse(posts[0].body),{scope:'all'});assert.equal(h.reloads,0);
 h.status.generation=2;h.status.phase='starting';h.status.busy=true;await h.poll();assert.equal(h.reloads,0);
 h.status.phase='ready';h.status.busy=false;await h.poll();assert.equal(h.reloads,1);
});
