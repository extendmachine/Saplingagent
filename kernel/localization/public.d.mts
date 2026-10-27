export type Language = 'en' | 'zh';
export const supportedLanguages: readonly Language[];
export function normalizeLanguage(value: unknown, fallback?: string): Language;
export function formatMessage(catalog: {en: Record<string,string>; zh: Record<string,string>}, language: string, key: string, params?: Record<string, unknown>): string;
export interface ExplainedError { code: string; summary: string; action: string; details: string; }
export function describeError(error: unknown, language?: string): ExplainedError;
export function browserErrorSource(): string;
