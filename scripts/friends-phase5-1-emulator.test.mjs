import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {selectCampaignFriendRecipients,validateCampaignFriendRecipientRequest}
  from '../functions/campaignFriendRecipients.mjs';
import {createFriendRequestRecord,transitionFriendRelationship}
  from '../functions/friendRelationshipModel.mjs';
import {issueAccountBoundFriendInvitation,validateAccountBoundInvitation}
  from '../functions/campaignFriendInvitations.mjs';
import {previewSecureCampaignInvitation,acceptSecureCampaignInvitation}
  from '../functions/campaignInvitationAcceptance.mjs';
import {changeSecureCampaignInvitation}
  from '../functions/campaignInvitationManager.mjs';

const projectId='demo-asteria',campaignId='campaign01';
const now=new Date('2026-11-11T09:30:00.000Z');
const createdAt='2026-11-10T00:00:00.000Z';
const disabled=new Set();
let env,app,db;
const auth={async getUser(uid){
 if(!['alice','bob','carol','dave','eve'].includes(uid))
  throw new Error('Unknown Firebase account');
 return {uid,disabled:disabled.has(uid)};
}};
const request=(actorUid,input)=>selectCampaignFriendRecipients(db,auth,actorUid,
 {campaignId,...input},{now});
async function identity(uid,name,number){
 const lower=name.toLowerCase(),accountId=name+'#'+number;
 const accountIdKey=lower+'#'+number;
 await db.doc('users/'+uid).set({uid,username:name,usernameLower:lower,
  accountId,accountIdKey,accountNumber:number,accountIdAssignedAt:createdAt,
  email:uid+'@private.test'});
 await db.doc('accountIdAssignments/'+uid).set({uid,username:name,
  usernameLower:lower,accountId,accountIdKey,accountNumber:number,createdAt});
 await db.doc('accountIdRegistry/'+accountIdKey).set({uid,usernameLower:lower,
  accountId,accountIdKey,accountNumber:number,createdAt});
}
async function friends(a,b,offset=0){
 const sent=createFriendRequestRecord(a,b,{
  now:new Date(now.getTime()-60000+offset)});
 const accepted=transitionFriendRelationship(sent,{
  actorUid:b,action:'accept',expectedVersion:1,
  now:new Date(now.getTime()-59000+offset)});
 await db.doc('friendRelationships/'+accepted.pairId).set(accepted);
 return accepted;
}
before(async()=>{
 env=await initializeTestEnvironment({projectId,
  firestore:{rules:readFileSync('firestore.rules','utf8')}});
 app=initializeApp({projectId,name:'friends-phase51'});
 db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{
 disabled.clear();await env.clearFirestore();
 await identity('alice','Grayson','01448');
 await identity('bob','Poppa_J','52816');
 await identity('carol','Asteria','00009');
 await identity('dave','Traveller','00121');
 await identity('eve','Another','01777');
 await db.doc('campaigns/'+campaignId).set({
  id:campaignId,ownerUid:'alice',membershipSchemaVersion:2,
  joinPolicy:{joinRequestsOpen:true},name:'Private Campaign'});
});
test('validation is exact and rejects browser-supplied UIDs, emails and extra keys',()=>{
 assert.deepEqual(validateCampaignFriendRecipientRequest({
  action:'list',campaignId,cursor:20}),{action:'list',campaignId,cursor:20});
 assert.deepEqual(validateCampaignFriendRecipientRequest({
  action:'resolve',campaignId,accountId:'Poppa_J#52816'}),
  {action:'resolve',campaignId,accountId:'Poppa_J#52816'});
 for(const bad of [
  {action:'list',campaignId},{action:'list',campaignId,cursor:1},
  {action:'list',campaignId,cursor:-1},{action:'list',campaignId,cursor:1020},
  {action:'list',campaignId,cursor:0,uid:'bob'},
  {action:'resolve',campaignId,accountId:'poppa@example.test'},
  {action:'resolve',campaignId,accountId:'Poppa_J#52816',recipientUid:'bob'},
  {action:'resolve',campaignId,accountId:'Poppa_J#52816',email:'private.test'},
  {action:'resolve',campaignId,accountId:'Poppa_J#52816',roleOffered:'co-gm'},
  {action:'issue',campaignId,accountId:'Poppa_J#52816'},
  {action:'resolve',campaignId,accountId:'Poppa_J#52816',requestId:'abc'},
  null,[]
 ])assert.throws(()=>validateCampaignFriendRecipientRequest(bad),/unavailable/);
});
test('only campaign owner may inspect eligible recipients, not Co-GM or stranger',async()=>{
 await friends('alice','bob');
 assert.deepEqual((await request('alice',{action:'list',cursor:0})).items,
  [{username:'Poppa_J',accountId:'Poppa_J#52816'}]);
 await assert.rejects(request('bob',{action:'list',cursor:0}),/unavailable/);
 await assert.rejects(request('carol',{action:'resolve',
  accountId:'Poppa_J#52816'}),/unavailable/);
 await db.doc('campaigns/'+campaignId).update({membershipSchemaVersion:1});
 await assert.rejects(request('alice',{action:'list',cursor:0}),/unavailable/);
});
test('exact active Account ID works for friend and nonfriend, no UID/email leaks',async()=>{
 await friends('alice','bob');
 const accepted=await request('alice',{action:'resolve',accountId:'Poppa_J#52816'});
 const stranger=await request('alice',{action:'resolve',accountId:'Traveller#00121'});
 assert.deepEqual(accepted,{available:true,
  recipient:{username:'Poppa_J',accountId:'Poppa_J#52816'}});
 assert.deepEqual(stranger,{available:true,
  recipient:{username:'Traveller',accountId:'Traveller#00121'}});
 for(const result of [accepted,stranger]){
  const json=JSON.stringify(result);
  assert.equal(json.includes('private.test'),false);
  assert.equal(json.includes('recipientUid'),false);
  assert.equal(json.includes('pairId'),false);
  assert.equal(json.includes('membership'),false);
  assert.equal(json.includes('blockedBy'),false);
 }
 assert.deepEqual(await request('alice',{action:'resolve',accountId:'Missing#00000'}),
  {available:false});
});
test('blocked, disabled, existing member and pending join collapse to unavailable',async()=>{
 const sent=createFriendRequestRecord('alice','bob',{
  now:new Date(now.getTime()-60000)});
 const blocked=transitionFriendRelationship(sent,{
  actorUid:'alice',action:'block',expectedVersion:1,now});
 await db.doc('friendRelationships/'+blocked.pairId).set(blocked);
 assert.deepEqual(await request('alice',{action:'resolve',accountId:'Poppa_J#52816'}),
  {available:false});
 disabled.add('carol');
 assert.deepEqual(await request('alice',{action:'resolve',accountId:'Asteria#00009'}),
  {available:false});
 disabled.clear();
 await friends('alice','dave');
 await db.doc('campaigns/'+campaignId+'/members/dave').set({
  uid:'dave',campaignId,status:'active',role:'player'});
 assert.deepEqual((await request('alice',{action:'list',cursor:0})).items,[]);
 assert.deepEqual(await request('alice',{action:'resolve',accountId:'Traveller#00121'}),
  {available:false});
 await db.doc('campaigns/'+campaignId+'/joinRequests/eve').set({
  uid:'eve',campaignId,status:'pending'});
 assert.deepEqual(await request('alice',{action:'resolve',accountId:'Another#01777'}),
  {available:false});
});
test('renamed identity remains canonical; old aliases do not reveal targets',async()=>{
 await friends('alice','bob');
 await db.doc('users/bob').update({
  username:'Renamed',usernameLower:'renamed',
  accountId:'Renamed#52816',accountIdKey:'renamed#52816'});
 await db.doc('accountIdAssignments/bob').update({
  username:'Renamed',usernameLower:'renamed',
  accountId:'Renamed#52816',accountIdKey:'renamed#52816'});
 await db.doc('accountIdRegistry/poppa_j#52816').update({
  alias:true,activeAccountIdKey:'renamed#52816'});
 await db.doc('accountIdRegistry/renamed#52816').set({
  uid:'bob',usernameLower:'renamed',accountId:'Renamed#52816',
  accountIdKey:'renamed#52816',accountNumber:'52816',createdAt});
 assert.deepEqual((await request('alice',{action:'list',cursor:0})).items,
  [{username:'Renamed',accountId:'Renamed#52816'}]);
 assert.deepEqual(await request('alice',{action:'resolve',accountId:'Poppa_J#52816'}),
  {available:false});
 assert.equal((await request('alice',{action:'resolve',accountId:'Renamed#52816'}))
  .available,true);
});
test('closed campaign and disabled actor fail closed; no membership or invitation writes',async()=>{
 await friends('alice','bob');
 await db.doc('campaigns/'+campaignId).update({
  joinPolicy:{joinRequestsOpen:false}});
 await assert.rejects(request('alice',{action:'list',cursor:0}),/unavailable/);
 await db.doc('campaigns/'+campaignId).update({
  joinPolicy:{joinRequestsOpen:true}});
 disabled.add('alice');
 await assert.rejects(request('alice',{action:'list',cursor:0}),/unavailable/);
 disabled.clear();
 await request('alice',{action:'list',cursor:0});
 await request('alice',{action:'resolve',accountId:'Poppa_J#52816'});
 const members=await db.collection('campaigns/'+campaignId+'/members').get();
 const invitations=await db.collection('campaigns/'+campaignId+'/invitations').get();
 assert.equal(members.size,0);assert.equal(invitations.size,0);
 const client=env.authenticatedContext('alice').firestore();
 await assertFails(getDoc(doc(client,'friendRelationships/alice~bob')));
 await assertFails(getDocs(collection(client,'accountIdRegistry')));
 await assertFails(getDocs(collection(client,'campaigns/'+campaignId+'/invitations')));
});


// Phase 5.2: the same existing emulator tests private account-bound issuance,
// signed redemption and GM-approval-only handoff without touching production.
const signingKey='S'.repeat(48),secureToken='A'.repeat(43);
const friendIssue=(actorUid,accountId,requestId='account-invite-req-00001',
 opts={})=>issueAccountBoundFriendInvitation(db,auth,actorUid,{
  action:'issue-friend',campaignId,accountId,requestId,expiresInHours:24
 },{now,signingKey,tokenFactory:()=>secureToken,...opts});
const inviteArgs=invite=>({
 campaignId,inviteId:invite.inviteId,token:invite.token
});
const inviteOptions=(overrides={})=>({
 signingKey,now,authAdmin:auth,friendInvitationsEnabled:true,...overrides
});
test('Phase 5.2 strict contract rejects client supplied UID, role, email and grants',()=>{
 const valid={action:'issue-friend',campaignId,accountId:'Poppa_J#52816',
   requestId:'account-invite-req-00001',expiresInHours:24};
 assert.equal(validateAccountBoundInvitation(valid).accountIdKey,'poppa_j#52816');
 for(const input of [
   {...valid,recipientUid:'bob'},{...valid,type:'email'},
   {...valid,roleOffered:'co-gm'},{...valid,maxUses:2},
   {...valid,requiresGMApproval:false},{...valid,recipientEmail:'x@a.test'},
   {...valid,expiresInHours:1},{...valid,requestId:'short'},
   {...valid,accountId:'bob@private.test'},{...valid,action:'issue'}
 ])assert.throws(()=>validateAccountBoundInvitation(input),/unavailable/);
});
test('owner issues single-use UID-bound invitation for friend or exact Account ID',async()=>{
 await friends('alice','bob');
 const friend=await friendIssue('alice','Poppa_J#52816');
 assert.equal(friend.alreadyIssued,false);assert.equal(friend.token,secureToken);
 const stored=(await db.doc('campaigns/'+campaignId+'/invitations/'+friend.inviteId).get()).data();
 assert.equal(stored.bindingKind,'friend-account');
 assert.equal(stored.recipientUid,'bob');
 assert.equal(stored.recipientAccountIdKey,'poppa_j#52816');
 assert.equal(stored.maxUses,1);assert.equal(stored.roleOffered,'player');
 assert.equal(stored.requiresGMApproval,true);
 assert.equal(stored.token,undefined);
 assert.equal((await db.collection('campaigns/'+campaignId+'/members').get()).size,0);
 assert.equal((await db.collection('campaigns/'+campaignId+'/joinRequests').get()).size,0);
 const again=await friendIssue('alice','Poppa_J#52816');
 assert.equal(again.alreadyIssued,true);assert.equal(again.token,null);
 await assert.rejects(friendIssue('alice','Traveller#00121'),/unavailable/);
 const direct=await friendIssue('alice','Traveller#00121',
   'account-invite-req-00002');
 const directSnap=(await db.doc('campaigns/'+campaignId+'/invitations/'+direct.inviteId).get()).data();
 assert.equal(directSnap.recipientUid,'dave');
 assert.equal(directSnap.maxUses,1);
 assert.equal(JSON.stringify({friend,direct}).includes('"recipientUid"'),false);
});
test('friend-bound invitation claims create pending review only; wrong account denied',async()=>{
 const issued=await friendIssue('alice','Poppa_J#52816');
 await assert.rejects(previewSecureCampaignInvitation(db,{
   uid:'carol',emailVerified:true
 },inviteArgs(issued),inviteOptions()),/unavailable/);
 await assert.rejects(acceptSecureCampaignInvitation(db,{
   uid:'carol',emailVerified:true
 },inviteArgs(issued),inviteOptions()),/unavailable/);
 const preview=await previewSecureCampaignInvitation(db,{uid:'bob'},inviteArgs(issued),
   inviteOptions());
 assert.equal(preview.requiresGMApproval,true);
 assert.equal(preview.status,'available');
 const claim=await acceptSecureCampaignInvitation(db,{uid:'bob'},inviteArgs(issued),
   inviteOptions());
 assert.equal(claim.status,'pending');
 assert.equal(claim.offeredRole,'player');
 assert.equal((await db.doc('campaigns/'+campaignId+'/joinRequests/bob').get()).data().status,'pending');
 assert.equal((await db.doc('campaigns/'+campaignId+'/members/bob').get()).exists,false);
 const repeat=await acceptSecureCampaignInvitation(db,{uid:'bob'},inviteArgs(issued),
   inviteOptions({now:new Date(now.getTime()+48*3600000)}));
 assert.equal(repeat.alreadyExists,true);
 const stored=(await db.doc('campaigns/'+campaignId+'/invitations/'+issued.inviteId).get()).data();
 assert.equal(stored.usedCount,1);
});
test('blocked or disabled recipients cannot receive or redeem new bound invitations',async()=>{
 const initial=await friendIssue('alice','Poppa_J#52816');
 const sent=createFriendRequestRecord('alice','bob',{
   now:new Date(now.getTime()-60000)});
 const blocked=transitionFriendRelationship(sent,{
   actorUid:'alice',action:'block',expectedVersion:1,now});
 await db.doc('friendRelationships/'+blocked.pairId).set(blocked);
 await assert.rejects(friendIssue('alice','Poppa_J#52816',
   'account-invite-req-00003'),/unavailable/);
 await assert.rejects(previewSecureCampaignInvitation(db,{uid:'bob'},
   inviteArgs(initial),inviteOptions()),/unavailable/);
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'bob'},
   inviteArgs(initial),inviteOptions()),/unavailable/);
 disabled.add('dave');
 await assert.rejects(friendIssue('alice','Traveller#00121',
   'account-invite-req-00004'),/unavailable/);
 disabled.add('bob');
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'bob'},
   inviteArgs(initial),inviteOptions()),/unavailable/);
 assert.equal((await db.collection('campaigns/'+campaignId+'/joinRequests').get()).size,0);
});
test('revoked, expired, disabled gate, member, pending review and v1 fail closed',async()=>{
 const issued=await friendIssue('alice','Poppa_J#52816');
 await assert.rejects(previewSecureCampaignInvitation(db,{uid:'bob'},
   inviteArgs(issued),inviteOptions({friendInvitationsEnabled:false})),/unavailable/);
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'bob'},
   inviteArgs(issued),inviteOptions({friendInvitationsEnabled:false})),/unavailable/);
 await changeSecureCampaignInvitation(db,'alice',{
   campaignId,inviteId:issued.inviteId,action:'revoke',expectedRevision:1
 },{now});
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'bob'},
   inviteArgs(issued),inviteOptions()),/unavailable/);
 const expiring=await friendIssue('alice','Poppa_J#52816','account-invite-req-00005');
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'bob'},
   inviteArgs(expiring),inviteOptions({now:new Date(now.getTime()+86400000)})),
   /unavailable/);
 await db.doc('campaigns/'+campaignId+'/members/bob').set({
   uid:'bob',campaignId,role:'player',status:'active'});
 await assert.rejects(friendIssue('alice','Poppa_J#52816',
   'account-invite-req-00006'),/unavailable/);
 await db.doc('campaigns/'+campaignId+'/members/bob').delete();
 await db.doc('campaigns/'+campaignId+'/joinRequests/bob').set({
   uid:'bob',campaignId,status:'pending',revision:1});
 await assert.rejects(friendIssue('alice','Poppa_J#52816',
   'account-invite-req-00007'),/unavailable/);
 await db.doc('campaigns/'+campaignId+'/joinRequests/bob').delete();
 await db.doc('campaigns/'+campaignId).update({membershipSchemaVersion:1});
 await assert.rejects(friendIssue('alice','Poppa_J#52816',
   'account-invite-req-00008'),/unavailable/);
 await assert.rejects(friendIssue('carol','Poppa_J#52816',
   'account-invite-req-00009'),/unavailable/);
});
