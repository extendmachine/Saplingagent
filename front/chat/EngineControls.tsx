import { ErrorNotice } from '../localization/ErrorNotice';
import { message, type UiText } from '../localization/messages';
import { useLanguage } from '../localization/LanguageProvider';
import { useEffect, useState } from 'react';
import type { ComposerRuntime } from '@assistant-ui/react';
import { codexModelSelectable, type EngineSelection } from './runtime-api';
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
  const codex = draft.engine === 'codex';
  const accountModels = codex && engine?.modelSelection === 'account';
  const catalogError = agent.enginesError || engine?.modelCatalogError;
  const models = engine?.models ?? [];
  const missingModel = accountModels && Boolean(draft.modelId && !models.some(item => item.id === draft.modelId));
  const ready = codex ? Boolean(agent.status?.codexReady ?? agent.status?.ready) && codexModelSelectable(engine, draft.modelId, Boolean(agent.enginesError)) : Boolean(engine?.ready && engine.authenticated && provider?.models.some(item => item.id === draft.modelId));
  const configuredModel = engine?.model || engine?.defaultModelId || engine?.requestedModel;
  const mismatchedApiModel = codex && engine?.modelSelection === 'api' && Boolean(draft.modelId && !codexModelSelectable(engine, draft.modelId));
  const usage = agent.selection.engine === 'codex' ? agent.modelUsage : null;
  const actual = usage?.source !== 'unreported' && typeof usage?.actualModel === 'string' && usage.actualModel.trim() ? usage.actualModel : null;
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
  function refreshModels() {
    if (agent.enginesLoading || !editable()) return;
    void agent.refreshEngines(undefined, true);
  }
  return <div className="conversation-engine-controls">
    <div className="engine-picker" title={accountModels ? t('engine.catalogLimit') : undefined}>
      <select aria-label={t('engine.label')} value={draft.engine} disabled={disabled} onChange={event => chooseEngine(event.target.value as EngineSelection['engine'])}><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="claude">Claude Agent</option></select>
      {draft.engine !== 'codex' && <>
        <select aria-label={t('engine.provider')} value={draft.providerId || ''} disabled={disabled || !engine?.providers?.length} onChange={event => chooseProvider(event.target.value)}><option value="" disabled>{t('engine.pickProvider')}</option>{engine?.providers?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select aria-label={t('engine.model')} value={draft.modelId || ''} disabled={disabled || !provider?.models.length} onChange={event => choose({ ...draft, modelId: event.target.value })}><option value="" disabled>{t('engine.pickModel')}</option>{provider?.models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      </>}
      {accountModels && <>
        <select aria-label={t('engine.model')} value={draft.modelId || ''} disabled={disabled || agent.enginesLoading} onChange={event => choose({ engine: 'codex', providerId: null, modelId: event.target.value || null })}>
          <option value="">{configuredModel ? t('engine.autoModel', { model: configuredModel }) : t('engine.autoModelUnknown')}</option>
          {missingModel && <option value={draft.modelId!} disabled>{t('engine.unavailableModel', { model: draft.modelId })}</option>}
          {models.map(item => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
        </select>
      </>}
      {codex && engine?.modelSelection !== 'api' && <button type="button" className="engine-refresh" aria-label={t('engine.refreshModels')} disabled={disabled || agent.enginesLoading} onClick={refreshModels}>{agent.enginesLoading ? t('engine.modelsLoading') : catalogError ? t('engine.retryModels') : t('engine.refreshModels')}</button>}
      {mismatchedApiModel && <button type="button" className="engine-refresh" onClick={() => choose({ engine: 'codex', providerId: null, modelId: null })} disabled={disabled}>{t('engine.useApiModel')}</button>}
      {agent.activeSessionId && <button type="button" className="engine-apply" aria-label={t('engine.applyLabel')} disabled={disabled || !changed || !ready} onClick={() => { void apply(); }}>{agent.isChangingEngine ? t('engine.applying') : t('engine.apply')}</button>}
    </div>
    {codex && <div className="model-observation" role="status">
      <span title={engine?.modelSelection === 'api' ? t('engine.apiModel') : undefined}>{t(engine?.modelSelection === 'api' && !draft.modelId ? 'engine.chosenApiModel' : 'engine.chosenModel', { model: draft.modelId || configuredModel || t('engine.autoModelUnknown') })}</span>
      {agent.selection.engine === 'codex' && <span title={actual ? usage?.updatedAt : undefined}>{actual ? t('engine.lastActualModel', { model: actual }) : t('engine.actualUnreported')}</span>}
    </div>}
    {codex && agent.enginesLoading && <p className="engine-note" role="status">{t('engine.modelsLoading')}</p>}
    {codex && catalogError && <div className="engine-catalog-warning" role="status"><p>{t(models.length ? 'engine.modelsStale' : 'engine.modelsFailed')}</p><ErrorNotice compact error={message('engine.modelsRetry', undefined, catalogError)} /></div>}
    {accountModels && !agent.enginesLoading && !catalogError && !models.length && <p className="engine-note">{t('engine.modelsEmpty')}</p>}
    {missingModel && <p className="engine-note">{t('engine.modelUnavailable')}</p>}
    {codex && !draft.modelId && engine?.modelWarning && <p className="engine-note">{engine.requestedModel ? t('engine.modelWarning', { requested: engine.requestedModel, model: engine.defaultModelId || engine.model || t('engine.autoModelUnknown') }) : t('engine.modelsRetry')}</p>}
    {agent.activeSessionId && changed && <p className="engine-note">{t('engine.staged')}</p>}
    {agent.handoff?.status === 'pending' && <p className="engine-note" role="status">{t('engine.handoff')}</p>}
    {error && <ErrorNotice className="session-navigation-error" error={error} />}
  </div>;
}
