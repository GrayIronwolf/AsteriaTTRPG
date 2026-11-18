import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';
import { AuthBootstrap } from './auth/AuthBootstrap.jsx';
import { AppearanceProvider } from './appearance/AppearanceProvider.jsx';
// Tokens/reset/typography are the only global CSS; page UI uses CSS Modules.
import './styles/tokens.css';
import './styles/reset.css';
import './styles/typography.css';

const host = document.getElementById('asteria-site-root');
if (!host) {
  throw new Error('Asteria frontend entry point is missing #asteria-site-root');
}

createRoot(host).render(
  <React.StrictMode>
    <AppearanceProvider>
      <AuthBootstrap>
        <App />
      </AuthBootstrap>
    </AppearanceProvider>
  </React.StrictMode>
);
