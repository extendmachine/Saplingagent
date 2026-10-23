import React from 'react';
import {describeError, formatMessage, normalizeLanguage, type Language} from '../../localization/public.mjs';
import {setupMessages} from '../../localization/setup-messages.mjs';
export type Translation = (key: string, params?: Record<string, unknown>) => string;
export type Message = {key: string; params?: Record<string, unknown>};
export const msg = (key: string, params?: Record<string, unknown>): Message => ({key,params});
export const translate = (language: string): Translation => (key,params) => formatMessage(setupMessages,language,key,params);
export const setupError = (key: string, params?: Record<string, unknown>) => Object.assign(new Error(translate('en')(key,params)),{messageKey:key,params});
export function ErrorNotice({issue,language}: {issue: unknown;language: Language}) {
  if (!issue) return null;
  const t=translate(language), explained=describeError(issue,language);
  const keyed=issue as {messageKey?: string;params?: Record<string,unknown>};
  return <div className="message error" role="alert"><strong>{keyed.messageKey?t(keyed.messageKey,keyed.params):explained.summary}</strong><p>{explained.action}</p><details><summary>{t('common.error.details')}</summary><code>{explained.code}</code>{explained.details&&<pre>{explained.details}</pre>}</details></div>;
}
export function Notice({value,language}: {value: Message|null;language: Language}) {
 return value?<div className="message success" role="status">{translate(language)(value.key,value.params)}</div>:null;
}
export function LanguageSelector({language,onChange,disabled=false}: {language:Language;onChange:(language:Language)=>void;disabled?:boolean}){
 const t=translate(language);
 return <label className="language-selector"><span className="sr-only">{t('common.language')}</span><select aria-label={t('common.language')} value={language} disabled={disabled} onChange={event=>onChange(normalizeLanguage(event.target.value))}><option value="en">English</option><option value="zh">简体中文</option></select></label>;
}
export {normalizeLanguage};
export type {Language};
