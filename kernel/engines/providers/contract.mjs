export const ENGINE_CODEX = 'codex';
export const ENGINE_OPENCODE = 'opencode';
export const ENGINE_CLAUDE = 'claude';
export const ENGINE_IDS = Object.freeze([ENGINE_CODEX, ENGINE_OPENCODE, ENGINE_CLAUDE]);

export function validateEngineSelection(input = {}) {
  const engine = input.engine === undefined ? ENGINE_CODEX : input.engine;
  if (!ENGINE_IDS.includes(engine)) throw Object.assign(new Error('Unknown agent engine'), { code: 'INVALID_ENGINE', status: 400 });
  const providerId = input.providerId ?? null;
  const modelId = input.modelId ?? null;
  if (engine === ENGINE_CODEX) {
    if (providerId !== null || modelId !== null) throw Object.assign(new Error('Codex uses the project model and does not accept provider or model overrides'), { code: 'INVALID_ENGINE_SELECTION', status: 400 });
    return { engine, providerId: null, modelId: null };
  }
  if (typeof providerId !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,160}$/.test(providerId) || typeof modelId !== 'string' || !modelId.trim() || modelId.length > 240) {
    throw Object.assign(new Error('This engine requires a valid provider and model'), { code: 'INVALID_ENGINE_SELECTION', status: 400 });
  }
  return { engine, providerId, modelId };
}

export function assertSessionSelection(session, requested) {
  const saved = validateEngineSelection(session);
  if (!requested || requested.engine === undefined) return saved;
  const selected = validateEngineSelection(requested);
  if (selected.engine !== saved.engine || selected.providerId !== saved.providerId || selected.modelId !== saved.modelId) {
    throw Object.assign(new Error('This conversation is already bound to another engine or model. Start a new conversation to switch'), { code: 'SESSION_ENGINE_MISMATCH', status: 409 });
  }
  return saved;
}
