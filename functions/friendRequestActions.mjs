// Phase 2.2: authenticated server-only friend request mutations.
// Do not expose raw Firebase Auth UIDs, pair IDs, blocking state or private
// identity registry documents to callers. All relationship writes are atomic.
import {
  findFriendByAccountId,normaliseFriendAccountId,verifiedActiveIdentity
} from './friendAccountLookup.mjs';
import {
  friendRelationshipPath,createFriendRequestRecord,assertFriendRelationship,
  transitionFriendRelationship,nextFriendRequestIssueQuota
} from './friendRelationshipModel.mjs';

const UID=/^[A-Za-z0-9_-]{1,128}$/;
const ACTIONS=Object.freeze(['send','accept','decline','cancel','remove','block','unblock']);
const unavailable=()=>new Error('Friend request unavailable.');
const dataOf=snapshot=>snapshot?.exists?snapshot.data()||{}:null;

export function validateFriendRequestAction(data) {
  if(!data||typeof data!=='object'||Array.isArray(data)||
     !ACTIONS.includes(data.action))throw new Error('Invalid friend request action.');
  const keys=Object.keys(data).sort().join(',');
  const expected=data.action==='send'?'action,targetAccountId':
    data.action==='block'&&data.expectedVersion===undefined?
      'action,targetAccountId':'action,expectedVersion,targetAccountId';
  if(keys!==expected)throw new Error('Invalid friend request action.');
  // No raw UID, pair ID, email, bearer token, or arbitrary target path accepted.
  normaliseFriendAccountId(data.targetAccountId);
  if(data.action!=='send'&&
     !(data.action==='block'&&data.expectedVersion===undefined)&&
     (!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<1))
    throw new Error('Invalid friend request action.');
  return {
    action:data.action,
    targetAccountId:data.targetAccountId.trim(),
    ...(data.action==='send'||data.expectedVersion===undefined?{}:
      {expectedVersion:data.expectedVersion})
  };
}

/**
 * All target resolution is revalidated *inside* the Firestore transaction.
 * A preflight exact search consumes the normal lookup throttle on all attempts
 * (including misses) to prevent an unmetered alternative account directory.
 *
 * A caller never supplies a Firebase UID. The caller UID must come from the
 * authenticated onCall context, not request.data. A successful response is
 * deliberately limited to status/version/expiry, with no participant UIDs.
 *
 * Send: creates one deterministic pair document, or re-requests only after
 * cooldown; decrements neither quota nor privacy protections on failure.
 * Accept/decline/cancel: require the exact current counterparty Account ID and
 * a version previously issued by a future recipient-scoped inbox.
 */
export async function changeFriendRequest(db,authAdmin,actorUid,rawData,{
  now=new Date()
}={}) {
  if(typeof actorUid!=='string'||!UID.test(actorUid)||
     typeof db?.doc!=='function'||typeof db?.runTransaction!=='function'||
     typeof authAdmin?.getUser!=='function'||!(now instanceof Date)||
     !Number.isSafeInteger(now.getTime())||now.getTime()<0)
    throw unavailable();
  const input=validateFriendRequestAction(rawData);
  const sought=normaliseFriendAccountId(input.targetAccountId);
  // The preflight check is rate-limited, Auth-scoped, exact-match, and requires
  // a canonical active Account ID. A no-match cannot enumerate a private UID.
  const lookup=await findFriendByAccountId(db,authAdmin,actorUid,
    input.targetAccountId,{now});
  if(lookup?.found!==true)throw unavailable();

  const result=await db.runTransaction(async tx=>{
    const actorProfileRef=db.doc('users/'+actorUid);
    const actorAssignmentRef=db.doc('accountIdAssignments/'+actorUid);
    const targetRegistryRef=db.doc('accountIdRegistry/'+sought.key);
    const [actorProfileSnap,actorAssignmentSnap,targetRegistrySnap]=
      await Promise.all([
        tx.get(actorProfileRef),tx.get(actorAssignmentRef),tx.get(targetRegistryRef)
      ]);
    const actorAssignment=dataOf(actorAssignmentSnap);
    const targetRegistry=dataOf(targetRegistrySnap);
    if(!actorAssignment||typeof actorAssignment.accountIdKey!=='string'||
       !/^[a-z0-9._-]{3,24}#[0-9]{5}$/.test(actorAssignment.accountIdKey)||
       !targetRegistry||typeof targetRegistry.uid!=='string'||
       !UID.test(targetRegistry.uid))
      throw unavailable();
    const targetUid=targetRegistry.uid;
    if(targetUid===actorUid)throw unavailable();
    const [actorRegistrySnap,targetProfileSnap,targetAssignmentSnap]=
      await Promise.all([
        tx.get(db.doc('accountIdRegistry/'+actorAssignment.accountIdKey)),
        tx.get(db.doc('users/'+targetUid)),
        tx.get(db.doc('accountIdAssignments/'+targetUid))
      ]);
    const actorVerified=verifiedActiveIdentity(actorUid,
      dataOf(actorProfileSnap),actorAssignment,dataOf(actorRegistrySnap));
    const targetVerified=verifiedActiveIdentity(targetUid,
      dataOf(targetProfileSnap),dataOf(targetAssignmentSnap),targetRegistry);
    if(!actorVerified||!targetVerified||
       targetVerified.accountIdKey!==sought.key||
       targetVerified.accountId.toLowerCase()!==sought.key)
      throw unavailable();

    const pairRef=db.doc(friendRelationshipPath(actorUid,targetUid));
    const quotaRef=db.doc('friendRequestIssueThrottle/'+actorUid);
    const [pairSnap,quotaSnap]=await Promise.all([
      tx.get(pairRef),
      ...(input.action==='send'?[tx.get(quotaRef)]:[])
    ]);
    // A disabled/deleted Auth user cannot be the sender, recipient or
    // counterparty. These checks happen before the first transaction write.
    let actor,target;
    try{
      [actor,target]=await Promise.all([
        authAdmin.getUser(actorUid),authAdmin.getUser(targetUid)
      ]);
    }catch{throw unavailable();}
    if(actor?.uid!==actorUid||actor.disabled===true||
       target?.uid!==targetUid||target.disabled===true)throw unavailable();

    const previous=dataOf(pairSnap);
    let next;
    if(input.action==='block'&&!previous){
      // Block an account even when no prior friend request exists. The initial
      // canonical record is never persisted in pending state.
      if(input.expectedVersion!==undefined)throw unavailable();
      const initial=createFriendRequestRecord(actorUid,targetUid,{now});
      next=transitionFriendRelationship(initial,{
        actorUid,action:'block',expectedVersion:initial.version,now
      });
    }else if(input.action==='send'){
      if(!previous){
        next=createFriendRequestRecord(actorUid,targetUid,{now});
      }else{
        assertFriendRelationship(previous);
        if(previous.pairId!==pairRef.id)throw unavailable();
        let state=previous;
        if(state.status==='pending'&&now.getTime()>=state.expiresAtMs){
          // Expiration is at the originally fixed expiry instant, not when
          // some later user happens to notice an expired pending request.
          state=transitionFriendRelationship(state,{
            actorUid,action:'expire',expectedVersion:state.version,
            now:new Date(state.expiresAtMs)
          });
        }
        next=transitionFriendRelationship(state,{
          actorUid,action:'request',expectedVersion:state.version,now
        });
      }
    }else{
      if(!previous)throw unavailable();
      assertFriendRelationship(previous);
      if(previous.pairId!==pairRef.id)throw unavailable();
      next=transitionFriendRelationship(previous,{
        actorUid,action:input.action,
        expectedVersion:input.action==='block'&&input.expectedVersion===undefined?
          previous.version:input.expectedVersion,now
      });
    }
    let quota=null;
    if(input.action==='send'){
      quota=nextFriendRequestIssueQuota(dataOf(quotaSnap),actorUid,{now});
    }
    // All Firestore reads above precede these writes. Transaction retries
    // prevent concurrent duplicate sends, forged accepts and quota bypasses.
    if(!previous)tx.create(pairRef,next);
    else tx.update(pairRef,next);
    if(quota)tx.set(quotaRef,quota);
    return {
      ok:true,status:next.status,version:next.version,
      expiresAtMs:next.status==='pending'?next.expiresAtMs:null
    };
  });
  return result;
}
