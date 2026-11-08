/**
 * Phase 1.3: isolated policy contract for campaign connections v2.
 * NOT wired to production Firestore Rules, Functions, or client membership checks.
 * A future rollout must explicitly connect every authorization path together.
 */
export const CAMPAIGN_CONNECTIONS_V2_FLAG = 'ASTERIA_CAMPAIGN_CONNECTIONS_V2';
export const CAMPAIGN_CONNECTIONS_V2_DEFAULT = 'disabled';

const CO_GM_CAPABILITIES = new Set([
  'view-member-roster',
  'review-join-requests',
  'manage-invitations',
  'moderate-players',
  'manage-character-links'
]);

export function isCampaignConnectionsV2Requested(flags = {}) {
  return flags?.[CAMPAIGN_CONNECTIONS_V2_FLAG] === 'enabled';
}

/** A v2 campaign with a disabled feature gate must never fall back to v1 access. */
export function campaignConnectionMode(campaign, flags = {}) {
  if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) return 'blocked';
  const version = campaign.membershipSchemaVersion;
  if (version === 2) return isCampaignConnectionsV2Requested(flags) ? 'v2' : 'blocked';
  if (version === 1 || version === undefined || version === null) return 'legacy';
  return 'blocked';
}

export function mayAccessV2Campaign({ campaign, campaignId, uid, membership, flags = {} } = {}) {
  if (typeof campaignId !== 'string' || !campaignId || typeof uid !== 'string' || !uid) return false;
  if (campaignConnectionMode(campaign, flags) !== 'v2') return false;
  if (typeof campaign.ownerUid !== 'string' || !campaign.ownerUid) return false;
  if (campaign.ownerUid === uid) return true;
  return membership?.uid === uid && membership?.campaignId === campaignId &&
    membership?.status === 'active' &&
    (membership?.role === 'player' || membership?.role === 'co-gm');
}

/** Explicit Co-GM grants do not confer ownership or privileged role assignment. */
export function mayManageV2Campaign({ campaign, campaignId, uid, membership, flags = {}, permission } = {}) {
  if (typeof permission !== 'string' || !permission) return false;
  if (!mayAccessV2Campaign({ campaign, campaignId, uid, membership, flags })) return false;
  if (campaign.ownerUid === uid) return true;
  return membership?.role === 'co-gm' && CO_GM_CAPABILITIES.has(permission) &&
    membership?.capabilityOverrides?.[permission] === true;
}
