import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  OPERATION,CONFIRMATION,TARGETS,NOTIFICATION_SELECTOR,INVITATION_SELECTOR,
  buildCoordinatedInAppRelease,checkLiveInvitation,stageCoordinatedInAppRelease
} from './campaign-inapp-coordinated-release.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const runtime=()=>({
  exists:true,state:'ACTIVE',signingSecretAttached:true,
  env:{
    ASTERIA_SECURE_INVITATIONS_ENABLED:'0',
    ASTERIA_INVITATION_ACCEPTANCE_ENABLED:'0',
    ASTERIA_INVITATION_MANAGER_ENABLED:'0',
    ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED:'0',
    ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED:'0',
    ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED:'0'
  }
});
test('one coordinated package stages precisely existing secure invites plus one new notification callable',()=>{
  const release=buildCoordinatedInAppRelease(runtime());
  assert.deepEqual(release.targets,[
    'asteriaCampaignNotifications','asteriaSecureInvitation'
  ]);
  assert.deepEqual(release.targets,TARGETS);
  assert.deepEqual(release.packages.map(p=>p.selector),
    [NOTIFICATION_SELECTOR,INVITATION_SELECTOR]);
  assert.equal(release.productionChanged,false);
  const [inbox,invite]=release.packages;
  assert.equal(inbox.files['functions/.env.asteria-ttrpg'],
    'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=0\n');
  const secureEnv=invite.files['functions/.env.asteria-ttrpg'];
  assert.match(secureEnv,/ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED=0/);
  assert.match(secureEnv,/ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=0/);
  for(const p of release.packages){
    assert.equal((p.files['functions/index.mjs'].match(/export const /g)||[]).length,1);
    const index=p.files['functions/index.mjs'];
    assert.doesNotMatch(index,/ASTERIA_RESEND_API_KEY|asteriaCampaignEmailInvitations|asteriaResendApiKeySecret/);
    const cfg=JSON.parse(p.files['firebase.json']);
    assert.equal(cfg.functions[0].codebase,'asteria');
    assert.equal(cfg.functions[0].runtime,'nodejs22');
  }
  assert.match(invite.files['functions/index.mjs'],/preview-notification/);
  assert.match(invite.files['functions/index.mjs'],/accept-notification/);
  assert.match(invite.files['functions/index.mjs'],/delete safe\.token/);
  assert.match(invite.files['functions/index.mjs'],/defineSecret\('ASTERIA_SECURE_INVITE_SIGNING_KEY'\)/);
});
test('all existing approved secure invitation environment flags are preserved, with new issuance disabled',()=>{
  const live=runtime();
  live.env.ASTERIA_INVITATION_MANAGER_ENABLED='1';
  live.env.ASTERIA_INVITATION_ACCEPTANCE_ENABLED='1';
  const result=buildCoordinatedInAppRelease(live);
  const env=result.packages[1].files['functions/.env.asteria-ttrpg'];
  assert.match(env,/ASTERIA_INVITATION_MANAGER_ENABLED=1/);
  assert.match(env,/ASTERIA_INVITATION_ACCEPTANCE_ENABLED=1/);
  assert.match(env,/ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED=0/);
});
test('Gen2 Eventarc metadata is never packaged as an Asteria deployment flag',()=>{
  const live=runtime();
  live.env.EVENTARC_CLOUD_EVENT_SOURCE='//cloudfunctions.googleapis.com/projects/asteria-ttrpg/locations/us-central1/functions/asteriaSecureInvitation';
  live.env.EVENTARC_CLOUD_EVENT_TYPE='google.cloud.functions.function.v2.updated';
  live.env.FIREBASE_CONFIG='{"projectId":"asteria-ttrpg"}';
  live.env.GCLOUD_PROJECT='asteria-ttrpg';
  const reviewed=checkLiveInvitation(live);
  assert.equal(reviewed.env.EVENTARC_CLOUD_EVENT_SOURCE,undefined);
  assert.equal(reviewed.env.FIREBASE_CONFIG,undefined);
  const result=buildCoordinatedInAppRelease(live);
  const staged=result.packages[1].files['functions/.env.asteria-ttrpg'];
  assert.doesNotMatch(staged,/EVENTARC_|FIREBASE_CONFIG|GCLOUD_PROJECT/);
  assert.match(staged,/ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED=0/);
  assert.equal(result.productionChanged,false);
});
test('unexpected or malformed environment metadata still fails closed',()=>{
  const bad=[
    value=>{value.env.UNEXPECTED_RUNTIME_KEY='unsafe';},
    value=>{value.env.ASTERIA_UNREVIEWED_FEATURE='0';},
    value=>{value.env.EVENTARC_CLOUD_EVENT_SOURCE=42;},
    value=>{value.env.ASTERIA_SECURE_INVITATIONS_ENABLED='true';}
  ];
  for(const mutate of bad){
    const live=runtime();mutate(live);
    assert.throws(()=>checkLiveInvitation(live));
    assert.throws(()=>buildCoordinatedInAppRelease(live));
  }
});
test('unknown state, absent existing signing secret or already-live functionality fail without writes',()=>{
  const changes=[
    value=>{value.exists=false;},
    value=>{value.signingSecretAttached=false;},
    value=>{value.state='FAILED';},
    value=>{value.env.ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED='1';},
    value=>{value.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED='1';},
    value=>{value.env.ASTERIA_NEW_UNAPPROVED_GATE='1';},
    value=>{value.env.ASTERIA_INVITATION_MANAGER_ENABLED='unknown';}
  ];
  for(const change of changes){
    const value=runtime();
    change(value);
    assert.throws(()=>checkLiveInvitation(value));
    assert.throws(()=>buildCoordinatedInAppRelease(value));
  }
});
test('staging requires exact reviewed main branch dispatch and confines writes to runner temp',()=>{
  const dir=mkdtempSync(join(tmpdir(),'asteria-inapp-coordinated-'));
  try{
    const liveFile=join(dir,'live.json');
    writeFileSync(liveFile,JSON.stringify(runtime()));
    const env={
      GITHUB_ACTIONS:'true',
      GITHUB_REPOSITORY:'GrayIronwolf/AsteriaTTRPG',
      GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
      ASTERIA_INAPP_OPERATION:OPERATION,ASTERIA_INAPP_CONFIRMATION:CONFIRMATION,
      ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg',
      ASTERIA_INAPP_LIVE_FILE:liveFile,RUNNER_TEMP:dir
    };
    for(const invalid of [
      {GITHUB_REPOSITORY:'another/repo'},
      {GITHUB_REF:'refs/heads/release'},
      {GITHUB_EVENT_NAME:'push'},
      {ASTERIA_DEPLOY_PROJECT:'demo-asteria'},
      {ASTERIA_INAPP_OPERATION:'campaign-friends-invites-enable'},
      {ASTERIA_INAPP_CONFIRMATION:'wrong'},
      {ASTERIA_INAPP_LIVE_FILE:'relative.json'},
      {RUNNER_TEMP:'relative'},
    ])
      assert.throws(()=>stageCoordinatedInAppRelease({...env,...invalid}),
        /exactly confirmed dispatch/);
    const staged=stageCoordinatedInAppRelease(env);
    assert.equal(staged.packages.length,2);
    const notification=join(staged.directory,'notifications/functions/.env.asteria-ttrpg');
    const secure=join(staged.directory,'secure-invitation/functions/.env.asteria-ttrpg');
    assert.equal(readFileSync(notification,'utf8'),
      'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=0\n');
    assert.match(readFileSync(secure,'utf8'),/ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED=0/);
    assert.throws(()=>stageCoordinatedInAppRelease(env),/already exists/);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
test('existing trusted production workflow contains both scoped deploys, no email service and no automatic enablement',()=>{
  const workflow=read('.github/workflows/firebase-deploy.yml');
  const section=workflow.split(/^  campaign_inapp_prepare_disabled:\s*$/m)[1]
    ?.split(/^  campaign_coordinated_readiness_audit:\s*$/m)[0]||'';
  assert.match(workflow,/- campaign-inapp-prepare-disabled/);
  assert.match(section,/inputs\.production_confirmation == 'PREPARE-ASTERIA-INAPP-CAMPAIGN-DISABLED'/);
  assert.match(section,/environment: firebase-production/);
  assert.match(section,/google-github-actions\/auth@v3/);
  // GitHub Actions evaluates plain [object Object] expressions. A leading literal
  // backslash survives YAML parsing and corrupts Google's STS audience.
  const escaped=String.fromCharCode(92,36,123,123);
  assert.equal(workflow.includes(escaped),false,
    'A literal backslash before a GitHub Actions expression disables interpolation.');
  assert.match(section,/workload_identity_provider: \$\{\{ vars\.FIREBASE_WORKLOAD_IDENTITY_PROVIDER \}\}/);
  assert.match(section,/service_account: \$\{\{ vars\.FIREBASE_DEPLOY_SERVICE_ACCOUNT \}\}/);
  assert.match(section,/ASTERIA_INAPP_OPERATION: \$\{\{ inputs\.operation \}\}/);
  assert.match(section,/ASTERIA_INAPP_CONFIRMATION: \$\{\{ inputs\.production_confirmation \}\}/);
  assert.match(section,/working-directory: \$\{\{ runner\.temp \}\}\/asteria-inapp-coordinated\/notifications/);
  assert.match(section,/working-directory: \$\{\{ runner\.temp \}\}\/asteria-inapp-coordinated\/secure-invitation/);
  assert.match(section,/node scripts\/campaign-inapp-coordinated-release\.mjs --stage/);
  assert.match(section,/firebase-tools@15\.35\.0/);
  assert.match(section,/--only "functions:asteria:asteriaCampaignNotifications"/);
  assert.match(section,/--only "functions:asteria:asteriaSecureInvitation"/);
  assert.match(section,/ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED == "0"/);
  assert.match(section,/ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED == "0"/);
  for(const forbidden of [
    /gcloud secrets describe/,/gcloud secrets versions list/,
    /--only "functions:asteria:asteriaCampaignEmailInvitations"/,
    /firebase deploy --only hosting/,/firestore:rules/,/storage:rules/,
    /gcloud functions delete/,/gcloud firestore import/
  ])assert.doesNotMatch(section,forbidden);
});
