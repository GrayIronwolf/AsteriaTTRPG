import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {
  newCampaignDraft,editCampaignDraft,validateCampaignDraft,
  campaignEditablePatch,campaignIdentity,campaignSummary,DEFAULT_SETTINGS,UCN
} from '../frontend/src/campaigns/campaignForgeModel.mjs';
import {createFirebaseCampaignsService} from '../frontend/src/campaigns/firebaseCampaignsService.mjs';
import {createAppServices,previewServices} from '../frontend/src/services/appServices.mjs';
import {canActivateRoute} from '../frontend/src/app/featureRegistry.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const uid='campaign-owner',id='camp-abc';
const base={
 id,ucn:'000000123456',ownerUid:uid,gmId:uid,name:'Original Campaign',
 description:'Original story',membershipSchemaVersion:2,
 settings:{partySize:5,visibility:'private',inviteRequired:true,
  allowPlayerCreateCharacter:false,allowPlayerLinkCharacter:true,
  preservedFlag:'untouched'},
 access:{dashboard:true,inventory:true,notes:false,customFeature:true},
 partySize:5,players:{[uid]:{role:'gm',characterIds:[]}},
 roles:{[uid]:'gm'},gmUids:[uid],playerUids:[],
 party:['char-1'],characters:{'char-1':{hp:[30,40]}},
 playerCharacterLinks:{'char-1':'other'},joinPolicy:{joinRequestsOpen:false,autoApprove:false},
 inviteCode:'000000123456',uniqueCampaignCode:'000000123456',
 invites:[{id:'sensitive'}],activity:['Existing history'],
 membershipRevision:8
};
test('Campaign Forge starts private, invitation-required, with original editable defaults',()=>{
 const d=newCampaignDraft();
 assert.equal(d.partySize,4);
 assert.equal(d.settings.visibility,'private');
 assert.equal(d.settings.inviteRequired,true);
 assert.equal(d.settings.allowPlayerLinkCharacter,true);
 assert.equal(d.access.notes,false);
 assert.deepEqual(validateCampaignDraft({...d,name:'New Campaign'}),[]);
});
test('Campaign edits preserve all existing v2 membership, party, character and join data',()=>{
 const old=structuredClone(base);
 const draft=editCampaignDraft(old);
 assert.equal(draft.partySize,5);
 assert.equal(draft.settings.allowPlayerCreateCharacter,false);
 draft.name='Renamed Campaign';
 draft.description='A different premise';
 draft.partySize=8;
 draft.settings.allowPlayerLinkCharacter=false;
 draft.access.notes=true;
 const patch=campaignEditablePatch(draft,old);
 assert.deepEqual(Object.keys(patch).sort(),['name','description','partySize','settings','access'].sort());
 assert.equal(patch.settings.preservedFlag,'untouched');
 assert.equal(patch.access.customFeature,true);
 assert.equal(patch.settings.visibility,'private');
 const next={...old,...patch};
 for(const key of ['id','ucn','ownerUid','membershipSchemaVersion',
  'membershipRevision','players','roles','gmUids','playerUids','party','characters',
  'playerCharacterLinks','joinPolicy','inviteCode','uniqueCampaignCode','invites','activity'])
   assert.deepEqual(next[key],old[key],'Protected campaign data changed: '+key);
 assert.equal(next.partySize,8);
 assert.equal(next.access.notes,true);
});
test('invalid campaign input rejects oversized names, party limits and admission policy overrides',()=>{
 const d=newCampaignDraft();d.name='Campaign';
 assert.equal(validateCampaignDraft(d).length,0);
 for(const n of [0,13,2.5,NaN]){
  assert.ok(validateCampaignDraft({...d,partySize:n}).some(e=>e.field==='partySize'));
 }
 assert.ok(validateCampaignDraft({...d,name:' '.repeat(4)}).some(e=>e.field==='name'));
 assert.ok(validateCampaignDraft({...d,name:'x'.repeat(121)}).some(e=>e.field==='name'));
 assert.ok(validateCampaignDraft({...d,description:'x'.repeat(4001)}).some(e=>e.field==='description'));
 assert.ok(validateCampaignDraft({...d,settings:{...d.settings,visibility:'public'}}).some(e=>e.field==='visibility'));
 assert.ok(validateCampaignDraft({...d,settings:{...d.settings,inviteRequired:false}}).some(e=>e.field==='visibility'));
 assert.throws(()=>campaignEditablePatch(d,{...base,ucn:'short'}),/server campaign identity/);
});
test('server-issued UCN is validated, never generated in browser, and stays string-preserving',()=>{
 const identity=campaignIdentity({id,ucn:'000000123456',name:'A'},uid);
 assert.equal(identity.ucn,'000000123456');
 assert.equal(UCN.test(identity.ucn),true);
 assert.throws(()=>campaignIdentity({id,ucn:'123'},uid),/valid campaign identity/);
 assert.throws(()=>campaignIdentity({id:'../../private',ucn:base.ucn},uid),/valid campaign identity/);
 assert.throws(()=>campaignIdentity({id,ucn:base.ucn,membershipSchemaVersion:3},uid),/Unexpected membership/);
 const summary=campaignSummary(base,uid);
 assert.equal(summary.ucn,base.ucn);
 assert.equal(summary.owner,true);
 assert.equal(campaignSummary(base,'other').ucn,'');
});
test('campaign feature is unavailable to guest or auth alone; invitation and GM dashboard still closed',()=>{
 assert.equal(canActivateRoute('campaign-forge',previewServices),false);
 assert.equal(canActivateRoute('campaign-forge',createAppServices({auth:{}})),false);
 const services=createAppServices({auth:{},campaigns:{list(){}}});
 assert.equal(canActivateRoute('campaign-forge',services),true);
 for(const route of ['invitation','gm-dashboard','dashboard','presentation']){
  assert.equal(canActivateRoute(route,services),false);
 }
 const adapter=createFirebaseCampaignsService({
  auth:{currentUser:null},db:{},firestoreSdk:{},functions:{},
  functionsSdk:{},readCanonical:async()=>({uid})});
 assert.equal(adapter.availability().enabled,false);
 return assert.rejects(adapter.list(),/not enabled/);
});
test('Firebase adapter rejects unverified accounts before any campaign read or callable',async()=>{
 const user={uid};
 const adapter=createFirebaseCampaignsService({
  auth:{currentUser:user},db:{},firestoreSdk:{},functions:{},functionsSdk:{},
  readCanonical:async()=>({uid:'other'}),enabled:true
 });
 await assert.rejects(adapter.list(),/could not be verified/);
 await assert.rejects(adapter.create({...newCampaignDraft(),name:'Campaign'}),/could not be verified/);
});
test('React migration does not duplicate Firebase instances or load private browser globals',()=>{
 const files=[
 'frontend/src/campaigns/firebaseCampaignsService.mjs',
 'frontend/src/pages/CampaignForgePage.jsx'
 ];
 for(const p of files){
  assert.doesNotMatch(read(p),/window\.AsteriaFirebase|localStorage|sessionStorage|dangerouslySetInnerHTML/,p);
 }
 const adapter=read(files[0]);
 assert.match(adapter,/asteriaCampaignUCN/);
 assert.match(adapter,/runTransaction/);
 assert.match(adapter,/getDocsFromServer/);
 assert.match(adapter,/ownerUid!==uid/);
 assert.doesNotMatch(adapter,/Math\.random\(|randomUCN|setDoc\(.*campaigns/);
 assert.match(read('frontend/src/auth/firebaseAuthAdapter.mjs'),/VITE_ASTERIA_CAMPAIGN_FORGE_ENABLED/);
 assert.match(read('frontend/src/app/App.jsx'),/CampaignForgePage/);
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.scripts['site:check'],/site-campaign-phase5-2\.test\.mjs/);
 assert.match(read('.github/workflows/site-foundation.yml'),/site:campaign-browser/);
 assert.deepEqual(DEFAULT_SETTINGS.partySize,4);
});
