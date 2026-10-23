import {describeError,formatMessage,normalizeLanguage} from '../../localization/public.mjs';
import {setupMessages} from '../../localization/setup-messages.mjs';
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const pageErrors=new Set(['UI_NOT_BUILT','UI_BUILD_FAILED','UI_BUILD_INTERRUPTED','UI_UNREADABLE','CONFIG_STORAGE_ERROR']);
export function wantsConfigurationErrorPage(req,code){
 if(req.method!=='GET'||String(req.url).split(/[?#]/)[0]!=='/'||!pageErrors.has(code))return false;
 return String(req.headers.accept||'').split(',').some(value=>{
  const [type,...parameters]=value.trim().toLowerCase().split(';');
  const quality=parameters.find(part=>part.trim().startsWith('q='));
  return type.trim()==='text/html'&&(quality===undefined||Number(quality.trim().slice(2))>0);
 });
}
export function renderConfigurationError(error,language='en'){
 const lang=normalizeLanguage(language),explained=describeError(error,lang);
 const t=key=>escape(formatMessage(setupMessages,lang,key));
 return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('common.setup.unavailable')}</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f7f8f4;color:#233329}main{max-width:720px;margin:8vh auto;padding:28px}section{padding:24px;background:white;border:1px solid #dce3dc;border-radius:12px}h1{font-size:1.6rem}nav{display:flex;gap:20px;margin:24px 0}a{color:#28543a}details{margin-top:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}code{display:block}</style></head><body><main><strong>Saplingagent</strong><h1>${t('common.setup.unavailable')}</h1><section role="alert"><h2>${escape(explained.summary)}</h2><p>${escape(explained.action)}</p><nav><a href="/">${t('common.reload.page')}</a><a href="/help?lang=${lang}">${t('common.help')}</a></nav><details><summary>${t('common.error.details')}</summary><code>${escape(explained.code)}</code><pre>${escape(explained.details)}</pre></details></section></main></body></html>`;
}
