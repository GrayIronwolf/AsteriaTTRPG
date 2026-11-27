import {campaignMembershipRole,isGameMasterRole} from '../src/state/campaignMembershipAccess.mjs';
export const isCampaignGM=(campaign,uid,member=null,campaignId=campaign?.id)=>
  isGameMasterRole(campaignMembershipRole(campaign,uid,member,campaignId));
export const isCampaignMember=(campaign,uid,member=null,campaignId=campaign?.id)=>
  Boolean(campaignMembershipRole(campaign,uid,member,campaignId));
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
export const GM_CHARACTER_ACTIONS=new Set(['grantCharacterXP','sendCharacterNotification','updateCharacterInventory','createCustomLootReward','grantGMRewardBundle','manageMerchantRelationship','manageEnhancementPlan','reviewEnhancement','manageCraftingStation','manageNPCService','reviewNPCRepair','manageCampaignCraftingRecipe','reviewCraftingRequest','manageCampaignShop','manageGMRewardBundle','syncGMRewardBundles','syncCampaignShopStores','syncCampaignItemPrivacy','reviewCharacterQuest','manageCharacterCondition','configureCharacterResource','reviewCharacterRest','refreshCharacterSystems']);
export const GM_ONLY_ACTIONS=new Set(['grantCharacterXP','sendCharacterNotification','grantGMRewardBundle','manageMerchantRelationship','manageEnhancementPlan','reviewEnhancement','manageCampaignCraftingRecipe','reviewCraftingRequest','manageCampaignShop','manageGMRewardBundle','syncGMRewardBundles','syncCampaignShopStores','reviewCharacterQuest','configureCharacterResource','reviewCharacterRest','syncCampaignItemPrivacy']);
