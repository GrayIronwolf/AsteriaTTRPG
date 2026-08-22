/**
 * Temporary boundary between the canonical React dashboards and static routes
 * that have not yet migrated. Keep all legacy DOM/global writes in this file.
 */

export function activateReactDashboard() {
  document.getElementById('gmEncounterWorkspace')?.remove();
  document.getElementById('phase3GMPartyMagicPanel')?.remove();
  document.getElementById('phase3GMMagicGrantPanel')?.remove();
  window.setView?.('reactDashboard');
}

export function openLegacyView(view, callback) {
  window.location.hash = '';
  window.setView?.(view);
  callback?.();
}

export function openLegacyGMSystem(tab) {
  openLegacyView('gm', () => {
    window.renderGM?.();
    window.setGMSystem?.(tab);
  });
}

export function publishCustomItems(items = []) {
  window.ASTERIA_CUSTOM_ITEMS = items;
  window.dispatchEvent(new CustomEvent('asteria:custom-items-updated', { detail:{ items } }));
}

export function mirrorCharacterSnapshot(character) {
  if(!character?.id) return;
  const snapshot = typeof structuredClone === 'function'
    ? structuredClone(character)
    : JSON.parse(JSON.stringify(character));
  window.chars = window.chars || {};
  window.chars[character.id] = Object.assign({}, window.chars[character.id] || {}, snapshot);
  window.selected = character.id;
  window.session = Object.assign({}, window.session || {}, { character: character.id });
}
