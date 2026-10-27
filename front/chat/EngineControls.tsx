import { ErrorNotice } from '../localization/ErrorNotice';
import { message, type UiText } from '../localization/messages';
import { useLanguage } from '../localization/LanguageProvider';
import { useEffect, useState } from 'react';
import type { ComposerRuntime } from '@assistant-ui/react';
import type { EngineSelection } from './runtime-api';
import type { useSeedRuntime } from './useSeedRuntime';

type Agent = ReturnType<typeof useSeedRuntime>;
const sameSelection = (a: EngineSelection, b: EngineSelection) => a.engine === b.engine && (a.providerId ?? null) === (b.providerId ?? null) && (a.modelId ?? null) === (b.modelId ?? null);

export function EngineControls({ agent, composer, changingSession }: { agent: Agent; composer: ComposerRuntime; changingSession: boolean }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<EngineSelection>(agent.selection);
  const [error, setError] = useState<UiText>('');
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
    if (composer.getState().submission) { setError(message('engine.pending')); return false; }
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
      if (!await agent.changeEngine(draft)) setError(message('engine.rejected'));
    } catch { setError(message('engine.failed')); }
  }
  return <div className="conversation-engine-controls">
    <div className="engine-picker">
      <select aria-label={t('engine.label')} value={draft.engine} disabled={disabled} onChange={event => chooseEngine(event.target.value as EngineSelection['engine'])}><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="claude">Claude Agent</option></select>
      {draft.engine !== 'codex' && <>
        <select aria-label={t('engine.provider')} value={draft.providerId || ''} disabled={disabled || !engine?.providers?.length} onChange={event => chooseProvider(event.target.value)}><option value="" disabled>{t('engine.pickProvider')}</option>{engine?.providers?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select aria-label={t('engine.model')} value={draft.modelId || ''} disabled={disabled || !provider?.models.length} onChange={event => choose({ ...draft, modelId: event.target.value })}><option value="" disabled>{t('engine.pickModel')}</option>{provider?.models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      </>}
      {agent.activeSessionId && <button type="button" className="engine-apply" aria-label={t('engine.applyLabel')} disabled={disabled || !changed || !ready} onClick={() => { void apply(); }}>{agent.isChangingEngine ? t('engine.applying') : t('engine.apply')}</button>}
    </div>
    {agent.activeSessionId && changed && <p className="engine-note">{t('engine.staged')}</p>}
    {agent.handoff?.status === 'pending' && <p className="engine-note" role="status">{t('engine.handoff')}</p>}
    {error && <ErrorNotice className="session-navigation-error" error={error} />}
  </div>;
}
