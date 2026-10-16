import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUp, RefreshCw } from 'lucide-react';

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
const KERNEL_VERSION = '0.90';

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
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const hasUpdate = Boolean(version && baseline.current && version.fingerprint !== baseline.current);
  const label = version ? `${version.branch || 'detached'} · ${version.version}` : unavailable ? 'Version unavailable' : 'Loading version…';

  return <footer className={`version-footer${hasUpdate ? ' has-update' : ''}`} aria-live="polite">
    <details className="version-footer-disclosure">
      <summary aria-label="Version information">
        <span className="version-footer-dot" />Version <code>{KERNEL_VERSION}</code>
        {hasUpdate ? <span className="version-footer-update">Update</span> : null}
        <ChevronUp size={13} className="version-footer-chevron" aria-hidden="true" />
      </summary>
      <div className="version-footer-content">
        <span className="version-footer-label">Kernel version <code>{KERNEL_VERSION}</code></span>
        <span className="version-footer-label">Current version <code>{label}</code></span>
        {hasUpdate ? <button type="button" onClick={() => window.location.reload()}>
          <RefreshCw size={13} aria-hidden="true" />
          New version available - refresh
        </button> : null}
      </div>
    </details>
  </footer>;
}
