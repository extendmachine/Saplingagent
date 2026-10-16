import { useEffect, useRef } from 'react';
import { capturePage, pageUrl, type CaptureRequest } from './capture';
export function PageContextBridge() {
  const pageId = useRef(crypto.randomUUID());
  useEffect(() => {
    const controller = new AbortController();
    const request = async (route: string, body?: unknown, timeout = 18000) => {
      const response = await fetch('/api/page/' + route, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]) });
      if (!response.ok) throw new Error('Page bridge unavailable.'); return response.json();
    };
    const heartbeat = () => request('heartbeat', { pageId: pageId.current, url: pageUrl(), title: document.title.slice(0,500), visible: !document.hidden }).catch(() => {});
    const timer = setInterval(() => { void heartbeat(); }, 4000);
    const visibility = () => { void heartbeat(); };
    document.addEventListener('visibilitychange', visibility);
    void (async () => {
      await heartbeat();
      while (!controller.signal.aborted) {
        try {
          const result = await request(`requests?pageId=${encodeURIComponent(pageId.current)}`);
          const capture = result.request as CaptureRequest | null; if (!capture || controller.signal.aborted) continue;
          let payload;
          try { payload = { snapshot: await capturePage(capture) }; }
          catch (error) { payload = { error: error instanceof Error ? error.message : 'Page capture failed.' }; }
          if (!controller.signal.aborted) await request('results', { pageId: pageId.current, requestId: capture.requestId, ...payload });
        } catch {
          if (!controller.signal.aborted) await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timeout); controller.signal.removeEventListener('abort', finish); resolve(); };
            const timeout = setTimeout(finish, 1000);
            controller.signal.addEventListener('abort', finish, { once: true });
          });
        }
      }
    })();
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return null;
}
