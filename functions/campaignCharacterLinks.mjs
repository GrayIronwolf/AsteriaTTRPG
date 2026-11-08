import {createHash,randomUUID} from 'node:crypto';

// Phase 5.1: account-owned character participation requests only.
// A pending request never grants membership, creates a gameplay character,
// changes an owned sheet, or places a character in the active party.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const ACTIVE_LINK_STATUSES=new Set(['pending','approved']);
const LINK_STATUSES=new Set(['pending','approved','declined','inactive','unlinked']);
const validId=value=>typeof value==='string'&&ID.test(value);
const record=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);

function limit(value,fallback,label){
  if(value===undefined||value===null)return fallback;
  if(!Number.isSafeInteger(value)||value<1||value>100)
    throw new Error('Campaign '+label+' needs owner review.');
  return value;
}
export function characterCapacityLimits(campaign){
  const partySize=limit(campaign.partySize??campaign.settings?.partySize,4,'party size');
  return {
    overall:limit(campaign.capacity?.maxActiveCharacters,partySize,'character capacity'),
    perOwner:limit(campaign.capacity?.maxCharactersPerPlayer,1,'characters per player')
  };
}
function existingStatus(campaignId,link,alreadyExists=true){
  return {campaignId,sourceCharacterId:link.sourceCharacterId,
    status:link.status,campaignCharacterId:link.campaignCharacterId||null,
    revision:Number.isSafeInteger(link.revision)?link.revision:1,alreadyExists};
}
function ensureActiveMember(campaign,member,projection,uid,campaignId){
  const role=uid===campaign.ownerUid?'owner':member?.role;
  if(!record(member)||member.uid!==uid||member.campaignId!==campaignId||
    member.role!==role||member.status!=='active'||
    !Number.isSafeInteger(member.revision)||member.revision<1)
    throw new Error('Active campaign membership is required to request a character link.');
  if(!record(projection)||projection.campaignId!==campaignId||
    projection.status!=='active'||projection.role!==role)
    throw new Error('Campaign membership needs reconciliation before linking a character.');
}
export function ensureOwnedCampaignSheet(sheet,uid,sourceCharacterId){
  if(!record(sheet)||sheet.ownerUid!==uid||
    (sheet.id!==undefined&&sheet.id!==sourceCharacterId)||
    (sheet.sourceCharacterId!==undefined&&sheet.sourceCharacterId!==sourceCharacterId))
    throw new Error('The selected saved character is not owned by this account.');
}
export function legacyCharacterLinkExists(campaign,sheet,uid,sourceCharacterId,campaignId){
  const links=record(campaign.playerCharacterLinks)?campaign.playerCharacterLinks:{};
  const summaries=record(campaign.characters)?campaign.characters:{};
  const player=record(campaign.players?.[uid])?campaign.players[uid]:{};
  if(sheet.sharedCampaignId===campaignId||
    (Array.isArray(sheet.linkedCampaignIds)&&sheet.linkedCampaignIds.includes(campaignId)))
    return true;
  for(const [id,owner] of Object.entries(links)){
    if(owner===uid&&(id===sourceCharacterId||
      summaries[id]?.sourceCharacterId===sourceCharacterId))return true;
  }
  return Array.isArray(player.characterIds)&&player.characterIds.some(id=>
    id===sourceCharacterId||summaries[id]?.sourceCharacterId===sourceCharacterId);
}
export function assertCharacterLinkCapacity(campaign,links,uid,limits,{approving=false}={}){
  if(links.length>100)throw new Error('Campaign character links need reconciliation.');
  const inParty=Array.isArray(campaign.party)?campaign.party:[];
  if(inParty.some(id=>!validId(id)))throw new Error('Campaign party records need reconciliation.');
  // Legacy roster/gameplay indexes can contain established campaign characters
  // not currently in the party. Treat them as occupied capacity, never overwrite.
  const summaries=record(campaign.characters)?campaign.characters:{};
  const oldLinks=record(campaign.playerCharacterLinks)?campaign.playerCharacterLinks:{};
  const all=new Set([...inParty,...Object.keys(summaries),...Object.keys(oldLinks)]);
  const mine=new Set(Array.isArray(campaign.players?.[uid]?.characterIds)?
    campaign.players[uid].characterIds:[]);
  for(const [id,owner] of Object.entries(oldLinks))if(owner===uid)mine.add(id);
  for(const [id,summary] of Object.entries(summaries))if(summary?.ownerUid===uid)mine.add(id);
  let pendingTotal=0,pendingMine=0;
  for(const row of links){
    const link=row.data();
    if(!record(link)||link.linkId!==row.id||!validId(link.ownerUid)||
      !validId(link.sourceCharacterId)||!LINK_STATUSES.has(link.status))
      throw new Error('Campaign character links need reconciliation.');
    if(!ACTIVE_LINK_STATUSES.has(link.status))continue;
    if(link.status==='pending'){
      pendingTotal++;
      if(link.ownerUid===uid)pendingMine++;
    }else{
      if(!validId(link.campaignCharacterId))throw new Error('Campaign character links need reconciliation.');
      all.add(link.campaignCharacterId);
      if(link.ownerUid===uid)mine.add(link.campaignCharacterId);
    }
  }
  if(all.size+pendingTotal>limits.overall||(!approving&&all.size+pendingTotal===limits.overall))
    throw new Error('The campaign character capacity has been reached.');
  if(mine.size+pendingMine>limits.perOwner||(!approving&&mine.size+pendingMine===limits.perOwner))
    throw new Error('This account has reached the campaign character limit.');
}

/**
 * Auth UID is supplied by the Cloud Function, never by a request field.
 * Source sheets stay in users/{uid}/characters/{sourceCharacterId}. A
 * deterministic reservation prevents duplicate pending requests and allows
 * different accounts to reuse a Forge source character ID without conflict.
 * Phase 5.2 performs the separate approval and gameplay-character import.
 */
export async function campaignCharacterLink(db,uid,
  {action='request',campaignId,sourceCharacterId,sourceKind='owned'}={},options={}){
  if(!validId(uid)||!validId(campaignId)||!validId(sourceCharacterId)||
    !['request','status'].includes(action)||!['owned','forge'].includes(sourceKind))
    throw new Error('Choose a valid saved character and campaign.');
  const now=options.now instanceof Date&&Number.isFinite(options.now.getTime())?options.now:new Date();
  const digest=createHash('sha256').update(uid+'\0'+sourceCharacterId).digest('hex');
  const path='campaigns/'+campaignId;
  const campaignRef=db.doc(path);
  const memberRef=db.doc(path+'/members/'+uid);
  const projectionRef=db.doc('campaignMemberProjections/'+uid+'/campaigns/'+campaignId);
  const sheetRef=db.doc('users/'+uid+'/characters/'+sourceCharacterId);
  const linkRef=db.doc(path+'/characterLinks/'+digest);
  const keyRef=db.doc(path+'/characterLinkKeys/'+digest);

  return db.runTransaction(async tx=>{
    const campaignSnap=await tx.get(campaignRef);
    if(!campaignSnap.exists)throw new Error('Campaign not found.');
    const campaign=campaignSnap.data();
    if(!record(campaign)||campaign.membershipSchemaVersion!==2||
      !validId(campaign.ownerUid)||(campaign.id&&campaign.id!==campaignId))
      throw new Error('Character requests require an upgraded campaign.');
    const [memberSnap,projectionSnap,sheetSnap,linkSnap,keySnap]=await Promise.all([
      tx.get(memberRef),tx.get(projectionRef),tx.get(sheetRef),tx.get(linkRef),tx.get(keyRef)
    ]);
    ensureActiveMember(campaign,memberSnap.exists?memberSnap.data():null,
      projectionSnap.exists?projectionSnap.data():null,uid,campaignId);
    if(!sheetSnap.exists)throw new Error('Save this character in Character Forge before requesting a link.');
    const sheet=sheetSnap.data();
    ensureOwnedCampaignSheet(sheet,uid,sourceCharacterId);
    const link=linkSnap.exists?linkSnap.data():null;
    const key=keySnap.exists?keySnap.data():null;
    if(Boolean(link)!==Boolean(key))
      throw new Error('The character link needs reconciliation before retrying.');
    if(link){
      if(!record(link)||!record(key)||link.linkId!==digest||
        link.campaignId!==campaignId||link.ownerUid!==uid||
        link.sourceCharacterId!==sourceCharacterId||
        key.linkId!==digest||key.campaignId!==campaignId||
        key.ownerUid!==uid||key.sourceCharacterId!==sourceCharacterId||
        key.campaignCharacterId!==link.campaignCharacterId||
        !LINK_STATUSES.has(link.status))
        throw new Error('The character link reservation does not match its owner.');
      if(action==='status'||ACTIVE_LINK_STATUSES.has(link.status))
        return existingStatus(campaignId,link);
      if(link.status!=='declined')
        throw new Error('This character link is inactive. Ask the GM to review it.');
    }
    if(action==='status')return {campaignId,sourceCharacterId,status:'none',
      campaignCharacterId:null,revision:null,alreadyExists:false};
    if(campaign.settings?.allowPlayerLinkCharacter===false)
      throw new Error('The GM has disabled character linking for this campaign.');
    const effectiveSourceKind=link?.sourceKind==='forge'?'forge':sourceKind;
    if(effectiveSourceKind==='forge'&&campaign.settings?.allowPlayerCreateCharacter===false)
      throw new Error('The GM has disabled new characters for this campaign.');
    if(legacyCharacterLinkExists(campaign,sheet,uid,sourceCharacterId,campaignId))
      throw new Error('This character already has a legacy campaign link. Ask the GM to reconcile it rather than duplicate the character.');
    const limits=characterCapacityLimits(campaign);
    const links=await tx.get(db.collection(path+'/characterLinks'));
    assertCharacterLinkCapacity(campaign,links.docs||[],uid,limits);
    if(link){
      const revision=Number.isSafeInteger(link.revision)&&link.revision>=1?link.revision+1:3;
      if(revision>Number.MAX_SAFE_INTEGER)throw new Error('Link revision overflow.');
      tx.update(linkRef,{
        status:'pending',revision,sourceKind:effectiveSourceKind,requestedAt:now,
        updatedAt:now,approvedByUid:null,approvedAt:null,reviewedByUid:null,reviewedAt:null
      });
      const auditId='character-link-'+digest+'-r'+revision;
      tx.create(db.doc(path+'/auditEvents/'+auditId),{
        eventId:auditId,campaignId,actorUid:uid,subjectUid:uid,
        category:'character-link',action:'requested-again',createdAt:now,
        metadata:{sourceCharacterId}
      });
      return existingStatus(campaignId,{...link,status:'pending',revision},false);
    }

    const campaignCharacterId='linkchar-'+randomUUID().replace(/-/g,'');
    const requested={
      linkId:digest,campaignId,ownerUid:uid,sourceCharacterId,campaignCharacterId,
      status:'pending',revision:1,requestedAt:now,approvedByUid:null,approvedAt:null,
      updatedAt:now,role:'player-character',sourceKind
    };
    tx.create(linkRef,requested);
    tx.create(keyRef,{linkId:digest,campaignId,ownerUid:uid,sourceCharacterId,
      campaignCharacterId,createdAt:now});
    tx.create(db.doc(path+'/auditEvents/character-link-'+digest),{
      eventId:'character-link-'+digest,campaignId,actorUid:uid,subjectUid:uid,
      category:'character-link',action:'requested',createdAt:now,
      metadata:{sourceCharacterId}
    });
    return existingStatus(campaignId,requested,false);
  });
}
