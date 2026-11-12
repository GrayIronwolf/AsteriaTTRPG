import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
 CHANNEL_TARGETS,CHANNEL_OPERATION,CHANNEL_CONFIRMATION,
 buildCampaignChannelsRelease,stageCampaignChannelsRelease
} from './campaign-channels-scoped-release.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('scoped package exports exactly the two approved communication callables',()=>{
 const built=buildCampaignChannelsRelease();
 assert.deepEqual(built.targets,['asteriaCampaignNotifications','asteriaCampaignEmailInvitations']);
 assert.deepEqual(CHANNEL_TARGETS,built.targets);
 const cfg=JSON.parse(built.files['firebase.json']);
 assert.equal(cfg.functions[0].source,'functions');
 assert.equal(cfg.functions[0].codebase,'asteria');
 const pkg=JSON.parse(built.files['functions/package.json']);
 assert.equal(pkg.engines.node,'22');
 assert.equal(pkg.version,'1.0.0');
 assert.deepEqual(Object.keys(pkg.dependencies),['firebase-admin','firebase-functions']);
 const src=built.files['functions/index.mjs'];
 assert.equal((src.match(/export const /g)||[]).length,2);
 for(const name of CHANNEL_TARGETS)assert.match(src,new RegExp('export const '+name+'=onCall\\('));
 for(const unrelated of ['asteriaAction','asteriaInvite','asteriaFriendNotifications',
  'asteriaFriendRequests','asteriaSecureInvitation','asteriaCampaignUCN'])
   assert.doesNotMatch(src,new RegExp('export const '+unrelated+'='));
 for(const m of ['campaignNotifications','campaignEmailInvitations',
  'campaignSecureInvitations','campaignInvitationManager',
  'campaignEmailTransport','campaignEmailSecrets'])
    assert.equal(built.files['functions/'+m+'.mjs'],read('functions/'+m+'.mjs'));
});
test('email secrets remain referenced only by the gated email callable',()=>{
 const src=buildCampaignChannelsRelease().files['functions/index.mjs'];
 assert.match(src,/secrets:\[secureInvitationSigningKey,asteriaResendApiKeySecret\]/);
 assert.match(src,/defineSecret\('ASTERIA_SECURE_INVITE_SIGNING_KEY'\)/);
 assert.match(src,/process\.env\.ASTERIA_EMAIL_INVITATION_CONTROLS_ENABLED!=='1'/);
 assert.match(src,/process\.env\.ASTERIA_EMAIL_DELIVERY_ENABLED!=='1'/);
 assert.match(src,/process\.env\.ASTERIA_SECURE_INVITATIONS_ENABLED!=='1'/);
 const env=buildCampaignChannelsRelease().files['functions/.env.asteria-ttrpg'];
 assert.equal(env,[
  'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=0',
  'ASTERIA_EMAIL_DELIVERY_ENABLED=0',
  'ASTERIA_EMAIL_INVITATION_CONTROLS_ENABLED=0',
  'ASTERIA_SECURE_INVITATIONS_ENABLED=0',
  ''
 ].join('\n'));
 assert.doesNotMatch(env,/ASTERIA_RESEND_API_KEY|ASTERIA_SECURE_INVITE_SIGNING_KEY|GOOGLE_APPLICATION_CREDENTIALS/);
});
test('source changes that remove notification/email authorization guards fail staging',()=>{
 const src=read('functions/index.mjs');
 for(const changed of [
   src.replace("process.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED!=='1'","true"),
   src.replace("process.env.ASTERIA_EMAIL_DELIVERY_ENABLED!=='1'","false"),
   src.replace('secrets:[secureInvitationSigningKey,asteriaResendApiKeySecret]','secrets:[]')
 ])assert.throws(()=>buildCampaignChannelsRelease(changed),/gates changed/);
});
test('staging requires exact trusted main dispatch and never writes outside temporary directory',()=>{
 const dir=mkdtempSync(join(tmpdir(),'asteria-campaign-channels-'));
 try{
   const env={
     GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'GrayIronwolf/AsteriaTTRPG',
     GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
     ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg',ASTERIA_CHANNELS_OPERATION:CHANNEL_OPERATION,
     ASTERIA_CHANNELS_CONFIRMATION:CHANNEL_CONFIRMATION,RUNNER_TEMP:dir
   };
   for(const change of [
     {GITHUB_REF:'refs/heads/develop'},
     {GITHUB_REPOSITORY:'other/repo'},
     {ASTERIA_CHANNELS_CONFIRMATION:'NOT-APPROVED'},
     {ASTERIA_CHANNELS_OPERATION:'deploy'},
     {RUNNER_TEMP:'relative'},
     {GITHUB_EVENT_NAME:'push'}
   ])assert.throws(()=>stageCampaignChannelsRelease({...env,...change}),/approved production dispatch/);
   const built=stageCampaignChannelsRelease(env);
   assert.equal(built.targets.length,2);
   const deployed=readFileSync(join(built.directory,'functions/.env.asteria-ttrpg'),'utf8');
   assert.match(deployed,/ASTERIA_EMAIL_DELIVERY_ENABLED=0/);
   assert.throws(()=>stageCampaignChannelsRelease(env),/already exists/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('workflow uses prior absent-target and enabled-version checks, approved deploy selector, and postdeployment default-off verification',()=>{
 const workflow=read('.github/workflows/firebase-deploy.yml');
 const job=workflow.split(/^  campaign_channels_deploy_disabled:\s*$/m)[1]
   ?.split(/^  campaign_friends_release:\s*$/m)[0]||'';
 assert.match(workflow,/- campaign-channels-deploy-disabled/);
 assert.match(job,/inputs\.operation == 'campaign-channels-deploy-disabled'/);
 assert.match(job,/inputs\.production_confirmation == 'DEPLOY-ASTERIA-CAMPAIGN-CHANNELS-DISABLED'/);
 assert.match(job,/environment: firebase-production/);
 assert.match(job,/google-github-actions\/auth@v3/);
 assert.match(job,/gcloud secrets versions list/);
 assert.match(job,/gcloud functions list/);
 assert.match(job,/node scripts\/campaign-channels-scoped-release\.mjs --stage/);
 assert.match(job,/firebase-tools@15\.35\.0/);
 assert.match(job,/--only "functions:asteria:asteriaCampaignNotifications,functions:asteria:asteriaCampaignEmailInvitations"/);
 assert.match(job,/ASTERIA_EMAIL_DELIVERY_ENABLED/);
 assert.doesNotMatch(job,/firestore:rules|storage:rules|firebase deploy --only hosting|gcloud functions delete|gcloud firestore import/);
});
