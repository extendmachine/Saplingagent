import { Settings } from 'lucide-react';
import { LanguageSelector, useLanguage } from './localization/LanguageProvider';

export function PageHeader() {
  const { t } = useLanguage();
  return <header className="page-header">
    <span className="wordmark">Sapling<span>agent</span></span>
    <div className="page-header-actions">
      <LanguageSelector />
      <a className="settings-link" href="/__saplingagent/runtime" target="_blank" rel="noopener noreferrer" title={t('common.settingsHint')}>
        <Settings size={14} aria-hidden="true" />
        <span>{t('common.settings')}</span>
      </a>
    </div>
  </header>;
}
