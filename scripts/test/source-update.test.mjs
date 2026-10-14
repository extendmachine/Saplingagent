import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {updateSource,runtimePortsBusy} from '../launcher/source-update.mjs';
import net from 'node:net';
const exec=promisify(execFile),project=fileURLToPath(new URL('../../',import.meta.url));
const git=async(root,...args)=>(await exec('git',['-C',root,...args],{env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:path.join(root,'absent-global')},encoding:'utf8'})).stdout.trim();
async function fixture(t){
 const parent=path.join(project,'.cache/source-update-tests');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,"更新 app's "));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),app=path.join(root,'app');await fs.mkdir(source);await git(source,'init','-b','release');await git(source,'config','user.name','Test');await git(source,'config','user.email','test@localhost');
 await fs.writeFile(path.join(source,'.gitignore'),'local-secrets/\n.cache/\n');await fs.writeFile(path.join(source,'feature.txt'),'base\n');await git(source,'add','.');await git(source,'commit','-m','source');
 await git(root,'clone','--single-branch','--branch','release',source,app);await git(app,'remote','rename','origin','upstream');await git(app,'config','user.name','Test');await git(app,'config','user.email','test@localhost');await git(app,'config','saplingagent.storageMode','upstream');
 const before=await git(app,'rev-parse','HEAD');const output=[];const update=options=>updateSource(app,{mode:'upstream',isRunning:async()=>false,output:line=>output.push(line),...options});
 return {root,source,app,before,output,update};
}
async function publish(f,content='upstream\n'){await fs.writeFile(path.join(f.source,'feature.txt'),content);await git(f.source,'commit','-am','new release');return git(f.source,'rev-parse','HEAD');}
test('follow mode actually updates release source without adding other branches or changing credentials',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.app,'local-secrets'));await fs.writeFile(path.join(f.app,'local-secrets/auth.json'),'synthetic-private');const latest=await publish(f);
 const result=await f.update();assert.equal(result.changed,true);assert.equal(await git(f.app,'rev-parse','HEAD'),latest);assert.equal(await fs.readFile(path.join(f.app,'feature.txt'),'utf8'),'upstream\n');assert.equal(await fs.readFile(path.join(f.app,'local-secrets/auth.json'),'utf8'),'synthetic-private');assert.equal(await git(f.app,'branch','--show-current'),'release');assert.equal(await git(f.app,'branch','--format=%(refname:short)'),'release');assert.match(f.output.join('\n'),/Source updated/);
});
test('a current follow install reports source current and keeps local snapshots',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.app,'local-feature.txt'),'customer');await git(f.app,'add','.');await git(f.app,'commit','-m','customer');const head=await git(f.app,'rev-parse','HEAD');const result=await f.update();assert.equal(result.changed,false);assert.equal(result.reason,'current');assert.equal(await git(f.app,'rev-parse','HEAD'),head);assert.match(f.output.join('\n'),/current/);
});
test('divergent compatible customer commits merge and retain both histories',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.app,'local-feature.txt'),'customer');await git(f.app,'add','.');await git(f.app,'commit','-m','customer');const local=await git(f.app,'rev-parse','HEAD'),latest=await publish(f);
 const result=await f.update();assert.equal(result.changed,true);assert.equal((await git(f.app,'rev-list','--parents','-n','1','HEAD')).split(' ').length,3);await git(f.app,'merge-base','--is-ancestor',local,'HEAD');await git(f.app,'merge-base','--is-ancestor',latest,'HEAD');assert.equal(await fs.readFile(path.join(f.app,'local-feature.txt'),'utf8'),'customer');
});
test('uncommitted edits and untracked files stop before overwriting or fetching',async t=>{
 for(const filename of ['feature.txt','customer.txt']){const f=await fixture(t);await publish(f);await fs.writeFile(path.join(f.app,filename),'pending');await assert.rejects(f.update(),/save or commit/);assert.equal(await git(f.app,'rev-parse','HEAD'),f.before);assert.equal(await fs.readFile(path.join(f.app,filename),'utf8'),'pending');assert.equal(await git(f.app,'rev-parse','upstream/release'),f.before);}
});
test('conflicting saved edits are detected without markers/index/working-tree changes',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.app,'feature.txt'),'customer\n');await git(f.app,'commit','-am','customer');const head=await git(f.app,'rev-parse','HEAD');await publish(f);await assert.rejects(f.update(),/merge has conflicts/);assert.equal(await git(f.app,'rev-parse','HEAD'),head);assert.equal(await fs.readFile(path.join(f.app,'feature.txt'),'utf8'),'customer\n');assert.equal(await git(f.app,'status','--porcelain'),'');await assert.rejects(fs.access(path.join(f.app,'.git/MERGE_HEAD')));
});
test('local/own/worktree modes never fetch or change customer branch/history',async t=>{
 const f=await fixture(t);await publish(f);for(const mode of ['local','own','worktree','existing']){const result=await f.update({mode});assert.equal(result.reason,'customer-owned');assert.equal(await git(f.app,'rev-parse','HEAD'),f.before);assert.equal(await git(f.app,'rev-parse','upstream/release'),f.before);}assert.match(f.output.join('\n'),/Only local dependencies/);
});
test('detached history and a different untracked branch remain selected',async t=>{
 const f=await fixture(t);await publish(f);await git(f.app,'switch','--detach',f.before);assert.equal((await f.update()).reason,'selected-version');assert.equal(await git(f.app,'branch','--show-current'),'');await git(f.app,'switch','-c','personal');assert.equal((await f.update()).reason,'selected-version');assert.equal(await git(f.app,'branch','--show-current'),'personal');assert.equal(await git(f.app,'rev-parse','upstream/release'),f.before);
});
test('explicitly configured branch is respected instead of secretly switching to release',async t=>{
 const f=await fixture(t);await git(f.source,'switch','-c','custom');await fs.writeFile(path.join(f.source,'feature.txt'),'custom');await git(f.source,'commit','-am','custom');await git(f.app,'config','branch.release.merge','refs/heads/custom');const result=await f.update();assert.equal(result.changed,true);assert.equal(await git(f.app,'branch','--show-current'),'release');assert.equal(await fs.readFile(path.join(f.app,'feature.txt'),'utf8'),'custom');
});
test('network/fetch failure gives sanitized actionable error and preserves source',async t=>{
 const f=await fixture(t);await git(f.app,'remote','set-url','upstream',path.join(f.root,'missing-private-source'));await assert.rejects(f.update(),e=>/Git fetch failed/.test(e.message)&&!e.message.includes('missing-private-source'));assert.equal(await git(f.app,'rev-parse','HEAD'),f.before);assert.equal(await fs.readFile(path.join(f.app,'feature.txt'),'utf8'),'base\n');
});
test('running app and a concurrent edit pause updates without silently changing files',async t=>{
 const f=await fixture(t);await publish(f);await assert.rejects(f.update({isRunning:async()=>true}),/Stop the running app/);assert.equal(await git(f.app,'rev-parse','upstream/release'),f.before);
 let checks=0;await assert.rejects(f.update({isRunning:async()=>{checks++;if(checks===2)await fs.writeFile(path.join(f.app,'feature.txt'),'concurrent');return false;}}),/state changed/);assert.equal(await fs.readFile(path.join(f.app,'feature.txt'),'utf8'),'concurrent');assert.equal(await git(f.app,'rev-parse','HEAD'),f.before);
});
test('port check detects a live configured listener and ignores closed ports without inference',async t=>{
 const f=await fixture(t);const server=net.createServer(socket=>socket.end());await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));await fs.mkdir(path.join(f.app,'config'));await fs.writeFile(path.join(f.app,'config/runtime.json'),JSON.stringify({frontPort:server.address().port}));assert.equal(await runtimePortsBusy(f.app),true);await fs.writeFile(path.join(f.app,'config/runtime.json'),'{}');assert.equal(await runtimePortsBusy(f.app),false);
});
test('port check also discovers a listener allocated outside configured starting ports', async t => {
 const f=await fixture(t);const server=net.createServer(socket=>socket.end());await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 await fs.mkdir(path.join(f.app,'config'));await fs.writeFile(path.join(f.app,'config/runtime.json'),'{}');
 await fs.mkdir(path.join(f.app,'.runtime'));await fs.writeFile(path.join(f.app,'.runtime/runtime-address.json'),JSON.stringify({ports:{frontPort:server.address().port}}));
 assert.equal(await runtimePortsBusy(f.app),true);
 await fs.writeFile(path.join(f.app,'.runtime/runtime-address.json'),'broken');assert.equal(await runtimePortsBusy(f.app),false);
});
test('a new upstream path never overwrites an ignored customer file',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.app,'.git/info/exclude'),'customer-ignored.txt\n');await fs.writeFile(path.join(f.app,'customer-ignored.txt'),'customer private contents');await fs.writeFile(path.join(f.source,'customer-ignored.txt'),'new source');await git(f.source,'add','.');await git(f.source,'commit','-m','new file');await assert.rejects(f.update(),/could not finish/);assert.equal(await fs.readFile(path.join(f.app,'customer-ignored.txt'),'utf8'),'customer private contents');assert.equal(await git(f.app,'rev-parse','HEAD'),f.before);
});
