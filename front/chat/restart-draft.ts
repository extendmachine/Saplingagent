export const DRAFT_KEY = 'saplingagent.restart-draft.v1';
type Draft = { sessionId: string | null; text: string; savedAt: number };
export function saveDraft(storage: Storage, sessionId: string | null, text: string, now = Date.now()) {
  try { if (text && text.length <= 2_000_000) storage.setItem(DRAFT_KEY, JSON.stringify({ sessionId, text, savedAt: now })); else storage.removeItem(DRAFT_KEY); } catch { /* Storage can be unavailable; persisted server sessions are independent. */ }
}
export function restoreDraft(storage: Storage, sessionId: string | null, currentText: string, now = Date.now()): string | null {
  try {
    const raw = storage.getItem(DRAFT_KEY); if (!raw) return null;
    storage.removeItem(DRAFT_KEY);
    const value = JSON.parse(raw) as Draft;
    if (currentText || value.sessionId !== sessionId || typeof value.text !== 'string' || value.text.length > 2_000_000 || typeof value.savedAt !== 'number' || now - value.savedAt > 3600000 || value.savedAt > now) return null;
    return value.text;
  } catch { return null; }
}
