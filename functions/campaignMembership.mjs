/**
 * Phase 2.2: server-side membership records and controlled legacy staging.
 *
 * This module does not grant campaign access, change Firestore/Storage rules,
 * alter the legacy roster, or enable schema version 2. Access cutover is 2.3.
 */
export const MEMBER_ROLES=Object.freeze(['owner','co-gm','player']);
export const MEMBER_STATUSES=Object.freeze(['active','suspended','removed','banned']);
export const JOIN_REQUEST_STATUSES=Object.freeze(['pending','approved','declined','cancelled','expired']);

const VALID_ID=/^[A-Za-z0-9_-]{1,128}$/;
const MAX_STAGED_MEMBERS=100;
const DENIED_STATUSES=new Set(['suspended','removed','banned']);

function validId(value) { return typeof value==='string' && VALID_ID.test(value); }
function plainObject(value) { return Boolean(value) && typeof value==='object' && !Array.isArray(value); }
function toDate(value, fallback) {
  if(value instanceof Date && Number.isFinite(value.getTime())) return value;
  if(value && typeof value.toDate==='function') {
    const date=value.toDate();
    if(date instanceof Date && Number.isFinite(date.getTime())) return date;
  }
  if(typeof value==='string') {
    const date=new Date(value);
    if(Number.isFinite(date.getTime())) return date;
  }
  return fallback;
}
function canonicalRole(role) {
  if(role==='gm' || role==='co-gm') return 'co-gm';
  if(role==='player') return 'player';
  return null;
}
function resolveLegacyStatus(row) {
  if(!plainObject(row) || row.status===undefined || row.status===null || row.status==='') return 'active';
  return MEMBER_STATUSES.includes(row.status) ? row.status : null;
}

/**
 * Only ownerUid, gmUids, playerUids and legacy roles grant v1 membership.
 * An orphan entry in campaign.players cannot independently grant access.
 * Inactive orphan records are carried over as denied tombstones.
 */
export function legacyMembershipPlan(campaign, campaignId) {
  if(!validId(campaignId)) throw new Error('Invalid campaign ID.');
  if(!plainObject(campaign) || !validId(campaign.ownerUid)) throw new Error('Campaign owner is invalid.');
  if(![undefined,null,1].includes(campaign.membershipSchemaVersion)) throw new Error('Only legacy campaigns may be staged.');
  const members=new Map(),issues=[];
  const record=(uid,role)=> {
    if(!validId(uid)) {issues.push({code:'invalid-uid'});return;}
    if(uid===campaign.ownerUid) {members.set(uid,{uid,role:'owner',status:'active'});return;}
    const old=members.get(uid);
    members.set(uid,{uid,role:old?.role==='co-gm'||role==='co-gm'?'co-gm':'player',status:old?.status||'active'});
  };
  record(campaign.ownerUid,'owner');
  for(const [field,role] of [['gmUids','co-gm'],['playerUids','player']]) {
    const rows=campaign[field];
    if(rows===undefined || rows===null) continue;
    if(!Array.isArray(rows)) {issues.push({code:'invalid-'+field});continue;}
    for(const uid of rows) record(uid,role);
  }
  if(campaign.roles!==undefined && campaign.roles!==null && !plainObject(campaign.roles)) issues.push({code:'invalid-roles'});
  for(const [uid,role] of Object.entries(plainObject(campaign.roles)?campaign.roles:{})) {
    if(uid===campaign.ownerUid) continue;
    const converted=canonicalRole(role);
    if(!converted) {issues.push({code:'invalid-role',uid:validId(uid)?uid:undefined});continue;}
    record(uid,converted);
  }
  if(campaign.players!==undefined && campaign.players!==null && !plainObject(campaign.players)) issues.push({code:'invalid-players'});
  for(const [uid,row] of Object.entries(plainObject(campaign.players)?campaign.players:{})) {
    if(!validId(uid)) {issues.push({code:'invalid-uid'});continue;}
    if(!plainObject(row)) {issues.push({code:'invalid-player-record',uid});continue;}
    const status=resolveLegacyStatus(row);
    if(!status) {issues.push({code:'unsupported-member-status',uid});continue;}
    if(uid===campaign.ownerUid) {
      if(status!=='active') issues.push({code:'owner-status-conflict',uid});
      continue;
    }
    if(members.has(uid)) {
      const member=members.get(uid);
      member.status=status;
      if(row.joinedAt) member.joinedAt=row.joinedAt;
    } else if(DENIED_STATUSES.has(status)) {
      // Store a denied tombstone, not an access grant, for previously banned users.
      members.set(uid,{uid,role:'player',status,joinedAt:row.joinedAt});
    } else {
      issues.push({code:'orphan-active-player',uid});
    }
  }
  const rows=[...members.values()].sort((a,b)=>a.uid.localeCompare(b.uid));
  if(rows.length>MAX_STAGED_MEMBERS) issues.push({code:'member-count-exceeds-staging-limit'});
  return {campaignId,rows,issues};
}

export function memberDocument({campaignId,uid,role,status='active',joinedAt,origin='legacy-migration'},now=new Date()) {
  if(!validId(campaignId)||!validId(uid)) throw new Error('Invalid member reference.');
  if(!MEMBER_ROLES.includes(role) || !MEMBER_STATUSES.includes(status)) throw new Error('Invalid membership role or status.');
  if(role==='owner' && status!=='active') throw new Error('The campaign owner must remain active.');
  if(!['legacy-migration','owner-creation','invitation','join-request'].includes(origin)) throw new Error('Invalid membership provenance.');
  const at=toDate(now,new Date());
  return {
    uid,campaignId,role,status,
    joinedAt:toDate(joinedAt,at),
    updatedAt:at,
    invitedByUid:null,approvedByUid:null,lastStatusReason:null,
    revision:1,origin,capabilityOverrides:{}
  };
}

export function ownerMembership(campaignId,ownerUid,now=new Date()) {
  return memberDocument({campaignId,uid:ownerUid,role:'owner',status:'active',origin:'owner-creation'},now);
}

function existingMemberConflict(existing,row,campaignId) {
  if(!plainObject(existing) || existing.uid!==row.uid || existing.campaignId!==campaignId) return 'member-identity-conflict';
  if(!MEMBER_ROLES.includes(existing.role) || !MEMBER_STATUSES.includes(existing.status)) return 'member-field-conflict';
  if(existing.role!==row.role || existing.status!==row.status) return 'member-state-conflict';
  if(existing.role==='owner' && existing.status!=='active') return 'member-owner-conflict';
  return null;
}

/**
 * Admin SDK only. Owner authorised; never accept a caller supplied roster.
 * By default this is a preview and writes NOTHING. Write mode is separately
 * guarded by the Cloud Function's server-side staging switch.
 *
 * Existing member docs are never overwritten, especially suspended/removed/
 * banned tombstones. Any conflict blocks all writes until reviewed.
 */
export async function stageLegacyMemberships(db,callerUid,campaignId,{write=false,now=new Date()}={}) {
  if(!validId(callerUid)||!validId(campaignId)) throw new Error('Invalid campaign member request.');
  return db.runTransaction(async transaction=>{
    const campaignRef=db.doc('campaigns/'+campaignId);
    const campaignSnap=await transaction.get(campaignRef);
    if(!campaignSnap.exists) throw new Error('Campaign not found.');
    const campaign=campaignSnap.data();
    if(campaign.ownerUid!==callerUid) throw new Error('Only the campaign owner can prepare membership records.');
    const plan=legacyMembershipPlan(campaign,campaignId);
    const refs=plan.rows.map(row=>db.doc('campaigns/'+campaignId+'/members/'+row.uid));
    const snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
    const conflicts=plan.issues.slice();
    const missing=[];
    for(let i=0;i<plan.rows.length;i++) {
      const row=plan.rows[i], snapshot=snapshots[i];
      if(!snapshot.exists) missing.push(i);
      else {
        const code=existingMemberConflict(snapshot.data(),row,campaignId);
        if(code) conflicts.push({code,uid:row.uid});
      }
    }
    const summary={
      campaignId,legacySchemaVersion:campaign.membershipSchemaVersion??1,
      membershipSchemaVersion:campaign.membershipSchemaVersion??1,
      members:plan.rows.map(row=>({uid:row.uid,role:row.role,status:row.status})),
      missing:missing.length,alreadyStaged:plan.rows.length-missing.length,
      issues:conflicts,
      canStage:conflicts.length===0
    };
    if(!write) return {...summary,staged:0};
    if(conflicts.length) throw new Error('Membership staging blocked by inconsistent legacy records.');
    for(const index of missing) {
      const row=plan.rows[index];
      transaction.create(refs[index],memberDocument({
        campaignId,uid:row.uid,role:row.role,status:row.status,
        joinedAt:row.joinedAt,origin:'legacy-migration'
      },now));
    }
    return {...summary,staged:missing.length};
  });
}
