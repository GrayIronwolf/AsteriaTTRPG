/* Shared ownership boundary for the static Forge and React dashboards. */
(function(root){
  const owns = (character, uid) => Boolean(uid && character?.ownerUid === uid);
  const ownedIds = (characters, uid) => Object.keys(characters || {}).filter(id => owns(characters[id], uid));
  // v2 access is derived from the active member document, never legacy roles.
  const isGM = (campaign, uid, membership = null) => {
    if(!uid || !campaign)return false;
    const version=campaign.membershipSchemaVersion;
    if(version===2)return campaign.ownerUid===uid || Boolean(
      campaign.id && membership?.uid===uid && membership?.campaignId===campaign.id &&
      membership?.status==='active' && membership?.role==='co-gm'
    );
    if(version!==undefined && version!==null && version!==1)return false;
    return campaign.ownerUid===uid || campaign.roles?.[uid]==='gm' ||
      (Array.isArray(campaign.gmUids) && campaign.gmUids.includes(uid));
  };
  function linkProblem(campaign, character){
    if(!campaign?.id || !character?.id) return 'The campaign or character record ID is missing.';
    if(!character.ownerUid) return 'This character has no verified owner.';
    if(character.sharedCampaignId && character.sharedCampaignId !== campaign.id) return 'This character points to another campaign.';
    const linkedOwner = campaign.playerCharacterLinks?.[character.id];
    const summaryOwner = campaign.characters?.[character.id]?.ownerUid;
    if(linkedOwner && linkedOwner !== character.ownerUid || summaryOwner && summaryOwner !== character.ownerUid) return 'The campaign link and character owner do not match.';
    if(linkedOwner === character.ownerUid || summaryOwner === character.ownerUid ||
      (campaign.players?.[character.ownerUid]?.characterIds || []).includes(character.id)) return '';
    return 'This character has no saved ownership link to this campaign.';
  }
  const isLinked=(campaign,character)=>linkProblem(campaign,character)==='';
  root.AsteriaCharacterAccess = Object.freeze({ owns, ownedIds, isGM, isLinked, linkProblem,
    canGMView:(campaign, character, uid, membership = null) => isGM(campaign, uid, membership) && isLinked(campaign, character)
  });
})(typeof window === 'undefined' ? globalThis : window);
