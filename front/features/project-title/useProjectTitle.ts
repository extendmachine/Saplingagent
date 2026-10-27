import { useEffect, useState } from 'react';

// Older runtimes expose only applicationRoot; never substitute the native app name.
export function projectFolderTitle(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const { projectFolderName, applicationRoot } = value as Record<string, unknown>;
  if (typeof projectFolderName === 'string' && projectFolderName.trim()) return projectFolderName.trim();
  if (typeof applicationRoot === 'string') return applicationRoot.split(/[\\/]/).filter(Boolean).at(-1) || null;
  return null;
}

export function useProjectTitle(fallback: string) {
  const [folderName, setFolderName] = useState<string | null>(null);
  useEffect(() => {
    let current: AbortController | undefined;
    const refresh = async () => {
      current?.abort();
      const request = new AbortController();
      current = request;
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
      try {
        const response = await fetch('/api/runtime/status', { cache: 'no-store', signal });
        if (!response.ok) return;
        const title = projectFolderTitle(await response.json());
        if (!signal.aborted && title) setFolderName(title);
      } catch { /* Optional metadata: keep the last known title or localized fallback. */ }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { current?.abort(); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => { document.title = folderName || fallback; }, [folderName, fallback]);
}
