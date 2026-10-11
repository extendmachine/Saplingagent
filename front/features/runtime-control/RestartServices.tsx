import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, LoaderCircle, RotateCw } from 'lucide-react';
import './runtime-control.css';

type State = { instanceId: string; generation: number; phase: string; busy: boolean; canRestart: boolean; jobId: string | null; scope: 'all' | 'backend'; error: { message: string; code: string } | null };
const RELOAD_KEY = 'saplingagent.restart-reload.v1';
const labels: Record<string, string> = { preparing: 'Checking tasks…', stopping: 'Stopping…', starting: 'Starting…', connecting: 'Connecting AI…', ready: 'Services restarted', failed: 'Restart failed' };
function publish(state: State) {
  window.dispatchEvent(new CustomEvent('saplingagent:runtime', { detail: { busy: state.busy, phase: state.phase, instanceId: state.instanceId, generation: state.generation } }));
}
export function RestartServices() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const alive = useRef(true);
  const polling = useRef(false);
  const previous = useRef('');
  async function update() {
    if (polling.current) return;
    polling.current = true;
    try {
      const response = await fetch('/api/runtime/status', { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('Runtime manager is unavailable. Start Saplingagent with its Mac launcher.');
      const value = await response.json() as State;
      if (!value.instanceId || !Number.isInteger(value.generation)) throw new Error('Runtime manager returned an invalid status.');
      if (!alive.current) return;
      setState(value); setUnavailable(false); setError(value.error?.message || '');
      try {
        const marker = JSON.parse(sessionStorage.getItem(RELOAD_KEY) || 'null');
        if (marker && !value.busy) {
          sessionStorage.removeItem(RELOAD_KEY);
          if (value.phase === 'ready' && value.instanceId === marker.instanceId && value.generation > marker.generation) window.location.reload();
        }
      } catch { /* Browser storage is optional. */ }
      const signature = `${value.instanceId}:${value.generation}:${value.phase}:${value.busy}`;
      if (signature !== previous.current) { previous.current = signature; publish(value); }
    } catch (failure) {
      if (alive.current) { setUnavailable(true); setError(failure instanceof Error ? failure.message : 'Runtime manager is unavailable.'); }
    } finally { polling.current = false; }
  }
  useEffect(() => {
    alive.current = true; void update();
    const timer = window.setInterval(() => { void update(); }, 1000);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, []);
  async function restart(scope: 'all' | 'backend') {
    if (pending || state?.busy || unavailable) return;
    window.dispatchEvent(new Event('saplingagent:before-restart'));
    if (scope === 'all' && state) { try { sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ instanceId: state.instanceId, generation: state.generation })); } catch {} }
    setPending(true); setError('');
    try {
      const response = await fetch('/api/runtime/restart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }), signal: AbortSignal.timeout(5000) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error?.message || 'Services could not restart.');
      if (!alive.current) return;
      setRequested(true); setState(value.status); publish(value.status);
      await update();
    } catch (failure) { try { sessionStorage.removeItem(RELOAD_KEY); } catch {} if (alive.current) setError(failure instanceof Error ? failure.message : 'Restart request failed. Check the service status before retrying.'); }
    finally { if (alive.current) setPending(false); }
  }
  const busy = pending || !!state?.busy;
  const label = busy ? labels[state?.phase || 'preparing'] || 'Restarting…' : 'Restart app';
  return <div className="runtime-control">
    <button type="button" className="runtime-restart-button" onClick={() => void restart('all')} disabled={busy || unavailable || !state?.canRestart} aria-label={label} title={error || 'Reload frontend, backend, Codex App Server and MCP from the selected version.'}>
      {busy ? <LoaderCircle className="spinning" size={15} /> : <RotateCw size={15} />}<span>{label}</span>
    </button>
    <details className="runtime-options"><summary aria-label="Restart options" title="Restart options">⌄</summary><div><button type="button" disabled={busy || unavailable || !state?.canRestart} onClick={() => void restart('backend')}>Restart backend</button><a href="/__saplingagent/runtime">Runtime recovery</a></div></details>
    {(error || busy || requested) && <div className={`runtime-control-notice${error ? ' has-error' : ''}`} role={error ? 'alert' : 'status'}>
      {error ? <AlertTriangle size={13} /> : null}<span>{error || (busy ? label : labels[state?.phase || ''] || 'Checking services…')}</span>
    </div>}
  </div>;
}
