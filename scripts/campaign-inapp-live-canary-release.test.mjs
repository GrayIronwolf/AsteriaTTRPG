import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCanaryRelease,TARGETS,ENABLE_OPERATION,DISABLE_OPERATION,
  CONFIRMATIONS,stageCanaryRelease} from './campaign-inapp-live-canary-release.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sample=(enabled=false)=>Object.fromEntries(TARGETS.map(name=>[
  name,{
    state:'ACTIVE',signingSecretAttached:name==='asteriaSecureInvitation',
    env:name==='asteriaCampaignJoinRequest'?{
      ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED:'0',
      LOG_EXECUTION_ID:'true',FUNCTION_REGION:'us-central1'
    }:name==='asteriaCampaignJoinReview'?{
      ASTERIA_PLAYER_ROSTER_ENABLED:'0',
      LOG_EXECUTION_ID:'true'
    }:{
      LOG_EXECUTION_ID:'true',
      ...(enabled?Object.fromEntries([
        ...(name==='asteriaSecureInvitation'?[
          'ASTERIA_SECURE_INVITATIONS_ENABLED','ASTERIA_INVITATION_ACCEPTANCE_ENABLED',
          'ASTERIA_INVITATION_MANAGER_ENABLED','ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED',
          'ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED','ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED'
        ]:name==='asteriaCampaignNotifications'?[
          'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED'
        ]:name==='asteriaCampaignFriendRecipients'?[
          'ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED'
        ]:name==='asteriaCampaignUCN'?[
          'ASTERIA_CAMPAIGN_V2_CANARY_ENABLED'
        ]:[])] .map(key=>[key,'1'])):{})
    }
  }
]));
test('new invitation canary targets exactly six reviewed functions, no email and no migration',()=>{
  const plan=buildCanaryRelease(sample());
  assert.equal(plan.productionChanged,false);
  assert.equal(plan.targets.length,6);
  assert.equal(new Set(plan.targets).size,6);
  assert.equal(plan.packages.filter(p=>p.kind==='core').length,3);
  assert.equal(plan.packages.find(p=>p.name==='asteriaCampaignUCN')
    .env.ASTERIA_CAMPAIGN_V2_CANARY_ENABLED,'1');
  for(const pkg of plan.packages){
    const source=pkg.files[pkg.kind==='core'?'functions/index.mjs':'functions/index.mjs'];
    assert.ok(source.includes('export const '+pkg.name+'=onCall('));
    assert.ok(pkg.selector==='functions:asteria:'+pkg.name);
    assert.equal(pkg.files[pkg.envPath].includes('LOG_EXECUTION_ID'),false);
    assert.doesNotMatch(source,/asteriaCampaignEmailInvitations=onCall/);
    assert.equal(Object.keys(pkg.env).every(key=>key.startsWith('ASTERIA_')),true);
  }
  const secure=plan.packages.find(p=>p.name==='asteriaSecureInvitation');
  for(const key of ['ASTERIA_SECURE_INVITATIONS_ENABLED',
    'ASTERIA_INVITATION_ACCEPTANCE_ENABLED','ASTERIA_INVITATION_MANAGER_ENABLED',
    'ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED',
    'ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED',
    'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED'])
    assert.equal(secure.env[key],'1',key);
  const request=plan.packages.find(p=>p.name==='asteriaCampaignJoinRequest');
  assert.equal(request.env.ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED,'0');
  const review=plan.packages.find(p=>p.name==='asteriaCampaignJoinReview');
  assert.equal(review.env.ASTERIA_PLAYER_ROSTER_ENABLED,'0');
  assert.equal(review.env.ASTERIA_JOIN_REVIEW_ENABLED,'1');
});
test('enabled gates or unknown Asteria settings are not blindly overwritten',()=>{
  let live=sample();
  live.asteriaSecureInvitation.env.ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED='1';
  assert.throws(()=>buildCanaryRelease(live),/already ON/);
  live=sample();
  live.asteriaCampaignUCN.env.ASTERIA_UNKNOWN_GATE='1';
  assert.throws(()=>buildCanaryRelease(live),/Unreviewed/);
  live=sample();
  live.asteriaCampaignNotifications.state='FAILED';
  assert.throws(()=>buildCanaryRelease(live),/ACTIVE/);
  live=sample();
  live.asteriaSecureInvitation.signingSecretAttached=false;
  assert.throws(()=>buildCanaryRelease(live),/secret/);
});
test('rollback disables new gates without altering unrelated controls',()=>{
  const live=sample(true);
  live.asteriaCampaignJoinRequest.env.ASTERIA_JOIN_REQUESTS_ENABLED='1';
  live.asteriaCampaignJoinRequest.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED='1';
  live.asteriaCampaignJoinReview.env.ASTERIA_JOIN_REVIEW_ENABLED='1';
  live.asteriaCampaignJoinReview.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED='1';
  const p=buildCanaryRelease(live,{enable:false});
  for(const pkg of p.packages){
    for(const [key,value] of Object.entries(pkg.env)){
      if(key==='ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED'||
         key==='ASTERIA_PLAYER_ROSTER_ENABLED')
        assert.equal(value,'0');
      else assert.equal(value,'0',pkg.name+'/'+key);
    }
  }
});
test('trusted manual GitHub workflow selects only reviewed callables and retains emergency disable',()=>{
  const workflow=read('.github/workflows/firebase-deploy.yml');
  const s=workflow.split(/^  campaign_inapp_live_canary:\s*$/m)[1]||'';
  assert.match(workflow,/- campaign-inapp-canary-enable/);
  assert.match(workflow,/- campaign-inapp-canary-disable/);
  assert.match(s,/environment: firebase-production/);
  assert.match(s,/google-github-actions\/auth@v3/);
  assert.match(s,/--only "functions:asteria:\$name"/);
  assert.match(s,/gcloud functions describe/);
  assert.match(s,/DISABLE-ASTERIA-CAMPAIGN-INAPP-CANARY/);
  assert.doesNotMatch(s,/--only functions,firestore,storage|firebase deploy --project.*--only functions(?!:)/);
  assert.equal(CONFIRMATIONS[ENABLE_OPERATION],'ENABLE-ASTERIA-CAMPAIGN-INAPP-CANARY');
  assert.equal(CONFIRMATIONS[DISABLE_OPERATION],'DISABLE-ASTERIA-CAMPAIGN-INAPP-CANARY');
});
test('staging refuses missing production approval before reading live project evidence',()=>{
  assert.throws(()=>stageCanaryRelease({
    GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'GrayIronwolf/AsteriaTTRPG',
    GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg',
    ASTERIA_CANARY_OPERATION:ENABLE_OPERATION,
    ASTERIA_CANARY_CONFIRMATION:'bad',
    RUNNER_TEMP:'/tmp',ASTERIA_CANARY_LIVE_FILE:'/tmp/none'
  }),/confirmed/);
});
