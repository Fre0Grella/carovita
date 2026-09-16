import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App.js';
import { ErrorBoundary } from './ui/ErrorBoundary.js';
import './ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root non trovato.');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
