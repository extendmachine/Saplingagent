import { useLanguage } from '../localization/LanguageProvider';
import { Component, type ReactNode } from 'react';

function FailedContent({ retry }: { retry: () => void }) {
  const { t } = useLanguage();
  return <div className="application-error" role="status">{t('boundary.failed')}<button type="button" onClick={retry}>{t('boundary.reload')}</button></div>;
}

export class ApplicationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <FailedContent retry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
