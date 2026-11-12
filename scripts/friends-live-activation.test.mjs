import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  buildFriendsLiveRelease,stageFriendsLiveRelease,OPERATION,CONFIRMATION,TARGETS
} from './friends-live-activation.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sample=()=>Object.fromEntries(TARGETS.map(name=>[name,{
  state:'ACTIVE',signingSecretAttached:false,env:{
    LOG_EXECUTION_ID:'true',FUNCTION_REGION:'us-central1'
  }
}]));
test('three already-deployed Friends functions, no campaigns or email, preserve metadata isolation',()=>{
  const release=buildFriendsLiveRelease(sample());
  assert.equal(release.productionChanged,false);
  assert.deepEqual(release.targets,TARGETS);
  assert.equal(release.packages.length,3);
  for(const p of release.packages){
    assert.equal(p.selector,'functions:asteria:'+p.name);
    assert.equal((p.files['functions/index.mjs'].match(/export const /g)||[]).length,1);
    assert.match(p.files['functions/index.mjs'],
      new RegExp('export const '+p.name+'=onCall'));
    assert.equal(p.files['functions/.env.asteria-ttrpg'].includes('LOG_EXECUTION_ID'),false);
    assert.equal(Object.keys(p.files).some(k=>k.startsWith('firestore.')||k.startsWith('storage.')),false);
    assert.doesNotMatch(p.files['functions/index.mjs'],/asteriaSecureInvitation=onCall|asteriaCampaignUCN=onCall/);
  }
  assert.equal(release.packages[0].env.ASTERIA_FRIEND_LOOKUP_ENABLED,'1');
  assert.equal(release.packages[1].env.ASTERIA_FRIEND_NOTIFICATIONS_ENABLED,'1');
  assert.deepEqual(release.packages[2].env,{
    ASTERIA_FRIEND_REQUESTS_ENABLED:'1',ASTERIA_FRIEND_NOTIFICATIONS_ENABLED:'1'
  });
});
test('unexpected unknown application environment, absent or changed functions fail closed',()=>{
  const state=sample();
  state.asteriaFriendRequests.env.ASTERIA_UNKNOWN_SETTING='1';
  assert.throws(()=>buildFriendsLiveRelease(state),/Unreviewed/);
  delete state.asteriaFriendRequests.env.ASTERIA_UNKNOWN_SETTING;
  state.asteriaFriendRequests.signingSecretAttached=true;
  assert.throws(()=>buildFriendsLiveRelease(state),/Unexpected secret/);
  state.asteriaFriendRequests.signingSecretAttached=false;
  state.asteriaFriendRequests.state='FAILED';
  assert.throws(()=>buildFriendsLiveRelease(state),/ACTIVE/);
  assert.throws(()=>buildFriendsLiveRelease({}),/Exactly three/);
});
test('scoped activation preserves an already active notification gate and request state',()=>{
  const state=sample();
  state.asteriaFriendRequests.env.ASTERIA_FRIEND_REQUESTS_ENABLED='1';
  state.asteriaFriendRequests.env.ASTERIA_FRIEND_NOTIFICATIONS_ENABLED='0';
  const result=buildFriendsLiveRelease(state);
  assert.equal(result.packages[2].env.ASTERIA_FRIEND_REQUESTS_ENABLED,'1');
  assert.equal(result.packages[2].env.ASTERIA_FRIEND_NOTIFICATIONS_ENABLED,'1');
});
test('manual workflow is confirmed, exact targets, three deployments, rules review and rollback retained',()=>{
  const yaml=read('.github/workflows/firebase-deploy.yml');
  const job=yaml.split(/^  friends_complete_live_activation:\s*$/m)[1]||'';
  assert.match(yaml,/- friends-complete-activate/);
  assert.match(job,/inputs.production_confirmation == 'ACTIVATE-ASTERIA-COMPLETE-FRIENDS'/);
  assert.match(job,/environment: firebase-production/);
  assert.match(job,/gcloud functions describe/);
  assert.match(job,/friends-notifications-scoped-rules.mjs/);
  assert.match(job,/--only "functions:asteria:\$name"/);
  assert.match(yaml,/- friends-lookup-deactivate/);
  assert.match(yaml,/- friends-request-backend-deactivate/);
  assert.match(yaml,/- friend-notifications-events-deactivate/);
  assert.match(yaml,/- friend-notifications-read-deactivate/);
  assert.equal(OPERATION,'friends-complete-activate');
  assert.equal(CONFIRMATION,'ACTIVATE-ASTERIA-COMPLETE-FRIENDS');
});
test('protected staging rejects unconfirmed or untrusted execution',()=>{
  assert.throws(()=>stageFriendsLiveRelease({
    GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'GrayIronwolf/AsteriaTTRPG',
    GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    ASTERIA_FRIENDS_LIVE_OPERATION:OPERATION,
    ASTERIA_FRIENDS_LIVE_CONFIRMATION:'wrong',
    ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg',
    RUNNER_TEMP:'/tmp',ASTERIA_FRIENDS_LIVE_FILE:'/tmp/friends.json'
  }),/approved/);
});
