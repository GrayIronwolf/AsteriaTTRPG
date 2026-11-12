// Friends Phase 5.2: exact-account, owner-only secure invitation issuance.
// This is the only bridge from a public Account ID to private recipientUid.
// The browser never receives, supplies or chooses a Firebase UID.
import {normaliseFriendAccountId,verifiedActiveIdentity,
  findFriendByAccountId} from './friendAccountLookup.mjs';
import {assertFriendRelationship,friendRelationshipPath,friendPairId}
  from './friendRelationshipModel.mjs';
import {issueSecureCampaignInvitation} from './campaignSecureInvitations.mjs';

const ID=/^[A-Za-z0-9_-]{1,160}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
const REQUEST=/^[A-Za-z0-9_-]{12,80}$/;
const EXPIRIES=new Set([24,72,168,336,720]);
const invalid=()=>new Error('Invitation recipient unavailable.');
const snapData=snap=>snap?.exists?snap.data()||null:null;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function validateAccountBoundInvitation(input){
  if(!record(input)||Object.keys(input).sort().join(',')!==
      'accountId,action,campaignId,expiresInHours,requestId'||
     input.action!=='issue-friend'||!ID.test(input.campaignId||'')||
     !REQUEST.test(input.requestId||'')||
     typeof input.accountId!=='string'||!HANDLE.test(input.accountId)||
     !Number.isSafeInteger(input.expiresInHours)||
     !EXPIRIES.has(input.expiresInHours))
    throw invalid();
  const sought=normaliseFriendAccountId(input.accountId);
  return {campaignId:input.campaignId,requestId:input.requestId,
    accountId:input.accountId,accountIdKey:sought.key,
    expiresInHours:input.expiresInHours};
}

/**
 * Called only inside the original invitation issuance transaction.
 * Rechecks canonical identity, mutual block state, pending requests and
 * membership against current Firestore documents before the invitation writes.
 * Firebase Auth status is independently checked; disabled accounts fail closed.
 *
 * Existence, block direction, private UID, and member status never escape
 * through the public callable. Neither Friends acceptance nor a prior preview
 * is trusted as issuance authorization.
 */
export async function resolveCampaignRecipientForIssuance(tx,db,auth,
  actorUid,campaignId,accountIdKey){
  if(!record(tx)||typeof tx.get!=='function'||!db?.doc||
     !auth?.getUser||!UID.test(actorUid||'')||!ID.test(campaignId||'')||
     typeof accountIdKey!=='string'||
     !/^[a-z0-9._-]{3,24}#[0-9]{5}$/.test(accountIdKey))
    throw invalid();
  const reg=snapData(await tx.get(db.doc('accountIdRegistry/'+accountIdKey)));
  const uid=reg?.uid;
  if(typeof uid!=='string'||!UID.test(uid)||uid===actorUid||
     reg.accountIdKey!==accountIdKey||reg.alias===true)
    throw invalid();

  const refs=[
    db.doc('users/'+uid),db.doc('accountIdAssignments/'+uid),
    db.doc(friendRelationshipPath(actorUid,uid)),
    db.doc('campaigns/'+campaignId+'/members/'+uid),
    db.doc('campaigns/'+campaignId+'/joinRequests/'+uid)
  ];
  const [profileSnap,assignmentSnap,relationshipSnap,memberSnap,requestSnap]=
    await Promise.all(refs.map(ref=>tx.get(ref)));
  const identity=verifiedActiveIdentity(uid,snapData(profileSnap),
    snapData(assignmentSnap),reg);
  if(!identity||identity.accountIdKey!==accountIdKey||
     memberSnap.exists||requestSnap.exists)
    throw invalid();

  // Exact Account IDs may refer to a nonfriend. Existing blocked pairs may
  // NOT be invited, even when the requesting owner previously saw them.
  if(relationshipSnap.exists){
    const pair=relationshipSnap.data();
    try{
      assertFriendRelationship(pair);
      if(pair.pairId!==friendPairId(actorUid,uid)||
         !pair.participantUids.includes(actorUid)||
         !pair.participantUids.includes(uid)||
         pair.status==='blocked')throw invalid();
    }catch{throw invalid();}
  }

  const target=await auth.getUser(uid).catch(()=>null);
  if(target?.uid!==uid||target.disabled===true)throw invalid();
  return uid;
}

export async function issueAccountBoundFriendInvitation(db,auth,actorUid,input,{
  now=new Date(),signingKey,tokenFactory,notificationsEnabled=false
}={}){
  const data=validateAccountBoundInvitation(input);
  if(!UID.test(actorUid||'')||!db?.runTransaction||!db?.doc||
     !auth?.getUser||!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw invalid();

  // Exact lookup is charged against the existing owner-only search quota,
  // including a missing or disabled target. This is not an enumerable directory.
  const match=await findFriendByAccountId(db,auth,actorUid,data.accountId,{now});
  if(match.found!==true)throw invalid();
  try{
    return await issueSecureCampaignInvitation(db,actorUid,{
      campaignId:data.campaignId,requestId:data.requestId,
      type:'share-link',roleOffered:'player',
      recipientEmail:null,recipientUid:null,
      expiresInHours:data.expiresInHours,maxUses:1,
      requiresGMApproval:true
    },{
      signingKey,now,tokenFactory,notificationsEnabled,
      bindingKind:'friend-account',recipientAccountIdKey:data.accountIdKey,
      resolveBoundRecipient:(tx)=>resolveCampaignRecipientForIssuance(
        tx,db,auth,actorUid,data.campaignId,data.accountIdKey)
    });
  }catch{throw invalid();}
}


/**
 * Current-state check during preview AND within the claim transaction.
 * UID is trusted from Firebase Auth and the existing HMAC-protected invite.
 * An invite issued before a block or account deactivation cannot be used to
 * bypass those new restrictions. A later username change does not break the
 * UID-bound invitation while its canonical identity remains valid.
 */
export async function assertCurrentFriendInvitationRecipient(db,auth,invite,
  ownerUid,claimantUid,tx=null){
  if(!record(invite)||invite.bindingKind!=='friend-account'||
     invite.recipientUid!==claimantUid||
     !UID.test(ownerUid||'')||!UID.test(claimantUid||'')||
     ownerUid===claimantUid||!db?.doc||!auth?.getUser)
    throw invalid();
  const read=ref=>tx?tx.get(ref):ref.get();
  const [profile,assignment,pairSnap]=await Promise.all([
    read(db.doc('users/'+claimantUid)),
    read(db.doc('accountIdAssignments/'+claimantUid)),
    read(db.doc(friendRelationshipPath(ownerUid,claimantUid)))
  ]);
  const profileData=snapData(profile),assignmentData=snapData(assignment);
  const key=assignmentData?.accountIdKey;
  if(typeof key!=='string'||!/^[a-z0-9._-]{3,24}#[0-9]{5}$/.test(key))
    throw invalid();
  const registry=snapData(await read(db.doc('accountIdRegistry/'+key)));
  if(!verifiedActiveIdentity(claimantUid,profileData,assignmentData,registry))
    throw invalid();
  if(pairSnap.exists){
    const pair=pairSnap.data();
    try{
      assertFriendRelationship(pair);
      if(pair.pairId!==friendPairId(ownerUid,claimantUid)||
         pair.status==='blocked')throw invalid();
    }catch{throw invalid();}
  }
  const user=await auth.getUser(claimantUid).catch(()=>null);
  if(user?.uid!==claimantUid||user.disabled===true)throw invalid();
  return true;
}
