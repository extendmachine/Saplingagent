// Catalog membership is not an account entitlement check. Only inference verifies access.
const validText = (value, limit = 240) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value);
export const reportedModel = value => validText(value) ? value : null;
const failure = (code, message, status = 400) => Object.assign(new Error(message), { code, status });

export async function readCodexModels(rpc) {
  const models = new Map(), cursors = new Set();
  let cursor;
  // Bounded pagination fails atomically instead of presenting a truncated catalog.
  for (let page = 0; page < 100; page++) {
    const result = await rpc.call('model/list', { limit: 50, includeHidden: false, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(result?.data)) throw failure('MODEL_CATALOG_INVALID', 'Codex returned an invalid model catalog. Refresh the model list.', 502);
    for (const item of result.data) {
      if (!validText(item?.model)) throw failure('MODEL_CATALOG_INVALID', 'Codex returned an invalid model catalog. Refresh the model list.', 502);
      if (item.hidden === true) continue;
      models.set(item.model, {
        id: item.model, label: validText(item.displayName, 300) ? item.displayName : item.model, isDefault: item.isDefault === true,
        defaultReasoningEffort: validText(item.defaultReasoningEffort, 40) ? item.defaultReasoningEffort : null,
        supportedReasoningEfforts: (Array.isArray(item.supportedReasoningEfforts) ? item.supportedReasoningEfforts : []).filter(entry => validText(entry?.reasoningEffort, 40)).map(entry => ({ reasoningEffort: entry.reasoningEffort })),
        ...(Array.isArray(item.inputModalities) ? { inputModalities: item.inputModalities.filter(value => value === 'text' || value === 'image') } : {}),
      });
    }
    if (result.nextCursor === null || result.nextCursor === undefined) return [...models.values()];
    if (!validText(result.nextCursor, 8000) || cursors.has(result.nextCursor)) throw failure('MODEL_CATALOG_INVALID', 'Codex model pagination did not complete. Refresh the model list.', 502);
    cursors.add(result.nextCursor); cursor = result.nextCursor;
  }
  throw failure('MODEL_CATALOG_INVALID', 'Codex model pagination exceeded its limit. Refresh the model list.', 502);
}

export function defaultCodexModel(models, preferred) {
  const match = models.find(item => item.id === preferred), selected = match || models.find(item => item.isDefault) || models[0];
  if (!selected) throw failure('MODEL_NOT_AVAILABLE', 'No Codex model is available. Refresh the model list or check AI configuration.', 503);
  return { model: selected.id, warning: preferred && !match ? `Preferred model ${preferred} is absent from the Codex catalog. Automatic selection uses ${selected.id}. Choose a model explicitly to avoid fallback.` : null };
}

export function selectCodexModel({ models, defaultModelId, modelId = null, apiModel = null, reasoningEffort }) {
  if (apiModel) {
    if (modelId !== null && modelId !== apiModel) throw failure('MODEL_NOT_AVAILABLE', 'The saved Codex model differs from the configured API scheme. Select the configured model or automatic selection.');
    return { model: apiModel, effort: null };
  }
  const selected = models.find(item => item.id === (modelId || defaultModelId));
  if (!selected) throw failure('MODEL_NOT_AVAILABLE', 'The selected Codex model is no longer in the catalog. Refresh the models and choose an available model; it was not replaced.');
  const efforts = selected.supportedReasoningEfforts.map(item => item.reasoningEffort);
  return { model: selected.id, effort: efforts.includes(reasoningEffort) ? reasoningEffort : efforts.includes(selected.defaultReasoningEffort) ? selected.defaultReasoningEffort : null };
}
