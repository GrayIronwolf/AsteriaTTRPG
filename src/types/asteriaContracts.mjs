/**
 * Shared application contracts for the JavaScript React migration.
 * These JSDoc types are the canonical frontend vocabulary until the project
 * adopts TypeScript; runtime constants prevent feature modules inventing
 * competing route, session, or connection labels.
 */

export const REACT_ROUTE_TYPES = Object.freeze({
  GM: 'gm',
  CHARACTER: 'character'
});

export const SESSION_STATES = Object.freeze({
  IDLE: 'idle',
  ACTIVE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended',
  EXPIRED: 'expired'
});

export const LIVE_SYNC_STATES = Object.freeze({
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  EXPIRED: 'expired',
  READ_ONLY: 'read-only',
  WAITING_FOR_GM: 'waiting-for-gm',
  ERROR: 'error'
});

/**
 * @typedef {Object} AsteriaItem
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {number} marketValue Standard amount the player normally receives when selling, in Marks.
 * @property {number|null} marketPrice Standard amount the player normally pays when purchasing, in Marks. Null is legacy-only.
 */

/** @typedef {'gm'|'character'} AsteriaReactRouteType */
/**
 * @typedef {Object} AsteriaReactRoute
 * @property {AsteriaReactRouteType} type
 * @property {string} campaignId
 * @property {string} [characterId]
 */
/**
 * @typedef {Object} AsteriaAccountSnapshot
 * @property {object|null} user
 * @property {object|null} profile
 * @property {boolean} authenticated
 */
/**
 * @typedef {Object} AsteriaLiveSyncPresentation
 * @property {string} state
 * @property {string} label
 * @property {string} detail
 * @property {string} tone
 */
