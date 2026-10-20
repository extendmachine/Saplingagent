import { useEffect, useRef } from 'react';
import { useAui } from '@assistant-ui/react';
import { restoreDraft, saveDraft } from './restart-draft';
export function RestartDraft({ sessionId }: { sessionId: string | null }) {
  const active = useRef(sessionId);
  active.current = sessionId;
  const runtime = useAui();
  useEffect(() => {
    const composer = runtime.composer();
    try {
      const text = restoreDraft(sessionStorage, active.current, composer.getState().text);
      if (text !== null) composer.setText(text);
    } catch { /* The browser may deny access to the storage property itself. */ }
    const save = () => {
      try { saveDraft(sessionStorage, active.current, composer.getState().text); }
      catch { /* Optional draft recovery must not interrupt a restart. */ }
    };
    window.addEventListener('saplingagent:before-restart', save);
    window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('saplingagent:before-restart', save); window.removeEventListener('pagehide', save); };
  }, [runtime]);
  return null;
}
