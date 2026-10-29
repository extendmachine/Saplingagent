import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { describeError, type Language } from '../../kernel/localization/public.mjs';
import { useProjectTitle } from '../features/project-title/useProjectTitle';
import { createLanguageController } from './language-controller';
import { localeFor, resolveText, translate } from './messages';
const defaultValue = { language: 'en' as Language, locale: 'en-US', t: (key: Parameters<typeof translate>[1], params?: Record<string, unknown>) => translate('en', key, params), text: (value: unknown) => resolveText(value, 'en'), saving: false, error: null as unknown, select: (_value: string) => Promise.resolve(), receive: (_value: unknown) => {} };
const LanguageContext = createContext(defaultValue);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createLanguageController({ browserLanguage: navigator.language, storage: () => window.localStorage }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { const abort = new AbortController(); void controller.load(abort.signal); return () => abort.abort(); }, [controller]);
  useProjectTitle(translate(state.language, 'page.title'));
  useEffect(() => { document.documentElement.lang = state.language; }, [state.language]);
  return <LanguageContext.Provider value={{ ...state, locale: localeFor(state.language), t: (key, params) => translate(state.language, key, params), text: value => resolveText(value, state.language), select: controller.select, receive: controller.receive }}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
export function LanguageSelector() {
  const { language, t, select, saving, error } = useLanguage();
  return <div className="language-tools" data-page-capture-exclude>
    <select aria-label={t('common.language')} value={language} onChange={event => { void select(event.target.value); }} aria-busy={saving}><option value="en">English</option><option value="zh">中文</option></select>
    {error ? <span role="status" className="language-save-error">{t('language.failed')} <button type="button" onClick={() => { void select(language); }}>{t('language.retry')}</button><details><summary>{t('common.details')}</summary><code>{describeError(error, language).code}</code><pre>{describeError(error, language).details}</pre></details></span> : null}
  </div>;
}
