// Use only a server-read campaign and member record for authorization.
export function campaignMembershipRole(campaign, uid, member = null, campaignId = campaign?.id) {
  if (!campaign || typeof uid !== 'string' || !uid ||
      (campaign.id && campaign.id !== campaignId)) return '';
  const version = campaign.membershipSchemaVersion ?? 1;
  if (version !== 1 && version !== 2) return '';
  if (campaign.ownerUid === uid) return 'owner';
  if (version === 2) {
    if (!campaignId || member?.uid !== uid || member.campaignId !== campaignId ||
        member.status !== 'active') return '';
    return member.role === 'co-gm' || member.role === 'player' ? member.role : '';
  }
  if (campaign.roles?.[uid] === 'gm' ||
      (Array.isArray(campaign.gmUids) && campaign.gmUids.includes(uid))) return 'gm';
  if (campaign.roles?.[uid] === 'player' ||
      (Array.isArray(campaign.playerUids) && campaign.playerUids.includes(uid))) return 'player';
  return '';
}
export function isGameMasterRole(role) {
  return role === 'owner' || role === 'co-gm' || role === 'gm';
}
