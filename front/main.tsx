import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatDock } from './chat/ChatDock';
import { ApplicationBoundary } from './chat/ApplicationBoundary';
import { PageContextBridge } from './features/page-context/PageContextBridge';
import { LanguageProvider, LanguageSelector } from './localization/LanguageProvider';
import './styles.css';
import './chat/chat.css';

const App = lazy(() => import('./App').then(module => ({ default: module.App })));

createRoot(document.getElementById('root')!).render(<StrictMode><LanguageProvider>
  <main className="seed-page">
    <header className="page-header"><span className="wordmark">Sapling<span>agent</span></span><LanguageSelector /></header>
    <div className="application-content"><ApplicationBoundary><Suspense fallback={null}><App /></Suspense></ApplicationBoundary></div>
    <ChatDock />
    <PageContextBridge />
  </main>
</LanguageProvider></StrictMode>);
