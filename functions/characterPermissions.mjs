/**
 * Authoritative v2 member status. No legacy UID/role array may grant v2 access.
 * The membership document is always loaded by the trusted server.
 */
export const isCampaignGM=(campaign,uid,membership=null)=>{
  if(!campaign || !uid) return false;
  const version=campaign.membershipSchemaVersion;
  if(version===2) return campaign.ownerUid===uid ||
    (membership?.uid===uid && membership?.campaignId===(campaign.id || membership?.campaignId) &&
      membership?.status==='active' && membership?.role==='co-gm');
  if(version!==undefined && version!==null && version!==1) return false;
  return campaign.ownerUid===uid || (campaign.gmUids || []).includes(uid) || campaign.roles?.[uid]==='gm';
};
export const isCampaignMember=(campaign,uid,membership=null)=>{
  if(!campaign || !uid) return false;
  const version=campaign.membershipSchemaVersion;
  if(version===2) return isCampaignGM(campaign,uid,membership) ||
    (membership?.uid===uid && membership?.campaignId===(campaign.id || membership?.campaignId) &&
      membership?.status==='active' && membership?.role==='player');
  if(version!==undefined && version!==null && version!==1) return false;
  return isCampaignGM(campaign,uid) || (campaign.playerUids || []).includes(uid) || campaign.roles?.[uid]==='player';
};
export const membershipRef=(db,campaignId,uid)=>db.doc(`campaigns/${campaignId}/members/${uid}`);
export async function readCampaignMember(transaction,db,campaignId,campaign,uid){
  if(campaign?.membershipSchemaVersion!==2) return null;
  const snapshot=await transaction.get(membershipRef(db,campaignId,uid));
  return snapshot.exists ? snapshot.data() : null;
}
export function isLinkedCharacter(campaign,characterId,character,campaignId) {
  const owner=character.ownerUid,link=campaign.playerCharacterLinks?.[characterId],summary=campaign.characters?.[characterId]?.ownerUid;
  return typeof owner==='string' && Boolean(owner) && (!character.sharedCampaignId || character.sharedCampaignId===campaignId)
    && (!link || link===owner) && (!summary || summary===owner)
    && (link===owner || summary===owner || (campaign.players?.[owner]?.characterIds || []).includes(characterId));
}
export const GM_CHARACTER_ACTIONS=new Set(['sendCharacterNotification','updateCharacterInventory','createCustomLootReward','grantGMRewardBundle','syncCampaignItemPrivacy','reviewCharacterQuest','manageCharacterCondition','configureCharacterResource','reviewCharacterRest','refreshCharacterSystems']);
export const GM_ONLY_ACTIONS=new Set(['sendCharacterNotification','grantGMRewardBundle','reviewCharacterQuest','configureCharacterResource','reviewCharacterRest','syncCampaignItemPrivacy']);
