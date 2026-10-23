import { formatMessage, type Language } from '../../kernel/localization/public.mjs';
import { catalog, type MessageKey } from './catalog.ts';
export type UiMessage = { key: MessageKey; params?: Record<string, unknown>; cause?: unknown };
export type UiText = string | UiMessage;
export function message(key: MessageKey, params?: Record<string, unknown>, cause?: unknown): UiMessage { return { key, params, ...(cause === undefined ? {} : { cause }) }; }
export function isMessage(value: unknown): value is UiMessage { return Boolean(value && typeof value === 'object' && 'key' in value && typeof value.key === 'string' && value.key in catalog.en); }
export function translate(language: Language, key: MessageKey, params?: Record<string, unknown>) { return formatMessage(catalog, language, key, params); }
// Only known UI/status phrases are translated here. Conversation, file/provider
// names and model output never pass through this function.
const known = new Map<string, MessageKey>(Object.entries(catalog.en).map(([key, value]) => [value, key as MessageKey]));
export function knownMessage(value: unknown) { const text = typeof value === 'string' ? value : value instanceof Error ? value.message : ''; return known.get(text); }
export function resolveText(value: unknown, language: Language): string {
  if (isMessage(value)) return translate(language, value.key, value.params) + (value.cause === undefined ? '' : ': ' + resolveText(value.cause, language));
  const text = typeof value === 'string' ? value : value instanceof Error ? value.message : '';
  const key = known.get(text); return key ? translate(language, key) : text;
}
export const localeFor = (language: Language) => language === 'zh' ? 'zh-CN' : 'en-US';
