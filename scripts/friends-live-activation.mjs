/**
 * Activate only the three established Asteria Friends callable gates together.
 * Backend deployment is performed ONLY by a protected manual GitHub workflow.
 * No account data, campaigns, Firestore rules or website files are modified.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFriendsRelease} from './friends-phase1-2-release-package.mjs';
import {buildFriendRequestsRelease} from './friends-phase2-2-release-package.mjs';
import {buildFriendNotificationsRelease} from './friends-notifications-scoped-release.mjs';
import {reviewFunctionEnvironment} from './firebase-runtime-env-review.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const fail=s=>{throw Error('Friends live activation: '+s);};
export const OPERATION='friends-complete-activate';
export const CONFIRMATION='ACTIVATE-ASTERIA-COMPLETE-FRIENDS';
export const TARGETS=Object.freeze([
  'asteriaFriendAccountLookup','asteriaFriendNotifications','asteriaFriendRequests'
]);
const SPECS=Object.freeze([
  {name:'asteriaFriendAccountLookup',allowed:['ASTERIA_FRIEND_LOOKUP_ENABLED'],
    flags:{ASTERIA_FRIEND_LOOKUP_ENABLED:'1'},build:buildFriendsRelease},
  {name:'asteriaFriendNotifications',allowed:['ASTERIA_FRIEND_NOTIFICATIONS_ENABLED'],
    flags:{ASTERIA_FRIEND_NOTIFICATIONS_ENABLED:'1'},build:buildFriendNotificationsRelease},
  {name:'asteriaFriendRequests',
    allowed:['ASTERIA_FRIEND_REQUESTS_ENABLED','ASTERIA_FRIEND_NOTIFICATIONS_ENABLED'],
    flags:{ASTERIA_FRIEND_REQUESTS_ENABLED:'1',ASTERIA_FRIEND_NOTIFICATIONS_ENABLED:'1'},
    build:()=>buildFriendRequestsRelease({enabled:true})}
]);
export function buildFriendsLiveRelease(live){
  if(!live||typeof live!=='object'||Array.isArray(live)||
     Object.keys(live).sort().join(',')!==[...TARGETS].sort().join(','))
    fail('Exactly three scoped callable descriptions are required.');
  const packages=[];
  for(const spec of SPECS){
    const existing=live[spec.name];
    if(!existing||existing.state!=='ACTIVE'||
       typeof existing.env!=='object'||!existing.env||
       Array.isArray(existing.env))
      fail('The existing callable is missing or not ACTIVE: '+spec.name);
    if(existing.signingSecretAttached===true)
      fail('Unexpected secret attached to '+spec.name);
    const kept=reviewFunctionEnvironment(existing.env,spec.allowed);
    const next={...kept,...spec.flags};
    const files=spec.build();
    if(!files['functions/index.mjs'].includes('export const '+spec.name+'=onCall(')||
       (files['functions/index.mjs'].match(/export const /g)||[]).length!==1||
       Object.keys(files).some(x=>x.startsWith('firestore.')||x.startsWith('storage.'))||
       Object.values(files).some(x=>typeof x==='string'&&/ASTERIA_RESEND_API_KEY|asteriaCampaignEmailInvitations=onCall/.test(x)))
      fail('Unexpected isolated callable contents.');
    files['functions/.env.asteria-ttrpg']=Object.entries(next)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,value])=>key+'='+value).join('\n')+'\n';
    packages.push({
      name:spec.name,selector:'functions:asteria:'+spec.name,files,env:next
    });
  }
  if(packages.length!==3||new Set(packages.map(x=>x.name)).size!==3)
    fail('Exactly three reviewed callables required.');
  return {targets:[...TARGETS],packages,productionChanged:false};
}
export function stageFriendsLiveRelease(env=process.env){
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REPOSITORY!=='GrayIronwolf/AsteriaTTRPG'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_FRIENDS_LIVE_OPERATION!==OPERATION||
     env.ASTERIA_FRIENDS_LIVE_CONFIRMATION!==CONFIRMATION||
     env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'||
     !isAbsolute(env.RUNNER_TEMP||'')||
     !isAbsolute(env.ASTERIA_FRIENDS_LIVE_FILE||'')||
     !resolve(env.ASTERIA_FRIENDS_LIVE_FILE).startsWith(resolve(env.RUNNER_TEMP)+'/'))
    fail('Production requires exact approved main-only workflow dispatch.');
  const state=JSON.parse(readFileSync(env.ASTERIA_FRIENDS_LIVE_FILE,'utf8'));
  const release=buildFriendsLiveRelease(state);
  const dir=join(env.RUNNER_TEMP,'asteria-friends-live-activation');
  if(existsSync(dir))fail('Staging directory already exists.');
  for(const pkg of release.packages)
    for(const [name,body] of Object.entries(pkg.files)){
      const destination=join(dir,pkg.name,name);
      mkdirSync(dirname(destination),{recursive:true});
      writeFileSync(destination,body);
    }
  return {directory:dir,targets:release.targets,productionChanged:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check'){
      const sample=Object.fromEntries(TARGETS.map(name=>[name,{
        state:'ACTIVE',env:{LOG_EXECUTION_ID:'true'},signingSecretAttached:false
      }]));
      const x=buildFriendsLiveRelease(sample);
      console.log(JSON.stringify({checked:true,targets:x.targets,
        productionChanged:false,emailSending:false}));
    }else if(process.argv[2]==='--stage'){
      console.log(JSON.stringify(stageFriendsLiveRelease()));
    }else fail('Choose --check or --stage.');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
