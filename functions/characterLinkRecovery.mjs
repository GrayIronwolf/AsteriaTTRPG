import { isCampaignMember } from './characterPermissions.mjs';

// Repair stale campaign indexes only. Neither character ownership nor a saved
// sheet is created, transferred or overwritten by this operation.
export async function repairCharacterLink(db, uid, data, serverTimestamp) {
  const [campaignId, characterId] = data.args;
  const input = JSON.stringify(data.args);
  const campaignRef = db.doc(`campaigns/${campaignId}`);
  const characterRef = db.doc(`campaigns/${campaignId}/characters/${characterId}`);
  const receiptRef = db.doc(`campaigns/${campaignId}/actionReceipts/${uid}_${data.requestId}`);
  return db.runTransaction(async transaction => {
    const [campaignSnapshot, characterSnapshot, receipt] = await Promise.all([
      transaction.get(campaignRef), transaction.get(characterRef), transaction.get(receiptRef)
    ]);
    if (!campaignSnapshot.exists || !isCampaignMember(campaignSnapshot.data(), uid)) throw new Error('Campaign membership is required.');
    if (!characterSnapshot.exists) throw new Error('The campaign character no longer exists. No sheet was recreated.');
    const campaign = campaignSnapshot.data(), character = characterSnapshot.data();
    if (character.ownerUid !== uid) throw new Error('Only the existing character owner can repair this link.');
    if (character.sharedCampaignId && character.sharedCampaignId !== campaignId) throw new Error('This character belongs to another campaign.');
    const sourceId = character.sourceCharacterId || characterId;
    if (typeof sourceId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(sourceId)) throw new Error('The saved character reference is invalid.');
    const savedSnapshot = await transaction.get(db.doc(`users/${uid}/characters/${sourceId}`));
    if (!savedSnapshot.exists || savedSnapshot.data().ownerUid !== uid) throw new Error('The existing saved character could not verify ownership. No ownership was changed.');
    const saved = savedSnapshot.data();
    if (saved.sourceCharacterId && saved.sourceCharacterId !== sourceId) throw new Error('The saved character reference does not match.');
    if (saved.sharedCampaignId !== campaignId && !(saved.linkedCampaignIds || []).includes(campaignId)) throw new Error('The saved character does not confirm this campaign link.');
    if (receipt.exists) {
      if (receipt.data().action !== data.action || receipt.data().input !== input) throw new Error('Request ID has already been used.');
      return receipt.data().result;
    }
    const players = Object.fromEntries(Object.entries(campaign.players || {}).map(([owner, player]) => [owner, {
      ...player, characterIds: owner === uid
        ? [...new Set([...(Array.isArray(player?.characterIds) ? player.characterIds : []), characterId])]
        : (Array.isArray(player?.characterIds) ? player.characterIds : []).filter(id => id !== characterId)
    }]));
    // Membership is already verified; do not manufacture or change a role.
    if (!players[uid]) players[uid] = {uid, characterIds:[characterId]};
    const result = {ok:true, characterId, sourceCharacterId:sourceId, ownerUid:uid};
    transaction.update(campaignRef, {
      playerCharacterLinks:{...(campaign.playerCharacterLinks || {}), [characterId]:uid},
      characters:{...(campaign.characters || {}), [characterId]:{
        ...(campaign.characters?.[characterId] || {}), id:characterId,
        name:character.name || characterId, ownerUid:uid, sourceCharacterId:sourceId
      }},
      players, party:[...new Set([...(campaign.party || []), characterId])],
      updatedAt:serverTimestamp()
    });
    transaction.set(receiptRef, {action:data.action, input, result, createdAt:serverTimestamp()});
    return result;
  });
}
