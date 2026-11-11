import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  buildFriendsNotificationActivationRelease,stageFriendsNotificationActivation
} from './friends-notifications-activation-release.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const operations=[
  ['friend-notifications-read-activate','ACTIVATE-ASTERIA-FRIEND-NOTIFICATION-READS','asteriaFriendNotifications',true],
  ['friend-notifications-read-deactivate','DEACTIVATE-ASTERIA-FRIEND-NOTIFICATION-READS','asteriaFriendNotifications',false],
  ['friend-notifications-events-activate','ACTIVATE-ASTERIA-FRIEND-NOTIFICATION-EVENTS','asteriaFriendRequests',true],
  ['friend-notifications-events-deactivate','DEACTIVATE-ASTERIA-FRIEND-NOTIFICATION-EVENTS','asteriaFriendRequests',false]
];
const base={
  GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch',ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg',
  ASTERIA_CURRENT_FRIEND_REQUESTS_ENABLED:'1'
};
test('all four packages isolate a single callable while website rollout is separately controlled',()=>{
 for(const [operation,,functionName,on] of operations){
  const pack=buildFriendsNotificationActivationRelease(operation,{requestEnabled:'1'});
  assert.equal(pack.enabled,on);
  assert.equal(pack.functionName,functionName);
  assert.equal(pack.operation,operation);
  assert.deepEqual(Object.keys(JSON.parse(pack.files['firebase.json'])),['functions']);
  assert.equal(JSON.parse(pack.files['firebase.json']).functions[0].codebase,'asteria');
  const source=pack.files['functions/index.mjs'];
  assert.equal((source.match(/export const /g)||[]).length,1);
  assert.match(source,new RegExp('export const '+functionName+'=onCall'));
  assert.equal(source.includes('export const asteriaFriendNotifications=onCall'),
    functionName==='asteriaFriendNotifications');
  assert.equal(source.includes('export const asteriaFriendRequests=onCall'),
    functionName==='asteriaFriendRequests');
  assert.doesNotMatch(source,/asteriaCampaign|defineSecret|sendEmail|asteriaAccountIdentity=onCall/);
  const env=pack.files['functions/.env.asteria-ttrpg'];
  if(functionName==='asteriaFriendNotifications'){
    assert.equal(env,'ASTERIA_FRIEND_NOTIFICATIONS_ENABLED='+Number(on)+'\n');
  }else{
    assert.equal(env,'ASTERIA_FRIEND_REQUESTS_ENABLED=1\n'+
      'ASTERIA_FRIEND_NOTIFICATIONS_ENABLED='+Number(on)+'\n');
  }
 }
 assert.match(read('index.html'),/friendNotificationsEnabled:true,serverCampaignUCN:false/);
});
test('event rollback preserves a disabled live Friends request handler',()=>{
 const pack=buildFriendsNotificationActivationRelease('friend-notifications-events-deactivate',{
   requestEnabled:'0'
 });
 assert.equal(pack.enabled,false);
 assert.equal(pack.files['functions/.env.asteria-ttrpg'],
  'ASTERIA_FRIEND_REQUESTS_ENABLED=0\nASTERIA_FRIEND_NOTIFICATIONS_ENABLED=0\n');
 assert.throws(()=>buildFriendsNotificationActivationRelease(
   'friend-notifications-events-activate',{requestEnabled:'0'}),/must be verified/);
 for(const unexpected of [undefined,'','true','2','-1'])
  assert.throws(()=>buildFriendsNotificationActivationRelease(
    'friend-notifications-events-deactivate',{requestEnabled:unexpected}),/verified/);
 assert.throws(()=>buildFriendsNotificationActivationRelease('bad-action',
   {requestEnabled:'1'}),/Unknown/);
});
test('each staging operation requires an exact WIF-trusted manual main-only approval',()=>{
 for(const [operation,confirmation,functionName,on] of operations){
  const temp=mkdtempSync(join(tmpdir(),'asteria-friends-notification-stage-'));
  try{
   const env={...base,RUNNER_TEMP:temp,
    ASTERIA_NOTIFICATION_ACTIVATION_OPERATION:operation,
    ASTERIA_NOTIFICATION_ACTIVATION_CONFIRMATION:confirmation
   };
   for(const tamper of [{GITHUB_REF:'refs/heads/not-main'},
     {GITHUB_ACTIONS:'false'},{GITHUB_EVENT_NAME:'push'},
     {ASTERIA_DEPLOY_PROJECT:'another-project'},
     {ASTERIA_NOTIFICATION_ACTIVATION_OPERATION:'friend-notifications-read-deactivate-not-approved'},
     {ASTERIA_NOTIFICATION_ACTIVATION_CONFIRMATION:'different'},
     {RUNNER_TEMP:'relative'}]){
    assert.throws(()=>stageFriendsNotificationActivation({...env,...tamper},operation),
      /main-only/);
   }
   const staged=stageFriendsNotificationActivation(env,operation);
   assert.equal(staged.functionName,functionName);
   assert.equal(staged.enabled,on);
   assert.equal(readFileSync(join(staged.directory,'functions/index.mjs'),'utf8'),
      buildFriendsNotificationActivationRelease(operation,{requestEnabled:'1'})
        .files['functions/index.mjs']);
   assert.throws(()=>stageFriendsNotificationActivation(env,operation),
     /already exists/);
  }finally{rmSync(temp,{recursive:true,force:true});}
 }
});
test('rollback remains available independent of subsequent browser gate release',()=>{
 const js=read('scripts/friends-notifications-activation-release.mjs');
 assert.match(js,/clientFlag\.length!==1/);
 assert.match(js,/requestEnabled:env\.ASTERIA_CURRENT_FRIEND_REQUESTS_ENABLED/);
 assert.match(js,/requestEnabled===['"]1['"]/);
 assert.match(js,/buildFriendRequestsRelease\(\{enabled:requestEnabled===['"]1['"]\}\)/);
});
test('only trusted manual workflow contains independently confirmed activation and rollbacks',()=>{
 const workflow=read('.github/workflows/firebase-deploy.yml');
 assert.match(workflow,/^on:\n  workflow_dispatch:/m);
 assert.match(workflow,/friend-notifications-activation-audit/);
 for(const [operation,confirmation] of operations){
  assert.match(workflow,new RegExp(operation));
  assert.match(workflow,new RegExp(confirmation));
 }
 const audit=workflow.split('  friend_notifications_activation_audit:')[1]
    ?.split('  friend_notifications_activation:')[0]||'';
 const job=workflow.split('  friend_notifications_activation:')[1]||'';
 for(const text of [audit,job]){
  assert.match(text,/github.ref == 'refs\/heads\/main'/);
  assert.match(text,/github.event_name == 'workflow_dispatch'/);
  assert.match(text,/environment: firebase-production/);
  assert.match(text,/google-github-actions\/auth@v3/);
  assert.match(text,/FIREBASE_DEPLOY_SERVICE_ACCOUNT/);
 }
 assert.doesNotMatch(audit,/firebase" deploy|--only functions:|--only firestore:rules/);
 assert.match(job,/test:firebase/);
 assert.match(job,/--stage "\$OPERATION"/);
 assert.match(job,/ASTERIA_CURRENT_FRIEND_REQUESTS_ENABLED/);
 assert.match(job,/--compare-ruleset/);
 assert.match(job,/event_enabled.*!= 0/);
 assert.match(job,/read_enabled.*!= 1/);
 assert.match(job,/--only "functions:asteria:\$NOTIFICATION_RELEASE_TARGET"/);
 assert.match(job,/gcloud functions describe "\$NOTIFICATION_RELEASE_TARGET" --gen2/);
 assert.doesNotMatch(job,/--only firestore|--only storage|--only hosting|--only functions,/);
});
test('source event wiring is still behind the original independent feature flags',()=>{
 const entry=read('functions/index.mjs');
 const mutation=entry.slice(entry.indexOf('// Phase 2.2 Friends:'),
   entry.indexOf('// Phase 1.2 Friends System:'));
 const reader=entry.slice(entry.indexOf('// Phase 4.1 Friends:'),
   entry.indexOf('// Phase 2.2 Friends:'));
 assert.match(mutation,/ASTERIA_FRIEND_REQUESTS_ENABLED!=='1'/);
 assert.match(mutation,/notificationsEnabled:process.env.ASTERIA_FRIEND_NOTIFICATIONS_ENABLED==='1'/);
 assert.match(reader,/ASTERIA_FRIEND_NOTIFICATIONS_ENABLED!=='1'/);
 assert.doesNotMatch(reader,/ASTERIA_FRIEND_REQUESTS_ENABLED/);
 assert.match(read('functions/friendRequestActions.mjs'),
   /enqueueFriendNotifications\(tx,db,actorUid,input.action,previous,next,\{now\}\)/);
});
