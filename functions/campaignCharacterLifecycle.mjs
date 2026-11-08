import {createHash} from 'node:crypto';
import {characterCapacityLimits,assertCharacterLinkCapacity,
  ensureOwnedCampaignSheet} from './campaignCharacterLinks.mjs';
import {ownedGameplayMirrorPatch,incomingSnapshotIsStale} from '../src/state/characterIntegrityModel.mjs';

// Phase 5.3: reversible GM deactivation, owner/GM unlink and pending withdrawal.
// Live characters are moved into server-only archives, never deleted outright.
// A source Forge record is always retained with the last verified gameplay.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const HASH=/^[a-f0-9]{64}$/;
const validId=value=>typeof value==='string'&&ID.test(value);
const object=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const revision=value=>Number.isSafeInteger(value)&&value>=1;
const MAX_LINKS=100;

function verifyCampaign(c,id){
  if(!object(c)||c.membershipSchemaVersion!==2||!validId(c.ownerUid)||
    (c.id&&c.id!==id))throw Error('Character lifecycle requires an upgraded campaign.');
}
function gmAuthorized(c,id,actorUid,m){
  if(c.ownerUid===actorUid)return true;
  return object(m)&&m.uid===actorUid&&m.campaignId===id&&
    m.status==='active'&&m.role==='co-gm'&&revision(m.revision)&&
    m.capabilityOverrides?.['moderate-members']===true;
}
function checkLink(link,campaignId,linkId){
  if(!object(link)||link.linkId!==linkId||link.campaignId!==campaignId||
    !validId(link.ownerUid)||!validId(link.sourceCharacterId)||
    !validId(link.campaignCharacterId)||!revision(link.revision)||
    !['pending','approved','declined','inactive','unlinked'].includes(link.status))
    throw Error('Character link needs reconciliation.');
  return link;
}
function checkLinkKey(key,link){
  if(!object(key)||key.linkId!==link.linkId||key.campaignId!==link.campaignId||
    key.ownerUid!==link.ownerUid||key.sourceCharacterId!==link.sourceCharacterId||
    key.campaignCharacterId!==link.campaignCharacterId)
    throw Error('Character link reservation needs reconciliation.');
}
function memberActive(c,cid,uid,m,p){
  const role=uid===c.ownerUid?'owner':m?.role;
  if(!object(m)||m.uid!==uid||m.campaignId!==cid||m.status!=='active'||
    m.role!==role||!revision(m.revision)||!object(p)||
    p.campaignId!==cid||p.role!==role||p.status!=='active')
    throw Error('Restoring requires active membership and a matching projection.');
}
function rootIndexes(c,link,shouldExist){
  const id=link.campaignCharacterId,uid=link.ownerUid;
  const players=object(c.players)?c.players:{};
  const summaries=object(c.characters)?c.characters:{};
  const owners=object(c.playerCharacterLinks)?c.playerCharacterLinks:{};
  const party=Array.isArray(c.party)?c.party:[];
  const ids=Array.isArray(players[uid]?.characterIds)?players[uid].characterIds:[];
  if(shouldExist){
    if(!party.includes(id)||!ids.includes(id)||owners[id]!==uid||
      summaries[id]?.ownerUid!==uid||
      summaries[id]?.sourceCharacterId!==link.sourceCharacterId)
      throw Error('The campaign roster does not match the approved character.');
  }else if(party.includes(id)||ids.includes(id)||
    Object.prototype.hasOwnProperty.call(owners,id)||
    Object.prototype.hasOwnProperty.call(summaries,id)){
    throw Error('Archived character still appears in an active roster.');
  }
}
function sourceLinkState(sheet,cid,characterId,active){
  const mapped=sheet.campaignCharacterIds?.[cid];
  const linked=Array.isArray(sheet.linkedCampaignIds)&&
    sheet.linkedCampaignIds.includes(cid);
  if(active){
    if(mapped!==characterId||!linked||sheet.sharedCampaignId!==cid)
      throw Error('Saved Forge character link metadata needs reconciliation.');
  }else if(mapped!==undefined||linked||sheet.sharedCampaignId===cid){
    throw Error('The inactive Forge character is still linked in active metadata.');
  }
}
function detachedPrivateMetadata(sheet,cid,now){
  const mapping={...(object(sheet.campaignCharacterIds)?sheet.campaignCharacterIds:{})};
  delete mapping[cid];
  const rest=Array.isArray(sheet.linkedCampaignIds)?
    sheet.linkedCampaignIds.filter(id=>id!==cid):[];
  return {
    campaignCharacterIds:mapping,linkedCampaignIds:rest,
    sharedCampaignId:sheet.sharedCampaignId===cid?'':(sheet.sharedCampaignId||''),
    campaignId:sheet.campaignId===cid?'':(sheet.campaignId||''),
    updatedAt:now
  };
}
function activePrivateMetadata(sheet,cid,characterId,now){
  const mapping=object(sheet.campaignCharacterIds)?sheet.campaignCharacterIds:{};
  if(mapping[cid]&&mapping[cid]!==characterId)
    throw Error('The saved character maps to another campaign ID.');
  return {
    campaignCharacterIds:{...mapping,[cid]:characterId},
    linkedCampaignIds:[...new Set([
      ...(Array.isArray(sheet.linkedCampaignIds)?sheet.linkedCampaignIds:[]),cid
    ])],
    sharedCampaignId:sheet.sharedCampaignId||cid,updatedAt:now
  };
}
function removeIndexes(c,link,now){
  const id=link.campaignCharacterId,uid=link.ownerUid;
  const chars={...(object(c.characters)?c.characters:{})};
  const owners={...(object(c.playerCharacterLinks)?c.playerCharacterLinks:{})};
  delete chars[id];delete owners[id];
  const players={...(object(c.players)?c.players:{})};
  const p=object(players[uid])?players[uid]:{};
  players[uid]={...p,characterIds:(Array.isArray(p.characterIds)?p.characterIds:[])
    .filter(other=>other!==id)};
  return {
    party:(Array.isArray(c.party)?c.party:[]).filter(other=>other!==id),
    players,characters:chars,playerCharacterLinks:owners,
    lastLinkedCharacterId:c.lastLinkedCharacterId===id?null:(c.lastLinkedCharacterId??null),
    updatedAt:now
  };
}
function restoreIndexes(c,link,snapshot,now){
  const id=link.campaignCharacterId,uid=link.ownerUid;
  const players={...(object(c.players)?c.players:{})};
  const p=object(players[uid])?players[uid]:{};
  players[uid]={...p,uid,characterIds:[...new Set([
    ...(Array.isArray(p.characterIds)?p.characterIds:[]),id
  ])]};
  const summary={id,ownerUid:uid,sourceCharacterId:link.sourceCharacterId,
    name:typeof snapshot.name==='string'?snapshot.name.slice(0,120):id,
    klass:typeof (snapshot.klass||snapshot.class)==='string'?
      (snapshot.klass||snapshot.class):'',
    level:Number.isFinite(snapshot.level)?snapshot.level:0,
    status:'linked',sharedCampaignId:link.campaignId};
  return {
    party:[...new Set([...(Array.isArray(c.party)?c.party:[]),id])],
    players,characters:{...(object(c.characters)?c.characters:{}),[id]:summary},
    playerCharacterLinks:{...(object(c.playerCharacterLinks)?c.playerCharacterLinks:{}),[id]:uid},
    lastLinkedCharacterId:id,updatedAt:now
  };
}
function safeGameplayPatch(sheet,shared,uid,sourceId){
  ensureOwnedCampaignSheet(sheet,uid,sourceId);
  // Compare even if the private record is newer; silently skipping the
  // authoritative campaign gameplay would lose progress at unlink time.
  const compare=ownedGameplayMirrorPatch({...sheet,updatedAt:shared.updatedAt},
    shared,uid,sourceId);
  if(incomingSnapshotIsStale(sheet,shared)&&Object.keys(compare).length)
    throw Error('The saved Forge sheet has newer conflicting gameplay. Reconcile it before detaching.');
  return compare;
}
function compatibleArchivedGameplay(sheet,archive,uid,sourceId){
  const compare=ownedGameplayMirrorPatch(
    {...sheet,updatedAt:archive.updatedAt},archive,uid,sourceId
  );
  if(Object.keys(compare).length)
    throw Error('The Forge sheet changed while inactive. Reconcile gameplay before restoration.');
}
function dateText(value){
  if(!value)return null;
  const date=typeof value.toDate==='function'?value.toDate():value instanceof Date?
    value:new Date(value);
  return date instanceof Date&&Number.isFinite(date.getTime())?date.toISOString():null;
}

/** Server-only safe GM list; never returns private gameplay or archive data. */
export async function listCampaignCharacterLifecycle(db,actorUid,campaignId){
  if(!validId(actorUid)||!validId(campaignId))
    throw Error('Sign in as a campaign GM.');
  const root=await db.doc('campaigns/'+campaignId).get();
  if(!root.exists)throw Error('Campaign not found.');
  const campaign=root.data();
  verifyCampaign(campaign,campaignId);
  const reviewer=actorUid===campaign.ownerUid?null:
    await db.doc('campaigns/'+campaignId+'/members/'+actorUid).get();
  if(!gmAuthorized(campaign,campaignId,actorUid,
    reviewer?.exists?reviewer.data():null))
    throw Error('Only an authorised GM may manage campaign characters.');
  const result=await db.collection('campaigns/'+campaignId+'/characterLinks')
    .limit(MAX_LINKS+1).get();
  if(result.size>MAX_LINKS)throw Error('Campaign character links exceed the safe roster limit.');
  const links=[];
  for(const row of result.docs){
    const link=checkLink(row.data(),campaignId,row.id);
    if(!['approved','inactive'].includes(link.status))continue;
    links.push({
      linkId:row.id,ownerUid:link.ownerUid,
      sourceCharacterId:link.sourceCharacterId,
      campaignCharacterId:link.campaignCharacterId,
      status:link.status,revision:link.revision,
      updatedAt:dateText(link.updatedAt)
    });
  }
  links.sort((a,b)=>a.ownerUid.localeCompare(b.ownerUid)||
    a.sourceCharacterId.localeCompare(b.sourceCharacterId));
  return {campaignId,links};
}

/**
 * Lifecycle state machine:
 * - owner cancels pending requests (may submit again at a new revision)
 * - owner or authorised GM unlinks an approved/inactive character
 * - authorised GM deactivates approved or restores inactive characters
 *
 * All reads precede writes; campaign and character document writes synchronize
 * against gameplay transactions. No client-supplied identity or character sheet
 * is trusted. No active gameplay record is ever deleted without first creating
 * a complete server-only archive and mirroring verified gameplay to the owner.
 */
export async function changeCampaignCharacterLifecycle(db,actorUid,
  {campaignId,linkId,sourceCharacterId,action,expectedRevision}={},options={}){
  if(!validId(actorUid)||!validId(campaignId)||
    !['cancel','unlink','deactivate','restore'].includes(action)||
    !revision(expectedRevision)||
    (linkId!==undefined&&!HASH.test(linkId))||
    (sourceCharacterId!==undefined&&!validId(sourceCharacterId))||
    (!linkId&&!sourceCharacterId))
    throw Error('Invalid character lifecycle request.');
  const digest=sourceCharacterId?
    createHash('sha256').update(actorUid+'\0'+sourceCharacterId).digest('hex'):linkId;
  // Owners supply their own source ID; a GM uses a server-listed link ID.
  // A supplied link ID must match the derived owner reference if both exist.
  if(linkId&&sourceCharacterId&&linkId!==digest)
    throw Error('Character link identity mismatch.');
  const now=options.now instanceof Date&&Number.isFinite(options.now.getTime())?
    options.now:new Date();
  const path='campaigns/'+campaignId;
  return db.runTransaction(async tx=>{
    const campaignRef=db.doc(path),linkRef=db.doc(path+'/characterLinks/'+digest);
    const [campaignSnap,linkSnap]=await Promise.all([
      tx.get(campaignRef),tx.get(linkRef)
    ]);
    if(!campaignSnap.exists)throw Error('Campaign not found.');
    const campaign=campaignSnap.data();
    verifyCampaign(campaign,campaignId);
    if(!linkSnap.exists)throw Error('Character link not found.');
    const link=checkLink(linkSnap.data(),campaignId,digest);
    const self=link.ownerUid===actorUid;
    if(sourceCharacterId&&(!self||link.sourceCharacterId!==sourceCharacterId))
      throw Error('Only a character owner may use its saved character reference.');
    const reviewerRef=db.doc(path+'/members/'+actorUid);
    const reviewer=actorUid===campaign.ownerUid?null:await tx.get(reviewerRef);
    const gm=gmAuthorized(campaign,campaignId,actorUid,
      reviewer?.exists?reviewer.data():null);
    if((action==='deactivate'||action==='restore')&&!gm)
      throw Error('Only an authorised GM may change character activation.');
    if(action==='cancel'&&!self)
      throw Error('Only the character owner can withdraw a pending request.');
    if(action==='unlink'&&!self&&!gm)
      throw Error('Only the owner or an authorised GM may unlink a character.');
    const newStatus=action==='cancel'?'declined':
      action==='deactivate'?'inactive':
      action==='restore'?'approved':'unlinked';
    const auditId='character-lifecycle-'+digest+'-r'+expectedRevision;
    const auditRef=db.doc(path+'/auditEvents/'+auditId);
    const keyRef=db.doc(path+'/characterLinkKeys/'+digest);
    const privateRef=db.doc('users/'+link.ownerUid+'/characters/'+link.sourceCharacterId);
    const characterRef=db.doc(path+'/characters/'+link.campaignCharacterId);
    const archiveRef=db.doc(path+'/archivedCharacters/'+link.campaignCharacterId);
    const memberRef=db.doc(path+'/members/'+link.ownerUid);
    const projectionRef=db.doc('campaignMemberProjections/'+link.ownerUid+'/campaigns/'+campaignId);
    const encounterRef=db.doc(path+'/systems/encounter');
    const [auditSnap,keySnap,privateSnap,characterSnap,archiveSnap,memberSnap,projectionSnap,encounterSnap]=
      await Promise.all([
        tx.get(auditRef),tx.get(keyRef),tx.get(privateRef),
        tx.get(characterRef),tx.get(archiveRef),tx.get(memberRef),
        tx.get(projectionRef),tx.get(encounterRef)
      ]);
    if(link.status!==({cancel:'pending',deactivate:'approved',restore:'inactive'}[action]||
      (action==='unlink'&&['approved','inactive'].includes(link.status)?link.status:'never'))){
      if(link.revision===expectedRevision+1&&link.status===newStatus&&
        link.lifecycleActorUid===actorUid&&link.lifecycleAction===action&&
        auditSnap.exists&&auditSnap.data().actorUid===actorUid&&
        auditSnap.data().action===action)
        return {campaignId,linkId:digest,status:newStatus,
          campaignCharacterId:link.campaignCharacterId,alreadyApplied:true};
      throw Error('Character link changed. Refresh its status before retrying.');
    }
    if(link.revision!==expectedRevision)throw Error('Character link changed. Refresh its status before retrying.');
    if(auditSnap.exists)throw Error('Lifecycle audit history requires reconciliation.');
    if(!keySnap.exists)throw Error('Character link reservation is missing.');
    checkLinkKey(keySnap.data(),link);
    if(action==='cancel'){
      if(characterSnap.exists||archiveSnap.exists)
        throw Error('A pending character already has gameplay records. Review before cancelling.');
    }else{
      if(!privateSnap.exists)throw Error('The original saved Forge character is missing.');
      const sheet=privateSnap.data();
      ensureOwnedCampaignSheet(sheet,link.ownerUid,link.sourceCharacterId);
      const shared=characterSnap.exists?characterSnap.data():null;
      const archive=archiveSnap.exists?archiveSnap.data():null;
      const active=link.status==='approved';
      rootIndexes(campaign,link,active);
      if(active){
        sourceLinkState(sheet,campaignId,link.campaignCharacterId,true);
        if(!object(shared)||archiveSnap.exists||shared.ownerUid!==link.ownerUid||
          shared.sourceCharacterId!==link.sourceCharacterId||
          shared.id!==link.campaignCharacterId||
          shared.sharedCampaignId!==campaignId||
          shared.status!=='linked')
          throw Error('Active campaign character requires reconciliation.');
        const encounter=encounterSnap.exists?encounterSnap.data():{};
        if(encounter?.status==='active'&&Array.isArray(encounter.combatants)&&
          encounter.combatants.some(row=>row?.characterId===link.campaignCharacterId))
          throw Error('End the character\'s active encounter before detaching.');
      }else{
        sourceLinkState(sheet,campaignId,link.campaignCharacterId,false);
        if(characterSnap.exists||!object(archive)||
          archive.ownerUid!==link.ownerUid||
          archive.sourceCharacterId!==link.sourceCharacterId||
          archive.id!==link.campaignCharacterId||
          archive.sharedCampaignId!==campaignId||
          archive.status!=='inactive')
          throw Error('Inactive archived gameplay requires reconciliation.');
      }
      if(action==='restore'){
        memberActive(campaign,campaignId,link.ownerUid,
          memberSnap.exists?memberSnap.data():null,
          projectionSnap.exists?projectionSnap.data():null);
        if(campaign.settings?.allowPlayerLinkCharacter===false||
          (link.sourceKind==='forge'&&campaign.settings?.allowPlayerCreateCharacter===false))
          throw Error('The GM has disabled restoring this character.');
        compatibleArchivedGameplay(sheet,archive,link.ownerUid,link.sourceCharacterId);
        const links=await tx.get(db.collection(path+'/characterLinks'));
        assertCharacterLinkCapacity(campaign,links.docs||[],link.ownerUid,
          characterCapacityLimits(campaign));
        const original={...archive};
        for(const key of ['archivedAt','archivedByUid','archiveReason','unlinkedAt'])
          delete original[key];
        tx.create(characterRef,{...original,status:'linked',updatedAt:now});
        tx.delete(archiveRef);
        tx.update(privateRef,activePrivateMetadata(sheet,campaignId,
          link.campaignCharacterId,now));
        tx.update(campaignRef,restoreIndexes(campaign,link,archive,now));
      }else if(active){
        const mirror=safeGameplayPatch(sheet,shared,link.ownerUid,link.sourceCharacterId);
        const detached=detachedPrivateMetadata(sheet,campaignId,now);
        tx.update(privateRef,{...mirror,...detached,
          ...(sheet.campaign===campaign.name?{campaign:'Unassigned'}:{})});
        tx.create(archiveRef,{...shared,status:newStatus,
          archivedAt:now,archivedByUid:actorUid,archiveReason:action});
        tx.delete(characterRef);
        tx.update(campaignRef,removeIndexes(campaign,link,now));
      }else if(action==='unlink'){
        // Finalise a previously deactivated character without changing its
        // already-safe Forge record or destroying its archived gameplay.
        tx.update(archiveRef,{status:'unlinked',unlinkedAt:now,
          archivedByUid:actorUid,archiveReason:'unlink'});
      }
    }
    const newRevision=link.revision+1;
    if(!revision(newRevision))throw Error('Character link revision overflow.');
    tx.update(linkRef,{
      status:newStatus,revision:newRevision,
      lifecycleActorUid:actorUid,lifecycleAction:action,
      lifecycleAt:now,updatedAt:now
    });
    tx.create(auditRef,{
      eventId:auditId,campaignId,actorUid,subjectUid:link.ownerUid,
      category:'character-lifecycle',action,
      sourceCharacterId:link.sourceCharacterId,
      campaignCharacterId:link.campaignCharacterId,
      previousStatus:link.status,status:newStatus,createdAt:now
    });
    return {campaignId,linkId:digest,status:newStatus,
      campaignCharacterId:link.campaignCharacterId,alreadyApplied:false};
  });
}
