import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAgentServer } from '../server.mjs';
const exec = promisify(execFile);
async function fixture(t, { unborn = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saplingagent-git-http-'));
  const git = (...args) => exec('git', ['-C', root, ...args]);
  await git('init', '-b', 'main'); await git('config', 'user.name', 'Test'); await git('config', 'user.email', 'test@example.invalid');
  await fs.mkdir(path.join(root, 'config')); await fs.mkdir(path.join(root, 'local-secrets/runtime'), { recursive: true });
  await fs.writeFile(path.join(root, 'config/runtime.json'), JSON.stringify({ agentPort: 4310, frontPort: 5173, workspacePort: 4311 }));
  await fs.writeFile(path.join(root, 'local-secrets/runtime/service-token'), 'SYNTHETIC_TEST_TOKEN');
  await fs.writeFile(path.join(root, '.gitignore'), 'local-secrets/\nlogs/\n');
  await fs.writeFile(path.join(root, 'note.txt'), 'original');
  let initial;
  if (!unborn) {
    await git('add', '--all'); await git('commit', '-m', 'Initial');
    initial = (await git('rev-parse', 'HEAD')).stdout.trim();
    await git('branch', 'release');
    await fs.writeFile(path.join(root, 'note.txt'), 'new'); await git('add', 'note.txt'); await git('commit', '-m', 'Second');
  }
  const server = await createAgentServer({ root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await server.shutdown(); await fs.rm(root, { recursive: true, force: true }); });
  const request = (route, data, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: data === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer SYNTHETIC_TEST_TOKEN', 'Content-Type': 'application/json', ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { root, server, git, initial, request };
}

test('Git HTTP names, checks out, returns to main and retains existing authentication rules', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/git?limit=1')).status, 200);
  assert.equal((await f.request('/api/git?limit=bad')).status, 400);
  assert.equal((await f.request('/api/git/label', { sha: f.initial, name: 'Baseline' }, { Authorization: '' })).status, 401);
  assert.equal((await f.request('/api/git/label', { sha: f.initial, name: 'Baseline' }, { Origin: 'https://example.invalid' })).status, 403);
  const named = await f.request('/api/git/label', { sha: f.initial, name: 'Baseline' });
  assert.equal(named.status, 200); assert.ok((await named.json()).git.recentCommits.some(c => c.displayName === 'Baseline'));
  const tip = (await f.git('rev-parse', 'main')).stdout.trim();
  const checked = await f.request('/api/git/checkout', { sha: f.initial });
  assert.equal(checked.status, 200); assert.equal((await checked.json()).git.detached, true);
  assert.equal((await f.git('rev-parse', 'main')).stdout.trim(), tip);
  const returned = await f.request('/api/git/switch', { branch: 'main' });
  assert.equal(returned.status, 200); assert.equal((await returned.json()).git.branch, 'main');
});
test('managed frontend origin works on an allocated port while the old origin remains rejected', async t => {
  const previous = process.env.SEED_FRONT_PORT;
  process.env.SEED_FRONT_PORT = '55173';
  let f;
  try { f = await fixture(t); }
  finally { if (previous === undefined) delete process.env.SEED_FRONT_PORT; else process.env.SEED_FRONT_PORT = previous; }
  const response = await f.request('/api/git/label', { sha: f.initial, name: 'Shifted origin' }, { Origin: 'http://127.0.0.1:55173', Authorization: '' });
  assert.equal(response.status, 200);
  assert.equal((await f.request('/api/git/label', { sha: f.initial, name: 'Old origin' }, { Origin: 'http://127.0.0.1:5173', Authorization: '' })).status, 403);
});

test('Git reservation blocks a concurrent mutation and new chat before body parsing completes', async t => {
  const f = await fixture(t);
  const body = JSON.stringify({ sha: f.initial, name: 'Reserved' });
  let completed;
  const done = new Promise(resolve => { completed = resolve; });
  const hold = http.request({ hostname: '127.0.0.1', port: f.server.address().port, path: '/api/git/label', method: 'POST', headers: { Authorization: 'Bearer SYNTHETIC_TEST_TOKEN', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => { res.resume(); res.on('end', () => completed(res.statusCode)); });
  hold.on('error', () => completed(500)); t.after(() => hold.destroy()); hold.write(body.slice(0, 1));
  let response;
  for (let i = 0; i < 30; i++) { response = await f.request('/api/git/commit', {}); if (response.status === 409) break; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'GIT_SWITCH_BUSY');
  const chat = await f.request('/api/chat', { text: 'never sent', requestId: 'blocked' });
  assert.equal(chat.status, 409); assert.equal((await chat.json()).error.code, 'GIT_SWITCH_BUSY');
  hold.end(body.slice(1)); assert.equal(await done, 200);
  assert.equal((await f.request('/api/git/commit', {})).status, 200);
});

test('runtime prepare requires internal token even for browser origins and refuses an unfinished Git body', async t => {
  const f = await fixture(t);
  const headers = { Origin:'http://127.0.0.1:5173', Authorization:'' };
  assert.equal((await f.request('/internal/runtime/prepare',{},headers)).status,401);
  const text=JSON.stringify({sha:f.initial,name:'held'});
  let finish; const done=new Promise(resolve=>{finish=resolve});
  const hold=http.request({host:'127.0.0.1',port:f.server.address().port,path:'/api/git/label',method:'POST',headers:{Authorization:'Bearer SYNTHETIC_TEST_TOKEN','Content-Length':Buffer.byteLength(text)}},res=>{res.resume();res.on('end',()=>finish(res.statusCode))});hold.on('error',()=>finish(500));t.after(()=>hold.destroy());hold.write(text.slice(0,1));
  let response;for(let i=0;i<30;i++){response=await f.request('/internal/runtime/prepare',{});if(response.status===409)break;await f.request('/internal/runtime/release',{});await new Promise(resolve=>setTimeout(resolve,10))}
  assert.equal(response.status,409);hold.end(text.slice(1));assert.equal(await done,200);
  assert.equal((await f.request('/internal/runtime/prepare',{})).status,200);
  assert.equal((await f.request('/api/git/label',{sha:f.initial,name:'blocked'})).status,503);
  assert.equal((await f.request('/internal/runtime/release',{})).status,200);
});


test('Git HTTP returns empty main without inference/history and first explicit save creates one source version', async t => {
  const f=await fixture(t,{unborn:true});
  for (let i=0;i<2;i++) {
    const response=await f.request('/api/git'); assert.equal(response.status,200);
    const {git}=await response.json(); assert.equal(git.head,null); assert.equal(git.unborn,true); assert.equal(git.branch,'main');
    assert.deepEqual(git.recentCommits,[]); assert.deepEqual(git.branches.map(b=>b.name),['main']);
  }
  await assert.rejects(f.git('rev-parse','--verify','HEAD'));
  const save=await f.request('/api/git/commit',{}); assert.equal(save.status,200);
  const {git}=await save.json(); assert.equal(git.unborn,false); assert.equal(git.recentCommits.length,1); assert.ok(git.head.sha);
  assert.equal((await f.git('remote')).stdout.trim(),'');
});
