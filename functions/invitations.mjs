export async function accessInvite(db, uid, code, join=false) {
  if(!uid) throw new Error('Sign in to continue.');
  if(typeof code !== 'string' || !/^\d{12}$/.test(code)) throw new Error('Enter the 12-digit campaign code.');
  return db.runTransaction(async transaction=>{
    const invite=await transaction.get(db.doc(`campaignInvites/${code}`));
    if(!invite.exists || invite.data().status!=='active') return null;
    const id=invite.data().campaignId;
    if(typeof id!=='string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) return null;
    const ref=db.doc(`campaigns/${id}`);
    const snapshot=await transaction.get(ref);
    if(!snapshot.exists) return null;
    const campaign=snapshot.data();
    if(campaign.ownerUid!==invite.data().ownerUid || campaign.ucn!==code) return null;
    if(!join) return {id,name:campaign.name||'Campaign',ucn:code};
    const isGM=campaign.ownerUid===uid || (campaign.gmUids||[]).includes(uid) || campaign.roles?.[uid]==='gm';
    const previous=campaign.players?.[uid]||{};
    const player={...previous,uid,role:isGM?'gm':'player',status:'active',characterIds:previous.characterIds||[],joinedAt:previous.joinedAt||new Date().toISOString()};
    const next={...campaign,id,playerUids:[...new Set([...(campaign.playerUids||[]),...(isGM?[]:[uid])])],roles:{...campaign.roles,[uid]:player.role},players:{...campaign.players,[uid]:player}};
    transaction.update(ref,{playerUids:next.playerUids,roles:next.roles,players:next.players});
    transaction.set(db.doc(`users/${uid}/campaigns/${id}`),next);
    return next;
  });
}
