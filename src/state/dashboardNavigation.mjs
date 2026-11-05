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

/**
 * Move a clipped active dashboard tab into view without scrolling the page.
 * Coordinates are viewport-relative (getBoundingClientRect).
 */
export function tabVisibilityDelta({ viewportStart, viewportEnd, itemStart, itemEnd }) {
  if (![viewportStart, viewportEnd, itemStart, itemEnd].every(Number.isFinite)) return 0;
  if (viewportEnd <= viewportStart) return 0;
  if (itemStart < viewportStart) return itemStart - viewportStart;
  if (itemEnd > viewportEnd) return itemEnd - viewportEnd;
  return 0;
}
