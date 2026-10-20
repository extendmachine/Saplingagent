import type { ContextUsage } from '../../chat/runtime-api';

const compactTokens = (value: number) => value >= 1_000_000
  ? `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`
  : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value);

export function contextUsageView(usage: ContextUsage | null) {
  if (!usage || !Number.isSafeInteger(usage.usedTokens) || usage.usedTokens < 0 || !Number.isSafeInteger(usage.contextWindow) || usage.contextWindow <= 0) return { percent: 0, tone: 'empty', value: '—', badge: '', label: 'Context usage is unavailable until this provider reports its usage and capacity.' };
  const percent = Math.min(100, Math.max(0, Math.round(usage.usedTokens / usage.contextWindow * 100)));
  const tone = percent >= 85 ? 'critical' : percent >= 70 ? 'warning' : 'normal';
  const guidance = tone === 'critical' ? 'Context is near its reported capacity; compaction timing is controlled by the provider.' : tone === 'warning' ? 'Context is filling; consider wrapping up this thread.' : 'Context has comfortable room.';
  const badge = tone === 'critical' ? `${percent}% · near capacity` : tone === 'warning' ? `${percent}% · filling` : `${percent}%`;
  return { percent, tone, value: `${compactTokens(usage.usedTokens)} / ${compactTokens(usage.contextWindow)}`, badge, label: `${usage.usedTokens.toLocaleString()} of ${usage.contextWindow.toLocaleString()} tokens (${percent}%). ${guidance}` };
}
