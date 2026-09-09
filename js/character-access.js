/* Shared ownership boundary for the static Forge and React dashboards. */
(function(root){
  const owns = (character, uid) => Boolean(uid && character?.ownerUid === uid);
  const ownedIds = (characters, uid) => Object.keys(characters || {}).filter(id => owns(characters[id], uid));
  const isGM = (campaign, uid) => Boolean(uid && campaign && (
    campaign.ownerUid === uid || campaign.roles?.[uid] === 'gm' || (campaign.gmUids || []).includes(uid)
  ));
  function isLinked(campaign, character){
    if(!campaign?.id || !character?.id || !character.ownerUid) return false;
    if(character.sharedCampaignId && character.sharedCampaignId !== campaign.id) return false;
    const linkedOwner = campaign.playerCharacterLinks?.[character.id];
    const summaryOwner = campaign.characters?.[character.id]?.ownerUid;
    if(linkedOwner && linkedOwner !== character.ownerUid || summaryOwner && summaryOwner !== character.ownerUid) return false;
    return linkedOwner === character.ownerUid || summaryOwner === character.ownerUid ||
      (campaign.players?.[character.ownerUid]?.characterIds || []).includes(character.id);
  }
  root.AsteriaCharacterAccess = Object.freeze({ owns, ownedIds, isGM, isLinked,
    canGMView:(campaign, character, uid) => isGM(campaign, uid) && isLinked(campaign, character)
  });
})(typeof window === 'undefined' ? globalThis : window);
