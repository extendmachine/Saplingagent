import { useEffect, useState } from 'react';
import type { ComposerRuntime } from '@assistant-ui/react';
import type { EngineSelection } from './runtime-api';
import type { useSeedRuntime } from './useSeedRuntime';

type Agent = ReturnType<typeof useSeedRuntime>;
const sameSelection = (a: EngineSelection, b: EngineSelection) => a.engine === b.engine && (a.providerId ?? null) === (b.providerId ?? null) && (a.modelId ?? null) === (b.modelId ?? null);

export function EngineControls({ agent, composer, changingSession }: { agent: Agent; composer: ComposerRuntime; changingSession: boolean }) {
  const [draft, setDraft] = useState<EngineSelection>(agent.selection);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft(agent.selection); setError('');
  }, [agent.activeSessionId, agent.engineRevision, agent.selection.engine, agent.selection.providerId, agent.selection.modelId]);
  const engine = agent.engines.find(item => item.id === draft.engine);
  const provider = engine?.providers?.find(item => item.id === draft.providerId);
  const disabled = changingSession || !agent.canSelectEngine;
  const changed = !sameSelection(draft, agent.selection);
  const ready = draft.engine === 'codex' ? Boolean(agent.status?.codexReady ?? agent.status?.ready) : Boolean(engine?.ready && engine.authenticated && provider?.models.some(item => item.id === draft.modelId));
  function editable() {
    if (disabled) return false;
    if (composer.getState().submission) { setError('Wait for the pending attachment send to finish before changing AI.'); return false; }
    setError(''); return true;
  }
  function choose(value: EngineSelection) {
    if (!editable()) return;
    if (!agent.activeSessionId && !agent.setSelection(value)) return;
    setDraft(value);
  }
  function chooseEngine(value: EngineSelection['engine']) {
    const first = agent.engines.find(item => item.id === value)?.providers?.[0];
    choose(value === 'codex' ? { engine: value, providerId: null, modelId: null } : { engine: value, providerId: first?.id ?? null, modelId: first?.defaultModelId || first?.models[0]?.id || null });
  }
  function chooseProvider(id: string) {
    const selected = engine?.providers?.find(item => item.id === id);
    choose({ engine: draft.engine, providerId: id, modelId: selected?.defaultModelId || selected?.models[0]?.id || null });
  }
  async function apply() {
    if (!changed || !ready || !editable()) return;
    try {
      if (!await agent.changeEngine(draft)) setError('AI was not changed. Check the conversation status and try again.');
    } catch { setError('Unable to change AI. Your conversation and draft are retained.'); }
  }
  return <div className="conversation-engine-controls">
    <div className="engine-picker">
      <select aria-label="Agent engine" value={draft.engine} disabled={disabled} onChange={event => chooseEngine(event.target.value as EngineSelection['engine'])}><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="claude">Claude Agent</option></select>
      {draft.engine !== 'codex' && <>
        <select aria-label="Agent provider" value={draft.providerId || ''} disabled={disabled || !engine?.providers?.length} onChange={event => chooseProvider(event.target.value)}><option value="" disabled>Select provider</option>{engine?.providers?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select aria-label="Agent model" value={draft.modelId || ''} disabled={disabled || !provider?.models.length} onChange={event => choose({ ...draft, modelId: event.target.value })}><option value="" disabled>Select model</option>{provider?.models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      </>}
      {agent.activeSessionId && <button type="button" className="engine-apply" aria-label="Apply AI to this conversation" disabled={disabled || !changed || !ready} onClick={() => { void apply(); }}>{agent.isChangingEngine ? 'Applying…' : 'Apply'}</button>}
    </div>
    {agent.activeSessionId && changed && <p className="engine-note">Apply to use this AI in the same conversation. Messages and your draft stay here.</p>}
    {agent.handoff?.status === 'pending' && <p className="engine-note" role="status">Conversation history will be handed to the selected AI with your next message. No AI request has been sent by switching.</p>}
    {error && <p className="session-navigation-error" role="alert">{error}</p>}
  </div>;
}
