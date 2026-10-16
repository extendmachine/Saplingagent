import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatDock } from './chat/ChatDock';
import { ApplicationBoundary } from './chat/ApplicationBoundary';
import { PageContextBridge } from './features/page-context/PageContextBridge';
import './styles.css';
import './chat/chat.css';

const App = lazy(() => import('./App').then(module => ({ default: module.App })));

createRoot(document.getElementById('root')!).render(<StrictMode>
  <main className="seed-page">
    <header className="page-header"><span className="wordmark">Sapling<span>agent</span></span></header>
    <div className="application-content"><ApplicationBoundary><Suspense fallback={null}><App /></Suspense></ApplicationBoundary></div>
    <ChatDock />
    <PageContextBridge />
  </main>
</StrictMode>);
