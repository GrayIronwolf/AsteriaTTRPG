// Phase 2.3 — private, authenticated incoming/outgoing request inbox.
// Firestore documents, UIDs, pair IDs and blocking state must never be
// returned to the website. The server resolves current public handles.
import {verifiedActiveIdentity} from './friendAccountLookup.mjs';
import {assertFriendRelationship,friendPairId} from './friendRelationshipModel.mjs';

const UID=/^[A-Za-z0-9_-]{1,128}$/;
const PAGE_SIZE=20;
const MAX_OFFSET=1000;
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
