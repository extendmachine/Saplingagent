import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {compileLauncher} from '../build.mjs';
import {saveProject} from '../manager.mjs';
import {closeDockForMaintenance} from '../dock.mjs';
const exec=promisify(execFile),source=fileURLToPath(new URL('../../../',import.meta.url));
const goRelative='.runtime/go1.27.2-darwin-arm64';
const available=process.platform==='darwin'&&await fs.access(path.join(source,goRelative,'go/bin/go')).then(()=>true,()=>false);
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
async function waitFor(readValue,label){for(let i=0;i<300;i++){const value=await readValue().catch(()=>null);if(value)return value;await delay(100);}throw Error('Timed out: '+label);}
const appAction=(pid,action)=>exec('/usr/bin/osascript',['-l','JavaScript','-e',`ObjC.import('AppKit');var a=$.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid});${action}`]);

// Native app + unmodified Node bridge against isolated HTTP protocol fixtures.
// These services use no account, model, user data or fixed ports.
test('actual Dock Quit stops its runtime only, and maintenance releases the app before rebuild',{skip:!available,timeout:180000},async t=>{
 const base=path.join(source,'.cache/dock-integration-tests');await fs.mkdir(base,{recursive:true});
 const root=await fs.mkdtemp(path.join(base,'项目 Dock ')),other=await fs.mkdtemp(path.join(base,'independent-'));let app,unrelated,runtimePID;
 t.after(async()=>{
  if(t.passed===false){for(const relative of ['.runtime/native-app-state.json','.runtime/native-app-request.json'])console.error(relative,await fs.readFile(path.join(root,relative),'utf8').catch(()=>''));for(const name of await fs.readdir(path.join(root,'logs/project-launcher')).catch(()=>[]))console.error(await fs.readFile(path.join(root,'logs/project-launcher',name),'utf8'));}
  for(const child of [app,unrelated])if(child?.pid&&alive(child.pid)){try{child.kill('SIGKILL');}catch{}await waitFor(async()=>!alive(child.pid),'fixture process exit');}
  if(runtimePID&&alive(runtimePID)){try{process.kill(runtimePID,'SIGTERM');}catch{}await waitFor(async()=>!alive(runtimePID),'fixture runtime cleanup');}
  await fs.rm(root,{recursive:true,force:true});await fs.rm(other,{recursive:true,force:true});
 });
 await fs.cp(path.join(source,'kernel'),path.join(root,'kernel'),{recursive:true,mode:constants.COPYFILE_FICLONE,filter:p=>!p.split(path.sep).some(v=>['node_modules','.cache','dist','dist-setup','test','ai-tasks'].includes(v))});
 await fs.cp(path.join(source,goRelative),path.join(root,goRelative),{recursive:true,mode:constants.COPYFILE_FICLONE});
 // Only the fixture dependency set is empty; production preparation runs unchanged.
 await fs.rm(path.join(root,'kernel/package.json'));
 const settings=await read(path.join(root,'kernel/config/macos.json'));
 const localNode=path.join(root,`.runtime/node-v${settings.nodeVersion}-darwin-${process.arch}/bin/node`);await fs.mkdir(path.dirname(localNode),{recursive:true});await fs.copyFile(process.execPath,localNode);
 for(const [relative,value]of [['.runtime/codex/node_modules/@openai/codex/package.json',JSON.stringify({version:settings.codexVersion})],['.runtime/codex/node_modules/.bin/codex','fixture-only'],['local-secrets/runtime/service-token','fixture-token']]){const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value);}
 const dev=`import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import {randomUUID} from 'node:crypto';
 const root=process.cwd(),instanceId=randomUUID();await fs.mkdir(path.join(root,'.runtime'),{recursive:true});let state;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/runtime/status'){res.end(JSON.stringify(state));return;}if(req.url==='/api/runtime/stop'&&req.headers.authorization==='Bearer fixture-token'){res.once('finish',()=>{server.close();server.closeAllConnections();});res.end(JSON.stringify({stopped:true}));return;}res.statusCode=404;res.end('{}');});
 server.listen(0,'127.0.0.1',async()=>{const port=server.address().port;state={phase:'ready',applicationRoot:root,instanceId,services:[]};await fs.writeFile(path.join(root,'.runtime/runtime-address.json'),JSON.stringify({root,instanceId,pid:process.pid,ports:{runtimeManagerPort:port},url:'http://127.0.0.1:'+port}));});process.on('SIGTERM',()=>{server.close();server.closeAllConnections();});`;
 await fs.mkdir(path.join(root,'scripts'));await fs.writeFile(path.join(root,'scripts/dev.mjs'),dev);await fs.writeFile(path.join(other,'dev.mjs'),dev);
 unrelated=spawn(process.execPath,[path.join(other,'dev.mjs')],{cwd:other,stdio:'ignore'});await waitFor(()=>read(path.join(other,'.runtime/runtime-address.json')),'unrelated runtime');
 const project=await saveProject(root,{name:'Dock integration '+randomUUID().slice(0,8)}),receipt=await compileLauncher(root,project);
 const bundle=path.join(root,receipt.artifact),executable=path.join(bundle,'Contents/MacOS/applet');
 const launch=async()=>{app=spawn(executable,[],{cwd:root,env:{...process.env,SAPLING_NO_OPEN:'1'},stdio:'ignore'});await waitFor(async()=>{const value=await read(path.join(root,'.runtime/native-app-state.json'));const owner=await read(path.join(root,'.runtime/native-app.json'));return owner.pid===app.pid&&value.phase==='ready';},'Dock bridge ready');return app.pid;};
 const first=await launch();runtimePID=(await read(path.join(root,'.runtime/runtime-address.json'))).pid;
 assert.equal((await appAction(first,'String(a.activationPolicy);')).stdout.trim(),'0');assert.ok(alive(runtimePID));
 await exec('/usr/bin/open',[bundle]);await delay(750);assert.equal((await read(path.join(root,'.runtime/native-app.json'))).pid,first);assert.equal((await read(path.join(root,'.runtime/runtime-address.json'))).pid,runtimePID);
 await appAction(first,'a.terminate;');await waitFor(async()=>!alive(first)&&!alive(runtimePID),'normal Quit and owned runtime exit');assert.ok(alive(unrelated.pid));
 // A new app owner can reclaim the closed receipt and start its runtime again.
 const second=await launch();assert.notEqual(second,first);runtimePID=(await read(path.join(root,'.runtime/runtime-address.json'))).pid;
 await closeDockForMaintenance(root);await waitFor(async()=>!alive(second),'maintenance Dock exit');assert.ok(alive(runtimePID));assert.ok(alive(unrelated.pid));
 await assert.rejects(fs.access(path.join(root,'.runtime/native-app.json')));
 const rebuilt=await compileLauncher(root,project);assert.equal(rebuilt.artifact,receipt.artifact);await exec('/usr/bin/codesign',['--verify',bundle]);
 const third=await launch();await appAction(third,'a.terminate;');await waitFor(async()=>!alive(third)&&!alive(runtimePID),'rebuilt app Quit');assert.ok(alive(unrelated.pid));
});
