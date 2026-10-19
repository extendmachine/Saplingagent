import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type VersionState = {
  branch: string | null;
  version: string;
  fingerprint: string;
};

type StoredVersion = {
  pageStartedAt: number;
  fingerprint: string;
};

const STORAGE_KEY = 'saplingagent.loaded-version.v1';

function readLoadedVersion(current: VersionState) {
  const pageStartedAt = performance.timeOrigin;
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as StoredVersion | null;
    if (stored?.pageStartedAt === pageStartedAt && typeof stored.fingerprint === 'string') return stored.fingerprint;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ pageStartedAt, fingerprint: current.fingerprint }));
  } catch {
    // Storage can be unavailable in privacy modes. The in-memory baseline still works.
  }
  return current.fingerprint;
}

async function requestVersion(): Promise<VersionState> {
  const response = await fetch('/api/git', { cache: 'no-store' });
  const value = await response.json().catch(() => ({}));
  if (!response.ok || !value.git) throw new Error(value.error?.message || `Version service returned ${response.status}`);
  return value.git;
}

export function VersionFooter() {
  const [version, setVersion] = useState<VersionState | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [kernelVersion, setKernelVersion] = useState<string | null>(null);
  const baseline = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await requestVersion();
      if (baseline.current === null) baseline.current = readLoadedVersion(next);
      setVersion(next);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch('/api/kernel', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      .then(async response => {
        if (!response.ok) return;
        const value = await response.json();
        if (active && value.kernel?.state === 'managed' && /^\d+\.\d+(?:\.\d+)?$/.test(value.kernel.version)) {
          setKernelVersion(value.kernel.version);
        }
      }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const hasUpdate = Boolean(version && baseline.current && version.fingerprint !== baseline.current);
  const label = version ? `${version.branch || 'detached'} · ${version.version}` : unavailable ? 'Version unavailable' : 'Loading version…';

  return <footer className={`version-footer${hasUpdate ? ' has-update' : ''}`} aria-live="polite">
    <span className="version-footer-label version-footer-kernel">Kernel version <code>{kernelVersion || 'Unavailable'}</code></span>
    <span className="version-footer-label"><span className="version-footer-dot" />Workspace revision <code>{label}</code></span>
    {hasUpdate ? <button type="button" onClick={() => window.location.reload()}>
      <RefreshCw size={13} aria-hidden="true" />
      New version available - refresh
    </button> : null}
  </footer>;
}
