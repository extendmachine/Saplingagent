import { useEffect } from 'react';
import { useAui } from '@assistant-ui/react';
import { readSessionId } from './runtime-api';
import { restoreDraft, saveDraft } from './restart-draft';
export function RestartDraft() {
  const runtime = useAui();
  useEffect(() => {
    const composer = runtime.composer();
    try {
      const text = restoreDraft(sessionStorage, readSessionId(), composer.getState().text);
      if (text !== null) composer.setText(text);
    } catch { /* The browser may deny access to the storage property itself. */ }
    const save = () => {
      try { saveDraft(sessionStorage, readSessionId(), composer.getState().text); }
      catch { /* Optional draft recovery must not interrupt a restart. */ }
    };
    window.addEventListener('saplingagent:before-restart', save);
    window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('saplingagent:before-restart', save); window.removeEventListener('pagehide', save); };
  }, [runtime]);
  return null;
}
