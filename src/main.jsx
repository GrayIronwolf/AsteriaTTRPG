import * as talentSystem from './state/talentModel.mjs';
import { navigateReactRoute, parseReactRoute } from './app/asteriaRoutes.mjs';
import { activateReactDashboard, openLegacyView } from './app/legacyBridge.js';
import * as armourSystem from './systems/armour/armourSystem.mjs';

const host = document.getElementById('asteriaReactRoot');
let dashboardLoad = null;
function ensureDashboard(){
  if(!host) return Promise.resolve();
  if(dashboardLoad) return dashboardLoad;
  host.innerHTML = '<div class="react-route-loading" role="status" aria-live="polite">Loading Asteria workspace...</div>';
  dashboardLoad = import('./app/mountDashboard.jsx').then(module => module.mountDashboard(host)).catch(error => {
    dashboardLoad = null;
    if(parseReactRoute(window.location.hash)) {
      host.innerHTML = '<div class="react-route-state" role="alert"><p>The dashboard could not load. Reload the page to try again.</p><button type="button">Reload dashboard</button></div>';
      host.querySelector('button')?.addEventListener('click',() => window.location.reload(),{once:true});
    }
    console.warn('Asteria dashboard could not load.',error);
  });
  return dashboardLoad;
}
function loadActiveDashboard(){
  if(parseReactRoute(window.location.hash)) {
    activateReactDashboard();
    ensureDashboard();
  }
}
window.addEventListener('hashchange',loadActiveDashboard);
document.documentElement.dataset.asteriaLiveCharacterDashboard = 'active';
window.AsteriaArmour = Object.freeze({ ...armourSystem });
window.AsteriaTalents = Object.freeze({ ...talentSystem });

function openRoute(route) {
  // Normal owner/navigation entry must not inherit a previous GM visit.
  if(window.history.state?.gmReturn) {
    const state = {...window.history.state};
    delete state.gmReturn;
    window.history.replaceState(state, '');
  }
  activateReactDashboard();
  const hash = navigateReactRoute(route);
  ensureDashboard();
  return hash;
}

function restoreLegacy(view, callback) {
  openLegacyView(view, callback);
}

function linkedCharacterRoute(characterId = '') {
  const id = characterId || window.session?.character || window.selected || '';
  const character = window.chars?.[id] || {};
  const campaignId = character.sharedCampaignId || character.campaignId || character.linkedCampaignIds?.[0] ||
    (window.campaigns || []).find(campaign => (campaign.party || []).includes(id))?.id || '';
  return id ? { id, campaignId } : null;
}

window.AsteriaReactMigration = Object.assign(window.AsteriaReactMigration || {}, {
  available: true,
  dashboardRuntime: 'on-demand',
  milestone: 'live-session-real-time-dashboards-v1',
  openGM: campaignId => openRoute({ type:'gm', campaignId }),
  openCharacter: (campaignId, characterId) => openRoute({ type:'character', campaignId, characterId }),
  openLegacyGM: () => restoreLegacy('gm', () => window.renderGM?.()),
  openCurrentCharacter: characterId => {
    const route = linkedCharacterRoute(characterId);
    if(route) return openRoute({ type:route.campaignId?'character':'owned-character', campaignId:route.campaignId, characterId:route.id });
    window.AsteriaGameplay?.openCharacterForgeHub?.() || window.AsteriaWorkspace?.openCharacterForge?.();
    window.toast?.('Choose a character to open its dashboard.');
  },
  isDashboardActive: () => Boolean(parseReactRoute(window.location.hash))
});

const legacySetView = window.setView;
if(typeof legacySetView === 'function' && !legacySetView.__asteriaLiveCharacterWrapped) {
  window.setView = function(view, ...args) {
    if(view === 'player') return window.AsteriaReactMigration.openCurrentCharacter();
    return legacySetView.call(this, view, ...args);
  };
  window.setView.__asteriaLiveCharacterWrapped = true;
}

loadActiveDashboard();
window.dispatchEvent(new CustomEvent('asteria:react-ready'));
