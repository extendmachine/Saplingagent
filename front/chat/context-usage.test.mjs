import test from 'node:test';
import assert from 'node:assert/strict';
import { contextUsageView } from '../features/context-usage/context-usage.ts';

test('context display uses measured capacity and never promises compaction or pricing', () => {
  for (const value of [null, {usedTokens:-1,contextWindow:100}, {usedTokens:1,contextWindow:0}, {usedTokens:NaN,contextWindow:100}]) assert.equal(contextUsageView(value).value,'—');
  const normal=contextUsageView({usedTokens:42575,contextWindow:258400});assert.equal(normal.percent,16);assert.equal(normal.tone,'normal');assert.equal(normal.value,'43k / 258k');
  assert.equal(contextUsageView({usedTokens:700,contextWindow:1000}).tone,'warning');
  const critical=contextUsageView({usedTokens:1200,contextWindow:1000});assert.equal(critical.percent,100);assert.equal(critical.badge,'100% · near capacity');assert.doesNotMatch(critical.label,/automatic|compact soon|\$/);
});
