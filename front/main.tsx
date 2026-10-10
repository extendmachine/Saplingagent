import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPanel } from './chat/ChatPanel';
import { ApplicationBoundary } from './chat/ApplicationBoundary';
import './styles.css';
import './chat/chat.css';

const App = lazy(() => import('./App').then(module => ({ default: module.App })));

createRoot(document.getElementById('root')!).render(<StrictMode><main className="seed-page"><header className="page-header"><span className="wordmark">Sapling<span>agent</span></span></header><ApplicationBoundary><Suspense fallback={null}><App /></Suspense></ApplicationBoundary><ChatPanel /></main></StrictMode>);
