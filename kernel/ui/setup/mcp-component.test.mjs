import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {loadComponentModule} from './component-test-loader.mjs';
import {formatMessage} from '../../localization/public.mjs';
import {setupMessages} from '../../localization/setup-messages.mjs';

const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
async function fixture() {
  const slots = [], effects = [], calls = [], statuses = [], copied = [], downloads = [];
  let cursor = 0, tree, scheduled = false, copyFailure = false, conflict = false, delayedRead;
  let stored = { schemaVersion: 1, revision: 2, enabled: false, externalOnly: false, available: true, transport: 'stdio', permissionMode: 'full-access', configuration: { mcpServers: { saplingagent: { command: '/fixture/old/node', args: ['/fixture/old/mcp.mjs'] } } }, warnings: [] };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; render(); }); } };
  const react = {
    default: {}, forwardRef: render => render,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { value: initial }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; schedule(); }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useEffect(effect, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const old = slots[index]; slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect(); }); } },
    useImperativeHandle(ref, create) { ref.current = create(); },
  };
  const props = {
    request: async (route, body) => {
      calls.push({ route, body });
      if (body) {
        if (conflict || body.revision !== stored.revision) throw Object.assign(Error('Changed'), { code: 'CONFIG_CHANGED' });
        stored = { ...stored, ...body, revision: stored.revision + 1 };
      } else if (delayedRead) { const read = delayedRead; delayedRead = undefined; return read.promise; }
      return structuredClone(stored);
    },
    language:'en', t: (key,params)=>formatMessage(setupMessages,props.language,key,params), disabled: false, refreshKey: 'old', onSaved() {}, onStatus: value => statuses.push(value),
  };
  const ref = { current: null }, jsx = (type, props) => ['ErrorNotice','Notice','LanguageSelector'].includes(type?.name)?type(props):({ type, props });
  const context = vm.createContext({ Error, Promise, JSON, Blob, setTimeout,
    navigator: { clipboard: { async writeText(json) { if (copyFailure) throw Error('denied'); copied.push(json); } } },
    URL: { createObjectURL() { return 'blob:fixture'; }, revokeObjectURL() {} },
    document: { body: { append() {} }, createElement() { return { click() { downloads.push(this.download); }, remove() {} }; } },
  });
  const mocks = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' } };
  const module=await loadComponentModule('./McpAccess.tsx',{context,mocks});await module.evaluate();
  function render() { cursor = 0; tree = module.namespace.McpAccess(props, ref); while (effects.length) effects.shift()(); }
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
  render(); await settle();
  return {
    props, ref, calls, statuses, copied, downloads, settle, render,
    button(text) { return nodes(tree).find(node => node.type === 'button' && node.props.children === text); },
    check(index) { return nodes(tree).filter(node => node.type === 'input')[index]; },
    text() { return JSON.stringify(tree); },
    setStored(value) { stored = { ...stored, ...value }; },
    denyCopy() { copyFailure = true; }, conflict() { conflict = true; }, allowSave() { conflict = false; },
    delayRead(value) { delayedRead = value; },
  };
}

test('MCP component saves external-only independently and disabling resets external-only', async () => {
  const h = await fixture();
  assert.equal(h.button('Copy JSON').props.disabled, true);
  h.check(0).props.onChange({ target: { checked: true } }); await h.settle();
  h.check(1).props.onChange({ target: { checked: true } }); await h.settle();
  assert.equal(h.statuses.at(-1).dirty, true);
  await h.ref.current.save(); await h.settle();
  assert.equal(h.calls.filter(call => call.body).length, 1);
  assert.equal(JSON.stringify(h.calls.find(call => call.body).body), JSON.stringify({ revision: 2, enabled: true, externalOnly: true }));
  assert.equal(h.statuses.at(-1).dirty, false);
  assert.equal(h.button('Copy JSON').props.disabled, false);
  h.check(0).props.onChange({ target: { checked: false } }); await h.settle();
  assert.equal(h.check(1).props.checked, false);
  assert.equal(h.check(1).props.disabled, true);
  assert.equal(h.button('Copy JSON').props.disabled, true);
});

test('MCP revision conflict keeps edits dirty until explicit reload and successful resave', async () => {
  const h = await fixture(); h.conflict();
  h.check(0).props.onChange({ target: { checked: true } }); await h.settle();
  await assert.rejects(h.ref.current.save(), { code: 'CONFIG_CHANGED' }); await h.settle();
  assert.equal(h.statuses.at(-1).dirty, true);
  assert.match(h.text(), /CONFIG_CHANGED/);
  h.setStored({ revision: 5 }); h.allowSave();
  h.button('Reload saved MCP settings').props.onClick(); await h.settle();
  assert.equal(h.check(0).props.checked, false);
  h.check(0).props.onChange({ target: { checked: true } }); await h.settle();
  await h.ref.current.save(); await h.settle();
  assert.equal(h.calls.filter(call => call.body).at(-1).body.revision, 5);
});

test('clipboard failure is visible without a success claim; rename refresh and download use current paths', async () => {
  const h = await fixture(); h.setStored({ enabled: true }); await h.ref.current.refresh(); await h.settle();
  h.denyCopy(); h.button('Copy JSON').props.onClick(); await h.settle();
  assert.match(h.text(), /Could not copy/); assert.doesNotMatch(h.text(), /configuration copied/);
  h.setStored({ configuration: { mcpServers: { saplingagent: { command: '/fixture/final folder/node', args: ['/fixture/final folder/mcp.mjs'] } } } });
  h.props.refreshKey = 'final folder and new artifact'; h.render(); await h.settle();
  assert.match(h.text(), /final folder/); assert.doesNotMatch(h.text(), /fixture\/old/);
  h.button('Download JSON').props.onClick(); await h.settle();
  assert.deepEqual(h.downloads, ['saplingagent-mcp.json']);
  assert.match(h.text(), /JSON download requested/);
});

test('late MCP refresh cannot replace saved choices and busy setup disables client exports', async () => {
  const h = await fixture(); const late = Promise.withResolvers();
  h.delayRead(late); const refresh = h.ref.current.refresh();
  h.check(0).props.onChange({ target: { checked: true } }); await h.settle();
  await h.ref.current.save(); await h.settle();
  late.resolve({ revision: 1, enabled: false, externalOnly: false, available: true, warnings: [] });
  await refresh; await h.settle(); assert.equal(h.check(0).props.checked, true);
  h.props.disabled = true; h.render(); assert.equal(h.button('Copy JSON').props.disabled, true);
});

test('MCP language changes keep unsaved choices and translate notices and error explanations',async()=>{
 const h=await fixture();h.check(0).props.onChange({target:{checked:true}});await h.settle();h.props.language='zh';h.render();await h.settle();assert.equal(h.check(0).props.checked,true);assert.ok(h.button('保存 MCP 设置'));assert.equal(h.calls.filter(c=>c.body).length,0);
 await h.ref.current.save();await h.settle();assert.match(h.text(),/MCP 设置已保存/);h.props.language='en';h.render();assert.match(h.text(),/MCP settings saved/);
 h.conflict();h.check(1).props.onChange({target:{checked:true}});await h.settle();await assert.rejects(h.ref.current.save());await h.settle();h.props.language='zh';h.render();assert.match(h.text(),/等待期间项目或对话已发生变化/);assert.match(h.text(),/技术详情/);assert.match(h.text(),/CONFIG_CHANGED/);
});
