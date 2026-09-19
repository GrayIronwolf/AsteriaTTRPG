export const isCampaignGM=(campaign,uid)=>campaign.ownerUid===uid || (campaign.gmUids || []).includes(uid) || campaign.roles?.[uid]==='gm';
export const isCampaignMember=(campaign,uid)=>isCampaignGM(campaign,uid) || (campaign.playerUids || []).includes(uid) || campaign.roles?.[uid]==='player';
export function isLinkedCharacter(campaign,characterId,character,campaignId) {
  const owner=character.ownerUid,link=campaign.playerCharacterLinks?.[characterId],summary=campaign.characters?.[characterId]?.ownerUid;
  return typeof owner==='string' && Boolean(owner) && (!character.sharedCampaignId || character.sharedCampaignId===campaignId)
    && (!link || link===owner) && (!summary || summary===owner)
    && (link===owner || summary===owner || (campaign.players?.[owner]?.characterIds || []).includes(characterId));
}
export const GM_CHARACTER_ACTIONS=new Set(['reviewCharacterQuest','manageCharacterCondition','configureCharacterResource','reviewCharacterRest','refreshCharacterSystems']);
export const GM_ONLY_ACTIONS=new Set(['reviewCharacterQuest','configureCharacterResource','reviewCharacterRest']);
