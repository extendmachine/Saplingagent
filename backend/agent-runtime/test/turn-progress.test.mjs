import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnProgress, turnTiming } from '../turn-progress.mjs';

import { fakeClock } from './progress-clock.mjs';
function fixture(config = {}) {
  const clock = fakeClock(), warnings = [], resumed = [];
  let stopped = 0;
  const monitor = createTurnProgress({ ...turnTiming(config), clock, onIdle: label => warnings.push(label), onResume: label => resumed.push(label), onHardTimeout: () => stopped++ });
  return { monitor, clock, warnings, resumed, get stopped() { return stopped; } };
}
test('default and explicit zero disable hard timeout; missing fields use idle warning only', () => {
  assert.deepEqual(turnTiming({}), { turnTimeoutMs: 0, turnIdleWarningMs: 600000 });
  for (const config of [{}, { turnTimeoutMs: 0 }]) {
    const f = fixture(config); f.clock.advance(3600000);
    assert.equal(f.stopped, 0); assert.equal(f.warnings.length, 1); assert.equal(f.monitor.snapshot().idle, true); f.monitor.stop();
  }
});
test('timer settings reject invalid numeric/coerced/null/overflow values', () => {
  for (const name of ['turnTimeoutMs', 'turnIdleWarningMs']) for (const value of [-1, 1.5, NaN, Infinity, '600000', null, true, 2147483648]) assert.throws(() => turnTiming({ [name]: value }), new RegExp(name));
  assert.equal(turnTiming({ turnTimeoutMs: 2147483647 }).turnTimeoutMs, 2147483647);
  const f = fixture({ turnIdleWarningMs: 0 }); f.clock.advance(3600000); assert.equal(f.warnings.length, 0); assert.equal(f.clock.pending, 0);
});
test('positive hard deadline remains absolute despite real progress and fires once', () => {
  const f = fixture({ turnTimeoutMs: 1000, turnIdleWarningMs: 600 });
  f.clock.advance(500); f.monitor.notification('item/agentMessage/delta', { itemId: 'a', delta: 'text' });
  f.clock.advance(499); assert.equal(f.stopped, 0); f.clock.advance(1); assert.equal(f.stopped, 1); assert.equal(f.clock.pending, 0);
  f.clock.advance(10000); assert.equal(f.stopped, 1);
});
test('text, reasoning, plan, command and MCP progress extend inactivity without retaining their bodies', () => {
  const f = fixture();
  const events = [
    ['item/agentMessage/delta', { itemId: 'a', delta: 'hello' }, 'text'],
    ['item/reasoning/summaryTextDelta', { itemId: 'r', delta: 'PRIVATE_REASONING' }, 'reasoning'],
    ['item/reasoning/textDelta', { itemId: 'r', delta: 'PRIVATE_REASONING' }, 'reasoning'],
    ['item/plan/delta', { itemId: 'p', delta: 'next step' }, 'plan'],
    ['turn/plan/updated', { plan: [{ step: 'implement', status: 'inProgress' }] }, 'plan'],
    ['item/commandExecution/outputDelta', { itemId: 'c', delta: 'SECRET_OUTPUT' }, 'command-output'],
    ['item/mcpToolCall/progress', { itemId: 'm', message: 'SECRET_ARGUMENT' }, 'mcp-progress'],
  ];
  for (const [method, p, kind] of events) {
    f.clock.advance(599999); assert.equal(f.monitor.notification(method, p), true);
    assert.equal(f.monitor.snapshot().lastProgressKind, kind); assert.equal(f.monitor.snapshot().lastProgressAt, new Date(f.clock.now()).toISOString());
  }
  assert.ok(f.clock.now() - Date.parse(f.monitor.snapshot().startedAt) > 600000);
  assert.equal(f.warnings.length, 0); assert.equal(f.stopped, 0); assert.doesNotMatch(JSON.stringify(f.monitor.snapshot()), /PRIVATE|SECRET/); f.monitor.stop();
});
test('empty, unrelated, heartbeat, connection retry and polling events cannot renew progress', () => {
  const f = fixture(), before = f.monitor.snapshot();
  f.clock.advance(599999);
  for (const method of ['item/agentMessage/delta', 'item/reasoning/textDelta', 'item/plan/delta', 'item/commandExecution/outputDelta']) for (const delta of ['', ' \n', null, 0]) assert.equal(f.monitor.notification(method, { itemId: 'a', delta }), false);
  for (const method of ['heartbeat', 'error', 'thread/status/changed', 'turn/started', 'account/rateLimits/updated']) assert.equal(f.monitor.notification(method, { delta: 'something' }), false);
  assert.equal(f.monitor.notification('item/mcpToolCall/progress', { itemId: 'm', message: '' }), false);
  assert.equal(f.monitor.notification('item/started', { item: {} }), false);
  assert.equal(f.monitor.snapshot().lastProgressAt, before.lastProgressAt); f.clock.advance(1); assert.equal(f.warnings.length, 1); f.monitor.stop();
});
test('each idle period warns once, real progress resumes then arms a new warning', () => {
  const f = fixture({ turnIdleWarningMs: 100 }); f.clock.advance(500);
  assert.equal(f.warnings.length, 1); assert.equal(f.clock.pending, 0);
  f.monitor.notification('item/reasoning/textDelta', { itemId: 'r', delta: 'thinking' });
  assert.equal(f.resumed.length, 1); assert.equal(f.monitor.snapshot().idle, false);
  f.clock.advance(100); assert.equal(f.warnings.length, 2); assert.equal(f.stopped, 0); f.monitor.stop();
});
test('valid lifecycle distinguishes silent tools and actual user waits; duplicates cannot renew', () => {
  const f = fixture({ turnIdleWarningMs: 100 });
  assert.equal(f.monitor.notification('item/started', { item: { id: 'c', type: 'commandExecution' } }), true);
  f.clock.advance(99); assert.equal(f.monitor.notification('item/started', { item: { id: 'c', type: 'commandExecution' } }), false);
  f.clock.advance(1); assert.match(f.warnings[0], /a tool is still running/); assert.equal(f.stopped, 0);
  f.monitor.notification('item/completed', { item: { id: 'c', type: 'commandExecution' } });
  f.monitor.waitForUser(23); assert.equal(f.monitor.snapshot().phase, 'waiting-user');
  const last = f.monitor.snapshot().lastProgressAt; f.clock.advance(100); assert.match(f.warnings[1], /waiting for your confirmation/);
  f.monitor.answered(23); assert.equal(f.monitor.snapshot().phase, 'working'); assert.equal(f.monitor.snapshot().lastProgressAt, last); f.monitor.stop();
});
test('stop clears both timers and prevents late progress from rearming', () => {
  const f = fixture({ turnTimeoutMs: 500, turnIdleWarningMs: 100 }); assert.equal(f.clock.pending, 2);
  f.monitor.stop(); f.monitor.stop(); f.monitor.notification('item/agentMessage/delta', { itemId: 'a', delta: 'late' });
  f.clock.advance(10000); assert.equal(f.clock.pending, 0); assert.equal(f.stopped, 0); assert.equal(f.warnings.length, 0);
});
test('monitors isolate concurrent sessions and consecutive turns', () => {
  const a = fixture({ turnIdleWarningMs: 100 }), b = fixture({ turnIdleWarningMs: 100 });
  a.clock.advance(90); b.clock.advance(90); a.monitor.notification('item/agentMessage/delta', { itemId: 'a', delta: 'text' });
  a.clock.advance(10); b.clock.advance(10); assert.equal(a.warnings.length, 0); assert.equal(b.warnings.length, 1);
  a.monitor.stop(); const c = fixture({ turnIdleWarningMs: 100 }); a.clock.advance(1000); c.clock.advance(99); assert.equal(c.warnings.length, 0); c.monitor.stop(); b.monitor.stop();
});
