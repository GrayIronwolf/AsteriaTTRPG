import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';
import './styles/foundation.css';

const host = document.getElementById('asteria-site-root');
if (!host) {
  throw new Error('Asteria frontend entry point is missing #asteria-site-root');
}

createRoot(host).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
