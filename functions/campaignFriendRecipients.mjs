// Asteria Friends Phase 5.1 — read-only, owner-scoped campaign recipient search.
// This service ONLY selects prospective recipients. It creates no invitations,
// tokens, campaign memberships or approvals. Phase 5.2 must revalidate the
// complete recipient identity and relationship in the issuance transaction.
import {normaliseFriendAccountId,verifiedActiveIdentity,
  findFriendByAccountId} from './friendAccountLookup.mjs';
import {listAcceptedFriends} from './friendRequestInbox.mjs';
import {assertFriendRelationship,friendRelationshipPath}
  from './friendRelationshipModel.mjs';

const ID=/^[A-Za-z0-9_-]{1,160}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
const MAX_OFFSET=1000;
const PAGE_SIZE=20;
const unavailable=()=>new Error('Campaign recipient selection unavailable.');
const validId=value=>typeof value==='string'&&ID.test(value);
const data=snap=>snap?.exists?snap.data()||null:null;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function validateCampaignFriendRecipientRequest(input){
  if(!plain(input)||typeof input.action!=='string'||
     !validId(input.campaignId))throw unavailable();
  const names=Object.keys(input).sort().join(',');
  if(input.action==='list'&&names==='action,campaignId,cursor'&&
     Number.isSafeInteger(input.cursor)&&input.cursor>=0&&
     input.cursor<=MAX_OFFSET&&input.cursor%PAGE_SIZE===0)
    return {action:'list',campaignId:input.campaignId,cursor:input.cursor};
  if(input.action==='resolve'&&names==='accountId,action,campaignId'&&
     typeof input.accountId==='string'&&HANDLE.test(input.accountId))
    return {action:'resolve',campaignId:input.campaignId,accountId:input.accountId};
  throw unavailable();
}

async function ownedCampaign(db,auth,actorUid,campaignId){
  if(!UID.test(actorUid)||typeof db?.doc!=='function'||
     typeof auth?.getUser!=='function')throw unavailable();
  const [actorSnap,campaignSnap]=await Promise.all([
    auth.getUser(actorUid).catch(()=>null),
    db.doc('campaigns/'+campaignId).get()
  ]);
  const campaign=data(campaignSnap);
  if(actorSnap?.uid!==actorUid||actorSnap.disabled===true||
     !plain(campaign)||campaign.membershipSchemaVersion!==2||
     campaign.ownerUid!==actorUid||
     (campaign.id!==undefined&&campaign.id!==campaignId)||
     campaign.joinPolicy?.joinRequestsOpen===false)
    throw unavailable();
}

/**
 * Server-only eligibility preview. Every output is a *public handle* which
 * was re-verified against the active identity registry and Firebase Auth.
 * Never return private UID, pair ID, block direction, membership, or emails.
 */
async function eligibleCandidate(db,auth,actorUid,campaignId,accountId,{
  requireFriend=false
}={}){
  let sought;
  try{sought=normaliseFriendAccountId(accountId);}catch{return null;}
  const registry=data(await db.doc('accountIdRegistry/'+sought.key).get());
  const uid=registry?.uid;
  if(!UID.test(uid||'')||uid===actorUid||
     registry.accountIdKey!==sought.key||registry.alias===true)
    return null;

  const [userSnap,assignmentSnap,authUser,relationshipSnap,memberSnap,joinSnap]=
    await Promise.all([
      db.doc('users/'+uid).get(),
      db.doc('accountIdAssignments/'+uid).get(),
      auth.getUser(uid).catch(()=>null),
      db.doc(friendRelationshipPath(actorUid,uid)).get(),
      db.doc('campaigns/'+campaignId+'/members/'+uid).get(),
      db.doc('campaigns/'+campaignId+'/joinRequests/'+uid).get()
    ]);
  const verified=verifiedActiveIdentity(uid,data(userSnap),
    data(assignmentSnap),registry);
  if(!verified||verified.accountIdKey!==sought.key||
     authUser?.uid!==uid||authUser.disabled===true||memberSnap.exists)
    return null;
  // Do not invite a player who is already awaiting campaign-owner review.
  // Terminal join records have their own controls in later invitation phases.
  const existingRequest=data(joinSnap);
  if(existingRequest&&(!plain(existingRequest)||
     existingRequest.uid!==uid||existingRequest.campaignId!==campaignId||
     ['pending','approved'].includes(existingRequest.status)))
    return null;
  const relationship=data(relationshipSnap);
  if(relationship){
    try{
      assertFriendRelationship(relationship);
      if(relationship.pairId!==friendRelationshipPath(actorUid,uid).slice('friendRelationships/'.length)||
         !relationship.participantUids.includes(actorUid)||
         relationship.status==='blocked'||
         requireFriend&&relationship.status!=='accepted')
        return null;
    }catch{return null;}
  }else if(requireFriend)return null;

  return {username:verified.username,accountId:verified.accountId};
}

/**
 * Existing Friends list and exact Account ID lookup quotas are reused.
 * No browser reads from users, relationships, membership or registry paths.
 * A disabled/blocked/member target is indistinguishable from an unavailable
 * target. Neither result conveys permission to issue or accept invitations.
 */
export async function selectCampaignFriendRecipients(db,auth,actorUid,input,{
  now=new Date()
}={}){
  const query=validateCampaignFriendRecipientRequest(input);
  if(!Number.isFinite(now?.getTime?.())||
     typeof db?.collection!=='function'||typeof db?.runTransaction!=='function')
    throw unavailable();
  await ownedCampaign(db,auth,actorUid,query.campaignId);
  if(query.action==='list'){
    const friends=await listAcceptedFriends(db,auth,actorUid,{
      action:'list-friends',cursor:query.cursor
    },{now});
    const items=[];
    for(const friend of friends.items){
      const result=await eligibleCandidate(db,auth,actorUid,
        query.campaignId,friend.accountId,{requireFriend:true});
      if(result)items.push(result);
    }
    return {items,nextCursor:friends.nextCursor};
  }
  // The existing exact Account ID discovery enforces a separate transactional
  // per-owner quota for every lookup, even failed/nonexistent accounts.
  const found=await findFriendByAccountId(db,auth,actorUid,
    query.accountId,{now});
  if(found.found!==true)return {available:false};
  const candidate=await eligibleCandidate(db,auth,actorUid,
    query.campaignId,found.accountId);
  return candidate?{available:true,recipient:candidate}:{available:false};
}
