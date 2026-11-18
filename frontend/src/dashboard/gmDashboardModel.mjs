import { CAMPAIGN_ID } from '../campaigns/campaignForgeModel.mjs';
import { effectiveSession } from '../../../src/state/liveWorkspaceModel.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;

export function assertGMCampaignId(id) {
  if (typeof id !== 'string' || !CAMPAIGN_ID.test(id)) throw new Error('Invalid campaign identifier.');
  return id;
}

/** Mirrors the authoritative v1/v2 GM definitions in firestore.rules.
 * The member argument MUST be the user's server-fetched /members/{uid} doc,
 * never a role supplied by URL, localStorage, or an account profile.
 */
export function gmCampaignAccess(campaign, member, uid, id) {
  if (!uid || !record(campaign) || !CAMPAIGN_ID.test(String(id || '')) ||
      campaign.id !== id) return Object.freeze({allowed:false,role:''});
  const version = campaign.membershipSchemaVersion ?? 1;
  if (version !== 1 && version !== 2) return Object.freeze({allowed:false,role:''});
  if (campaign.ownerUid === uid) return Object.freeze({allowed:true,role:'owner'});
  if (version === 2) {
    const valid = record(member) && member.uid === uid && member.campaignId === id &&
      member.status === 'active' && member.role === 'co-gm';
    return Object.freeze({allowed:Boolean(valid),role:valid?'co-gm':''});
  }
  const valid = (Array.isArray(campaign.gmUids) && campaign.gmUids.includes(uid)) ||
    (record(campaign.roles) && campaign.roles[uid] === 'gm');
  return Object.freeze({allowed:Boolean(valid),role:valid?'gm':''});
}

export function gmCampaignSummary(campaign, access) {
  if (!access?.allowed) throw new Error('GM campaign permission is required.');
  return Object.freeze({
    id:campaign.id, name:text(campaign.name,'Campaign').slice(0,120),
    description:text(campaign.description).slice(0,400),
    role:access.role,
    membershipSchemaVersion:campaign.membershipSchemaVersion ?? 1,
    partySize:Number.isInteger(Number(campaign.partySize)) ? Number(campaign.partySize) : 4
  });
}

function resource(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const current = Number(value[0]), maximum = Number(value[1]);
  return Number.isFinite(current) && Number.isFinite(maximum) && maximum >= 0
    ? [Math.max(0,current),maximum] : null;
}

/** Only render the required overview fields, not private character payloads. */
export function gmPartySummary(documents) {
  if (!Array.isArray(documents)) throw new TypeError('Expected Firestore character documents.');
  return Object.freeze(documents.slice(0,128).filter(item => record(item) &&
    CAMPAIGN_ID.test(String(item.id || ''))).map(item => Object.freeze({
    id:item.id, name:text(item.name,'Unnamed Character').slice(0,100),
    level:Number.isFinite(Number(item.level)) ? Math.max(0,Math.floor(Number(item.level))) : 0,
    className:text(item.className,typeof item.class === 'string' ? item.class :
      text(item.class?.name)).slice(0,80),
    hp:resource(item.hp), sp:resource(item.sp), mp:resource(item.mp)
  })));
}

export function gmSessionState(raw, now = Date.now()) {
  const value = effectiveSession(record(raw) ? raw : {status:'idle',id:''},now);
  return Object.freeze({
    id:text(value.id), status:['idle','active','paused','ended','expired'].includes(value.status)
      ? value.status : 'idle',
    expired:value.expired === true,
    editable:value.editable === true,
    expiresAtMs:value.expiresAtMs || 0
  });
}

export function gmSessionCommands(session) {
  if (session.status === 'active') return Object.freeze(['pause','end']);
  if (session.status === 'paused' && !session.expired) return Object.freeze(['start','end']);
  if (session.status === 'expired') return Object.freeze(['end']);
  if (session.status === 'ended' || session.status === 'idle') return Object.freeze(['start']);
  return Object.freeze([]);
}
