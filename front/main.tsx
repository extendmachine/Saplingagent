import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatDock } from './chat/ChatDock';
import { ApplicationBoundary } from './chat/ApplicationBoundary';
import { PageContextBridge } from './features/page-context/PageContextBridge';
import { LanguageProvider } from './localization/LanguageProvider';
import { PageHeader } from './PageHeader';
import './styles.css';
import './chat/chat.css';

const App = lazy(() => import('./App').then(module => ({ default: module.App })));

createRoot(document.getElementById('root')!).render(<StrictMode><LanguageProvider>
  <main className="seed-page">
    <PageHeader />
    <div className="application-content"><ApplicationBoundary><Suspense fallback={null}><App /></Suspense></ApplicationBoundary></div>
    <ChatDock />
    <PageContextBridge />
  </main>
</LanguageProvider></StrictMode>);
