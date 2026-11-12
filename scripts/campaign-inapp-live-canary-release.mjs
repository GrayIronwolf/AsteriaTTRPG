/**
 * Exact six-function, notification-only live canary staging.
 * No cloud operations: the existing protected manual workflow owns deployment.
 * The website must remain OFF until the backend is deployed and verified.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCampaignCoreRelease} from './campaign-backend-scoped-release.mjs';
import {buildCampaignChannelsRelease} from './campaign-channels-scoped-release.mjs';
import {buildPhase53Release} from './friends-phase5-3-scoped-release.mjs';
import {reviewFunctionEnvironment} from './firebase-runtime-env-review.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=p=>readFileSync(join(ROOT,p),'utf8');
const reject=reason=>{throw Error('Campaign in-app canary: '+reason);};
export const ENABLE_OPERATION='campaign-inapp-canary-enable';
export const DISABLE_OPERATION='campaign-inapp-canary-disable';
export const CONFIRMATIONS=Object.freeze({
  [ENABLE_OPERATION]:'ENABLE-ASTERIA-CAMPAIGN-INAPP-CANARY',
  [DISABLE_OPERATION]:'DISABLE-ASTERIA-CAMPAIGN-INAPP-CANARY'
});
const SPECS=Object.freeze([
  {name:'asteriaCampaignUCN',kind:'core',envPath:'.env.asteria-ttrpg',
    allowed:['ASTERIA_CAMPAIGN_V2_CANARY_ENABLED'],
    toggled:['ASTERIA_CAMPAIGN_V2_CANARY_ENABLED']},
  {name:'asteriaCampaignJoinRequest',kind:'core',envPath:'.env.asteria-ttrpg',
    allowed:['ASTERIA_JOIN_REQUESTS_ENABLED','ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED',
      'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED'],
    toggled:['ASTERIA_JOIN_REQUESTS_ENABLED','ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED']},
  {name:'asteriaCampaignJoinReview',kind:'core',envPath:'.env.asteria-ttrpg',
    allowed:['ASTERIA_JOIN_REVIEW_ENABLED','ASTERIA_PLAYER_ROSTER_ENABLED',
      'ASTERIA_MEMBER_CONTROLS_ENABLED','ASTERIA_ROLE_PERMISSIONS_ENABLED',
      'ASTERIA_CHARACTER_LINK_REQUESTS_ENABLED','ASTERIA_CHARACTER_LINK_APPROVAL_ENABLED',
      'ASTERIA_CHARACTER_LIFECYCLE_ENABLED','ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED'],
    toggled:['ASTERIA_JOIN_REVIEW_ENABLED','ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED']},
  {name:'asteriaCampaignFriendRecipients',kind:'recipients',
    envPath:'functions/.env.asteria-ttrpg',
    allowed:['ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED'],
    toggled:['ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED']},
  {name:'asteriaSecureInvitation',kind:'secure',
    envPath:'functions/.env.asteria-ttrpg',
    allowed:['ASTERIA_SECURE_INVITATIONS_ENABLED','ASTERIA_INVITATION_ACCEPTANCE_ENABLED',
      'ASTERIA_INVITATION_MANAGER_ENABLED','ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED',
      'ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED','ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED'],
    toggled:['ASTERIA_SECURE_INVITATIONS_ENABLED','ASTERIA_INVITATION_ACCEPTANCE_ENABLED',
      'ASTERIA_INVITATION_MANAGER_ENABLED','ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED',
      'ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED','ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED']},
  {name:'asteriaCampaignNotifications',kind:'notifications',
    envPath:'functions/.env.asteria-ttrpg',
    allowed:['ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED'],
    toggled:['ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED']}
]);
export const TARGETS=Object.freeze(SPECS.map(s=>s.name));
function sourceGuard(){
  const manifest=JSON.parse(read('config/asteria-release.json'));
  if(manifest.project!=='asteria-ttrpg'||
     manifest.invitationDelivery?.active!=='in-app-notifications-only'||
     manifest.invitationDelivery?.emailInvitations!=='deferred'||
     manifest.websiteFlags?.emailInvitationControls!==false)
    reject('Email must remain deferred and project unchanged.');
  const source=read('functions/index.mjs');
  if(!source.includes("process.env.ASTERIA_CAMPAIGN_V2_CANARY_ENABLED!=='1'")||
     !source.includes('v2Test:true')||
     source.includes('export const asteriaCampaignEmailInvitations=onCall('))
    reject('V2-only canary handler or in-app-only contract changed.');
}
export function buildCanaryRelease(live,{enable=true}={}){
  sourceGuard();
  if(!live||typeof live!=='object'||Array.isArray(live))
    reject('Live callable descriptions required.');
  const core=buildCampaignCoreRelease();
  const notifications=buildCampaignChannelsRelease();
  const packages=[];
  for(const spec of SPECS){
    const description=live[spec.name];
    if(!description||description.state!=='ACTIVE')
      reject('Exact live callable must be ACTIVE: '+spec.name);
    if(spec.kind==='secure'&&description.signingSecretAttached!==true)
      reject('Verified existing signing-secret binding required.');
    const reviewed=reviewFunctionEnvironment(description.env,spec.allowed);
    if(enable){
      for(const key of spec.toggled)
        if((reviewed[key]??'0')!=='0')
          reject('Canary gate already ON or unreviewed: '+spec.name+'/'+key);
    }
    const env={...reviewed};
    for(const key of spec.toggled)env[key]=enable?'1':'0';
    // Explicit preservation of disabled unrelated campaign features (e.g.
    // auto-approval, member moderation and character lifecycle).
    const envText=Object.entries(env).sort(([a],[b])=>a.localeCompare(b))
      .map(([key,value])=>key+'='+value).join('\n')+'\n';
    let files;
    if(spec.kind==='core')files={...core.files};
    else if(spec.kind==='notifications')files={...notifications.files};
    else files={...buildPhase53Release(
      spec.kind==='recipients'?(enable?'campaign-friends-recipients-deploy-off':
        'campaign-friends-recipients-disable'):
        (enable?'campaign-friends-invites-deploy-off':'campaign-friends-invites-disable'),
      {live:{exists:true,env:reviewed},recipientReady:false,acceptanceReady:false}
    ).files};
    files[spec.envPath]=envText;
    if(Object.values(files).some(body=>/ASTERIA_RESEND_API_KEY|asteriaResendApiKeySecret|export const asteriaCampaignEmailInvitations=onCall\(/.test(body)))
      reject('Email transport is forbidden.');
    packages.push({name:spec.name,selector:'functions:asteria:'+spec.name,
      kind:spec.kind,envPath:spec.envPath,env,files});
  }
  if(packages.length!==6||new Set(packages.map(x=>x.name)).size!==6)
    reject('Exactly six approved callables required.');
  return {enable,targets:[...TARGETS],packages,productionChanged:false};
}
export function stageCanaryRelease(env=process.env){
  const operation=env.ASTERIA_CANARY_OPERATION;
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REPOSITORY!=='GrayIronwolf/AsteriaTTRPG'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'||
     !Object.hasOwn(CONFIRMATIONS,operation)||
     env.ASTERIA_CANARY_CONFIRMATION!==CONFIRMATIONS[operation]||
     !isAbsolute(env.RUNNER_TEMP||'')||
     !isAbsolute(env.ASTERIA_CANARY_LIVE_FILE||'')||
     !resolve(env.ASTERIA_CANARY_LIVE_FILE).startsWith(resolve(env.RUNNER_TEMP)+'/'))
    reject('A main-only, confirmed protected dispatch is required.');
  const state=JSON.parse(readFileSync(env.ASTERIA_CANARY_LIVE_FILE,'utf8'));
  const plan=buildCanaryRelease(state,{enable:operation===ENABLE_OPERATION});
  const dir=join(env.RUNNER_TEMP,'asteria-inapp-live-canary');
  if(existsSync(dir))reject('Staging directory already exists.');
  for(const p of plan.packages){
    for(const [name,content] of Object.entries(p.files)){
      const to=join(dir,p.name,name);
      mkdirSync(dirname(to),{recursive:true});
      writeFileSync(to,content);
    }
  }
  return {directory:dir,targets:plan.targets,enable:plan.enable,
    packages:plan.packages.map(p=>({name:p.name,selector:p.selector,kind:p.kind}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check'){
      const sample=Object.fromEntries(SPECS.map(s=>[s.name,{
        state:'ACTIVE',env:{},signingSecretAttached:s.kind==='secure'
      }]));
      const result=buildCanaryRelease(sample);
      console.log(JSON.stringify({checked:true,targets:result.targets,
        privateNotificationOnly:true,productionChanged:false}));
    }else if(process.argv[2]==='--stage'){
      const result=stageCanaryRelease();
      console.log(JSON.stringify(result));
    }else reject('Choose --check or --stage.');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
