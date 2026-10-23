import { describeError } from '../../kernel/localization/public.mjs';
import { isMessage, knownMessage } from './messages';
import { useLanguage } from './LanguageProvider';
export function ErrorNotice({ error, className = '', compact = false }: { error: unknown; className?: string; compact?: boolean }) {
  const { language, t } = useLanguage();
  const cause = isMessage(error) && error.cause !== undefined ? error.cause : error;
  const explained = describeError(cause, language);
  const known = knownMessage(cause);
  const summary = isMessage(error) ? t(error.key, error.params) : known ? t(known) : explained.summary;
  return <div className={`localized-error ${className}`} role="alert">
    <span>{summary || t('common.error')}</span>
    <small>{explained.action || t('common.action')}</small>
    {!compact && Boolean(explained.code || explained.details) && <details><summary>{t('common.details')}</summary><pre>{explained.code}{explained.details ? `\n${explained.details}` : ''}</pre></details>}
  </div>;
}
