import { useEffect, useRef, useState } from 'react';
import type { ComposerRuntime } from '@assistant-ui/react';
import { LoaderCircle, Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
import type { useSeedRuntime } from './useSeedRuntime';
import { captureConversationDraft, restoreConversationDraft, type ConversationDraft } from './conversation-drafts';

type Agent = ReturnType<typeof useSeedRuntime>;
export function ConversationControls({ agent, composer, onChanging }: { agent: Agent; composer: ComposerRuntime; onChanging: (value: boolean) => void }) {
  const [editing, setEditing] = useState<string | null>(null), [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false), [changing, setChanging] = useState(false), [error, setError] = useState('');
  const drafts = useRef(new Map<string, ConversationDraft>()), operation = useRef(0), active = useRef(agent.activeSessionId);
  active.current = agent.activeSessionId;
  useEffect(() => { setEditing(null); setError(''); setSaving(false); ++operation.current; }, [agent.activeSessionId]);
  async function change(id: string | null) {
    if (changing || agent.isLoading || id === active.current || (!id && agent.isRunning)) return;
    const state = composer.getState();
    if (state.submission) { setError('Wait for the pending attachment send to finish before switching conversations.'); return; }
    const from = active.current;
    drafts.current.set(from || '', captureConversationDraft(state));
    setChanging(true); onChanging(true); setError(''); setEditing(null); ++operation.current;
    try {
      await composer.reset();
      const accepted = id ? agent.switchSession(id) : agent.startNew();
      if (!accepted) {
        await restoreConversationDraft(composer, drafts.current.get(from || ''));
        setError('Conversation could not switch while services are restarting. Try again when ready.');
        return;
      }
      // addAttachment descriptors restore finished uploads without re-uploading.
      // An unfinished original File is uploaded anew only to its own draft.
      const draft = drafts.current.get(id || '');
      drafts.current.delete(id || '');
      await restoreConversationDraft(composer, draft);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to restore the conversation draft.'); }
    finally { setChanging(false); onChanging(false); }
  }
  function beginEdit() {
    if (!active.current) return;
    ++operation.current; setSaving(false); setError(''); setEditing(active.current);
    setTitle(agent.sessions.find(item => item.id === active.current)?.title || 'Untitled conversation');
  }
  async function save() {
    if (!editing || saving) return;
    const id = editing, request = ++operation.current, value = title.trim();
    if (!value || value.length > 200) { setError('Use 1–200 characters.'); return; }
    setSaving(true); setError('');
    try { await agent.renameSession(id, value); if (operation.current === request && active.current === id) setEditing(null); }
    catch (failure) { if (operation.current === request && active.current === id) setError(failure instanceof Error ? failure.message : 'Unable to save title.'); }
    finally { if (operation.current === request && active.current === id) setSaving(false); }
  }
  const disabled = changing || agent.isLoading;
  return <div className="conversation-navigation">
    <div className="session-switcher">
      <label htmlFor="conversation-select">Chat</label>
      <select id="conversation-select" aria-label="Switch conversation" value={agent.activeSessionId || ''} disabled={disabled} onChange={event => { void change(event.target.value || null); }}>
        <option value="" disabled={agent.isRunning}>New conversation{agent.isRunning ? ' (stop current first)' : ''}</option>
        {agent.sessions.map(item => <option key={item.id} value={item.id}>{item.title?.trim() || 'Untitled conversation'}{item.updatedAt && Number.isFinite(Date.parse(item.updatedAt)) ? ` · ${new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</option>)}
      </select>
      <button type="button" title="Rename conversation" aria-label="Rename conversation" disabled={!agent.activeSessionId || disabled} onClick={beginEdit}><Pencil size={13} /></button>
      <button type="button" title="Refresh conversations" aria-label="Refresh conversations" disabled={agent.sessionsLoading} onClick={() => { void agent.refreshSessions(); }}><RotateCcw size={13} className={agent.sessionsLoading ? 'spinning' : ''} /></button>
    </div>
    <div className="session-actions"><button type="button" disabled={disabled || agent.isRunning} onClick={() => { void change(null); }}><Plus size={12} />New conversation</button>{agent.sessionsError && <span role="status" title={agent.sessionsError}>History unavailable</span>}</div>
    {editing && <div className="session-title-editor">
      <input aria-label="Conversation title" value={title} maxLength={200} autoFocus onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save(); } else if (event.key === 'Escape') { ++operation.current; setEditing(null); setSaving(false); setError(''); } }} />
      <button type="button" aria-label="Save conversation title" title="Save title" disabled={saving} onClick={() => { void save(); }}>{saving ? <LoaderCircle size={13} className="spinning" /> : <Save size={13} />}</button>
      <button type="button" aria-label="Cancel title edit" title="Cancel" onClick={() => { ++operation.current; setEditing(null); setSaving(false); setError(''); }}><X size={13} /></button>
    </div>}
    {error && <p className="session-navigation-error" role="alert">{error}</p>}
  </div>;
}
