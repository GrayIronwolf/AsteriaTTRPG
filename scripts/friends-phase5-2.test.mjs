import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {issueAccountBoundFriendInvitation,validateAccountBoundInvitation}
  from '../functions/campaignFriendInvitations.mjs';
import {createFriendRequestRecord,transitionFriendRelationship}
  from '../functions/friendRelationshipModel.mjs';
import {previewSecureCampaignInvitation,acceptSecureCampaignInvitation}
  from '../functions/campaignInvitationAcceptance.mjs';
import {changeSecureCampaignInvitation}
  from '../functions/campaignInvitationManager.mjs';

const now=new Date('2026-11-11T09:00:00Z'),key='K'.repeat(48);
const createdAt='2026-11-10T00:00:00.000Z';
const clone=x=>structuredClone(x);
const issueInput=(accountId='Poppa_J#52816',requestId='phase-5-2-request-00001')=>({
  action:'issue-friend',campaignId:'campaign01',accountId,requestId,
  expiresInHours:168
});
const auth={async getUser(uid){
  if(disabled.has(uid))return {uid,disabled:true};
  if(!['alice','bob','carol','dave'].includes(uid))
    throw Error('Auth user missing');
  return {uid,disabled:false};
}};
const disabled=new Set();
function seedIdentity(store,uid,username,number){
 const lower=username.toLowerCase(),accountId=username+'#'+number;
 const key=lower+'#'+number;
 store.set('users/'+uid,{uid,username,usernameLower:lower,accountId,
   accountIdKey:key,accountNumber:number,accountIdAssignedAt:createdAt});
 store.set('accountIdAssignments/'+uid,{uid,username,usernameLower:lower,
   accountId,accountIdKey:key,accountNumber:number,createdAt});
 store.set('accountIdRegistry/'+key,{uid,usernameLower:lower,accountId,
   accountIdKey:key,accountNumber:number,createdAt});
}
function fixture(){
 const store=new Map([['campaigns/campaign01',{
   id:'campaign01',ownerUid:'alice',membershipSchemaVersion:2,
   joinPolicy:{joinRequestsOpen:true},name:'Asteria'
 }]]);
 seedIdentity(store,'alice','Grayson','01448');
 seedIdentity(store,'bob','Poppa_J','52816');
 seedIdentity(store,'carol','Traveller','00121');
 seedIdentity(store,'dave','Other','00333');
 const ref=path=>({path,async get(){
   return {exists:store.has(path),data:()=>clone(store.get(path))};
 }});
 const db={store,doc:ref,
   async runTransaction(fn){
     const writes=[];
     const tx={
       get:r=>r.get(),
       create(r,data){if(store.has(r.path)||writes.some(x=>x.path===r.path))throw Error('duplicate doc');writes.push({type:'create',path:r.path,data:clone(data)});},
       set(r,data){writes.push({type:'set',path:r.path,data:clone(data)});},
       update(r,data){if(!store.has(r.path))throw Error('missing doc');writes.push({type:'update',path:r.path,data:clone(data)});}
     };
     const answer=await fn(tx);
     for(const w of writes){
       store.set(w.path,w.type==='update'?{...store.get(w.path),...w.data}:w.data);
     }
     return answer;
   }};
 return db;
}
function accepted(db,actor='alice',target='bob'){
 const sent=createFriendRequestRecord(actor,target,{now:new Date(now.getTime()-60000)});
 const pair=transitionFriendRelationship(sent,{actorUid:target,action:'accept',
   expectedVersion:1,now:new Date(now.getTime()-59000)});
 db.store.set('friendRelationships/'+pair.pairId,pair);
 return pair;
}
const token=()=>randomBytes(32).toString('base64url');
async function issue(db,accountId='Poppa_J#52816',requestId='phase-5-2-request-00001'){
 return issueAccountBoundFriendInvitation(db,auth,'alice',issueInput(accountId,requestId),
   {signingKey:key,now,tokenFactory:token});
}
const claim=(db,issued,uid='bob',time=now)=>acceptSecureCampaignInvitation(db,
 {uid}, {campaignId:'campaign01',inviteId:issued.inviteId,token:issued.token},
 {signingKey:key,now:time,authAdmin:auth,friendInvitationsEnabled:true});
const preview=(db,issued,uid='bob',time=now)=>previewSecureCampaignInvitation(db,
 {uid}, {campaignId:'campaign01',inviteId:issued.inviteId,token:issued.token},
 {signingKey:key,now:time,authAdmin:auth,friendInvitationsEnabled:true});

test('exact Account ID and distinct issue action shape reject forged UIDs and email',()=>{
 assert.deepEqual(validateAccountBoundInvitation(issueInput()).accountIdKey,'poppa_j#52816');
 for(const payload of [
  {...issueInput(),recipientUid:'bob'},
  {...issueInput(),roleOffered:'co-gm'},
  {...issueInput(),recipientEmail:'bob@test.example'},
  {...issueInput(),maxUses:2},
  {...issueInput(),type:'email'},
  {...issueInput(),expiresInHours:0},
  {...issueInput(),accountId:'bob@example.com'},
  {...issueInput(),action:'issue'}
 ])assert.throws(()=>validateAccountBoundInvitation(payload),/unavailable/);
});
test('accepted friend and exact nonfriend create owner-only single-use bound invitations',async()=>{
 disabled.clear();
 const db=fixture();accepted(db);
 const first=await issue(db);
 assert.equal(first.maxUses,1);
 assert.equal(first.requiresGMApproval,true);
 assert.equal(first.roleOffered,'player');
 assert.equal(first.type,'share-link');
 const record=db.store.get('campaigns/campaign01/invitations/'+first.inviteId);
 assert.equal(record.recipientUid,'bob');
 assert.equal(record.friendAccountBound,true);
 assert.equal(record.maxUses,1);
 assert.equal(record.recipientEmailNormalized,null);
 assert.equal(record.tokenDigest.length,64);
 assert.equal(JSON.stringify([...db.store.values()]).includes(first.token),false);
 assert.equal(db.store.has('campaigns/campaign01/members/bob'),false);
 const other=await issue(db,'Traveller#00121','phase-5-2-request-00002');
 assert.equal(db.store.get('campaigns/campaign01/invitations/'+other.inviteId).recipientUid,'carol');
 const otherPreview=await preview(db,other,'carol');
 assert.equal(otherPreview.requiresGMApproval,true);
 assert.equal(db.store.has('campaigns/campaign01/joinRequests/carol'),false);
 const approved=await claim(db,first);
 assert.equal(approved.status,'pending');
 assert.equal(approved.offeredRole,'player');
 assert.equal(db.store.has('campaigns/campaign01/members/bob'),false);
 assert.equal(db.store.get('campaigns/campaign01/joinRequests/bob').status,'pending');
});
test('wrong recipient, replay and duplicate request key cannot create another join or expose bearer',async()=>{
 disabled.clear();
 const db=fixture();accepted(db);
 const first=await issue(db);
 await assert.rejects(preview(db,first,'carol'),/unavailable/);
 await assert.rejects(claim(db,first,'carol'),/unavailable/);
 const retry=await issue(db);
 assert.equal(retry.alreadyIssued,true);
 assert.equal(retry.token,null);
 await assert.rejects(issue(db,'Traveller#00121'),/unavailable/);
 const result=await claim(db,first);
 assert.equal(result.status,'pending');
 const again=await claim(db,first,'bob',new Date(now.getTime()+8*86400000));
 assert.equal(again.alreadyExists,true);
 assert.equal(db.store.get('campaigns/campaign01/invitations/'+first.inviteId).usedCount,1);
});
test('blocked at issuance or later blocks claim; disabled Auth also blocks claim',async()=>{
 disabled.clear();
 const db=fixture();const pair=accepted(db);
 const blocked=transitionFriendRelationship(pair,{actorUid:'alice',action:'block',
   expectedVersion:2,now});
 db.store.set('friendRelationships/'+pair.pairId,blocked);
 await assert.rejects(issue(db),/unavailable/);
 db.store.set('friendRelationships/'+pair.pairId,pair);
 const issued=await issue(db,'Poppa_J#52816','phase-5-2-request-00003');
 db.store.set('friendRelationships/'+pair.pairId,blocked);
 await assert.rejects(preview(db,issued),/unavailable/);
 await assert.rejects(claim(db,issued),/unavailable/);
 db.store.set('friendRelationships/'+pair.pairId,pair);
 disabled.add('bob');
 await assert.rejects(claim(db,issued),/unavailable/);
 disabled.clear();
 assert.equal(db.store.has('campaigns/campaign01/joinRequests/bob'),false);
});
test('member, pending join, closed, disabled target and v1 fail without issuing',async()=>{
 disabled.clear();
 const db=fixture();accepted(db);
 db.store.set('campaigns/campaign01/members/bob',
   {uid:'bob',campaignId:'campaign01',role:'player',status:'active'});
 await assert.rejects(issue(db),/unavailable/);
 db.store.delete('campaigns/campaign01/members/bob');
 db.store.set('campaigns/campaign01/joinRequests/bob',
   {uid:'bob',campaignId:'campaign01',status:'pending'});
 await assert.rejects(issue(db,'Poppa_J#52816','phase-5-2-request-00004'),/unavailable/);
 db.store.delete('campaigns/campaign01/joinRequests/bob');
 disabled.add('bob');
 await assert.rejects(issue(db,'Poppa_J#52816','phase-5-2-request-00005'),/unavailable/);
 disabled.clear();
 db.store.get('campaigns/campaign01').joinPolicy.joinRequestsOpen=false;
 await assert.rejects(issue(db,'Poppa_J#52816','phase-5-2-request-00006'),/unavailable/);
 db.store.get('campaigns/campaign01').joinPolicy.joinRequestsOpen=true;
 db.store.get('campaigns/campaign01').membershipSchemaVersion=1;
 await assert.rejects(issue(db,'Poppa_J#52816','phase-5-2-request-00007'),/unavailable/);
 assert.equal([...db.store.keys()].some(k=>k.includes('/invitations/')),false);
});
test('revoked, expired and forged credentials cannot claim; legacy stays unaffected',async()=>{
 disabled.clear();
 const db=fixture();accepted(db);
 const issued=await issue(db);
 await changeSecureCampaignInvitation(db,'alice',{
   campaignId:'campaign01',inviteId:issued.inviteId,
   action:'revoke',expectedRevision:1
 },{now});
 await assert.rejects(claim(db,issued),/unavailable/);
 const next=await issue(db,'Traveller#00121','phase-5-2-request-00008');
 await assert.rejects(claim(db,next,'carol',new Date(now.getTime()+8*86400000)),
   /unavailable/);
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'carol'},{
   campaignId:'campaign01',inviteId:next.inviteId,token:token()
 },{signingKey:key,now,authAdmin:auth,friendInvitationsEnabled:true}),/unavailable/);
 const oldRecord={...db.store.get('campaigns/campaign01/invitations/'+next.inviteId)};
 delete oldRecord.friendAccountBound;
 assert.equal(oldRecord.friendAccountBound,undefined);
});
test('release remains disabled and cannot grant campaign access directly',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const backend=read('functions/index.mjs');
 const ui=read('index.html');
 const flow=read('functions/campaignFriendInvitations.mjs');
 assert.match(backend,/ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED!=='1'/);
 assert.match(backend,/ASTERIA_SECURE_INVITATIONS_ENABLED!=='1'/);
 assert.match(ui,/campaignFriendInvitations:false/);
 assert.match(flow,/resolveBoundRecipient:/);
 assert.doesNotMatch(flow,/tx\.create|tx\.update|tx\.delete/);
 assert.doesNotMatch(flow,/recipientUid:uid/);
 assert.match(read('functions/campaignInvitationAcceptance.mjs'),/assertFriendBoundClaim/);
 assert.match(read('js/firebase-auth.js'),/issueCampaignFriendInvitation: async function/);
});


test('notification-only friend invitation arrives in exact account inbox and requests GM approval without any token',async()=>{
 disabled.clear();
 const db=fixture();accepted(db);
 const issued=await issueAccountBoundFriendInvitation(db,auth,'alice',issueInput(),{
   signingKey:key,now,tokenFactory:token,notificationsEnabled:true
 });
 const ownerInbox=[...db.store.keys()].filter(p=>
   p.startsWith('campaignNotificationInbox/alice/items/'));
 const recipientInbox=[...db.store.keys()].filter(p=>
   p.startsWith('campaignNotificationInbox/bob/items/'));
 assert.equal(ownerInbox.length,0);
 assert.equal(recipientInbox.length,1);
 const row=db.store.get(recipientInbox[0]);
 assert.equal(row.kind,'friend-invitation');
 assert.equal(row.inviteId,issued.inviteId);
 assert.equal(row.recipientUid,'bob');
 for(const secret of ['token','tokenDigest','recipientEmail','email'])
   assert.equal(row[secret],undefined);
 assert.ok(!JSON.stringify(row).includes(issued.token));
 const args={campaignId:'campaign01',inviteId:issued.inviteId};
 const options={now,authAdmin:auth,notificationsEnabled:true,
   friendInvitationsEnabled:true,notificationOnly:true};
 const prev=await previewSecureCampaignInvitation(db,{uid:'bob'},args,options);
 assert.equal(prev.status,'available');
 await assert.rejects(previewSecureCampaignInvitation(db,{uid:'carol'},args,options),/unavailable/);
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'carol'},args,options),/unavailable/);
 const claim=await acceptSecureCampaignInvitation(db,{uid:'bob'},args,options);
 assert.equal(claim.status,'pending');
 assert.equal(db.store.has('campaigns/campaign01/members/bob'),false);
 assert.equal(db.store.get('campaigns/campaign01/joinRequests/bob').status,'pending');
 assert.equal(await acceptSecureCampaignInvitation(db,{uid:'bob'},args,options)
   .then(v=>v.alreadyExists),true);
});
test('notice path fails closed without recipient notification, disabled flags, or valid friend relationship',async()=>{
 disabled.clear();
 const db=fixture();const pair=accepted(db);
 const issued=await issue(db);
 const args={campaignId:'campaign01',inviteId:issued.inviteId};
 const opts={now,authAdmin:auth,notificationsEnabled:true,
   friendInvitationsEnabled:true,notificationOnly:true};
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'bob'},args,opts),/unavailable/);
 const first=await issueAccountBoundFriendInvitation(db,auth,'alice',
   issueInput('Poppa_J#52816','notification-request-000002'),{
     signingKey:key,now,tokenFactory:token,notificationsEnabled:true
   });
 const notify={campaignId:'campaign01',inviteId:first.inviteId};
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'bob'},notify,{
   ...opts,notificationsEnabled:false
 }),/unavailable/);
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'bob'},{
   ...notify,token:first.token
 },opts),/unavailable/);
 const blocked=transitionFriendRelationship(pair,{actorUid:'alice',
   action:'block',expectedVersion:2,now});
 db.store.set('friendRelationships/'+pair.pairId,blocked);
 await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'bob'},notify,opts),/unavailable/);
 assert.equal(db.store.has('campaigns/campaign01/members/bob'),false);
});
