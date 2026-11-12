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

test('isolated callable is only a disabled recipient-scoped notification inbox',()=>{
 const p=buildCampaignChannelsRelease();
 assert.deepEqual(p.targets,['asteriaCampaignNotifications']);
 assert.deepEqual(CHANNEL_TARGETS,p.targets);
 assert.equal(CHANNEL_OPERATION,'campaign-notifications-deploy-disabled');
 assert.equal(CHANNEL_CONFIRMATION,'DEPLOY-ASTERIA-CAMPAIGN-NOTIFICATIONS-DISABLED');
 const pkg=JSON.parse(p.files['functions/package.json']);
 assert.equal(pkg.engines.node,'22');
 assert.equal(pkg.version,'1.0.0');
 assert.deepEqual(Object.keys(pkg.dependencies),['firebase-admin','firebase-functions']);
 const src=p.files['functions/index.mjs'];
 assert.equal((src.match(/export const /g)||[]).length,1);
 assert.match(src,/export const asteriaCampaignNotifications=onCall/);
 assert.match(src,/ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED!=='1'/);
 assert.doesNotMatch(src,/asteriaCampaignEmailInvitations|ASTERIA_RESEND_API_KEY|defineSecret|asteriaSecureInvitation/);
 assert.equal(p.files['functions/campaignNotifications.mjs'],read('functions/campaignNotifications.mjs'));
 assert.equal(p.files['functions/.env.asteria-ttrpg'],'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=0\n');
 assert.deepEqual(Object.keys(p.files).sort(),[
   'firebase.json','functions/.env.asteria-ttrpg','functions/campaignNotifications.mjs',
   'functions/index.mjs','functions/package.json'
 ].sort());
});
test('package rejects removed server feature gates or unexpected callable source',()=>{
 const src=read('functions/index.mjs');
 assert.throws(()=>buildCampaignChannelsRelease(
   src.replace("process.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED!=='1'","false")
 ),/safeguards changed/);
 assert.throws(()=>buildCampaignChannelsRelease(
   src.replace("await import('./campaignNotifications.mjs')","await import('./other.mjs')")
 ),/safeguards changed/);
});
test('manual stage requires exact account/project/branch and only a temp output',()=>{
 const dir=mkdtempSync(join(tmpdir(),'asteria-notification-'));
 try{
  const env={
   GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'GrayIronwolf/AsteriaTTRPG',
   GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
   ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg',ASTERIA_CHANNELS_OPERATION:CHANNEL_OPERATION,
   ASTERIA_CHANNELS_CONFIRMATION:CHANNEL_CONFIRMATION,RUNNER_TEMP:dir
  };
  for(const mutation of [
   {GITHUB_REF:'refs/heads/other'},{GITHUB_REPOSITORY:'other/repo'},
   {ASTERIA_CHANNELS_CONFIRMATION:'wrong'},{ASTERIA_CHANNELS_OPERATION:'email'},
   {GITHUB_EVENT_NAME:'push'},{RUNNER_TEMP:'relative'}
  ])assert.throws(()=>stageCampaignChannelsRelease({...env,...mutation}),/reviewed dispatch/);
  const staged=stageCampaignChannelsRelease(env);
  assert.equal(staged.targets.length,1);
  assert.equal(readFileSync(join(staged.directory,'functions/.env.asteria-ttrpg'),'utf8'),
    'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=0\n');
  assert.throws(()=>stageCampaignChannelsRelease(env),/already exists/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('only manual, scoped, secret-free single notification deployment is allowed',()=>{
 const workflow=read('.github/workflows/firebase-deploy.yml');
 const section=workflow.split(/^  campaign_channels_deploy_disabled:\s*$/m)[1]
   ?.split(/^  campaign_friends_release:\s*$/m)[0]||'';
 assert.match(workflow,/- campaign-notifications-deploy-disabled/);
 assert.doesNotMatch(workflow,/- campaign-channels-deploy-disabled/);
 assert.match(section,/inputs\.operation == 'campaign-notifications-deploy-disabled'/);
 assert.match(section,/inputs\.production_confirmation == 'DEPLOY-ASTERIA-CAMPAIGN-NOTIFICATIONS-DISABLED'/);
 assert.match(section,/environment: firebase-production/);
 assert.match(section,/google-github-actions\/auth@v3/);
 assert.match(section,/gcloud functions list/);
 assert.match(section,/node scripts\/campaign-channels-scoped-release\.mjs --stage/);
 assert.match(section,/firebase-tools@15\.35\.0/);
 assert.match(section,/--only "functions:asteria:asteriaCampaignNotifications"/);
 assert.doesNotMatch(section,/gcloud secrets|Secret Manager|ASTERIA_RESEND_API_KEY|asteriaCampaignEmailInvitations|functions:asteria:asteriaSecureInvitation/);
 assert.doesNotMatch(section,/firestore:rules|storage:rules|firebase deploy --only hosting|gcloud functions delete/);
});
