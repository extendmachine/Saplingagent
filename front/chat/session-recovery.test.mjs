import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Execute the shipped hook/API/SSE modules with synthetic transport and hook
// scheduling. This is a state/transport regression harness, not React DOM QA.
const KEY = 'seedagent.active-session.v1';
const missing = () => json({ error: { code: 'NOT_FOUND', message: 'Session does not exist' } }, 404);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const message = (id, text, role = 'user') => ({ id, text, role, requestId: id });
const session = (id, messages = [], running = false) => ({ id, messages, running, pendingApprovals: [] });
const sse = (id, messages) => new Response([
  { type: 'session', sessionId: id },
  { type: 'snapshot', session: session(id, messages) },
  { type: 'done', status: 'completed' },
].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream', 'X-Session-Id': id } });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

async function harness({ savedId = null, route, engineCatalog = null, runtimeStatus = null, list = () => json({ sessions: [] }) }) {
  const storage = new Map(savedId ? [[KEY, savedId]] : []);
  const requests = [], slots = [], effects = [], timers = new Map();
  let cursor = 0, nextTimer = 0, rendered, scheduled = false, unmounted = false;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  function schedule() {
    if (scheduled || unmounted) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!unmounted) render(); });
  }
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; schedule(); }
      }];
    },
    useRef(initial) { const index = cursor++; slots[index] ||= { current: initial }; return slots[index]; },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index]; slots[index] = { deps, effect };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const events = new EventTarget();
  const context = vm.createContext({
    window: events,
    ...react, Error, DOMException, AbortController, AbortSignal, Response, ReadableStream, TextDecoder, TextEncoder,
    crypto: { randomUUID: () => `fixture-request-${requests.filter(request => request.url === '/api/chat').length + 1}` },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay, interval: true }); return id; },
    clearInterval: id => timers.delete(id),
    fetch: async (url, options = {}) => {
      const request = { url, ...options, input: options.body ? JSON.parse(options.body) : undefined };
      requests.push(request);
      if (url === '/api/status') return json(runtimeStatus || { ready: true, authenticated: true, model: 'fixture-model' });
      if (url === '/api/engines') return engineCatalog ? typeof engineCatalog === 'function' ? engineCatalog() : json(engineCatalog) : json({ defaultEngine: 'codex', engines: [{ id: 'codex', label: 'Codex', ready: true, authenticated: true, model: 'fixture-model' }] });
      if (url === '/api/sessions') return list(request);
      const response = await route(request);
      if (!response) throw new Error(`Unhandled synthetic request: ${url}`);
      return response;
    },
  });
  const reactModule = new vm.SyntheticModule(Object.keys(react), function () { for (const [key, value] of Object.entries(react)) this.setExport(key, value); }, { context });
  const modules = new Map();
  async function load(name) {
    if (name === 'react') return reactModule;
    if (modules.has(name)) return modules.get(name);
    const source = await readFile(new URL(`${name}.ts`, import.meta.url), 'utf8');
    const module = new vm.SourceTextModule(stripTypeScriptTypes(source), { context, identifier: name });
    modules.set(name, module);
    await module.link(specifier => load(specifier === 'react' ? specifier : specifier.replace(/^\.\//, '')));
    return module;
  }
  const module = await load('useSeedRuntime'); await module.evaluate();
  function render() { cursor = 0; rendered = module.namespace.useSeedRuntime(); while (effects.length) effects.shift()(); }
  async function settle() { for (let index = 0; index < 12; index++) await new Promise(resolve => setImmediate(resolve)); }
  render(); await settle();
  return {
    get current() { return rendered; }, requests, storage, settle,
    runtime(detail) { const event = new Event('saplingagent:runtime'); event.detail = detail; events.dispatchEvent(event); },
    async send(text = 'synthetic request') { await rendered.onNew({ content: [{ type: 'text', text }] }); await settle(); },
    tick(delay) { for (const [id, timer] of [...timers]) if (timer.delay <= delay) { if (!timer.interval) timers.delete(id); timer.callback(); } },
    restartEffects() { for (const slot of slots) if (slot?.effect) { slot.cleanup?.(); slot.cleanup = slot.effect(); } },
    close() { unmounted = true; for (const slot of slots) slot?.cleanup?.(); timers.clear(); },
  };
}

test('stale startup ID is detached without a POST; the next user send creates a new session', async t => {
  const h = await harness({ savedId: 'obsolete', route: request => {
    if (request.url === '/api/sessions/obsolete') return missing();
    if (request.url === '/api/chat') return sse('fresh', [message(request.input.requestId, request.input.text)]);
    if (request.url === '/api/sessions/fresh') return json({ session: session('fresh', [message('fixture-request-1', 'synthetic request')]) });
  } }); t.after(() => h.close());
  assert.equal(h.storage.get(KEY), undefined);
  assert.equal(h.requests.filter(request => request.url === '/api/chat').length, 0);
  await h.send();
  const posts = h.requests.filter(request => request.url === '/api/chat');
  assert.equal(posts.length, 1); assert.equal(posts[0].input.sessionId, undefined);
  assert.equal(h.storage.get(KEY), 'fresh'); assert.equal(h.current.messages.filter(item => item.role === 'user').length, 1);
});

test('POST missing session preserves user input and requestId for explicit retry only', async t => {
  let reads = 0, posts = 0, first;
  const original = message('prior-user', 'prior synthetic input');
  const h = await harness({ savedId: 'obsolete', route: request => {
    if (request.url === '/api/sessions/obsolete') return ++reads === 1 ? json({ session: session('obsolete', [original]) }) : missing();
    if (request.url === '/api/chat') {
      if (++posts === 1) { first = request.input; return missing(); }
      return sse('fresh', [message(request.input.requestId, request.input.text)]);
    }
    if (request.url === '/api/sessions/fresh') return json({ session: session('fresh', [message(first.requestId, first.text)]) });
  } }); t.after(() => h.close());
  await h.send('retained synthetic input');
  assert.equal(posts, 1); assert.equal(h.storage.get(KEY), undefined);
  assert.equal(h.current.retryable, true); assert.equal(h.current.isRunning, false);
  assert.equal(h.current.messages.length, 2); assert.equal(h.current.messages.at(-1).text, first.text);
  await h.current.retry(); await h.settle();
  const retried = h.requests.filter(request => request.url === '/api/chat')[1].input;
  assert.equal(posts, 2); assert.equal(retried.sessionId, undefined);
  assert.equal(retried.requestId, first.requestId); assert.equal(retried.text, first.text);
  assert.equal(h.current.messages.filter(item => item.id === first.requestId).length, 1);
});

test('recovery-confirmed missing session after transport failure permits an explicit unbound retry', async t => {
  let reads = 0;
  const h = await harness({ savedId: 'obsolete', route: request => {
    if (request.url === '/api/sessions/obsolete') return ++reads === 1 ? json({ session: session('obsolete') }) : missing();
    if (request.url === '/api/chat') throw new TypeError('synthetic offline');
  } }); t.after(() => h.close());
  await h.send();
  assert.equal(h.storage.get(KEY), undefined); assert.equal(h.current.retryable, true);
  assert.match(h.current.error, /[Ss]ession.*does not exist/);
  assert.equal(h.current.messages.length, 1); assert.equal(h.requests.filter(request => request.url === '/api/chat').length, 1);
});

test('non-session failures retain the saved ID and do not silently create a session', async t => {
  const failures = [
    () => json({ error: { code: 'NOT_FOUND', message: 'Endpoint does not exist' } }, 404),
    () => json({ error: { code: 'NOT_FOUND', message: 'Endpoint does not exist' } }, 404),
    () => new Response('<h1>missing route</h1>', { status: 404 }),
    () => json({ error: { code: 'NOT_FOUND', message: 'Session does not exist' } }, 500),
    () => json({ error: { code: 'NOT_FOUND', message: 'Session does not exist' } }, 503),
    () => json({ error: { code: 'UNAUTHORIZED', message: 'authentication required' } }, 401),
    () => { throw new TypeError('synthetic offline'); },
  ];
  for (const failure of failures) {
    const h = await harness({ savedId: 'retained', route: request => {
      if (request.url === '/api/sessions/retained') return failure();
      if (request.url === '/api/chat') return json({ error: { code: 'AGENT_NOT_READY', message: 'synthetic unavailable' } }, 503);
    } });
    t.after(() => h.close());
    assert.equal(h.storage.get(KEY), 'retained'); assert.equal(h.current.isLoading, false);
    assert.ok(h.current.error); assert.equal(h.requests.filter(request => request.url === '/api/chat').length, 0);
    await h.send();
    assert.equal(h.requests.find(request => request.url === '/api/chat').input.sessionId, 'retained');
    assert.equal(h.storage.get(KEY), 'retained');
  }
});

test('timeout during restoration retains the saved ID', async t => {
  const h = await harness({ savedId: 'retained', route: request => new Promise((resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(new DOMException('synthetic timeout', 'AbortError')), { once: true });
  }) }); t.after(() => h.close());
  h.tick(10000); await h.settle();
  assert.equal(h.storage.get(KEY), 'retained'); assert.match(h.current.error, /timed out/);
});

test('missing-session cleanup leaves a different ID written by another tab intact', async t => {
  const pending = deferred();
  const h = await harness({ savedId: 'obsolete', route: request => request.url === '/api/chat' ? json({ error: { code: 'AGENT_NOT_READY', message: 'synthetic unavailable' } }, 503) : pending.promise }); t.after(() => h.close());
  h.storage.set(KEY, 'other-tab-session'); pending.resolve(missing()); await h.settle();
  assert.equal(h.storage.get(KEY), 'other-tab-session');
  await h.send();
  assert.equal(h.requests.find(request => request.url === '/api/chat').input.sessionId, undefined);
  assert.equal(h.storage.get(KEY), 'other-tab-session');
});

test('late final snapshot cannot replace a conversation started after done', async t => {
  const pending = deferred(); let first, latest, posts = 0;
  const h = await harness({ route: request => {
    if (request.url === '/api/chat') {
      latest = request.input;
      if (++posts === 1) first = latest;
      return sse(posts === 1 ? 'obsolete' : 'fresh', [message(latest.requestId, latest.text)]);
    }
    if (request.url === '/api/sessions/obsolete') return pending.promise;
    if (request.url === '/api/sessions/fresh') return json({ session: session('fresh', [message(latest.requestId, latest.text)]) });
  } }); t.after(() => h.close());
  const sending = h.current.onNew({ content: [{ type: 'text', text: 'synthetic input' }] }); await h.settle();
  assert.equal(h.current.isRunning, false);
  h.current.startNew(); await h.settle(); await h.send('new synthetic input');
  pending.resolve(json({ session: session('obsolete', [message(first.requestId, first.text)]) }));
  await sending; await h.settle();
  assert.equal(h.current.messages.length, 1); assert.equal(h.current.messages[0].text, 'new synthetic input');
  assert.equal(h.storage.get(KEY), 'fresh'); assert.equal(h.current.error, ''); assert.equal(h.current.isRunning, false);
});

test('obsolete bootstrap results after epoch change or effect cleanup are ignored', async t => {
  for (const response of [missing, () => json({ session: session('obsolete', [message('old-message', 'synthetic old text')]) })]) {
    const pending = deferred();
    const h = await harness({ savedId: 'obsolete', route: () => pending.promise }); t.after(() => h.close());
    h.current.startNew(); await h.settle();
    pending.resolve(response()); await h.settle();
    assert.equal(h.current.messages.length, 0); assert.equal(h.current.error, ''); assert.equal(h.storage.get(KEY), undefined);
  }
  const pending = deferred(); let reads = 0;
  const h = await harness({ savedId: 'valid', route: () => ++reads === 1 ? pending.promise : json({ session: session('valid') }) }); t.after(() => h.close());
  h.restartEffects(); await h.settle(); pending.resolve(missing()); await h.settle();
  assert.equal(h.storage.get(KEY), 'valid'); assert.equal(h.current.error, '');
});

test('a missing session during active snapshot polling releases running and keeps the original retry input', async t => {
  let reads = 0;
  const active = session('active', [message('active-request', 'synthetic active input')], true);
  const h = await harness({ savedId: 'active', route: request => {
    if (request.url === '/api/sessions/active') return ++reads < 3 ? json({ session: active }) : missing();
    if (request.url.startsWith('/api/events')) return json({ error: { code: 'TEMPORARY', message: 'synthetic event outage' } }, 502);
  } }); t.after(() => h.close());
  assert.equal(h.current.isLoading, false); assert.equal(h.current.isRunning, false);
  assert.equal(h.current.retryable, true); assert.equal(h.storage.get(KEY), undefined);
  assert.equal(h.current.messages.at(-1).text, 'synthetic active input');
  assert.match(h.current.error, /[Ss]ession.*does not exist/);
  assert.equal(h.requests.filter(request => request.url === '/api/chat').length, 0);
});

test('bootstrap active-session recovery 404 retains the pending input for retry without an automatic POST', async t => {
  let reads = 0;
  const saved = session('active', [message('active-request', 'synthetic active input')], true);
  const h = await harness({ savedId: 'active', route: request => {
    if (request.url === '/api/sessions/active') return ++reads === 1 ? json({ session: saved }) : missing();
  } }); t.after(() => h.close());
  assert.equal(h.current.isLoading, false); assert.equal(h.current.isRunning, false); assert.equal(h.current.retryable, true);
  assert.equal(h.storage.get(KEY), undefined); assert.equal(h.current.messages.at(-1).text, 'synthetic active input');
  assert.equal(h.requests.filter(request => request.url === '/api/chat').length, 0);
});

test('POST route and bare 404 failures retain the original session and never automatically POST again', async t => {
  for (const failure of [() => json({ error: { code: 'NOT_FOUND', message: 'Endpoint does not exist' } }, 404), () => new Response('proxy route missing', { status: 404 })]) {
    let reads = 0;
    const h = await harness({ savedId: 'retained', route: request => {
      if (request.url === '/api/sessions/retained') return ++reads === 1 ? json({ session: session('retained') }) : json({ error: { code: 'INTERNAL_ERROR', message: 'synthetic storage outage' } }, 500);
      if (request.url === '/api/chat') return failure();
    } }); t.after(() => h.close());
    await h.send();
    assert.equal(h.storage.get(KEY), 'retained'); assert.equal(h.current.retryable, true); assert.equal(h.current.isRunning, false);
    assert.equal(h.requests.filter(request => request.url === '/api/chat').length, 1); assert.equal(h.current.messages.length, 1);
    await h.current.retry(); await h.settle();
    const posts = h.requests.filter(request => request.url === '/api/chat');
    assert.equal(posts[1].input.sessionId, 'retained'); assert.equal(posts[1].input.requestId, posts[0].input.requestId);
    assert.equal(h.current.messages.length, 1);
  }
});

test('a valid active session resumes SSE without sending a model request or duplicating text', async t => {
  const saved = session('active', [message('active-request', 'synthetic input')], true);
  const h = await harness({ savedId: 'active', route: request => {
    if (request.url === '/api/sessions/active') return json({ session: saved });
    if (request.url.startsWith('/api/events')) return new Response([
      { type: 'snapshot', session: saved },
      { type: 'text_delta', itemId: 'assistant-fixture', delta: 'fixture reply' },
      { type: 'done', status: 'completed' },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
  } }); t.after(() => h.close());
  assert.equal(h.storage.get(KEY), 'active'); assert.equal(h.current.isRunning, false);
  assert.equal(h.current.messages.length, 2); assert.equal(h.current.messages.at(-1).text, 'fixture reply');
  assert.equal(h.requests.filter(request => request.url === '/api/chat').length, 0);
});

test('a late final 404 cannot clear a subsequently created session', async t => {
  const pending = deferred(); let posts = 0, newRequest;
  const h = await harness({ savedId: 'active', route: request => {
    if (request.url === '/api/sessions/active') return json({ session: session('active') });
    if (request.url === '/api/sessions/obsolete') return pending.promise;
    if (request.url === '/api/chat') {
      newRequest = request.input;
      return sse(++posts === 1 ? 'obsolete' : 'fresh', [message(newRequest.requestId, newRequest.text)]);
    }
    if (request.url === '/api/sessions/fresh') return json({ session: session('fresh', [message(newRequest.requestId, newRequest.text)]) });
  } }); t.after(() => h.close());
  const firstSend = h.current.onNew({ content: [{ type: 'text', text: 'first synthetic input' }] }); await h.settle();
  assert.equal(h.current.isRunning, false);
  h.current.startNew(); await h.settle(); await h.send('new synthetic input');
  pending.resolve(missing()); await firstSend; await h.settle();
  assert.equal(h.storage.get(KEY), 'fresh'); assert.equal(h.current.error, '');
  assert.equal(h.current.messages.length, 1); assert.equal(h.current.messages[0].text, 'new synthetic input');
});

test('a mismatched snapshot ID is rejected without binding a different conversation', async t => {
  const h = await harness({ savedId: 'retained', route: () => json({ session: session('different', [message('foreign', 'synthetic data')]) }) }); t.after(() => h.close());
  assert.equal(h.storage.get(KEY), 'retained'); assert.equal(h.current.messages.length, 0);
  assert.match(h.current.error, /Invalid.*format/);
});

test('a list failure about a different missing session does not invalidate the selected ID', async t => {
  const h = await harness({ savedId: 'retained', list: missing, route: () => json({ session: session('retained', [message('saved', 'saved text')]) }) }); t.after(() => h.close());
  assert.equal(h.storage.get(KEY), 'retained'); assert.equal(h.current.error, ''); assert.ok(h.current.sessionsError);
  assert.equal(h.current.messages[0].text, 'saved text');
  assert.equal(h.requests.filter(request => request.url === '/api/sessions/retained').length, 1);
});

test('a header arriving after unmount cannot bind a session', async t => {
  const pending = deferred();
  const h = await harness({ route: () => pending.promise }); t.after(() => h.close());
  const sending = h.current.onNew({ content: [{ type: 'text', text: 'synthetic input' }] }); await h.settle();
  const input = h.requests.find(request => request.url === '/api/chat').input;
  h.close(); pending.resolve(sse('obsolete', [message(input.requestId, input.text)])); await sending;
  assert.equal(h.storage.get(KEY), undefined);
});

test('backend restart blocks sends and restores the saved session without POST or clearing history', async t => {
  const h = await harness({ savedId: 'restart-saved', route: request => {
    if (request.url === '/api/sessions/restart-saved') return json({session: session('restart-saved', [message('existing', 'existing conversation')])});
  }});
  t.after(() => h.close());
  h.runtime({busy:false,phase:'ready',instanceId:'fixture',generation:1});
  h.runtime({busy:true,phase:'stopping',instanceId:'fixture',generation:1});
  await h.settle(); assert.equal(h.current.status.ready, false);
  await h.send('must not send');
  assert.equal(h.requests.filter(r => r.url === '/api/chat').length, 0);
  h.runtime({busy:false,phase:'ready',instanceId:'fixture',generation:2});
  await h.settle(); assert.equal(h.current.status.ready, true);
  assert.equal(h.current.messages[0].text, 'existing conversation');
  assert.equal(h.storage.get(KEY), 'restart-saved');
  assert.equal(h.requests.filter(r => r.url === '/api/chat').length, 0);
});


test('new chat uses saved default scheme while manual selection and restored legacy conversations remain pinned', async t => {
 const selection = {engine:'opencode',providerId:'sapling-fixture',modelId:'synthetic-coder'};
 const catalog = {defaultSelection:selection,engines:[{id:'opencode',ready:true,authenticated:true,providers:[{id:selection.providerId,models:[{id:selection.modelId}]}]}]};
 const h = await harness({engineCatalog:catalog,route:()=>undefined});t.after(()=>h.close());
 assert.deepEqual({...h.current.selection},selection);assert.equal(h.current.engineReady,true);
 h.current.setSelection({engine:'codex',providerId:null,modelId:null});await h.settle();await h.current.refreshEngines();await h.settle();assert.equal(h.current.selection.engine,'codex');
 const saved=await harness({savedId:'legacy',engineCatalog:catalog,route:r=>r.url==='/api/sessions/legacy'?json({session:session('legacy')}):undefined});t.after(()=>saved.close());
 assert.equal(saved.current.selection.engine,'codex');saved.current.startNew();await saved.settle();assert.deepEqual({...saved.current.selection},selection);
});
test('aggregate OpenCode readiness cannot enable sending on an unavailable Codex engine',async t=>{
 const h=await harness({runtimeStatus:{ready:true,authenticated:true,codexReady:false,defaultEngine:'opencode'},route:()=>undefined});t.after(()=>h.close());assert.equal(h.current.selection.engine,'codex');assert.equal(h.current.engineReady,false);
});

test('Claude default is ready without Codex login and restored conversation retains Claude binding',async t=>{
 const selection={engine:'claude',providerId:'sapling-synthetic',modelId:'synthetic-claude'};const catalog={defaultSelection:selection,engines:[{id:'claude',ready:true,authenticated:true,providers:[{id:selection.providerId,models:[{id:selection.modelId}]}]}]};
 const h=await harness({engineCatalog:catalog,runtimeStatus:{ready:true,codexReady:false},savedId:'claude-saved',route:r=>r.url==='/api/sessions/claude-saved'?json({session:{...session('claude-saved'),...selection}}):undefined});t.after(()=>h.close());assert.deepEqual({...h.current.selection},selection);assert.equal(h.current.engineReady,true);assert.equal(h.requests.filter(r=>r.url==='/api/chat').length,0);
});

test('file-only sends retain attachment IDs and restored retries reuse the same files and request ID',async t=>{
 const attachment={id:'ab48eef0-7780-4ac5-9c92-6490279ca6f2',name:'reference.png',kind:'image',contentType:'image/png',size:20};let saved=[],posted=[];
 const route=r=>{if(r.url==='/api/chat'){posted.push(r.input);saved=[{...message(r.input.requestId,r.input.text),attachments:[attachment]}];return sse('files',saved)}if(r.url==='/api/sessions/files')return json({session:session('files',saved)})};
 const h=await harness({route});t.after(()=>h.close());await h.current.onNew({content:[],attachments:[{id:attachment.id,type:'image',name:attachment.name,contentType:attachment.contentType,status:{type:'complete'},content:[{type:'image',image:'/api/attachments/'+attachment.id+'/content'}]}]});await h.settle();assert.equal(posted.length,1);assert.equal(posted[0].text,'');assert.deepEqual([...posted[0].attachmentIds],[attachment.id]);assert.equal(h.current.messages[0].attachments[0].id,attachment.id);
 const original=posted[0].requestId;saved.push({...message('failed-answer','Failed','assistant'),status:'failed'});
 const resumed=await harness({savedId:'files',route});t.after(()=>resumed.close());assert.equal(posted.length,1);await resumed.current.retry();await resumed.settle();assert.equal(posted.length,2);assert.equal(posted[1].requestId,original);assert.deepEqual([...posted[1].attachmentIds],[attachment.id]);
});

test('saved conversation list can switch the active chat without sending a model request', async t => {
  const summaries = [
    { id: 'recent-chat', title: 'Zulu notes', updatedAt: '2026-10-14T10:00:00.000Z' },
    { id: 'older-chat', title: 'beta notes', updatedAt: '2026-10-13T10:00:00.000Z' },
  ];
  const h = await harness({
    savedId: 'recent-chat',
    list: () => json({ sessions: summaries }),
    route: request => {
      if (request.url === '/api/sessions/recent-chat') return json({ session: session('recent-chat', [message('recent-message', 'recent conversation')]) });
      if (request.url === '/api/sessions/older-chat' && request.method === 'PATCH') return json({ session: { ...session('older-chat', [message('older-message', 'older conversation')]), title: request.input.title, updatedAt: '2026-10-15T10:00:00.000Z' } });
      if (request.url === '/api/sessions/older-chat') return json({ session: session('older-chat', [message('older-message', 'older conversation')]) });
    },
  });
  t.after(() => h.close());
  assert.deepEqual([...h.current.sessions].map(item => item.id), ['older-chat', 'recent-chat']);
  assert.equal(h.current.activeSessionId, 'recent-chat');
  await h.current.switchSession('older-chat'); await h.settle();
  assert.equal(h.storage.get(KEY), 'older-chat');
  assert.equal(h.current.activeSessionId, 'older-chat');
  assert.equal(h.current.messages[0].text, 'older conversation');
  assert.equal(h.requests.filter(request => request.url === '/api/chat').length, 0);
  assert.equal(await h.current.renameSession('older-chat', '  zzz reference  '), 'zzz reference'); await h.settle();
  assert.deepEqual([...h.current.sessions].map(item => item.id), ['recent-chat', 'older-chat']);
  assert.equal(h.current.sessions.at(-1).title, 'zzz reference');
  assert.deepEqual(h.requests.find(request => request.method === 'PATCH').input, { title: 'zzz reference' });
});


test('running conversation switching releases loading before the stream ends and isolates late events', async t => {
  let streamController;
  const h = await harness({ savedId: 'idle', route: req => {
    if (req.url === '/api/sessions/idle') return json({ session: session('idle', [message('idle-m', 'idle text')]) });
    if (req.url === '/api/sessions/live') return json({ session: { ...session('live', [], true), contextUsage: { usedTokens: 500, contextWindow: 1000, updatedAt: '2026-10-19T10:00:00Z' } } });
    if (req.url === '/api/events?sessionId=live') return new Response(new ReadableStream({ start(c) { streamController = c; } }));
  } }); t.after(() => h.close());
  const switching = h.current.switchSession('live'); await h.settle();
  assert.equal(h.current.isRunning, true); assert.equal(h.current.isLoading, false); assert.equal(h.current.contextUsage.usedTokens, 500);
  await h.current.switchSession('idle'); await h.settle();
  streamController.enqueue(new TextEncoder().encode('data: '+JSON.stringify({ type: 'snapshot', session: session('live', [message('late','wrong thread')]) })+'\n\n')); streamController.close(); await switching; await h.settle();
  assert.equal(h.current.activeSessionId, 'idle'); assert.equal(h.current.messages[0].text, 'idle text'); assert.equal(h.current.contextUsage, null);
  assert.equal(h.requests.filter(req => req.method === 'POST').length, 0);
});

test('late session-list results do not undo a saved rename or a newer refresh', async t => {
  const old = deferred(); let lists=0;
  const h=await harness({ list:()=>++lists===2?old.promise:json({sessions:[{id:'saved',title:'Initial',engine:'codex'}]}), route:req=>req.method==='PATCH'?json({session:{...session('saved'),title:req.input.title}}):json({session:session('saved')}) });t.after(()=>h.close());
  const refresh=h.current.refreshSessions();await h.settle();await h.current.renameSession('saved','Renamed');await h.settle();
  old.resolve(json({sessions:[{id:'saved',title:'Old'}]}));await refresh;await h.settle();assert.equal(h.current.sessions[0].title,'Renamed');assert.equal(h.current.sessionsLoading,false);
});

test('a new session enters navigation while its first response is still streaming', async t => {
  let controller;
  const h=await harness({route:req=>req.url==='/api/chat'?new Response(new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'session',sessionId:'new-live'})+'\n\n'));}}),{headers:{'X-Session-Id':'new-live'}}):json({session:session('new-live')})});t.after(()=>h.close());
  const sending=h.current.onNew({content:[{type:'text',text:'Navigation title'}]});await h.settle();
  assert.equal(h.current.activeSessionId,'new-live');assert.equal(h.current.sessions.find(item=>item.id==='new-live').title,'Navigation title');assert.equal(h.current.isRunning,true);
  controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'done',status:'completed'})+'\n\n'));controller.close();await sending;
});

test('late cancellation and approval responses cannot change another conversation', async t => {
  const cancel=deferred(), approval=deferred();
  const h=await harness({savedId:'a',route:req=>req.url.endsWith('/cancel')?cancel.promise:req.url.startsWith('/api/approvals/')?approval.promise:json({session:session(req.url.split('/').at(-1),[message('m','saved text')])})});t.after(()=>h.close());
  const stop=h.current.onCancel(), answer=h.current.respondApproval('approval-a','accept');await h.settle();
  await h.current.switchSession('b');await h.settle();cancel.resolve(json({error:{message:'Old failure'}},500));approval.resolve(json({ok:true}));await Promise.all([stop,answer]);await h.settle();
  assert.equal(h.current.activeSessionId,'b');assert.equal(h.current.error,'');assert.equal(h.current.activity,'');assert.equal(h.current.approvalBusy,false);
});


test('repeated title edits are persisted in order and older completion cannot replace the latest intent',async t=>{
 const first=deferred(),second=deferred();let patches=0;
 const h=await harness({list:()=>json({sessions:[{id:'a',title:'Initial'}]}),route:()=>++patches===1?first.promise:second.promise});t.after(()=>h.close());
 const old=h.current.renameSession('a','First');await h.settle();const fresh=h.current.renameSession('a','Second');await h.settle();assert.equal(patches,1);
 first.resolve(json({session:{...session('a'),title:'First'}}));await old;await h.settle();assert.equal(patches,2);assert.equal(h.current.sessions[0].title,'Initial');
 second.resolve(json({session:{...session('a'),title:'Second'}}));await fresh;await h.settle();assert.equal(h.current.sessions[0].title,'Second');
});
