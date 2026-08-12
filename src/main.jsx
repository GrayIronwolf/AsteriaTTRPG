import React from 'react';
import { createRoot } from 'react-dom/client';
import { AsteriaReactRoot } from './app/AsteriaReactRoot.jsx';
import './styles/asteria-react.css';

const host = document.getElementById('asteriaReactRoot');
if(host) createRoot(host).render(<AsteriaReactRoot />);
document.documentElement.dataset.asteriaLiveCharacterDashboard = 'active';

function openRoute(path) {
  document.getElementById('gmEncounterWorkspace')?.remove();
  document.getElementById('phase3GMPartyMagicPanel')?.remove();
  document.getElementById('phase3GMMagicGrantPanel')?.remove();
  window.location.hash = path;
  window.setView?.('reactDashboard');
}

function restoreLegacy(view, callback) {
  window.location.hash = '';
  window.setView?.(view);
  callback?.();
}

function linkedCharacterRoute(characterId = '') {
  const id = characterId || window.session?.character || window.selected || '';
  const character = window.chars?.[id] || {};
  const campaignId = character.sharedCampaignId || character.campaignId || character.linkedCampaignIds?.[0] ||
    (window.campaigns || []).find(campaign => (campaign.party || []).includes(id))?.id || '';
  return id && campaignId ? { id, campaignId } : null;
}

window.AsteriaReactMigration = Object.assign(window.AsteriaReactMigration || {}, {
  available: true,
  milestone: 'live-session-real-time-dashboards-v1',
  openGM: campaignId => openRoute(`#/react/gm/${encodeURIComponent(campaignId)}`),
  openCharacter: (campaignId, characterId) => openRoute(`#/react/character/${encodeURIComponent(campaignId)}/${encodeURIComponent(characterId)}`),
  openLegacyGM: () => restoreLegacy('gm', () => window.renderGM?.()),
  openCurrentCharacter: characterId => {
    const route = linkedCharacterRoute(characterId);
    if(route) return openRoute(`#/react/character/${encodeURIComponent(route.campaignId)}/${encodeURIComponent(route.id)}`);
    window.AsteriaGameplay?.openCharacterForgeHub?.() || window.AsteriaWorkspace?.openCharacterForge?.();
    window.toast?.('Link this character to a campaign to open its live dashboard.');
  },
  isDashboardActive: () => Boolean(window.location.hash.match(/^#\/react\/(gm|character)\//))
});

const legacySetView = window.setView;
if(typeof legacySetView === 'function' && !legacySetView.__asteriaLiveCharacterWrapped) {
  window.setView = function(view, ...args) {
    if(view === 'player') return window.AsteriaReactMigration.openCurrentCharacter();
    return legacySetView.call(this, view, ...args);
  };
  window.setView.__asteriaLiveCharacterWrapped = true;
}

window.dispatchEvent(new CustomEvent('asteria:react-ready'));
