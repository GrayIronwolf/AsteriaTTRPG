import { LIVE_SYNC_STATES, SESSION_STATES } from '../types/asteriaContracts.mjs';

/** @returns {import('../types/asteriaContracts.mjs').AsteriaLiveSyncPresentation} */
export function liveSyncPresentation({ online = true, error = '', loading = false, connectionState = '', session = {} } = {}) {
  if(error) return { state:LIVE_SYNC_STATES.ERROR, label:'Sync needs attention', detail:String(error), tone:'error' };
  if(session.status === SESSION_STATES.EXPIRED || session.expired) return { state:LIVE_SYNC_STATES.EXPIRED, label:'Session expired', detail:'Gameplay is read-only', tone:'warning' };
  if(connectionState === LIVE_SYNC_STATES.RECONNECTING) return { state:LIVE_SYNC_STATES.RECONNECTING, label:'Reconnecting live sync', detail:'Restoring campaign updates', tone:'pending' };
  if(loading || connectionState === LIVE_SYNC_STATES.CONNECTING) return { state:LIVE_SYNC_STATES.CONNECTING, label:'Connecting live sync', detail:'Loading campaign state', tone:'pending' };
  if(!online) return { state:LIVE_SYNC_STATES.DISCONNECTED, label:'Live sync disconnected', detail:'Changes will resume after reconnecting', tone:'offline' };
  if(session.readOnly) return { state:LIVE_SYNC_STATES.READ_ONLY, label:'Live sync connected', detail:'Read-only access', tone:'warning' };
  if([SESSION_STATES.IDLE, SESSION_STATES.ENDED, 'not-started'].includes(session.status)) {
    return { state:LIVE_SYNC_STATES.WAITING_FOR_GM, label:'Live sync connected', detail:'Waiting for the GM to start a session', tone:'pending' };
  }
  return { state:LIVE_SYNC_STATES.CONNECTED, label:'Live sync connected', detail:session.status ? `Session: ${session.status}` : 'Campaign connected', tone:'online' };
}
