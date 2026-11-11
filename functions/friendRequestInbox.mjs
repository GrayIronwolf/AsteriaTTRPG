// Phase 2.3 — private, authenticated incoming/outgoing request inbox.
// Firestore documents, UIDs, pair IDs and blocking state must never be
// returned to the website. The server resolves current public handles.
import {verifiedActiveIdentity} from './friendAccountLookup.mjs';
import {assertFriendRelationship,friendPairId} from './friendRelationshipModel.mjs';

const UID=/^[A-Za-z0-9_-]{1,128}$/;
const PAGE_SIZE=20;
const MAX_OFFSET=1000;
const INBOX_WINDOW_MS=15*60*1000;
const INBOX_DAY_MS=24*60*60*1000;
export const FRIEND_INBOX_LIMITS=Object.freeze({perWindow:30,perDay:120});
const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
const unavailable=()=>new Error('Friend request inbox unavailable.');
const dataOf=s=>s?.exists?s.data()||{}:null;

export function validateFriendRequestList(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||
      Object.keys(data).sort().join(',')!=='action,cursor,direction'||
      data.action!=='list'||!['incoming','outgoing'].includes(data.direction)||
      !Number.isSafeInteger(data.cursor)||data.cursor<0||
      data.cursor>MAX_OFFSET||data.cursor%PAGE_SIZE!==0)
    throw new Error('Invalid friend request inbox query.');
  return {direction:data.direction,cursor:data.cursor};
}

export function nextFriendInboxQuota(previous,actorUid,nowMs){
  if(typeof actorUid!=='string'||!UID.test(actorUid)||
     !Number.isSafeInteger(nowMs)||nowMs<0)
    throw unavailable();
  if(previous!=null&&(
     typeof previous!=='object'||Array.isArray(previous)||
     Object.keys(previous).sort().join(',')!==
       'dayCount,dayStartMs,lastAttemptAtMs,uid,windowCount,windowStartMs'||
     previous.uid!==actorUid||
     !Number.isSafeInteger(previous.dayStartMs)||
     !Number.isSafeInteger(previous.windowStartMs)||
     !Number.isSafeInteger(previous.lastAttemptAtMs)||
     previous.dayStartMs>nowMs||previous.windowStartMs>nowMs||
     previous.lastAttemptAtMs>nowMs||
     !Number.isSafeInteger(previous.dayCount)||previous.dayCount<1||
     previous.dayCount>FRIEND_INBOX_LIMITS.perDay||
     !Number.isSafeInteger(previous.windowCount)||previous.windowCount<1||
     previous.windowCount>FRIEND_INBOX_LIMITS.perWindow))
    throw unavailable();
  const inWindow=previous&&nowMs-previous.windowStartMs<INBOX_WINDOW_MS;
  const inDay=previous&&nowMs-previous.dayStartMs<INBOX_DAY_MS;
  const windowCount=inWindow?previous.windowCount:0;
  const dayCount=inDay?previous.dayCount:0;
  if(windowCount>=FRIEND_INBOX_LIMITS.perWindow||
     dayCount>=FRIEND_INBOX_LIMITS.perDay)
    throw new Error('Friend request inbox rate limit reached.');
  return {
    uid:actorUid,windowStartMs:inWindow?previous.windowStartMs:nowMs,
    windowCount:windowCount+1,
    dayStartMs:inDay?previous.dayStartMs:nowMs,
    dayCount:dayCount+1,lastAttemptAtMs:nowMs
  };
}

async function verifiedIdentity(db,uid){
  if(!UID.test(uid))return null;
  const [profileSnap,assignmentSnap]=await Promise.all([
    db.doc('users/'+uid).get(),db.doc('accountIdAssignments/'+uid).get()
  ]);
  const assignment=dataOf(assignmentSnap);
  if(!assignment||
      typeof assignment.accountIdKey!=='string'||
      !/^[a-z0-9._-]{3,24}#[0-9]{5}$/.test(assignment.accountIdKey))
    return null;
  const registrySnap=await db.doc('accountIdRegistry/'+assignment.accountIdKey).get();
  return verifiedActiveIdentity(uid,dataOf(profileSnap),assignment,
    dataOf(registrySnap));
}

/**
 * Only a signed-in account with an active, valid Account ID may read its own
 * pending relationship summaries. Pagination uses an integer scan offset so
 * the client never receives a relationship document ID containing private UIDs.
 *
 * The server scans at most 21 raw pair records per page. Because unrelated
 * accepted, expired and blocked records are omitted, a page may contain fewer
 * than 20 visible items; the client may use nextCursor to scan further.
 * Any concurrent status changes may reorder pages; the UI offers Refresh.
 */
export async function listFriendRequests(db,authAdmin,actorUid,rawData,{
  now=new Date()
}={}){
  if(typeof actorUid!=='string'||!UID.test(actorUid)||
      typeof db?.doc!=='function'||typeof db?.collection!=='function'||
      typeof authAdmin?.getUser!=='function'||!(now instanceof Date)||
      !Number.isSafeInteger(now.getTime())||now.getTime()<0)
    throw unavailable();
  const {direction,cursor}=validateFriendRequestList(rawData);
  let actor;
  try{actor=await authAdmin.getUser(actorUid);}
  catch{throw unavailable();}
  if(actor?.uid!==actorUid||actor.disabled===true||
      !await verifiedIdentity(db,actorUid))throw unavailable();
  const throttle=db.doc('friendRequestInboxThrottle/'+actorUid);
  // One transactional quota write per request, even for empty or no-match pages.
  // Browser clients cannot access the throttle directly. Retries enforce quota.
  await db.runTransaction(async tx=>{
    const previous=await tx.get(throttle);
    const next=nextFriendInboxQuota(dataOf(previous),actorUid,now.getTime());
    tx.set(throttle,next);
  });

  // A single-field array-contains query avoids a new composite index or any
  // client privilege expansion. The implicit document-ID order is stable
  // between writes; bounded offsets prevent unlimited server-side scans.
  const snapshot=await db.collection('friendRelationships')
    .where('participantUids','array-contains',actorUid)
    .offset(cursor).limit(PAGE_SIZE+1).get();
  const docs=snapshot.docs||[];
  const selected=docs.slice(0,PAGE_SIZE);
  const items=[];
  for(const snap of selected){
    const relationship=snap.data();
    try{
      assertFriendRelationship(relationship);
      if(relationship.pairId!==snap.id||
          !relationship.participantUids.includes(actorUid)||
          relationship.status!=='pending'||
          now.getTime()>=relationship.expiresAtMs)
        continue;
      const isIncoming=relationship.recipientUid===actorUid;
      if((direction==='incoming')!==isIncoming)continue;
      const otherUid=isIncoming?relationship.requesterUid:relationship.recipientUid;
      if(relationship.pairId!==friendPairId(actorUid,otherUid))continue;
      // An active account may be renamed since a request was sent. Always
      // resolve its *current* canonical handle; never store old handles here.
      const identity=await verifiedIdentity(db,otherUid);
      if(!identity||!HANDLE.test(identity.accountId)||
          identity.accountId!==identity.username+'#'+identity.accountId.slice(-5))
        continue;
      let target;
      try{target=await authAdmin.getUser(otherUid);}
      catch{continue;}
      if(target?.uid!==otherUid||target.disabled===true)continue;
      items.push({
        username:identity.username,accountId:identity.accountId,
        direction,status:'pending',version:relationship.version,
        requestedAtMs:relationship.requestedAtMs,
        expiresAtMs:relationship.expiresAtMs
      });
    }catch{
      // Corrupt or stale relationship data must not reveal private records.
      continue;
    }
  }
  items.sort((a,b)=>b.requestedAtMs-a.requestedAtMs||
    a.accountId.localeCompare(b.accountId));
  const nextCursor=docs.length>PAGE_SIZE&&cursor+PAGE_SIZE<=MAX_OFFSET?
    cursor+PAGE_SIZE:null;
  return {items,nextCursor};
}


/**
 * Phase 3.1: accepted Friends List, no client-side collection access.
 * Shares the existing authenticated inbox read quota and bounded pair scan.
 * Returns only a current public username, Account ID, and friendship date.
 * No UID, pair key, block details, private profile or token leaves the server.
 */
export function validateAcceptedFriendsList(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||
     Object.keys(data).sort().join(',')!=='action,cursor'||
     data.action!=='list-friends'||
     !Number.isSafeInteger(data.cursor)||data.cursor<0||
     data.cursor>MAX_OFFSET||data.cursor%PAGE_SIZE!==0)
    throw new Error('Invalid friends list query.');
  return {cursor:data.cursor};
}

export async function listAcceptedFriends(db,authAdmin,actorUid,rawData,{
  now=new Date()
}={}){
  if(typeof actorUid!=='string'||!UID.test(actorUid)||
     typeof db?.doc!=='function'||typeof db?.collection!=='function'||
     typeof db?.runTransaction!=='function'||
     typeof authAdmin?.getUser!=='function'||!(now instanceof Date)||
     !Number.isSafeInteger(now.getTime())||now.getTime()<0)
    throw unavailable();
  const {cursor}=validateAcceptedFriendsList(rawData);
  let actor;
  try{actor=await authAdmin.getUser(actorUid);}
  catch{throw unavailable();}
  if(actor?.uid!==actorUid||actor.disabled===true||
     !await verifiedIdentity(db,actorUid))throw unavailable();
  // Same per-user Firestore throttle as the incoming/outgoing requests inbox.
  // Repeated list and refresh calls cannot bypass request-inbox quotas.
  const throttle=db.doc('friendRequestInboxThrottle/'+actorUid);
  await db.runTransaction(async tx=>{
    const previous=await tx.get(throttle);
    tx.set(throttle,nextFriendInboxQuota(dataOf(previous),actorUid,now.getTime()));
  });
  const snapshot=await db.collection('friendRelationships')
    .where('participantUids','array-contains',actorUid)
    .offset(cursor).limit(PAGE_SIZE+1).get();
  const docs=snapshot.docs||[];
  const items=[];
  for(const snap of docs.slice(0,PAGE_SIZE)){
    try{
      const record=snap.data();
      assertFriendRelationship(record);
      if(record.pairId!==snap.id||record.status!=='accepted'||
         !record.participantUids.includes(actorUid))continue;
      const otherUid=record.participantUids.find(uid=>uid!==actorUid);
      if(!otherUid||record.pairId!==friendPairId(actorUid,otherUid))continue;
      const identity=await verifiedIdentity(db,otherUid);
      if(!identity||!HANDLE.test(identity.accountId)||
         identity.accountId!==identity.username+'#'+identity.accountId.slice(-5))
        continue;
      let other;
      try{other=await authAdmin.getUser(otherUid);}catch{continue;}
      if(other?.uid!==otherUid||other.disabled===true)continue;
      items.push({
        username:identity.username,accountId:identity.accountId,
        friendsSinceMs:record.updatedAtMs,version:record.version
      });
    }catch{
      // Skip corrupt, removed, blocked or deleted relationships.
      continue;
    }
  }
  items.sort((a,b)=>b.friendsSinceMs-a.friendsSinceMs||
    a.accountId.localeCompare(b.accountId));
  const nextCursor=docs.length>PAGE_SIZE&&cursor+PAGE_SIZE<=MAX_OFFSET?
    cursor+PAGE_SIZE:null;
  return {items,nextCursor};
}


/** Phase 3.2: private "Blocked Accounts" list. Only the actor's own blocks
 * are visible; never disclose whether another participant has blocked them.
 * This operation shares the existing request/list read quota. */
export function validateBlockedFriendsList(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||
     Object.keys(data).sort().join(',')!=='action,cursor'||
     data.action!=='list-blocked'||
     !Number.isSafeInteger(data.cursor)||data.cursor<0||
     data.cursor>MAX_OFFSET||data.cursor%PAGE_SIZE!==0)
    throw new Error('Invalid blocked accounts query.');
  return {cursor:data.cursor};
}
export async function listBlockedFriends(db,authAdmin,actorUid,rawData,{now=new Date()}={}){
  if(typeof actorUid!=='string'||!UID.test(actorUid)||
     typeof db?.doc!=='function'||typeof db?.collection!=='function'||
     typeof db?.runTransaction!=='function'||
     typeof authAdmin?.getUser!=='function'||!(now instanceof Date)||
     !Number.isSafeInteger(now.getTime())||now.getTime()<0)
    throw unavailable();
  const {cursor}=validateBlockedFriendsList(rawData);
  let actor;
  try{actor=await authAdmin.getUser(actorUid);}catch{throw unavailable();}
  if(actor?.uid!==actorUid||actor.disabled===true||
     !await verifiedIdentity(db,actorUid))throw unavailable();
  await db.runTransaction(async tx=>{
    const ref=db.doc('friendRequestInboxThrottle/'+actorUid);
    tx.set(ref,nextFriendInboxQuota(dataOf(await tx.get(ref)),actorUid,now.getTime()));
  });
  const snapshot=await db.collection('friendRelationships')
    .where('participantUids','array-contains',actorUid)
    .offset(cursor).limit(PAGE_SIZE+1).get();
  const docs=snapshot.docs||[],items=[];
  for(const snap of docs.slice(0,PAGE_SIZE)){
    try{
      const record=snap.data();
      assertFriendRelationship(record);
      if(record.pairId!==snap.id||record.status!=='blocked'||
         !record.blockedByUids.includes(actorUid))continue;
      const otherUid=record.participantUids.find(uid=>uid!==actorUid);
      if(!otherUid||record.pairId!==friendPairId(actorUid,otherUid))continue;
      const identity=await verifiedIdentity(db,otherUid);
      if(!identity||!HANDLE.test(identity.accountId)||
         identity.accountId!==identity.username+'#'+identity.accountId.slice(-5))
        continue;
      let target;
      try{target=await authAdmin.getUser(otherUid);}catch{continue;}
      if(target?.uid!==otherUid||target.disabled===true)continue;
      items.push({username:identity.username,accountId:identity.accountId,
        blockedAtMs:record.updatedAtMs,version:record.version});
    }catch{continue;}
  }
  items.sort((a,b)=>b.blockedAtMs-a.blockedAtMs||
    a.accountId.localeCompare(b.accountId));
  const nextCursor=docs.length>PAGE_SIZE&&cursor+PAGE_SIZE<=MAX_OFFSET?
    cursor+PAGE_SIZE:null;
  return {items,nextCursor};
}
