import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  buildFriendNotificationsRelease,isolatedFriendNotificationsSource,
  stageFriendNotificationsRelease
} from './friends-notifications-scoped-release.mjs';
import {
  approvedFriendRuleSources,evaluateLiveFriendRules,auditLiveFriendRules,
  extractLiveRulesFromRuleset,stageFriendRules
} from './friends-notifications-scoped-rules.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const baseEnv={
  GITHUB_ACTIONS:'true',
  GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch',
  ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg'
};
test('isolated callable deploy packages only one disabled notifications endpoint',()=>{
  const files=buildFriendNotificationsRelease();
  assert.deepEqual(Object.keys(files).sort(),[
    'firebase.json','functions/.env.asteria-ttrpg',
    'functions/friendNotificationThrottle.mjs','functions/friendNotifications.mjs',
    'functions/friendRelationshipModel.mjs',
    'functions/index.mjs','functions/package.json'
  ]);
  assert.equal(files['functions/.env.asteria-ttrpg'],
    'ASTERIA_FRIEND_NOTIFICATIONS_ENABLED=0\n');
  assert.equal(files['functions/index.mjs'],isolatedFriendNotificationsSource());
  assert.equal((files['functions/index.mjs'].match(/export const /g)||[]).length,1);
  assert.match(files['functions/index.mjs'],/asteriaFriendNotifications=onCall/);
  for(const prohibited of ['asteriaFriendRequests=onCall','asteriaCampaign',
    'asteriaFriendAccountLookup=onCall','defineSecret','sendEmail']){
    assert.doesNotMatch(files['functions/index.mjs'],new RegExp(prohibited));
  }
  assert.deepEqual(Object.keys(JSON.parse(files['firebase.json'])),['functions']);
  assert.doesNotMatch(files['functions/index.mjs'],/ASTERIA_FRIEND_REQUESTS_ENABLED/);
});
test('callable release refuses marker modification and unknown exports',()=>{
  const source=read('functions/index.mjs');
  assert.throws(()=>isolatedFriendNotificationsSource(source.replace(
    '// Phase 4.1 Friends:', '// modified boundary:')),/boundaries/);
  assert.throws(()=>isolatedFriendNotificationsSource(source.replace(
    'export const asteriaFriendNotifications=onCall({',
    'export const unexpected=onCall({')),/isolation/);
});
test('callable staging cannot run without manual main-only approval',()=>{
  const temp=mkdtempSync(join(tmpdir(),'asteria-notifications-stage-'));
  const env={...baseEnv,RUNNER_TEMP:temp,
    ASTERIA_NOTIFICATION_OPERATION:'friend-notifications-callable-deploy',
    ASTERIA_NOTIFICATION_CONFIRMATION:'DEPLOY-ASTERIA-FRIEND-NOTIFICATIONS-OFF'};
  try{
    for(const change of [{GITHUB_REF:'refs/heads/other'},
      {GITHUB_ACTIONS:'false'},{GITHUB_EVENT_NAME:'push'},
      {ASTERIA_DEPLOY_PROJECT:'demo-asteria'},
      {ASTERIA_NOTIFICATION_OPERATION:'deploy'},
      {ASTERIA_NOTIFICATION_CONFIRMATION:'ACTIVATE'}]){
      assert.throws(()=>stageFriendNotificationsRelease({...env,...change},
        'production'),/approval|requires/);
    }
    assert.throws(()=>stageFriendNotificationsRelease(env,'ci'),/requires/);
    const directory=stageFriendNotificationsRelease(env,'production');
    assert.match(directory,/asteria-friends-notifications-release$/);
    assert.equal(readFileSync(join(directory,'functions/.env.asteria-ttrpg'),'utf8'),
      'ASTERIA_FRIEND_NOTIFICATIONS_ENABLED=0\n');
    assert.equal((readFileSync(join(directory,'functions/index.mjs'),'utf8')
      .match(/export const /g)||[]).length,1);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
test('approved Firestore source contains only private notification denies as delta',()=>{
  const {baseline,approved,baselineSha256,approvedSha256}=
    approvedFriendRuleSources();
  assert.equal(approved,read('firestore.rules'));
  assert.ok(baseline.length>19000);
  assert.match(approved,/match \/friendNotificationInbox\/\{uid\}/);
  assert.match(approved,/match \/friendNotificationAccessThrottle\/\{uid\}/);
  assert.equal(evaluateLiveFriendRules(baseline).state,'ready');
  assert.equal(evaluateLiveFriendRules(approved).state,'already-current');
  assert.match(baselineSha256,/^[a-f0-9]{64}$/);
  assert.match(approvedSha256,/^[a-f0-9]{64}$/);
  assert.notEqual(baselineSha256,approvedSha256);
  assert.throws(()=>evaluateLiveFriendRules(baseline+'\n// unexpected rule'),
    /diverge/);
  assert.throws(()=>extractLiveRulesFromRuleset({source:{files:[]}}),/exactly one/);
  assert.equal(extractLiveRulesFromRuleset({source:{files:[
    {name:'firestore.rules',content:baseline}]}}),baseline);
});
test('read-only drift audit reports non-sensitive historical match and blocks deployment',()=>{
  const {baseline,approved}=approvedFriendRuleSources();
  const revision='a'.repeat(40);
  const history=[{sha:revision,content:baseline}];
  const matching=auditLiveFriendRules(baseline,approved,history);
  assert.equal(matching.state,'ready');
  assert.equal(matching.deploymentPermitted,true);
  assert.deepEqual(matching.historicalMatch,{commit:revision,match:'exact'});
  const drift=baseline.replace('match /accountIdRegistry/{accountIdKey} {',
    'match /accountIdRegistry/{accountIdKey} {\n      // changed policy marker');
  const audit=auditLiveFriendRules(drift,approved,history);
  assert.equal(audit.deploymentPermitted,false);
  assert.equal(audit.state,'blocked-drift');
  assert.equal(audit.knownPaths.accountIdRegistry,true);
  assert.equal(audit.knownPaths.friendNotificationInbox,false);
  assert.equal(audit.historicalMatch,null);
  assert.match(audit.liveSha256,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(audit).includes('changed policy marker'),false);
  assert.throws(()=>evaluateLiveFriendRules(drift,approved),/diverge/);
});
test('inventory performs diagnostic reporting without changing rules or enabling deploy',()=>{
  const workflow=read('.github/workflows/firebase-deploy.yml');
  const inventory=workflow.split('  friend_notifications_inventory:')[1]
    ?.split('  friend_notifications_rules:')[0]||'';
  assert.match(inventory,/--audit-ruleset/);
  assert.match(inventory,/read-only|Read Cloud Functions and Firestore rule inventory/);
  assert.doesNotMatch(inventory,/firebase" deploy|--only firestore:rules|--only functions:asteria/);
  const rules=workflow.split('  friend_notifications_rules:')[1]
    ?.split('  friend_notifications_callable:')[0]||'';
  assert.match(rules,/--stage-production/);
  assert.doesNotMatch(rules,/--audit-ruleset/);
  assert.match(read('scripts/friends-notifications-scoped-rules.mjs'),
    /evaluateLiveFriendRules\(live\)/);
});
test('Firestore staging denies unauthorized runs and never includes indexes or storage',()=>{
  const temp=mkdtempSync(join(tmpdir(),'asteria-friend-rules-stage-'));
  const {baseline,approved}=approvedFriendRuleSources();
  const env={...baseEnv,RUNNER_TEMP:temp,
    ASTERIA_NOTIFICATION_OPERATION:'friend-notifications-rules-deploy',
    ASTERIA_NOTIFICATION_CONFIRMATION:'DEPLOY-ASTERIA-FRIEND-NOTIFICATION-RULES'};
  try{
    for(const change of [{ASTERIA_NOTIFICATION_CONFIRMATION:'bad'},
      {ASTERIA_NOTIFICATION_OPERATION:'deploy'},
      {GITHUB_REF:'refs/heads/feature'},
      {GITHUB_EVENT_NAME:'push'},
      {ASTERIA_DEPLOY_PROJECT:'other-project'}])
      assert.throws(()=>stageFriendRules({...env,...change},baseline),/approval|requires/);
    const result=stageFriendRules(env,baseline);
    assert.equal(result.state,'ready');
    const config=JSON.parse(readFileSync(join(result.directory,'firebase.json'),'utf8'));
    assert.deepEqual(Object.keys(config),['firestore']);
    assert.deepEqual(Object.keys(config.firestore),['rules']);
    assert.equal(readFileSync(join(result.directory,'firestore.rules'),'utf8'),approved);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
test('manual workflow never executes broad deploys or activates social features',()=>{
  const source=read('.github/workflows/firebase-deploy.yml');
  assert.match(source,/^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(source,/^  (push|schedule|pull_request):/m);
  assert.match(source,/default: auth-check/);
  assert.match(source,/friend-notifications-inventory/);
  assert.match(source,/cancel-in-progress: false/);
  for(const section of ['friend_notifications_inventory','friend_notifications_rules','friend_notifications_callable']){
    const start=source.indexOf('  '+section+':');
    assert.ok(start>0,section);
    const following=source.slice(start+3).match(/\n  [a-z_]+:/);
    const next=following?start+3+following.index:-1;
    const body=source.slice(start,next<0?undefined:next);
    assert.match(body,/github.ref == 'refs\/heads\/main'/);
    assert.match(body,/environment: firebase-production/);
    assert.match(body,/google-github-actions\/auth@v3/);
    assert.match(body,/FIREBASE_WORKLOAD_IDENTITY_PROVIDER/);
    assert.match(body,/FIREBASE_DEPLOY_SERVICE_ACCOUNT/);
  }
  assert.match(source,/--only firestore:rules --non-interactive/);
  assert.match(source,/--only functions:asteria:asteriaFriendNotifications --non-interactive/);
  assert.match(source,/DEPLOY-ASTERIA-FRIEND-NOTIFICATION-RULES/);
  assert.match(source,/DEPLOY-ASTERIA-FRIEND-NOTIFICATIONS-OFF/);
  assert.match(source,/ASTERIA_FRIEND_NOTIFICATIONS_ENABLED=0/);
  const social=source.slice(source.indexOf('  friend_notifications_inventory:'));
  assert.doesNotMatch(social,/--only functions,firestore|--only storage|--only hosting/);
  assert.doesNotMatch(social,/ASTERIA_FRIEND_NOTIFICATIONS_ENABLED=1/);
});
