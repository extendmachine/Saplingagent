import { useLanguage } from '../../localization/LanguageProvider';
import { ErrorNotice } from '../../localization/ErrorNotice';
import type { MessageKey } from '../../localization/catalog';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, LoaderCircle, RotateCw } from 'lucide-react';
import './runtime-control.css';
import { completedRestart, readRestartMarker, type RestartMarker } from './restart-reload';

type State = { instanceId: string; generation: number; phase: string; busy: boolean; canRestart: boolean; jobId: string | null; scope: 'all' | 'backend'; error: { message: string; code: string } | null };
const RELOAD_KEY = 'saplingagent.restart-reload.v1';
const labels: Record<string, MessageKey> = { preparing: 'restart.preparing', stopping: 'restart.stopping', starting: 'restart.starting', connecting: 'restart.connecting', ready: 'restart.ready', failed: 'restart.failed' };
function publish(state: State) {
  window.dispatchEvent(new CustomEvent('saplingagent:runtime', { detail: { busy: state.busy, phase: state.phase, instanceId: state.instanceId, generation: state.generation } }));
}
export function RestartServices() {
  const { t } = useLanguage();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const alive = useRef(true);
  const polling = useRef(false);
  const previous = useRef('');
  const reloadMarker = useRef<RestartMarker | null>(null);
  const acceptedJob = useRef<string | null>(null);
  async function update() {
    if (polling.current) return;
    polling.current = true;
    try {
      const response = await fetch('/api/runtime/status', { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('Runtime control is unavailable. Check that the application launcher is running.');
      const value = await response.json() as State;
      if (!value.instanceId || !Number.isInteger(value.generation)) throw new Error('Runtime manager returned an invalid status.');
      if (!alive.current) return;
      setState(value); setUnavailable(false); setError(value.error || null);
      try { reloadMarker.current ||= readRestartMarker(sessionStorage, RELOAD_KEY); } catch { /* The in-memory marker also works without browser storage. */ }
      if (completedRestart(reloadMarker.current, value)) {
        reloadMarker.current = null;
        try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* Optional storage. */ }
        window.location.reload(); return;
      }
      if (acceptedJob.current && acceptedJob.current === value.jobId && (value.phase === 'failed' || !value.busy && value.error)) {
        reloadMarker.current = null;
        try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* Optional storage. */ }
      }
      const signature = `${value.instanceId}:${value.generation}:${value.phase}:${value.busy}`;
      if (signature !== previous.current) { previous.current = signature; publish(value); }
    } catch (failure) {
      if (alive.current) { setUnavailable(true); setError(failure); }
    } finally { polling.current = false; }
  }
  useEffect(() => {
    alive.current = true; void update();
    const timer = window.setInterval(() => { void update(); }, 1000);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, []);
  async function restart() {
    if (pending || state?.busy || unavailable) return;
    window.dispatchEvent(new Event('saplingagent:before-restart'));
    acceptedJob.current = null;
    if (state) {
      reloadMarker.current = { instanceId: state.instanceId, generation: state.generation };
      try { sessionStorage.setItem(RELOAD_KEY, JSON.stringify(reloadMarker.current)); } catch { /* The active page keeps its marker in memory. */ }
    } else { reloadMarker.current = null; try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* Optional storage. */ } }
    setPending(true); setError(null);
    try {
      const response = await fetch('/api/runtime/restart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'all' }), signal: AbortSignal.timeout(5000) });
      const value = await response.json();
      if (!response.ok) {
        reloadMarker.current = null; try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* Optional storage. */ }
        throw Object.assign(new Error(value.error?.message || 'Services could not restart.'), { code: value.error?.code });
      }
      if (!alive.current) return;
      acceptedJob.current = value.jobId;
      setRequested(true); setState(value.status); publish(value.status);
      await update();
    } catch (failure) { if (alive.current) setError(failure); }
    finally { if (alive.current) setPending(false); }
  }
  const busy = pending || !!state?.busy;
  const label = busy ? t(labels[state?.phase || 'preparing'] || 'restart.busy') : t('restart.label');
  return <div className="runtime-control">
    <button type="button" className="runtime-restart-button" onClick={() => void restart()} disabled={busy || unavailable || !state?.canRestart} aria-label={label} title={t('restart.hint')}>
      {busy ? <LoaderCircle className="spinning" size={15} /> : <RotateCw size={15} />}<span>{label}</span>
    </button>
    {Boolean(error || busy || requested) && <div className={`runtime-control-notice${error ? ' has-error' : ''}`} role={error ? 'alert' : 'status'}>
      {error ? <ErrorNotice error={error} /> : <span>{busy ? label : t(labels[state?.phase || ''] || 'restart.checking')}</span>}
    </div>}
  </div>;
}
