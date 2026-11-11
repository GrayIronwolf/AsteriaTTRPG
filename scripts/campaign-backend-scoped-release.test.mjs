import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  CAMPAIGN_CORE_TARGETS,buildCampaignCoreRelease,stageCampaignCoreRelease
} from './campaign-backend-scoped-release.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const targets=[
  'asteriaCampaignUCN','asteriaMembershipPreparation',
  'asteriaCampaignAccessCutover','asteriaCampaignJoinRequest',
  'asteriaCampaignJoinReview'
];
const forbidden=/defineSecret|ASTERIA_RESEND_API_KEY|ASTERIA_SECURE_INVITE_SIGNING_KEY|asteriaCampaignEmailInvitations=onCall/;

test('five and only five approved core callables are exported from a secret-free entrypoint',()=>{
  assert.deepEqual(CAMPAIGN_CORE_TARGETS,targets);
  const release=buildCampaignCoreRelease();
  assert.deepEqual(release.targets,targets);
  assert.equal(release.selector,targets.map(x=>'functions:asteria:'+x).join(','));
  assert.deepEqual(JSON.parse(release.files['firebase.json']).functions.map(x=>({
    source:x.source,codebase:x.codebase,runtime:x.runtime
  })),[{source:'.',codebase:'asteria',runtime:'nodejs22'}]);
  const source=release.files['functions/index.mjs'];
  const original=read('functions/index.mjs');
  assert.equal((source.match(/export const /g)||[]).length,5);
  for(const name of targets){
    assert.equal((source.match(new RegExp('export const '+name+'=onCall\\(','g'))||[]).length,1);
    assert.ok(original.includes('export const '+name+'=onCall('));
  }
  assert.doesNotMatch(source,forbidden);
  assert.doesNotMatch(source,/export const asteriaAction|export const asteriaInvite|export const asteriaFriend/);
  assert.doesNotMatch(source,/export const asteriaSecureInvitation|export const asteriaAccount/);
  assert.doesNotMatch(source,/export const asteriaCampaignNotifications=/);
});
test('package contains pinned runtime dependencies and closed local dependency graph',()=>{
  const release=buildCampaignCoreRelease();
  const files=release.files;
  const pkg=JSON.parse(files['package.json']);
  const lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.main,'functions/index.mjs');
  assert.equal(pkg.engines.node,'22');
  assert.equal(pkg.dependencies['firebase-admin'],lock.packages['node_modules/firebase-admin'].version);
  assert.equal(pkg.dependencies['firebase-functions'],lock.packages['node_modules/firebase-functions'].version);
  for(const filename of [
    'functions/campaignUCN.mjs','functions/campaignMembership.mjs',
    'functions/campaignAccessCutover.mjs','functions/campaignJoinRequests.mjs',
    'functions/campaignJoinApproval.mjs','functions/campaignCharacterLifecycle.mjs',
    'functions/campaignCharacterApproval.mjs','functions/campaignCharacterLinks.mjs',
    'functions/campaignRolePermissions.mjs','functions/campaignMemberControls.mjs',
    'functions/campaignPlayerRoster.mjs','functions/campaignNotifications.mjs',
    'src/state/characterIntegrityModel.mjs','src/state/resourceValues.mjs'
  ]){
    assert.equal(files[filename],read(filename),filename+' must exactly match reviewed source');
  }
  for(const [filename,content] of Object.entries(files)){
    assert.doesNotMatch(content,forbidden,filename);
    assert.doesNotMatch(filename,/\.env|firebase-adminsdk|credential|secret/i);
  }
  assert.equal(Object.keys(files).filter(x=>x.startsWith('functions/')).length,13);
  assert.ok(!Object.hasOwn(files,'firestore.rules'));
  assert.ok(!Object.hasOwn(files,'storage.rules'));
});
test('unreviewed callable changes and unexpected runtime imports fail closed',()=>{
  const source=read('functions/index.mjs');
  for(const altered of [
    source.replace('export const asteriaCampaignUCN=onCall(','export const changedCampaignUCN=onCall('),
    source.replace("export const asteriaCampaignUCN=onCall({region:'us-central1',maxInstances:3,timeoutSeconds:30","export const asteriaCampaignUCN=onCall({region:'europe-west1',maxInstances:3,timeoutSeconds:30"),
    source.replace("export const asteriaCampaignJoinReview=onCall(","export const asteriaCampaignJoinReview=onCall("+
      "{secrets:[defineSecret('ASTERIA_RESEND_API_KEY')]},")
  ]){
    assert.throws(()=>buildCampaignCoreRelease(altered),/Unreviewed|changed|secret/i);
  }
});
test('manual staging needs exact trusted production workflow and never stages twice',()=>{
  const dir=mkdtempSync(join(tmpdir(),'asteria-campaign-scope-'));
  try{
    const env={
      GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',
      GITHUB_EVENT_NAME:'workflow_dispatch',
      ASTERIA_CAMPAIGN_OPERATION:'campaign-backend-deploy',
      ASTERIA_CAMPAIGN_CONFIRMATION:'DEPLOY-ASTERIA-CAMPAIGN-BACKEND',
      ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg',RUNNER_TEMP:dir
    };
    for(const change of [
      {GITHUB_ACTIONS:'false'},{GITHUB_REF:'refs/heads/test'},
      {GITHUB_EVENT_NAME:'push'},
      {ASTERIA_CAMPAIGN_OPERATION:'deploy'},
      {ASTERIA_CAMPAIGN_CONFIRMATION:'UNKNOWN'},
      {ASTERIA_DEPLOY_PROJECT:'demo-asteria'}, {RUNNER_TEMP:'relative'}
    ])assert.throws(()=>stageCampaignCoreRelease({...env,...change}),/approval/);
    const result=stageCampaignCoreRelease(env);
    assert.deepEqual(result.targets,targets);
    assert.ok(existsSync(join(result.directory,'functions/index.mjs')));
    assert.ok(existsSync(join(result.directory,'src/state/characterIntegrityModel.mjs')));
    assert.throws(()=>stageCampaignCoreRelease(env),/existing campaign release directory/);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
test('approved campaign workflow stages isolated functions and never widens deployment',()=>{
  const workflow=read('.github/workflows/firebase-deploy.yml');
  const section=workflow.split(/^  campaign_backend_deploy:\s*$/m)[1]
    ?.split(/^  account_id_inventory:\s*$/m)[0]||'';
  assert.match(section,/inputs\.operation == 'campaign-backend-deploy'/);
  assert.match(section,/production_confirmation == 'DEPLOY-ASTERIA-CAMPAIGN-BACKEND'/);
  assert.match(section,/environment: firebase-production/);
  assert.match(section,/github\.ref == 'refs\/heads\/main'/);
  assert.match(section,/npm test/);
  assert.match(section,/npm run test:firebase/);
  assert.match(section,/campaign-backend-scoped-release\.mjs --check/);
  assert.match(section,/campaign-backend-scoped-release\.mjs --stage/);
  assert.match(section,/working-directory: \$\{\{ runner\.temp \}\}\/asteria-campaign-core-release/);
  assert.match(section,/Refusing to overwrite existing core campaign function/);
  assert.match(section,/--only "functions:asteria:asteriaCampaignUCN,functions:asteria:asteriaMembershipPreparation,functions:asteria:asteriaCampaignAccessCutover,functions:asteria:asteriaCampaignJoinRequest,functions:asteria:asteriaCampaignJoinReview"/);
  assert.doesNotMatch(section,/--only functions,firestore,storage/);
  assert.doesNotMatch(section,/gcloud .* (set-iam-policy|add-iam-policy-binding)/);
  assert.match(read('index.html'),/secureInvitationManager:false/);
  assert.match(read('index.html'),/campaignFriendInvitations:false/);
});
