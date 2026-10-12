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
  const h = await harness({ savedId: 'retained', list: missing, route: () => undefined }); t.after(() => h.close());
  assert.equal(h.storage.get(KEY), 'retained'); assert.ok(h.current.error);
  assert.equal(h.requests.filter(request => request.url === '/api/sessions/retained').length, 0);
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
