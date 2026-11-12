/**
 * Coordinated source-staging for Asteria's notification-only campaign invites.
 *
 * This module never calls Google Cloud or Firebase. The existing trusted
 * firebase-deploy.yml workflow is the only authorised executor.
 *
 * It packages EXACTLY:
 *   1. asteriaCampaignNotifications (NEW, with server gate OFF);
 *   2. asteriaSecureInvitation (EXISTING, preserve all live v2 gates while
 *      keeping ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED=0).
 *
 * The two packages are deployed by separate explicit --only selectors, not a
 * broad root deploy. No Resend API key or Campaign email function is involved.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildCampaignChannelsRelease
} from './campaign-channels-scoped-release.mjs';
import {buildPhase53Release} from './friends-phase5-3-scoped-release.mjs';
import {reviewFunctionEnvironment} from './firebase-runtime-env-review.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=p=>readFileSync(join(ROOT,p),'utf8');
const refuse=why=>{throw Error('Asteria coordinated in-app release: '+why);};
export const OPERATION='campaign-inapp-prepare-disabled';
export const CONFIRMATION='PREPARE-ASTERIA-INAPP-CAMPAIGN-DISABLED';
export const NOTIFICATION_TARGET='asteriaCampaignNotifications';
export const INVITATION_TARGET='asteriaSecureInvitation';
export const TARGETS=Object.freeze([NOTIFICATION_TARGET,INVITATION_TARGET]);
export const NOTIFICATION_SELECTOR='functions:asteria:asteriaCampaignNotifications';
export const INVITATION_SELECTOR='functions:asteria:asteriaSecureInvitation';

const safeRuntimeFields=Object.freeze([
  'ASTERIA_SECURE_INVITATIONS_ENABLED',
  'ASTERIA_INVITATION_ACCEPTANCE_ENABLED',
  'ASTERIA_INVITATION_MANAGER_ENABLED',
  'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED',
  'ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED',
  'ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED'
]);

export function checkLiveInvitation(live){
  if(!live||live.exists!==true||
     !live.env||typeof live.env!=='object'||Array.isArray(live.env))
    refuse('Already deployed secure invitation callable was not verified.');
  if(live.state!==undefined&&live.state!=='ACTIVE')
    refuse('Existing secure invitation must be ACTIVE.');
  if(live.signingSecretAttached!==true)
    refuse('Existing secure invitation signing secret binding is not verified.');
  // Google-managed runtime values are never copied to a staged .env.
  const reviewedEnv=reviewFunctionEnvironment(live.env,safeRuntimeFields);
  if(reviewedEnv.ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED==='1')
    refuse('Cannot overwrite an actively enabled invitation function.');
  if(reviewedEnv.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED==='1')
    refuse('Cannot reinstall a live notification-dependent invitation function without an approved cutover.');
  return {...live,env:reviewedEnv};
}
function assertSource(){
  const entry=read('functions/index.mjs');
  const manifest=JSON.parse(read('config/asteria-release.json'));
  if(manifest.invitationDelivery?.active!=='in-app-notifications-only'||
     manifest.invitationDelivery?.resendRequired!==false||
     manifest.websiteFlags?.campaignNotifications!==false||
     manifest.websiteFlags?.campaignFriendInvitations!==false||
     manifest.websiteFlags?.emailInvitationControls!==false||
     manifest.status!=='installed-not-activated')
    refuse('Canonical source and feature gates must remain disabled.');
  const secure=entry.slice(entry.indexOf('export const asteriaSecureInvitation=onCall('),
    entry.indexOf('// Phase 7.3: account-scoped in-app notification inbox.'));
  if(!entry.includes("defineSecret('ASTERIA_SECURE_INVITE_SIGNING_KEY')"))
    refuse('Existing approved signing-secret binding missing from callable source.');
  for(const requirement of [
    'preview-notification','accept-notification',
    'notificationsEnabled:true','delete safe.token'
  ]){
    if(!secure.includes(requirement))refuse('Required reviewed invitation behavior missing: '+requirement);
  }
  if(entry.includes('export const asteriaCampaignEmailInvitations=onCall(')||
     entry.includes('asteriaResendApiKeySecret')||
     entry.includes('ASTERIA_RESEND_API_KEY'))
    refuse('Email delivery reintroduced to the active Cloud Functions entrypoint.');
  return true;
}
export function buildCoordinatedInAppRelease(live){
  assertSource();
  const reviewedLive=checkLiveInvitation(live);
  const notifications=buildCampaignChannelsRelease();
  const secure=buildPhase53Release('campaign-friends-invites-deploy-off',{
    live:{exists:true,env:reviewedLive.env},recipientReady:false,acceptanceReady:false
  });
  if(notifications.targets.length!==1||
     notifications.targets[0]!==NOTIFICATION_TARGET||
     secure.functionName!==INVITATION_TARGET||secure.enabled!==false)
    refuse('Isolated target count changed.');
  if(notifications.files['functions/.env.asteria-ttrpg']!==
     'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=0\n'||
     secure.files['functions/.env.asteria-ttrpg']
       .includes('ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED=1'))
    refuse('New invocation gate must stay OFF.');
  const forbidden=/ASTERIA_RESEND_API_KEY|asteriaResendApiKeySecret|campaignEmailInvitations/;
  for(const [name,files] of [
    [NOTIFICATION_TARGET,notifications.files],[INVITATION_TARGET,secure.files]
  ]){
    if(Object.values(files).some(x=>forbidden.test(x)))
      refuse('Unreviewed email provider dependency in '+name);
    const source=files['functions/index.mjs'];
    if((source.match(/export const /g)||[]).length!==1)
      refuse('Exactly one isolated Firebase callable is required per package.');
  }
  const expected=Object.fromEntries(safeRuntimeFields.map(key=>[
    key,reviewedLive.env[key]??'0'
  ]));
  expected.ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED='0';
  const env=Object.fromEntries(secure.files['functions/.env.asteria-ttrpg'].trim()
    .split('\n').map(line=>line.split('=')));
  for(const [key,value] of Object.entries(expected)){
    if(env[key]!==value)refuse('Existing secure server gate was not preserved: '+key);
  }
  return {
    targets:[...TARGETS],
    packages:[
      {name:'notifications',target:NOTIFICATION_TARGET,
        selector:NOTIFICATION_SELECTOR,files:notifications.files},
      {name:'secure-invitation',target:INVITATION_TARGET,
        selector:INVITATION_SELECTOR,files:secure.files}
    ],
    protectedLiveFlags:expected,
    productionChanged:false
  };
}
export function stageCoordinatedInAppRelease(env=process.env){
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REPOSITORY!=='GrayIronwolf/AsteriaTTRPG'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_INAPP_OPERATION!==OPERATION||
     env.ASTERIA_INAPP_CONFIRMATION!==CONFIRMATION||
     env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'||
     !isAbsolute(env.RUNNER_TEMP||'')||
     !isAbsolute(env.ASTERIA_INAPP_LIVE_FILE||'')||
     !resolve(env.ASTERIA_INAPP_LIVE_FILE).startsWith(resolve(env.RUNNER_TEMP)+'/'))
    refuse('Main-only trusted, exactly confirmed dispatch required.');
  const live=JSON.parse(readFileSync(env.ASTERIA_INAPP_LIVE_FILE,'utf8'));
  const result=buildCoordinatedInAppRelease(live);
  const stagingRoot=join(env.RUNNER_TEMP,'asteria-inapp-coordinated');
  if(existsSync(stagingRoot))refuse('Staging directory already exists.');
  for(const pkg of result.packages){
    for(const [name,content] of Object.entries(pkg.files)){
      const target=join(stagingRoot,pkg.name,name);
      mkdirSync(dirname(target),{recursive:true});
      writeFileSync(target,content);
    }
  }
  return {directory:stagingRoot,targets:result.targets,packages:result.packages
    .map(p=>({name:p.name,target:p.target,selector:p.selector}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check'){
      const result=buildCoordinatedInAppRelease({
        exists:true,state:'ACTIVE',signingSecretAttached:true,env:{
          ASTERIA_SECURE_INVITATIONS_ENABLED:'0',
          ASTERIA_INVITATION_ACCEPTANCE_ENABLED:'0',
          ASTERIA_INVITATION_MANAGER_ENABLED:'0',
          ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED:'0'
        }
      });
      console.log(JSON.stringify({ready:true,targets:result.targets,
        packagePaths:result.packages.map(p=>({name:p.name,paths:Object.keys(p.files)})),
        productionChanged:false}));
    }else if(process.argv[2]==='--stage'){
      const result=stageCoordinatedInAppRelease();
      console.log(JSON.stringify({staged:true,directory:result.directory,
        targets:result.targets}));
    }else refuse('Choose --check or --stage.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
