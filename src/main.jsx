import React from 'react';
import { createRoot } from 'react-dom/client';
import { AsteriaReactRoot } from './app/AsteriaReactRoot.jsx';
import './styles/asteria-react.css';

const host = document.getElementById('asteriaReactRoot');
if(host) createRoot(host).render(<AsteriaReactRoot />);

function openRoute(path) {
  window.location.hash = path;
  window.setView?.('reactDashboard');
}

function restoreLegacy(view, callback) {
  window.location.hash = '';
  window.setView?.(view);
  callback?.();
}

window.AsteriaReactMigration = Object.assign(window.AsteriaReactMigration || {}, {
  available: true,
  milestone: 'live-session-real-time-dashboards-v1',
  openGM: campaignId => openRoute(`#/react/gm/${encodeURIComponent(campaignId)}`),
  openCharacter: (campaignId, characterId) => openRoute(`#/react/character/${encodeURIComponent(campaignId)}/${encodeURIComponent(characterId)}`),
  openLegacyGM: () => restoreLegacy('gm', () => window.renderGM?.()),
  openLegacyCharacter: characterId => restoreLegacy('player', () => window.loadPlayer?.(characterId)),
  isDashboardActive: () => Boolean(window.location.hash.match(/^#\/react\/(gm|character)\//))
});

window.dispatchEvent(new CustomEvent('asteria:react-ready'));
