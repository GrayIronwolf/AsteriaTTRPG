import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 parseSecureInvitationHash,captureIncomingSecureInvite,getPendingSecureInvite,
 clearPendingSecureInvite,normalizeUCN,safeSecureLink,safeJoinPreview,
 safeInvitationPreview,safeRequestState,validateMemberAction,
 validateRoleAction,validateDelegation
} from '../frontend/src/campaigns/campaignConnectionModel.mjs';
import {createFirebaseCampaignConnectionService} from '../frontend/src/campaigns/firebaseCampaignConnectionService.mjs';
import {parseSiteRoute} from '../frontend/src/router/siteRoutes.mjs';
import {createAppServices,previewServices} from '../frontend/src/services/appServices.mjs';
import {canActivateRoute} from '../frontend/src/app/featureRegistry.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const campaignId='camp-123',inviteId='a'.repeat(64),token='B'.repeat(43);
const hash='#secure-campaign-invite='+campaignId+'.'+inviteId+'.'+token;
test('secure incoming token is parsed only in memory, immediately removed from URL',()=>{
 const replaced=[];
 assert.equal(captureIncomingSecureInvite({hash,replace:x=>replaced.push(x)}),true);
 assert.deepEqual(replaced,['#/campaign-invitation']);
 assert.deepEqual(getPendingSecureInvite(),{campaignId,inviteId,token});
 assert.deepEqual(parseSecureInvitationHash(hash),{campaignId,inviteId,token});
 assert.equal(parseSecureInvitationHash('#secure-campaign-invite=broken'),null);
 clearPendingSecureInvite();
 assert.equal(getPendingSecureInvite(),null);
 assert.equal(captureIncomingSecureInvite({hash:'#secure-campaign-invite=broken',replace:x=>replaced.push(x)}),true);
 assert.equal(getPendingSecureInvite(),null);
 assert.equal(replaced.at(-1),'#/campaign-invitation');
 assert.equal(captureIncomingSecureInvite({hash:'#/home',replace:()=>{}}),false);
});
test('secure share link is constructed without modifying user role or UCN; malformed secrets rejected',()=>{
 assert.equal(safeSecureLink({campaignId,inviteId,token},'https://asteriattrpg.com/index.html'),
   'https://asteriattrpg.com/index.html'+hash);
 assert.throws(()=>safeSecureLink({campaignId,inviteId,token:'short'},'https://asteriattrpg.com'),/Invalid/);
 assert.throws(()=>safeSecureLink({campaignId,inviteId,token},'javascript:alert(1)'),/Invalid/);
 for(const v of ['12','1234567890123','1'.repeat(11),'1234567890xx'])assert.equal(normalizeUCN(v),null);
 assert.equal(normalizeUCN('0000-1234 5678'),'000012345678');
 assert.equal(safeJoinPreview({id:campaignId,ucn:'000012345678',name:'Citadel',joinMode:'request'}).ucn,'000012345678');
 assert.throws(()=>safeJoinPreview({id:campaignId,ucn:'bad',name:'Citadel',joinMode:'request'}),/Invalid/);
});
test('secure preview and request state never include raw token or private membership',()=>{
 const result=safeInvitationPreview({campaignId,campaignName:'The Citadel',
  roleOffered:'player',requiresGMApproval:true,status:'available',expiresAt:'2026-11-19T00:00:00Z',
  token,memberUids:['a'],gmNotes:'Private'});
 assert.deepEqual(Object.keys(result).sort(),
  ['campaignId','name','role','status','expiresAt','requiresGMApproval'].sort());
 assert.equal(JSON.stringify(result).includes(token),false);
 assert.throws(()=>safeInvitationPreview({...result,roleOffered:'owner'}),/Invalid/);
 assert.equal(safeRequestState({campaignId,status:'pending',alreadyExists:true},campaignId).status,'pending');
 assert.throws(()=>safeRequestState({campaignId:'other',status:'pending'},campaignId),/Invalid/);
});
test('moderation, Co-GM permissions, role changes require server-approved roster metadata',()=>{
 const member={uid:'player_1',status:'active',role:'player',revision:2,
  controls:['suspend','remove','ban'],roleEditable:true};
 assert.deepEqual(validateMemberAction(member,'suspend'),{
  memberUid:'player_1',memberAction:'suspend',expectedRevision:2,
  expectedStatus:'active',reason:''});
 assert.throws(()=>validateMemberAction(member,'remove','x'),/reason/);
 assert.throws(()=>validateMemberAction({...member,controls:[]},'ban','Good reason'),/not authorised/);
 assert.equal(validateRoleAction(member,'co-gm').expectedRole,'player');
 assert.throws(()=>validateRoleAction({...member,roleEditable:false},'co-gm'),/not available/);
 const gm={...member,role:'co-gm'};
 assert.equal(validateDelegation(gm,'review-join-requests',true).enabled,true);
 assert.throws(()=>validateDelegation(member,'review-join-requests',true),/not available/);
 assert.throws(()=>validateDelegation(gm,'admin',true),/not available/);
});
test('callable adapter rejects guest profiles and never directly writes membership records',async()=>{
 const service=createFirebaseCampaignConnectionService({
  auth:{currentUser:null},functions:{},functionsSdk:{},readCanonical:async()=>null});
 assert.equal(service.availability().enabled,false);
 await assert.rejects(service.lookupUCN('000000123456'),/not activated/);
 const active=createFirebaseCampaignConnectionService({
  auth:{currentUser:{uid:'user'}},functions:{},functionsSdk:{},
  readCanonical:async()=>({uid:'other'}),enabled:true});
 await assert.rejects(active.lookupUCN('000000123456'),/could not be verified/);
 const code=read('frontend/src/campaigns/firebaseCampaignConnectionService.mjs');
 for(const forbidden of ['setDoc(','updateDoc(','deleteDoc(','localStorage','sessionStorage','window.AsteriaFirebase','Math.random('])
  assert.equal(code.includes(forbidden),false,forbidden);
 for(const action of ['lookupUCN','requestStatus','submitJoin','previewSecure','acceptSecure',
  'issueInvite','invitations','changeInvite','roster','joinQueue','review',
  'approvalMode','moderate','role','delegate','activity'])
  assert.equal(typeof active[action],'function',action);
});
test('server-issued calls are well formed and immutable role proof is never supplied by client',async()=>{
 let calls=[];
 const service=createFirebaseCampaignConnectionService({
  auth:{currentUser:{uid:'owner'}},functions:{},
  functionsSdk:{httpsCallable:(_fn,name)=>async args=>{
   calls.push({name,args});
   if(name==='asteriaCampaignUCN')return {data:{
    id:campaignId,ucn:'000000123456',name:'Citadel',joinMode:'request'}};
   if(name==='asteriaCampaignJoinReview')return {data:{campaignId,status:'approved'}};
   return {data:{campaignId,status:'none',alreadyExists:false}};
  }},
  readCanonical:async()=>({uid:'owner'}),enabled:true});
 assert.equal((await service.lookupUCN('0000 0012-3456')).joinMode,'request');
 await service.submitJoin(campaignId,'000000123456');
 assert.deepEqual(calls[1].args,{action:'submit',campaignId,ucn:'000000123456',characterId:null});
 const member={uid:'player_1',status:'active',role:'player',revision:3,controls:['suspend']};
 await service.moderate(campaignId,member,'suspend');
 assert.deepEqual(calls.at(-1).args,{action:'member-control',campaignId,
  memberUid:'player_1',memberAction:'suspend',expectedRevision:3,
  expectedStatus:'active',reason:''});
 assert.ok(!JSON.stringify(calls).includes('"actorUid"'));
});
test('invitation recognition defaults safe and no GM dashboard privilege leaks',()=>{
 assert.equal(parseSiteRoute({hash:'#/campaign-invitation'}).id,'invitation');
 assert.equal(parseSiteRoute({hash:'#/join/000012345678'}).params.code,'000012345678');
 assert.equal(canActivateRoute('invitation',previewServices),false);
 const connected=createAppServices({auth:{},campaigns:{connections:{availability:()=>({enabled:true})}}});
 assert.equal(canActivateRoute('invitation',connected),true);
 for(const route of ['gm-dashboard','dashboard','presentation','character-dashboard'])
  assert.equal(canActivateRoute(route,connected),false,route);
 assert.match(read('frontend/src/main.jsx'),/sanitizeIncomingLocation/);
 assert.match(read('frontend/src/router/locationStore.mjs'),/captureIncomingSecureInvite/);
 assert.match(read('frontend/src/pages/CampaignInvitationPage.jsx'),/getPendingSecureInvite/);
 assert.match(read('frontend/src/pages/CampaignForgePage.jsx'),/CampaignConnectionManager/);
 assert.match(read('frontend/src/auth/firebaseAuthAdapter.mjs'),/VITE_ASTERIA_CAMPAIGN_CONNECTIONS_ENABLED/);
 assert.match(read('.github/workflows/site-foundation.yml'),/site:connection-browser/);
});
