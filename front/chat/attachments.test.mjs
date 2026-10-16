import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';import{stripTypeScriptTypes}from'node:module';import{transformSync}from'rolldown/utils';
async function adapterHarness(){
 const requests=[];class FileReader{readAsDataURL(){this.result='data:text/plain;base64,c3ludGhldGlj';queueMicrotask(()=>this.onload());}}
 const context=vm.createContext({Map,Error,FileReader,AbortSignal,crypto:{randomUUID:()=> 'c16b6003-802b-4453-afc6-3d2e2fe833b8'},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({attachment:{id:requests[0].body.id,name:'sample.txt',contentType:'text/plain',size:9,kind:'file'}})}}});
 const source=stripTypeScriptTypes(await readFile(new URL('./attachments.ts',import.meta.url),'utf8'));const module=new vm.SourceTextModule(source,{context});await module.link(()=>{throw Error('Unexpected runtime dependency')});await module.evaluate();return{...module.namespace,requests};
}
test('all-file adapter accepts the pinned library wildcard, uploads once and preserves opaque ID at send',async()=>{
 const h=await adapterHarness();assert.equal(h.attachmentAdapter.accept,'*');const states=[];for await(const state of h.attachmentAdapter.add({file:{name:'sample.txt',type:'text/plain',size:9}}))states.push(state);
 assert.equal(states[0].status.type,'running');assert.equal(states.at(-1).status.type,'requires-action');const sent=await h.attachmentAdapter.send(states.at(-1));assert.equal(sent.id,h.requests[0].body.id);assert.equal(sent.content[0].data,'/api/attachments/'+sent.id+'/content');assert.equal(h.requests.length,1);
 await h.attachmentAdapter.remove(states.at(-1));await assert.rejects(h.attachmentAdapter.send(states.at(-1)),/did not finish/);
});
test('oversized attachments report failure before uploading any bytes',async()=>{const h=await adapterHarness(),states=[];for await(const state of h.attachmentAdapter.add({file:{name:'large.bin',type:'',size:21*1024*1024}}))states.push(state);assert.equal(states.at(-1).status.type,'incomplete');assert.match(states.at(-1).status.message,/20 MiB/);assert.equal(h.requests.length,0);});
test('drop and clipboard-file events enqueue originals once while ordinary text paste is untouched',async()=>{
 const files=[],state={attachments:[]};const jsx=(type,props)=>({type,props});const context=vm.createContext({Array,Error,console});
 const mocks={react:{useRef:()=>({current:0}),useState:value=>[value,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx},'@assistant-ui/react':{useAui:()=>({composer:()=>({getState:()=>state,addAttachment:async file=>files.push(file)})}),useAuiState:()=>{},AttachmentPrimitive:{},ComposerPrimitive:{}},'lucide-react':{File:()=>{},LoaderCircle:()=>{},Paperclip:()=>{},X:()=>{}}};
 const source=transformSync('AttachmentControls.tsx',await readFile(new URL('./AttachmentControls.tsx',import.meta.url),'utf8'),{jsx:{runtime:'automatic'}}).code;
 const module=new vm.SourceTextModule(source,{context});await module.link(async spec=>{const mock=mocks[spec]||{};return new vm.SyntheticModule(Object.keys(mock),function(){for(const[k,v]of Object.entries(mock))this.setExport(k,v)},{context})});await module.evaluate();const{props}=module.namespace.AttachmentDropzone({children:null});let prevented=0;const file={name:'drop.txt'},image={name:'clipboard.png'};const event={preventDefault(){prevented++},stopPropagation(){},dataTransfer:{files:[file],types:['Files']}};props.onDrop(event);props.onPasteCapture({...event,clipboardData:{files:[image]}});props.onPasteCapture({...event,clipboardData:{files:[]}});assert.deepEqual(files,[file,image]);assert.equal(prevented,2);
 state.attachments=Array(10).fill({});props.onDrop(event);assert.equal(files.length,2);
});
