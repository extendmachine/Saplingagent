import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectLauncher} from '../manager.mjs';
import {runtimeStatusURL,statusPageOpener} from '../status.mjs';

test('activation opens the dynamically selected gateway before existing startup is ready', async () => {
  const launcher = new ProjectLauncher('/synthetic/project');
  let poll = 0;
  launcher.runtime = async () => ({phase: ++poll < 3 ? 'starting' : 'ready', url: 'http://127.0.0.1:58123/', instanceId: 'owned'});
  const opened = [], reports = [];
  const onRuntime = statusPageOpener(async url => opened.push({url, poll}), {report: message => reports.push(message)});
  const result = await launcher.startConfiguredProject({onRuntime});
  assert.equal(result.phase, 'ready');
  assert.deepEqual(opened, [{url:'http://127.0.0.1:58123/__saplingagent/runtime', poll:1}]);
  assert.equal(reports.length, 1);
  assert.equal(launcher.appChild, undefined, 'reopening a starting runtime must not spawn a duplicate');
});

test('an existing ready runtime opens status without preparing another cluster', async () => {
  const launcher = new ProjectLauncher('/synthetic/project');
  const state = {phase:'ready',url:'http://localhost:58124/',instanceId:'owned'};
  launcher.runtime = async () => state;
  const seen=[];
  assert.equal(await launcher.startConfiguredProject({onRuntime:statusPageOpener(async url => seen.push(url), {report:()=>{}})}),state);
  assert.deepEqual(seen,['http://localhost:58124/__saplingagent/runtime']);
  assert.equal(launcher.appChild,undefined);
});

test('headless activation reports its status address without opening a browser', async () => {
  const reports=[];
  await statusPageOpener(()=>assert.fail('browser must not open'),{noOpen:true,report:message=>reports.push(message)})({phase:'starting',url:'http://127.0.0.1:58125/'});
  assert.match(reports[0],/58125\/__saplingagent\/runtime/);
});

test('browser refusal leaves the running project available with a retry address', async () => {
  const launcher = new ProjectLauncher('/synthetic/project');
  launcher.runtime = async () => ({phase:'ready',url:'http://127.0.0.1:58126/'});
  const reports=[];
  const result=await launcher.startConfiguredProject({onRuntime:statusPageOpener(async()=>{throw Error('synthetic browser refusal');},{report:message=>reports.push(message)})});
  assert.equal(result.phase,'ready');
  assert.match(reports.join('\n'),/58126\/__saplingagent\/runtime/);
  assert.match(reports.join('\n'),/Could not open the browser/);
});

test('failed startup stays failed after exposing its status page', async () => {
  const launcher = new ProjectLauncher('/synthetic/project');
  launcher.runtime = async()=>({phase:'failed',url:'http://127.0.0.1:58127/',error:{message:'synthetic startup failure'}});
  const opened=[];
  await assert.rejects(launcher.startConfiguredProject({onRuntime:statusPageOpener(async url=>opened.push(url),{report:()=>{}})}),{code:'APP_START_FAILED'});
  assert.deepEqual(opened,['http://127.0.0.1:58127/__saplingagent/runtime']);
});

test('only a local runtime is eligible for a status URL', () => {
  for(const url of ['https://127.0.0.1:58123/','http://remote.invalid:58123/','http://secret@127.0.0.1:58123/'])
    assert.throws(()=>runtimeStatusURL({phase:'ready',url}));
  assert.equal(runtimeStatusURL({phase:'stopped',url:'http://127.0.0.1:58123/'}),null);
});
