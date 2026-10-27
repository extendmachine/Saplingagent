import { translate, localeFor } from '../../localization/messages.ts';
import type { Language } from '../../../kernel/localization/public.mjs';
import type { ContextUsage } from '../../chat/runtime-api';

const compactTokens = (value: number) => value >= 1_000_000
  ? `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`
  : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value);

export function contextUsageView(usage: ContextUsage | null, language: Language = 'en') {
  if (!usage || !Number.isSafeInteger(usage.usedTokens) || usage.usedTokens < 0 || !Number.isSafeInteger(usage.contextWindow) || usage.contextWindow <= 0) return { percent: 0, tone: 'empty', value: '—', badge: '', label: translate(language, 'context.unavailable') };
  const percent = Math.min(100, Math.max(0, Math.round(usage.usedTokens / usage.contextWindow * 100)));
  const tone = percent >= 85 ? 'critical' : percent >= 70 ? 'warning' : 'normal';
  const guidance = translate(language, tone === 'critical' ? 'context.critical' : tone === 'warning' ? 'context.warning' : 'context.normal');
  const badge = tone === 'critical' ? translate(language, 'context.criticalBadge', { percent }) : tone === 'warning' ? translate(language, 'context.warningBadge', { percent }) : `${percent}%`;
  const number = (value: number) => value.toLocaleString(localeFor(language));
  const compact = (value: number) => language === 'zh' ? new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : compactTokens(value);
  return { percent, tone, value: `${compact(usage.usedTokens)} / ${compact(usage.contextWindow)}`, badge, label: translate(language, 'context.label', { used: number(usage.usedTokens), capacity: number(usage.contextWindow), percent, guidance }) };
}
