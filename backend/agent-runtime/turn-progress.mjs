import { createHash } from 'node:crypto';

const maxTimerMs = 2147483647;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const itemTypes = new Set(['userMessage', 'hookPrompt', 'agentMessage', 'plan', 'reasoning', 'commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'collabAgentToolCall', 'subAgentActivity', 'webSearch', 'imageView', 'sleep', 'imageGeneration', 'enteredReviewMode', 'exitedReviewMode', 'contextCompaction']);
const toolTypes = new Set(['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'collabAgentToolCall', 'webSearch', 'imageView', 'sleep', 'imageGeneration']);
const deltaKinds = new Map([
  ['item/agentMessage/delta', 'text'], ['item/reasoning/summaryTextDelta', 'reasoning'],
  ['item/reasoning/textDelta', 'reasoning'], ['item/plan/delta', 'plan'],
  ['item/commandExecution/outputDelta', 'command-output'], ['item/fileChange/outputDelta', 'file-output'],
]);

export function turnTiming(config) {
  const read = (name, fallback) => {
    const value = config[name] === undefined ? fallback : config[name];
    if (!Number.isInteger(value) || value < 0 || value > maxTimerMs) throw new Error(`${name} must be an integer millisecond value from 0 to ${maxTimerMs}`);
    return value;
  };
  return { turnTimeoutMs: read('turnTimeoutMs', 0), turnIdleWarningMs: read('turnIdleWarningMs', 600000) };
}

// This monitor retains only timestamps, categories and item lifecycle IDs, never output bodies.
export function createTurnProgress({ turnTimeoutMs, turnIdleWarningMs, onIdle, onResume, onHardTimeout, clock = { now: Date.now, setTimeout, clearTimeout } }) {
  const startedAt = clock.now();
  let lastProgressAt = startedAt, lastProgressKind = 'started', idle = false, stopped = false, idleTimer, hardTimer, planDigest;
  const items = new Map(), tools = new Set(), waiting = new Set();
  const phase = () => waiting.size ? 'waiting-user' : tools.size ? 'tool-running' : 'working';
  const snapshot = () => ({ startedAt: new Date(startedAt).toISOString(), lastProgressAt: new Date(lastProgressAt).toISOString(), lastProgressKind, idle, phase: phase() });
  const idleLabel = () => phase() === 'waiting-user'
    ? 'This turn is waiting for your confirmation. Wait or click Stop; the system will not automatically resend.'
    : phase() === 'tool-running'
      ? 'There has been no recent progress; a tool is still running. Wait or click Stop; the system will not automatically resend.'
      : 'There has been no recent progress. Wait or click Stop; the system will not automatically resend.';
  function scheduleIdle() {
    clock.clearTimeout(idleTimer); idleTimer = undefined;
    if (stopped || !turnIdleWarningMs || idle) return;
    idleTimer = clock.setTimeout(() => {
      idleTimer = undefined;
      if (stopped) return;
      // Do not mark an early timer firing as inactivity.
      if (clock.now() - lastProgressAt < turnIdleWarningMs) { scheduleIdle(); return; }
      idle = true; onIdle(idleLabel());
    }, Math.max(1, turnIdleWarningMs - (clock.now() - lastProgressAt)));
  }
  function progress(kind) {
    if (stopped) return;
    const resumed = idle;
    lastProgressAt = clock.now(); lastProgressKind = kind; idle = false;
    scheduleIdle(); if (resumed) onResume('New progress received. Continuing…');
  }
  function notification(method, p) {
    if (stopped) return false;
    const kind = deltaKinds.get(method);
    if (kind && nonempty(p.itemId) && nonempty(p.delta)) { progress(kind); return true; }
    if (method === 'item/mcpToolCall/progress' && nonempty(p.itemId) && nonempty(p.message)) { progress('mcp-progress'); return true; }
    if (method === 'turn/plan/updated' && Array.isArray(p.plan) && p.plan.some(step => nonempty(step?.step) && ['pending', 'inProgress', 'completed'].includes(step.status))) {
      const digest = createHash('sha256').update(JSON.stringify([p.plan, p.explanation])).digest('hex');
      if (digest === planDigest) return false;
      planDigest = digest; progress('plan'); return true;
    }
    if (['item/started', 'item/completed'].includes(method) && nonempty(p.item?.id) && itemTypes.has(p.item.type)) {
      const state = method === 'item/started' ? 'started' : 'completed';
      if (items.get(p.item.id) === state || (state === 'started' && items.get(p.item.id) === 'completed')) return false;
      items.set(p.item.id, state);
      if (toolTypes.has(p.item.type)) { if (state === 'started') tools.add(p.item.id); else tools.delete(p.item.id); }
      progress(state === 'started' ? 'item-started' : 'item-completed'); return true;
    }
    return false;
  }
  function stop() { stopped = true; clock.clearTimeout(idleTimer); clock.clearTimeout(hardTimer); idleTimer = hardTimer = undefined; }
  scheduleIdle();
  if (turnTimeoutMs > 0) hardTimer = clock.setTimeout(() => { if (!stopped) { stop(); onHardTimeout(); } }, turnTimeoutMs);
  return {
    notification, snapshot, stop,
    statusLabel: () => idle ? idleLabel() : waiting.size ? 'Waiting for your confirmation…' : undefined,
    waitForUser(id) { if (!stopped) waiting.add(id); },
    answered(id) { waiting.delete(id); },
    isWaiting(id) { return waiting.has(id); },
  };
}
