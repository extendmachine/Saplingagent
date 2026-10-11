import { useEffect } from 'react';
import { useAui } from '@assistant-ui/react';
import { readSessionId } from './runtime-api';
import { restoreDraft, saveDraft } from './restart-draft';
export function RestartDraft() {
  const runtime = useAui();
  useEffect(() => {
    const composer = runtime.composer();
    const text = restoreDraft(sessionStorage, readSessionId(), composer.getState().text);
    if (text !== null) composer.setText(text);
    const save = () => saveDraft(sessionStorage, readSessionId(), composer.getState().text);
    window.addEventListener('saplingagent:before-restart', save);
    window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('saplingagent:before-restart', save); window.removeEventListener('pagehide', save); };
  }, [runtime]);
  return null;
}
