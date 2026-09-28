import { REACT_ROUTE_TYPES } from '../types/asteriaContracts.mjs';

function decode(value) {
  try { return decodeURIComponent(value || ''); }
  catch { return String(value || ''); }
}

/** @returns {import('../types/asteriaContracts.mjs').AsteriaReactRoute|null} */
export function parseReactRoute(hash = '') {
  const owned = String(hash).match(/^#\/react\/owned-character\/([^/]+)\/?$/);
  if(owned) return {type:REACT_ROUTE_TYPES.OWNED_CHARACTER,campaignId:'',characterId:decode(owned[1])};
  const match = String(hash).match(/^#\/react\/(gm|character)\/([^/]+)(?:\/([^/]+))?\/?$/);
  if(!match) return null;
  const route = {
    type: match[1],
    campaignId: decode(match[2]),
    characterId: decode(match[3] || '')
  };
  if(route.type === REACT_ROUTE_TYPES.CHARACTER && !route.characterId) return null;
  return route;
}

export function buildReactRoute({ type, campaignId, characterId = '' } = {}) {
  if(!Object.values(REACT_ROUTE_TYPES).includes(type)) throw new Error(`Unsupported Asteria React route: ${type || 'empty'}.`);
  if(type === REACT_ROUTE_TYPES.OWNED_CHARACTER) {
    if(!String(characterId || '').trim()) throw new Error('A character ID is required.');
    return `#/react/owned-character/${encodeURIComponent(characterId)}`;
  }
  if(!String(campaignId || '').trim()) throw new Error('A campaign ID is required.');
  if(type === REACT_ROUTE_TYPES.CHARACTER && !String(characterId || '').trim()) throw new Error('A character ID is required.');
  const base = `#/react/${type}/${encodeURIComponent(campaignId)}`;
  return type === REACT_ROUTE_TYPES.CHARACTER ? `${base}/${encodeURIComponent(characterId)}` : base;
}

export function navigateReactRoute(route, locationObject = window.location) {
  const hash = buildReactRoute(route);
  locationObject.hash = hash;
  return hash;
}

export function clearReactRoute(locationObject = window.location) {
  locationObject.hash = '';
}
