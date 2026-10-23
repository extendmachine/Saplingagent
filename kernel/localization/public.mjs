/** Public, dependency-free language contract for kernel and application UIs. */
export const supportedLanguages = Object.freeze(['en', 'zh']);
export function normalizeLanguage(value, fallback = 'en') {
  const tag = typeof value === 'string' ? value.trim().toLowerCase().replaceAll('_', '-') : '';
  if (/^zh(?:-|$)/.test(tag)) return 'zh';
  if (/^en(?:-|$)/.test(tag)) return 'en';
  return fallback === 'zh' ? 'zh' : 'en';
}
export function formatMessage(catalog, language, key, params = {}) {
  const text = catalog[normalizeLanguage(language)]?.[key] ?? catalog.en?.[key] ?? key;
  return String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
}
export { describeError, browserErrorSource } from './errors.mjs';
