import { normalizeLanguage, type Language } from '../../kernel/localization/public.mjs';
const KEY = 'saplingagent.ui-language.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function createLanguageController({ request = fetch, browserLanguage = 'en', storage }: { request?: typeof fetch; browserLanguage?: string; storage?: () => StorageLike } = {}) {
  let language = normalizeLanguage(browserLanguage);
  try { const saved = storage?.().getItem(KEY); if (saved === 'en' || saved === 'zh') language = saved; } catch { /* optional fallback */ }
  let state = { language, saving: false, error: null as unknown }, epoch = 0, queue = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = (next: Partial<typeof state>) => { state = { ...state, ...next }; for (const listener of listeners) listener(); };
  const remember = (value: Language) => { try { storage?.().setItem(KEY, value); } catch { /* project setting is authoritative */ } };
  const decode = async (response: Response) => {
    const value = await response.json();
    if (!response.ok || !['en', 'zh'].includes(value.language)) throw Object.assign(new Error(value.error?.message || 'Unable to save the project language.'), { code: value.error?.code || 'UI_LANGUAGE_UNAVAILABLE' });
    return value.language as Language;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async load(signal?: AbortSignal) {
      const expected = epoch;
      try { const value = await decode(await request('/api/runtime/language', { cache: 'no-store', signal })); if (!signal?.aborted && epoch === expected) { remember(value); emit({ language: value }); } }
      catch { /* A legacy/offline runtime retains the browser/fallback language. */ }
    },
    receive(value: unknown) {
      if ((value !== 'en' && value !== 'zh') || value === state.language || state.saving || state.error) return;
      ++epoch; remember(value); emit({ language: value });
    },
    select(value: unknown) {
      const next = normalizeLanguage(value), expected = ++epoch;
      remember(next); emit({ language: next, saving: true, error: null });
      queue = queue.catch(() => {}).then(async () => {
        if (expected !== epoch) return;
        try {
          await decode(await request('/api/runtime/language', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: next }), signal: AbortSignal.timeout(10000) }));
          if (epoch === expected) emit({ saving: false, error: null });
        } catch (error) { if (epoch === expected) emit({ saving: false, error }); }
      });
      return queue;
    },
  };
}
