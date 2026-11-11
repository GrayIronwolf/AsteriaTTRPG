import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  buildPhase53Release,parsePhase53LiveState,stagePhase53Release
} from './friends-phase5-3-scoped-release.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const secure={
  ASTERIA_SECURE_INVITATIONS_ENABLED:'1',
  ASTERIA_INVITATION_ACCEPTANCE_ENABLED:'1',
  ASTERIA_INVITATION_MANAGER_ENABLED:'1',
  ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED:'0',
  ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED:'0',
  ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED:'0'
};
const ready={recipientReady:true,acceptanceReady:true};
const operations=[
  ['campaign-friends-recipients-deploy-off','asteriaCampaignFriendRecipients','0'],
  ['campaign-friends-recipients-enable','asteriaCampaignFriendRecipients','1'],
  ['campaign-friends-recipients-disable','asteriaCampaignFriendRecipients','0'],
  ['campaign-friends-invites-deploy-off','asteriaSecureInvitation','0'],
  ['campaign-friends-invites-enable','asteriaSecureInvitation','1'],
  ['campaign-friends-invites-disable','asteriaSecureInvitation','0']
];
function stateFor(operation){
 const kind=operation.includes('recipients')?'recipients':'invites';
 const initial=operation.endsWith('-deploy-off');
 return {exists:!initial,env:initial?{}:
   kind==='recipients'?{ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED:'0'}:{...secure}};
}
test('all six operations stage a single source export with pinned Node and independent env flags',()=>{
 for(const [operation,target,enabled] of operations){
  const pkg=buildPhase53Release(operation,{...ready,live:stateFor(operation)});
  assert.equal(pkg.functionName,target);
  assert.equal(pkg.enabled,enabled==='1');
  const config=JSON.parse(pkg.files['firebase.json']);
  assert.deepEqual(Object.keys(config),['functions']);
  assert.equal(config.functions.length,1);
  assert.equal(config.functions[0].codebase,'asteria');
  assert.equal(config.functions[0].runtime,'nodejs22');
  const source=pkg.files['functions/index.mjs'];
  assert.equal((source.match(/export const /g)||[]).length,1);
  assert.match(source,new RegExp('export const '+target+'=onCall\\('));
  assert.doesNotMatch(source,/export const asteriaFriendRequests=onCall/);
  assert.doesNotMatch(source,/export const asteriaFriendNotifications=onCall/);
  assert.doesNotMatch(source,/export const asteriaCampaignNotifications=onCall/);
  const env=pkg.files['functions/.env.asteria-ttrpg'];
  assert.match(env,new RegExp('^ASTERIA_', 'm'));
  assert.doesNotMatch(env,/ASTERIA_FRIEND_NOTIFICATIONS_ENABLED/);
  assert.doesNotMatch(env,/ASTERIA_FRIEND_REQUESTS_ENABLED/);
  assert.doesNotMatch(env,/ASTERIA_RESEND_API_KEY|GOOGLE_APPLICATION_CREDENTIALS/);
  const flag=operation.includes('recipients')?
    'ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED':
    'ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED';
  assert.match(env,new RegExp('^'+flag+'='+enabled+'$', 'm'));
  if(target==='asteriaSecureInvitation'){
    assert.match(source,/defineSecret\('ASTERIA_SECURE_INVITE_SIGNING_KEY'\)/);
    assert.match(source,/secrets:\[secureInvitationSigningKey\]/);
    assert.equal(pkg.files['functions/campaignFriendInvitations.mjs'],
      read('functions/campaignFriendInvitations.mjs'));
    assert.equal(pkg.files['functions/campaignInvitationAcceptance.mjs'],
      read('functions/campaignInvitationAcceptance.mjs'));
  }else{
    assert.doesNotMatch(source,/defineSecret|ASTERIA_SECURE_INVITE_SIGNING_KEY/);
    assert.equal(pkg.files['functions/campaignFriendRecipients.mjs'],
      read('functions/campaignFriendRecipients.mjs'));
  }
 }
 assert.match(read('index.html'),/campaignFriendRecipients:false/);
 assert.match(read('index.html'),/campaignFriendInvitations:false/);
});
test('existing campaign email, issuance, review and notification flags survive scoped release',()=>{
 const state={exists:true,env:{...secure,ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED:'1'}};
 for(const operation of ['campaign-friends-invites-deploy-off',
   'campaign-friends-invites-enable','campaign-friends-invites-disable']){
  const pkg=buildPhase53Release(operation,{live:state,...ready});
  const env=pkg.files['functions/.env.asteria-ttrpg'];
  for(const f of ['ASTERIA_SECURE_INVITATIONS_ENABLED',
    'ASTERIA_INVITATION_ACCEPTANCE_ENABLED',
    'ASTERIA_INVITATION_MANAGER_ENABLED',
    'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED']){
    assert.match(env,new RegExp('^'+f+'='+state.env[f]+'$','m'));
  }
 }
});
test('activation fails closed without existing v2 invitation prerequisites',()=>{
 const live={exists:true,env:{...secure}};
 for(const changes of [
  {recipientReady:false},
  {acceptanceReady:false},
  {live:{exists:true,env:{...secure,ASTERIA_SECURE_INVITATIONS_ENABLED:'0'}}},
  {live:{exists:true,env:{...secure,ASTERIA_INVITATION_ACCEPTANCE_ENABLED:'0'}}},
  {live:{exists:true,env:{...secure,ASTERIA_INVITATION_MANAGER_ENABLED:'0'}}},
  {live:{exists:false,env:{}}},
  {live:{exists:true,env:{...secure,UNREVIEWED_FLAG:'1'}}}
 ]){
  assert.throws(()=>buildPhase53Release('campaign-friends-invites-enable',{
    live,...ready,...changes
  }),/verified active|never been deployed|Unreviewed/);
 }
 assert.throws(()=>buildPhase53Release('campaign-friends-recipients-enable',{
   live:{exists:false,env:{}}}),/never been deployed/);
 assert.throws(()=>buildPhase53Release('campaign-friends-invites-deploy-off',{
   live:{exists:true,env:{...secure,ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED:'1'}}
 }),/interrupt/);
 assert.throws(()=>buildPhase53Release('campaign-friends-recipients-deploy-off',{
   live:{exists:true,env:{ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED:'1'}}
 }),/interrupt/);
});
test('unknown function environment rejects arbitrary secrets or dynamic values',()=>{
 for(const data of [
  null,{},[],{exists:true,env:[]},{exists:true,env:{ASTERIA_FRIEND_REQUESTS_ENABLED:'1'}},
  {exists:true,env:{ASTERIA_SECURE_INVITATIONS_ENABLED:'unset'}},
  {exists:false,env:{ASTERIA_SECURE_INVITATIONS_ENABLED:'0'}}
 ])assert.throws(()=>parsePhase53LiveState(data),/reconciliation|Unreviewed|nonempty environment/);
 const saved=parsePhase53LiveState({exists:true,env:{
  FIREBASE_CONFIG:'some runtime project metadata',
  ASTERIA_SECURE_INVITATIONS_ENABLED:'1'
 }});
 assert.deepEqual(saved,{exists:true,env:{ASTERIA_SECURE_INVITATIONS_ENABLED:'1'}});
});
test('runner staging requires a manual trusted main workflow with exact confirmation',()=>{
 const confirmations=new Map([
  ['campaign-friends-recipients-deploy-off','DEPLOY-ASTERIA-CAMPAIGN-FRIEND-RECIPIENTS-OFF'],
  ['campaign-friends-recipients-enable','ENABLE-ASTERIA-CAMPAIGN-FRIEND-RECIPIENTS'],
  ['campaign-friends-recipients-disable','DISABLE-ASTERIA-CAMPAIGN-FRIEND-RECIPIENTS'],
  ['campaign-friends-invites-deploy-off','DEPLOY-ASTERIA-CAMPAIGN-FRIEND-INVITES-OFF'],
  ['campaign-friends-invites-enable','ENABLE-ASTERIA-CAMPAIGN-FRIEND-INVITES'],
  ['campaign-friends-invites-disable','DISABLE-ASTERIA-CAMPAIGN-FRIEND-INVITES']
 ]);
 for(const [operation,confirmation] of confirmations){
  const root=mkdtempSync(join(tmpdir(),'asteria-phase53-release-'));
  try{
   const liveFile=join(root,'live.json');
   writeFileSync(liveFile,JSON.stringify(stateFor(operation)));
   const env={
     GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',
     GITHUB_EVENT_NAME:'workflow_dispatch',RUNNER_TEMP:root,
     ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg',
     ASTERIA_PHASE53_OPERATION:operation,
     ASTERIA_PHASE53_CONFIRMATION:confirmation,
     ASTERIA_PHASE53_LIVE_FILE:liveFile,
     ASTERIA_PHASE53_RECIPIENT_READY:'1',
     ASTERIA_PHASE53_ACCEPTANCE_READY:'1'
   };
   for(const tamper of [{GITHUB_ACTIONS:'false'},{GITHUB_REF:'refs/heads/test'},
     {GITHUB_EVENT_NAME:'push'},{RUNNER_TEMP:'relative'},
     {ASTERIA_DEPLOY_PROJECT:'demo-asteria'},
     {ASTERIA_PHASE53_OPERATION:'deploy'},
     {ASTERIA_PHASE53_CONFIRMATION:'UNKNOWN'},
     {ASTERIA_PHASE53_LIVE_FILE:'/tmp/missing.json'}]){
    assert.throws(()=>stagePhase53Release({...env,...tamper},operation),
      /approval/);
   }
   const staged=stagePhase53Release(env,operation);
   assert.equal(staged.operation,operation);
   assert.match(readFileSync(join(staged.directory,'functions/index.mjs'),'utf8'),
     new RegExp('export const '+staged.functionName+'=onCall'));
   assert.throws(()=>stagePhase53Release(env,operation),/already exists/);
  }finally{rmSync(root,{recursive:true,force:true});}
 }
});
test('existing website and friend notification rollbacks are unchanged',()=>{
 const workflow=read('.github/workflows/firebase-deploy.yml');
 assert.match(workflow,/friend-notifications-events-deactivate/);
 assert.match(workflow,/friend-notifications-read-deactivate/);
 assert.match(workflow,/campaign-friends-release-audit/);
 for(const name of [
  'campaign-friends-recipients-deploy-off','campaign-friends-recipients-enable',
  'campaign-friends-recipients-disable','campaign-friends-invites-deploy-off',
  'campaign-friends-invites-enable','campaign-friends-invites-disable'
 ])assert.match(workflow,new RegExp(name));
 assert.match(workflow,/secure_count/);
 assert.match(workflow,/Disable account-bound invitation issuance before recipient lookup/);
 assert.match(workflow,/--only "functions:asteria:\$PHASE53_TARGET"/);
 assert.match(workflow,/firebase-production/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(read('index.html'),/friendNotificationsEnabled:true/);
});
