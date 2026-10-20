import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {compileLauncher} from '../build.mjs';
const exec=promisify(execFile),source=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const goRelative='.runtime/go1.27.2-darwin-arm64';
const available=process.platform==='darwin'&&await fs.access(path.join(source,goRelative,'go/bin/go')).then(()=>true,()=>false);
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function waitFor(read,description){for(let i=0;i<600;i++){const result=await read().catch(()=>null);if(result)return result;await delay(50);}throw Error('Timed out: '+description);}
async function appAction(pid,action){return exec('/usr/bin/osascript',['-l','JavaScript','-e',`ObjC.import('AppKit');var a=$.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid});${action}`]);}

test('compiled macOS app stays in the Dock, reopens, quits its helper, and keeps the same cluster contract',{skip:!available,timeout:180000},async t=>{
 const base=path.join(source,'.cache/dock-native-tests');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,"项目 user's "));
 let appPID,bundleId; t.after(async()=>{
  // LaunchServices can start the app before its bridge writes the first receipt.
  // Even an assertion/timeout in that interval must clean up this exact fixture.
  if((!appPID||!alive(appPID))&&bundleId){const value=await exec('/usr/bin/osascript',['-l','JavaScript','-e',`ObjC.import('AppKit');var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier(${JSON.stringify(bundleId)});apps.count?String(apps.objectAtIndex(0).processIdentifier):'';`]).catch(()=>null);appPID=Number(value?.stdout.trim())||null;}
  if(appPID&&alive(appPID)){try{process.kill(appPID,'SIGKILL');}catch{}await waitFor(async()=>!alive(appPID),'fixture app exit');}await fs.rm(root,{recursive:true,force:true});
 });
 for(const relative of ['kernel/launcher/native',goRelative])await fs.cp(path.join(source,relative),path.join(root,relative),{recursive:true,mode:constants.COPYFILE_FICLONE});
 for(const name of ['toolchain.json','build.mjs','windows-icon.ps1'])await fs.copyFile(path.join(source,'kernel/launcher',name),path.join(root,'kernel/launcher',name));
 await fs.mkdir(path.join(root,'kernel/config'),{recursive:true});await fs.writeFile(path.join(root,'kernel/config/macos.json'),JSON.stringify({nodeVersion:process.versions.node}));
 const node=path.join(root,`.runtime/node-v${process.versions.node}-darwin-${process.arch}/bin/node`);await fs.mkdir(path.dirname(node),{recursive:true});await fs.copyFile(process.execPath,node);
 await fs.writeFile(path.join(root,'kernel/launcher/entry.mjs'),`import fs from 'node:fs';const root=process.env.SEED_ROOT,args=process.argv.slice(2),action=args[0];const record={action,pid:Number(args[args.indexOf('--dock-pid')+1]),nonce:args[args.indexOf('--dock-nonce')+1]};fs.appendFileSync(root+'/calls.jsonl',JSON.stringify(record)+'\\n');if(action==='--dock-status')console.log(fs.existsSync(root+'/handoff')?'handoff':'ready');else if(action==='--dock-stop'){if(fs.existsSync(root+'/stop-fails')){console.error('Synthetic stop failure');process.exit(7);}fs.writeFileSync(root+'/stopped','yes');console.log('stopped');}else console.log('ready');`);
 const project={name:'Dock Example',projectId:randomUUID()};bundleId='local.saplingagent.p'+project.projectId.replaceAll('-','');const receipt=await compileLauncher(root,project);
 const app=path.join(root,receipt.artifact),helper=path.join(app,'Contents/MacOS/launcher');
 const plist=JSON.parse((await exec('/usr/bin/plutil',['-convert','json','-o','-',path.join(app,'Contents/Info.plist')])).stdout);
 assert.equal(plist.LSUIElement,false);assert.equal(plist.CFBundleExecutable,'applet');assert.equal(plist.OSAAppletStayOpen,true);assert.equal(plist.CFBundleDisplayName,project.name);
 assert.equal(Object.keys(plist).some(k=>k.endsWith('UsageDescription')),false);
 await exec('/usr/bin/codesign',['--verify',app]);await exec(helper,['--verify']);assert.equal((await exec(helper,['--root'])).stdout.trim(),root);
 const calls=async()=> (await fs.readFile(path.join(root,'calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 await exec('/usr/bin/open',[app]);const started=await waitFor(async()=>(await calls()).find(c=>c.action==='--dock-start'),'native startup');appPID=started.pid;assert.ok(alive(appPID));assert.match(started.nonce,/^[a-f0-9-]{36}$/i);
 assert.equal((await appAction(appPID,'String(a.activationPolicy);')).stdout.trim(),'0');
 await exec('/usr/bin/open',[app]);await waitFor(async()=>(await calls()).find(c=>c.action==='--dock-open'),'Dock reopen');
 assert.equal(new Set((await calls()).map(c=>c.pid)).size,1);
 await appAction(appPID,'a.terminate;');await waitFor(async()=>!alive(appPID),'normal Quit');assert.equal(await fs.readFile(path.join(root,'stopped'),'utf8'),'yes');
 await exec('/usr/bin/codesign',['--verify',app]);
 // Explicit handoff exits without sending a backend Stop (configuration owns it).
 await fs.rm(path.join(root,'stopped'));await fs.writeFile(path.join(root,'handoff'),'yes');await exec('/usr/bin/open',[app]);
 const restarted=await waitFor(async()=>{const all=(await calls()).filter(c=>c.action==='--dock-start');return all.length>1?all.at(-1):null;},'handoff startup');appPID=restarted.pid;await waitFor(async()=>!alive(appPID),'configuration handoff');await assert.rejects(fs.access(path.join(root,'stopped')));
 await fs.writeFile(path.join(root,'stop-fails'),'yes');await assert.rejects(exec(helper,['--dock-stop','--dock-pid','123','--dock-nonce',randomUUID()]),error=>error.code===7&&error.stderr.includes('Synthetic stop failure'));
});

test('missing Node Dock bootstrap is cancellable and status/stop never install it',{skip:!available,timeout:120000},async t=>{
 const base=path.join(source,'.cache/dock-native-tests');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'bootstrap-'));let child,childPID;
 t.after(async()=>{if(child&&child.exitCode===null){child.kill('SIGTERM');await waitFor(async()=>child.exitCode!==null||child.signalCode!==null,'helper cleanup');}if(childPID&&alive(childPID))try{process.kill(childPID,'SIGKILL');}catch{}await fs.rm(root,{recursive:true,force:true});});
 const build=path.join(root,'.runtime/build');await fs.mkdir(build,{recursive:true});for(const name of await fs.readdir(path.join(source,'kernel/launcher/native')))if(name.endsWith('.go'))await fs.copyFile(path.join(source,'kernel/launcher/native',name),path.join(build,name));
 const helper=path.join(root,'Bootstrap.app/Contents/MacOS/launcher');await fs.mkdir(path.dirname(helper),{recursive:true});const {buildEnv,prepareBuildStorage}=await import('../build.mjs');await prepareBuildStorage(root);
 await exec(path.join(source,goRelative,'go/bin/go'),['build','-trimpath','-buildvcs=false','-o',helper,'.'],{cwd:build,env:buildEnv(root)});
 await fs.mkdir(path.join(root,'kernel/config'),{recursive:true});await fs.writeFile(path.join(root,'kernel/config/macos.json'),JSON.stringify({nodeVersion:'0.0.0'}));await fs.mkdir(path.join(root,'kernel/scripts/macos'),{recursive:true});
 await fs.writeFile(path.join(root,'kernel/scripts/macos/bootstrap.sh'),`#!/bin/bash\nprintf '%s' "$$" > "$SEED_ROOT/bootstrap.pid"\ntrap 'printf stopped > "$SEED_ROOT/bootstrap-stopped"; exit 0' TERM INT\nwhile true; do sleep 1; done\n`);
 assert.equal((await exec(helper,['--dock-status'])).stdout.trim(),'bootstrapping');assert.equal((await exec(helper,['--dock-stop'])).stdout.trim(),'stopped');await assert.rejects(fs.access(path.join(root,'bootstrap.pid')));
 child=spawn(helper,['--dock-start','--dock-pid',String(process.pid),'--dock-nonce',randomUUID()],{stdio:'ignore'});childPID=Number(await waitFor(()=>fs.readFile(path.join(root,'bootstrap.pid'),'utf8'),'bootstrap started'));
 child.kill('SIGTERM');await waitFor(async()=>child.exitCode!==null||child.signalCode!==null,'cancelled native helper');await waitFor(async()=>!alive(childPID),'bootstrap child exit');assert.equal(await fs.readFile(path.join(root,'bootstrap-stopped'),'utf8'),'stopped');
 await fs.writeFile(path.join(root,'.runtime/runtime-address.json'),JSON.stringify({root,pid:process.pid}));await assert.rejects(exec(helper,['--dock-stop']),error=>error.code===1&&error.stderr.includes('may still be running'));
});
