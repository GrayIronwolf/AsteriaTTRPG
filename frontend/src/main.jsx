import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';
// Phase 1.3 replaces the old single-file preview stylesheet completely.
// Only tokens/reset/type are global; UI and pages use CSS Modules.
import './styles/tokens.css';
import './styles/reset.css';
import './styles/typography.css';

const host = document.getElementById('asteria-site-root');
if (!host) {
  throw new Error('Asteria frontend entry point is missing #asteria-site-root');
}

createRoot(host).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
