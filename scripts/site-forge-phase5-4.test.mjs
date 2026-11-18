import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 activeCampaignMember,safeOwnedChoices,safeCharacterLinkStatus,
 safePendingCharacterLinks,safeCampaignCharacterLifecycle,
 gmCharacterReviewPayload,gmCharacterLifecyclePayload,playerCharacterLifecyclePayload
} from '../frontend/src/campaigns/forgeIntegrationModel.mjs';
import {createFirebaseCampaignConnectionService} from '../frontend/src/campaigns/firebaseCampaignConnectionService.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const cid='campaign-1',id='forge-1',link='a'.repeat(64);
test('Phase 5.4: only approved membership can see Forge link workflow',()=>{
 assert.equal(activeCampaignMember('approved'),true);
 assert.equal(activeCampaignMember('member'),true);
 for(const status of ['none','pending','declined','blocked','closed','inactive'])
  assert.equal(activeCampaignMember(status),false);
 assert.deepEqual(safeOwnedChoices([{id,ownerUid:'alice',name:'Hero',linked:false},
  {id:'other',ownerUid:'bob',name:'Private'}],'alice'),
  [{id,name:'Hero',linked:false}]);
 assert.deepEqual(safeOwnedChoices([{}],'alice'),[]);
});
test('Phase 5.4: status and backend review projections reject owner or token spoofing',()=>{
 const item=safeCharacterLinkStatus({campaignId:cid,sourceCharacterId:id,
  status:'pending',revision:1,campaignCharacterId:null,secret:'private'},cid,id);
 assert.equal(item.status,'pending');
 assert.equal('secret' in item,false);
 assert.throws(()=>safeCharacterLinkStatus({campaignId:cid,sourceCharacterId:'other',
  status:'approved',revision:2},cid,id),/verified/);
 const pending=safePendingCharacterLinks({campaignId:cid,requests:[{
  linkId:link,sourceCharacterId:id,ownerUid:'alice',status:'pending',revision:1,
  privateSheet:{name:'Never leak'}
 }]},cid);
 assert.equal(pending.requests.length,1);
 assert.equal(JSON.stringify(pending).includes('privateSheet'),false);
 assert.deepEqual(gmCharacterReviewPayload({...pending.requests[0],status:'pending'},'approve'),{
  linkId:link,decision:'approve',expectedRevision:1});
 assert.throws(()=>gmCharacterReviewPayload({...pending.requests[0],revision:0},'approve'));
 const lifecycle=safeCampaignCharacterLifecycle({campaignId:cid,links:[{
  linkId:link,sourceCharacterId:id,campaignCharacterId:'shared-1',
  ownerUid:'alice',status:'approved',revision:2
 }]},cid);
 assert.deepEqual(gmCharacterLifecyclePayload(lifecycle.links[0],'deactivate'),{
  linkId:link,lifecycleAction:'deactivate',expectedRevision:2});
 assert.throws(()=>gmCharacterLifecyclePayload(lifecycle.links[0],'restore'));
 assert.deepEqual(playerCharacterLifecyclePayload(item,'cancel'),{
  sourceCharacterId:id,lifecycleAction:'cancel',expectedRevision:1});
 assert.throws(()=>playerCharacterLifecyclePayload(item,'unlink'));
});
test('Phase 5.4: callable methods explicitly gated and never write campaign membership in browser',async()=>{
 const auth={currentUser:{uid:'alice'}};
 let calls=[];
 const svc=createFirebaseCampaignConnectionService({
  auth,functions:{},functionsSdk:{
   httpsCallable:(_functions,name)=>async data=>{
    calls.push({name,data});
    if(data.action==='character-link-status')return {data:{
     campaignId:cid,sourceCharacterId:id,status:'none',revision:null}};
    if(data.action==='character-link-request')return {data:{
     campaignId:cid,sourceCharacterId:id,status:'pending',revision:1}};
    if(data.action==='character-link-list')return {data:{campaignId:cid,requests:[]}};
    if(data.action==='character-lifecycle-list')return {data:{campaignId:cid,links:[]}};
    if(data.action==='character-link-review')return {data:{campaignId:cid,status:'approved'}};
    if(data.action==='character-lifecycle-change')return {data:{
     campaignId:cid,status:data.lifecycleAction==='cancel'?'declined':'inactive'}};
    throw Error('Unexpected callable action');
   }
  },readCanonical:async()=>({uid:'alice'}),enabled:true,forgeEnabled:true
 });
 assert.equal(svc.availability().forgeEnabled,true);
 assert.equal((await svc.characterLinkStatus(cid,id)).status,'none');
 assert.equal((await svc.requestCharacterLink(cid,id)).status,'pending');
 assert.deepEqual((await svc.pendingCharacterLinks(cid)).requests,[]);
 assert.deepEqual((await svc.campaignCharacterLifecycle(cid)).links,[]);
 assert.equal((await svc.reviewCharacterLink(cid,{
  linkId:link,ownerUid:'alice',sourceCharacterId:id,revision:1,status:'pending'
 },'approve')).status,'approved');
 assert.equal((await svc.cancelOwnCharacterLink(cid,{sourceCharacterId:id,status:'pending',revision:1},'cancel')).status,'declined');
 assert.equal((await svc.changeCampaignCharacterLifecycle(cid,{
  linkId:link,status:'approved',revision:2
 },'deactivate')).status,'inactive');
 assert.ok(calls.every(x=>x.name==='asteriaCampaignJoinReview'));
 assert.ok(calls.every(x=>!('uid' in x.data)&&!('role' in x.data)&&!('ownerUid' in x.data)));
 const blocked=createFirebaseCampaignConnectionService({
  auth,functions:{},functionsSdk:{},readCanonical:async()=>({uid:'alice'}),
  enabled:true,forgeEnabled:false
 });
 await assert.rejects(blocked.characterLinkStatus(cid,id),/not activated/);
 auth.currentUser={uid:'bob'};
 await assert.rejects(svc.characterLinkStatus(cid,id),/could not be verified/);
 const service=read('frontend/src/campaigns/firebaseCampaignConnectionService.mjs');
 for(const forbidden of ['setDoc(','updateDoc(','deleteDoc(','localStorage','sessionStorage'])
  assert.equal(service.includes(forbidden),false,forbidden);
});
test('Phase 5.4: legacy records cannot be silently migrated or modified by Forge integration',()=>{
 const auth=read('frontend/src/auth/firebaseAuthAdapter.mjs');
 const manager=read('frontend/src/campaigns/CampaignConnectionManager.jsx');
 const player=read('frontend/src/campaigns/PlayerCharacterLink.jsx');
 const gm=read('frontend/src/campaigns/GMCharacterLinks.jsx');
 const page=read('frontend/src/pages/CampaignInvitationPage.jsx');
 const character=read('frontend/src/pages/CharacterForgePage.jsx');
 const campaign=read('frontend/src/campaigns/firebaseCampaignsService.mjs');
 assert.match(auth,/VITE_ASTERIA_FORGE_INTEGRATION_ENABLED/);
 assert.match(manager,/membershipSchemaVersion===2/);
 assert.match(manager,/GMCharacterLinks/);
 assert.match(page,/PlayerCharacterLink/);
 assert.match(character,/Link to Campaign/);
 assert.match(campaign,/membershipSchemaVersion/);
 for(const source of [player,gm,manager]){
  assert.doesNotMatch(source,/setDoc\(|updateDoc\(|deleteDoc\(|localStorage|sessionStorage|dangerouslySetInnerHTML/);
 }
 assert.doesNotMatch(read('frontend/src/campaigns/forgeIntegrationModel.mjs'),/getFirestore|httpsCallable|window\./);
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.scripts['site:check'],/site-forge-phase5-4\.test\.mjs/);
 assert.match(read('.github/workflows/site-foundation.yml'),/site:forge-integration-browser/);
});
