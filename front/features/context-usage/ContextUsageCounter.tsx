import { Gauge } from 'lucide-react';
import type { ContextUsage } from '../../chat/runtime-api';
import { contextUsageView } from './context-usage';
import './context-usage.css';

export function ContextUsageCounter({ usage }: { usage: ContextUsage | null }) {
  const view = contextUsageView(usage);
  return <div className={`context-usage context-usage-${view.tone}`} title={view.label} aria-label={view.label}>
    <Gauge size={13} aria-hidden="true" />
    <span className="context-usage-value">{view.value}</span>
    {usage && <span className="context-usage-percent">{view.badge}</span>}
    <span className="context-usage-track" aria-hidden="true"><span style={{ width: `${view.percent}%` }} /></span>
  </div>;
}
