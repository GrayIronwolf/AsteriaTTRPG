import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';
import { AuthBootstrap } from './auth/AuthBootstrap.jsx';
import { AppearanceProvider } from './appearance/AppearanceProvider.jsx';
// Tokens/reset/typography are the only global CSS; page UI uses CSS Modules.
import './styles/tokens.css';
import './styles/reset.css';
import './styles/typography.css';
import {captureIncomingSecureInvite} from './campaigns/campaignConnectionModel.mjs';

// Enabled secure links are captured and scrubbed before React renders or Auth
// loads. The secret is never recorded in URL history or browser storage.
if(import.meta.env.VITE_ASTERIA_CAMPAIGN_CONNECTIONS_ENABLED==='true'){
  const scrub=()=>captureIncomingSecureInvite({
    hash:window.location.hash,
    replace:hash=>window.history.replaceState(window.history.state,'',
      window.location.pathname+window.location.search+hash)
  });
  scrub();
}

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
