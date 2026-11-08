import {characterCapacityLimits,assertCharacterLinkCapacity,ensureOwnedCampaignSheet,
  legacyCharacterLinkExists} from './campaignCharacterLinks.mjs';

const ID=/^[A-Za-z0-9_-]{1,160}$/;
const validId=x=>typeof x==='string'&&ID.test(x);
const record=x=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const goodRevision=x=>Number.isSafeInteger(x)&&x>=1;
const MAX_PENDING=100;
const sharedFields=Object.freeze([
  'name','initial','pronouns','age','appearance','origin','backstory','family_tree',
  'biography','description','race','klass','class','classes','level','xp','xpMax','cp','tp',
  'hp','sp','mp','bp','zp','resources','resourceDefinitions','resourceState',
  'characteristics','skills','selectedSkills','skillProgress','spells',
  'inventory','equipment','coins','coinPouch','quickSlots','bags','storages','storageLimit',
  'talents','unlockedTalents','talentStateVersion','talentResourceState',
  'conditions','activeEffects','effects','restState','coreRevision','coreStateVersion',
  'titles','guild','guildName','partyName','magic','magicTypes','magicAffinities',
  'acModifiers','specialDamage','soulDamage','quests','questLog','portrait','image',
  'characterImage','gallery'
]);
function campaignValid(c,id){
  return record(c)&&c.membershipSchemaVersion===2&&validId(c.ownerUid)&&
    (!c.id||c.id===id);
}
function authorized(c,id,uid,m){
  if(c.ownerUid===uid)return true;
  return record(m)&&m.uid===uid&&m.campaignId===id&&
    m.role==='co-gm'&&m.status==='active'&&
    m.capabilityOverrides?.['review-join-requests']===true&&goodRevision(m.revision);
}
function linkValid(link,id,docId){
  return record(link)&&link.linkId===docId&&link.campaignId===id&&
    validId(link.ownerUid)&&validId(link.sourceCharacterId)&&
    validId(link.campaignCharacterId)&&goodRevision(link.revision)&&
    ['pending','approved','declined','inactive','unlinked'].includes(link.status);
}
function stamp(v){
  if(!v)return null;
  const date=typeof v.toDate==='function'?v.toDate():v instanceof Date?v:new Date(v);
  return date instanceof Date&&!Number.isNaN(date.getTime())?date.toISOString():null;
}
function projectSharedCharacter(sheet,id,cid,uid,sourceId,now){
  const value={};
  for(const field of sharedFields){
    if(Object.prototype.hasOwnProperty.call(sheet,field)&&sheet[field]!==undefined)
      value[field]=sheet[field];
  }
  return {...value,id,ownerUid:uid,sourceCharacterId:sourceId,
    sharedCampaignId:cid,status:'linked',linkedAt:now,updatedAt:now,
    linkedCampaignIds:[...new Set([...(Array.isArray(sheet.linkedCampaignIds)?sheet.linkedCampaignIds:[]),cid])]};
}
function summary(sheet,cid,id,uid,sourceId){
  return {id,ownerUid:uid,sourceCharacterId:sourceId,
    name:typeof sheet.name==='string'?sheet.name.slice(0,120):id,
    level:Number.isFinite(sheet.level)?sheet.level:0,
    klass:typeof (sheet.klass||sheet.class)==='string'?sheet.klass||sheet.class:'',
    status:'linked',sharedCampaignId:cid};
}
async function loadReviewer(db,uid,cid){
  const campaignRef=db.doc('campaigns/'+cid);
  const snap=await campaignRef.get();
  if(!snap.exists||!campaignValid(snap.data(),cid))throw Error('Character reviews require an upgraded campaign.');
  const c=snap.data();
  const gmSnap=uid===c.ownerUid?null:await db.doc('campaigns/'+cid+'/members/'+uid).get();
  if(!authorized(c,cid,uid,gmSnap?.exists?gmSnap.data():null))
    throw Error('Only an authorised GM may review character links.');
  return c;
}
/** Bounded safe GM queue: a request contains no full private character sheet. */
export async function listPendingCampaignCharacterLinks(db,actorUid,campaignId){
  if(!validId(actorUid)||!validId(campaignId))throw Error('Sign in as a campaign GM.');
  await loadReviewer(db,actorUid,campaignId);
  const snap=await db.collection('campaigns/'+campaignId+'/characterLinks')
    .where('status','==','pending').limit(MAX_PENDING+1).get();
  const rows=[];
  for(const row of snap.docs){
    const link=row.data();
    if(!linkValid(link,campaignId,row.id))throw Error('Character request records need reconciliation.');
    if(rows.length<MAX_PENDING)rows.push({
      linkId:row.id,ownerUid:link.ownerUid,sourceCharacterId:link.sourceCharacterId,
      campaignCharacterId:link.campaignCharacterId,status:'pending',
      revision:link.revision,requestedAt:stamp(link.requestedAt)
    });
  }
  rows.sort((a,b)=>(a.requestedAt||'').localeCompare(b.requestedAt||'')||
    a.linkId.localeCompare(b.linkId));
  return {campaignId,requests:rows,truncated:snap.size>MAX_PENDING};
}
/**
 * All reads precede writes. Campaign root update serializes approval capacity
 * decisions. Neither a client-selected owner nor a client-supplied sheet is
 * trusted; approved gameplay is copied only from the verified owner's record.
 */
export async function reviewCampaignCharacterLink(db,actorUid,
  {campaignId,linkId,decision,expectedRevision}={},options={}){
  if(!validId(actorUid)||!validId(campaignId)||
    typeof linkId!=='string'||!/^[a-f0-9]{64}$/.test(linkId)||
    !['approve','decline'].includes(decision)||!goodRevision(expectedRevision))
    throw Error('Invalid character review request.');
  const now=options.now instanceof Date&&!Number.isNaN(options.now.getTime())?options.now:new Date();
  const path='campaigns/'+campaignId;
  return db.runTransaction(async tx=>{
    const campaignRef=db.doc(path),linkRef=db.doc(path+'/characterLinks/'+linkId);
    const [campaignSnap,linkSnap]=await Promise.all([tx.get(campaignRef),tx.get(linkRef)]);
    if(!campaignSnap.exists||!campaignValid(campaignSnap.data(),campaignId))
      throw Error('Character reviews require an upgraded campaign.');
    const c=campaignSnap.data();
    const reviewerRef=db.doc(path+'/members/'+actorUid);
    const reviewSnap=actorUid===c.ownerUid?null:await tx.get(reviewerRef);
    if(!authorized(c,campaignId,actorUid,reviewSnap?.exists?reviewSnap.data():null))
      throw Error('Only an authorised GM may review character links.');
    if(!linkSnap.exists||!linkValid(linkSnap.data(),campaignId,linkId))
      throw Error('Character link needs reconciliation.');
    const link=linkSnap.data();
    const receiptId='character-link-review-'+linkId+'-r'+expectedRevision;
    const auditRef=db.doc(path+'/auditEvents/'+receiptId);
    const [audit,keySnap,memberSnap,projectionSnap,sheetSnap,sharedSnap]=await Promise.all([
      tx.get(auditRef),tx.get(db.doc(path+'/characterLinkKeys/'+linkId)),
      tx.get(db.doc(path+'/members/'+link.ownerUid)),
      tx.get(db.doc('campaignMemberProjections/'+link.ownerUid+'/campaigns/'+campaignId)),
      tx.get(db.doc('users/'+link.ownerUid+'/characters/'+link.sourceCharacterId)),
      tx.get(db.doc(path+'/characters/'+link.campaignCharacterId))
    ]);
    if(link.status!=='pending'){
      if(link.revision===expectedRevision+1&&
        link.status===(decision==='approve'?'approved':'declined')&&
        link.reviewedByUid===actorUid&&audit.exists&&
        audit.data().actorUid===actorUid&&audit.data().decision===decision)
        return {campaignId,linkId,status:link.status,alreadyReviewed:true,
          campaignCharacterId:link.campaignCharacterId};
      throw Error('Character request has already changed. Refresh the queue.');
    }
    if(link.revision!==expectedRevision)throw Error('Character request changed. Refresh the queue.');
    if(audit.exists)throw Error('Character review history needs reconciliation.');
    const key=keySnap.exists?keySnap.data():null;
    if(!record(key)||key.linkId!==linkId||key.campaignId!==campaignId||
      key.ownerUid!==link.ownerUid||key.sourceCharacterId!==link.sourceCharacterId||
      key.campaignCharacterId!==link.campaignCharacterId)
      throw Error('Character link reservation requires reconciliation.');
    const member=memberSnap.exists?memberSnap.data():null;
    const projection=projectionSnap.exists?projectionSnap.data():null;
    const role=link.ownerUid===c.ownerUid?'owner':member?.role;
    if(!record(member)||member.uid!==link.ownerUid||member.campaignId!==campaignId||
      member.status!=='active'||member.role!==role||!goodRevision(member.revision)||
      !record(projection)||projection.campaignId!==campaignId||
      projection.role!==role||projection.status!=='active')
      throw Error('Active member and matching account projection required.');
    if(!sheetSnap.exists)throw Error('Saved character no longer exists.');
    const sheet=sheetSnap.data();
    ensureOwnedCampaignSheet(sheet,link.ownerUid,link.sourceCharacterId);
    if(sheet.sharedCampaignId&&sheet.sharedCampaignId!==campaignId)
      throw Error('The saved character is linked to another primary campaign.');
    if(sharedSnap.exists)throw Error('Campaign character ID already exists. Approval blocked.');
    if(legacyCharacterLinkExists(c,sheet,link.ownerUid,link.sourceCharacterId,campaignId))
      throw Error('An existing legacy link needs reconciliation.');
    if(c.settings?.allowPlayerLinkCharacter===false||
      (link.sourceKind==='forge'&&c.settings?.allowPlayerCreateCharacter===false))
      throw Error('The GM has disabled this character linking method.');
    const rows=await tx.get(db.collection(path+'/characterLinks'));
    const limits=characterCapacityLimits(c);
    if(rows.docs.length>100)throw Error('Campaign link records need reconciliation.');
    if(!rows.docs.some(row=>row.id===linkId))
      throw Error('Pending link reservation disappeared.');
    // Check capacity at approval as well: a pending reservation counts as one.
    assertCharacterLinkCapacity(c,rows.docs,link.ownerUid,limits,{approving:true});
    const revision=link.revision+1;
    if(!goodRevision(revision))throw Error('Character link revision overflow.');
    const status=decision==='approve'?'approved':'declined';
    const auditEvent={
      eventId:receiptId,campaignId,actorUid,subjectUid:link.ownerUid,
      category:'character-link',action:status,decision,createdAt:now,
      metadata:{sourceCharacterId:link.sourceCharacterId,campaignCharacterId:link.campaignCharacterId}
    };
    if(decision==='approve'){
      const shared=projectSharedCharacter(sheet,link.campaignCharacterId,campaignId,
        link.ownerUid,link.sourceCharacterId,now);
      const mapping=record(sheet.campaignCharacterIds)?sheet.campaignCharacterIds:{};
      if(mapping[campaignId]&&mapping[campaignId]!==link.campaignCharacterId)
        throw Error('The saved character already maps to another campaign character.');
      const chars=record(c.characters)?c.characters:{};
      const ownership=record(c.playerCharacterLinks)?c.playerCharacterLinks:{};
      if(Object.prototype.hasOwnProperty.call(chars,link.campaignCharacterId)||
        Object.prototype.hasOwnProperty.call(ownership,link.campaignCharacterId))
        throw Error('Campaign character index collision.');
      const party=Array.isArray(c.party)?c.party:[];
      const players=record(c.players)?c.players:{};
      const existing=record(players[link.ownerUid])?players[link.ownerUid]:{};
      const ids=Array.isArray(existing.characterIds)?existing.characterIds:[];
      const revisedMembers={...players,[link.ownerUid]:{...existing,uid:link.ownerUid,
        characterIds:[...new Set([...ids,link.campaignCharacterId])]}};
      const connected=[...new Set([...party,link.campaignCharacterId])];
      tx.create(db.doc(path+'/characters/'+link.campaignCharacterId),shared);
      tx.update(db.doc('users/'+link.ownerUid+'/characters/'+link.sourceCharacterId),{
        campaignCharacterIds:{...mapping,[campaignId]:link.campaignCharacterId},
        sharedCampaignId:sheet.sharedCampaignId||campaignId,
        linkedCampaignIds:[...new Set([
          ...(Array.isArray(sheet.linkedCampaignIds)?sheet.linkedCampaignIds:[]),campaignId
        ])],
        updatedAt:now
      });
      tx.update(campaignRef,{
        party:connected,players:revisedMembers,
        characters:{...chars,[link.campaignCharacterId]:summary(sheet,campaignId,
          link.campaignCharacterId,link.ownerUid,link.sourceCharacterId)},
        playerCharacterLinks:{...ownership,[link.campaignCharacterId]:link.ownerUid},
        lastLinkedCharacterId:link.campaignCharacterId,updatedAt:now
      });
    }
    tx.update(linkRef,{status,revision,reviewedByUid:actorUid,
      reviewedAt:now,approvedByUid:decision==='approve'?actorUid:null,
      approvedAt:decision==='approve'?now:null,updatedAt:now});
    tx.create(auditRef,auditEvent);
    return {campaignId,linkId,status,alreadyReviewed:false,
      campaignCharacterId:link.campaignCharacterId};
  });
}
