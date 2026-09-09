/** Validate private mirrors against their linked, server-owned campaign records.
 * A prior client bug could save a viewed character under the viewer's UID.
 * Do not import or delete those copies, or infer ownership from legacy aliases.
 */
export async function validateOwnedRecord(record, uid, readCampaignCharacter) {
  if(!uid || record?.ownerUid !== uid) return false;
  const campaignIds = [...new Set([
    ...(Array.isArray(record.linkedCampaignIds) ? record.linkedCampaignIds : []),
    record.sharedCampaignId, record.campaignId
  ].filter(Boolean))];
  for(const campaignId of campaignIds) {
    const shared = await readCampaignCharacter(campaignId, record.id);
    if(!shared || shared.ownerUid !== uid ||
      (shared.sourceCharacterId || shared.id) !== (record.sourceCharacterId || record.id)) return false;
  }
  return true;
}
