/**
 * Resolve an active dashboard tab against the tabs currently available.
 * A character may lose campaign-only tabs while live data changes.
 */
export function resolveDashboardTab(tabs, requested, fallback = 'dashboard') {
  const available = Array.isArray(tabs) ? tabs.filter(tab => typeof tab?.id === 'string') : [];
  if (available.some(tab => tab.id === requested)) return requested;
  if (available.some(tab => tab.id === fallback)) return fallback;
  return available[0]?.id || '';
}

/**
 * Keep GM controls attached to an existing character when the roster changes.
 * Never retain the id of a removed or unavailable character.
 */
export function resolveRosterSelection(characters, requested) {
  const roster = characters && typeof characters === 'object' ? characters : {};
  if (requested && Object.hasOwn(roster, requested) && roster[requested]) return requested;
  return Object.keys(roster).find(id => Boolean(roster[id])) || '';
}
