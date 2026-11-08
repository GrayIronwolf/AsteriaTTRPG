import {legacyMembershipPlan, MEMBER_ROLES, MEMBER_STATUSES} from './campaignMembership.mjs';

const ID=/^[A-Za-z0-9_-]{1,160}$/;
const MAX_ROSTER=100;
const MAX_PENDING=100;
const validId=value=>typeof value==='string' && ID.test(value);
const record=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const safeName=value=>typeof value==='string' ? value.trim().slice(0,100) : '';
const dateText=value=>{
  if(!value)return null;
  const date=typeof value.toDate==='function'?value.toDate():value instanceof Date?value:new Date(value);
  return date instanceof Date && Number.isFinite(date.getTime())?date.toISOString():null;
};
const safeRole=value=>MEMBER_ROLES.includes(value)?value:null;
const safeStatus=value=>MEMBER_STATUSES.includes(value)?value:null;

function linkedCharacterSummaries(campaign,uid){
  // A legacy character reference is not enough to prove ownership. Require
  // an explicit owner match and a matching campaign link; never return a sheet.
  const summaries=record(campaign.characters)?campaign.characters:{};
  const links=record(campaign.playerCharacterLinks)?campaign.playerCharacterLinks:{};
  const result=[];
  for(const [id,summary] of Object.entries(summaries)){
    if(!validId(id)||!record(summary)||summary.ownerUid!==uid)continue;
    const linkedByOwner=links[id]===uid ||
      (Array.isArray(campaign.players?.[uid]?.characterIds) && campaign.players[uid].characterIds.includes(id));
    if(!linkedByOwner || (links[id] && links[id]!==uid))continue;
    result.push({id,name:safeName(summary.name)||id,level:Number.isSafeInteger(summary.level)&&summary.level>=0?summary.level:null});
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name)).slice(0,50);
}
function summarizeMember(campaign,row){
  const player=record(campaign.players?.[row.uid])?campaign.players[row.uid]:{};
  return {
    uid:row.uid,
    role:row.role,
    status:row.status,
    displayName:safeName(player.displayName)||safeName(player.name)||'',
    joinedAt:dateText(row.joinedAt||player.joinedAt),
    characters:linkedCharacterSummaries(campaign,row.uid)
  };
}
function safePending(row,campaignId){
  const value=row.data();
  if(!record(value)||value.uid!==row.id||value.campaignId!==campaignId||
    value.status!=='pending'||!validId(row.id))return null;
  return {
    uid:row.id,
    status:'pending',
    requestedAt:dateText(value.requestedAt),
    requestedCharacterId:validId(value.requestedCharacterId)?value.requestedCharacterId:null,
    revision:Number.isSafeInteger(value.revision)?value.revision:null
  };
}

/**
 * Phase 4.1 read-only roster. The authenticated GM UID is supplied by the
 * callable, never from a browser request body.
 * Campaign/member/character data and request documents are never mutated.
 */
export async function listCampaignPlayerRoster(db,actorUid,campaignId){
  if(!validId(actorUid)||!validId(campaignId))
    throw new Error('Sign in as a campaign GM to view the roster.');
  const snap=await db.doc('campaigns/'+campaignId).get();
  if(!snap.exists)throw new Error('Campaign not found.');
  const campaign=snap.data();
  if(!record(campaign)||!validId(campaign.ownerUid))
    throw new Error('Campaign membership requires review.');
  const version=campaign.membershipSchemaVersion;
  let members=[],pending=[],truncated=false;
  if(version===2){
    if(actorUid!==campaign.ownerUid){
      const memberSnap=await db.doc('campaigns/'+campaignId+'/members/'+actorUid).get();
      const gm=memberSnap.exists?memberSnap.data():null;
      if(!gm || gm.uid!==actorUid || gm.campaignId!==campaignId ||
        gm.role!=='co-gm' || gm.status!=='active')throw new Error('Only an active campaign GM may view the roster.');
    }
    const [membershipRows,requests]=await Promise.all([
      db.collection('campaigns/'+campaignId+'/members').limit(MAX_ROSTER+1).get(),
      db.collection('campaigns/'+campaignId+'/joinRequests').where('status','==','pending').limit(MAX_PENDING+1).get()
    ]);
    if(membershipRows.size>MAX_ROSTER)
      throw new Error('Campaign roster is too large to display safely.');
    truncated=requests.size>MAX_PENDING;
    for(const doc of membershipRows.docs){
      const row=doc.data();
      if(!validId(doc.id)||!record(row)||row.uid!==doc.id||row.campaignId!==campaignId ||
        !safeRole(row.role)||!safeStatus(row.status))throw new Error('Campaign membership records require review.');
      if(row.role==='owner' && (doc.id!==campaign.ownerUid||row.status!=='active'))
        throw new Error('Campaign owner membership requires review.');
      members.push(summarizeMember(campaign,row));
    }
    // The owner is always authoritative even if canonical staging is incomplete.
    if(!members.some(row=>row.uid===campaign.ownerUid))
      members.push(summarizeMember(campaign,{uid:campaign.ownerUid,role:'owner',status:'active'}));
    pending=requests.docs.map(row=>safePending(row,campaignId)).filter(Boolean)
      .filter(row=>!members.some(member=>member.uid===row.uid));
  }else if(version===undefined||version===null||version===1){
    const isGM=actorUid===campaign.ownerUid ||
      (Array.isArray(campaign.gmUids)&&campaign.gmUids.includes(actorUid)) ||
      campaign.roles?.[actorUid]==='gm';
    if(!isGM)throw new Error('Only a campaign GM may view the roster.');
    const plan=legacyMembershipPlan(campaign,campaignId);
    if(plan.issues.length)throw new Error('Legacy campaign roster has unresolved membership conflicts.');
    members=plan.rows.map(row=>summarizeMember(campaign,row));
    // The legacy system has no canonical pending queue.
  }else throw new Error('Unsupported campaign membership version.');

  const roleSort={owner:0,'co-gm':1,player:2};
  members.sort((a,b)=>(roleSort[a.role]-roleSort[b.role]) || a.displayName.localeCompare(b.displayName) || a.uid.localeCompare(b.uid));
  pending.sort((a,b)=>(a.requestedAt||'').localeCompare(b.requestedAt||'')||a.uid.localeCompare(b.uid));
  const active=members.filter(row=>row.status==='active');
  const inactive=members.filter(row=>row.status!=='active');
  return {
    campaignId,source:version===2?'canonical':'legacy',
    summary:{
      activePlayers:active.filter(row=>row.role==='player').length,
      activeGMs:active.filter(row=>row.role!=='player').length,
      inactive:inactive.length,pending:pending.length,
      linkedCharacters:members.reduce((n,row)=>n+row.characters.length,0)
    },
    active,inactive,pending,truncated
  };
}
