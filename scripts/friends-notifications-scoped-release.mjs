// Isolated production-safe release staging for Friends social notifications.
// This package deliberately never imports or deploys campaign/identity request
// callables and leaves the new social notification service DISABLED.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve,isAbsolute,dirname} from 'node:path';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(join(root,path),'utf8');
const startMarker='// Phase 4.1 Friends: private social inbox, independently gated from campaigns.';
const endMarker='// Phase 2.2 Friends: authenticated request mutations, disabled by default.';
const requiredFiles=[
  'functions/index.mjs','functions/friendNotifications.mjs',
  'functions/friendNotificationThrottle.mjs',
  'functions/friendRelationshipModel.mjs'
];
const fail=reason=>{throw new Error(reason);};
export function isolatedFriendNotificationsSource(source=read('functions/index.mjs')){
  const first=source.indexOf(startMarker),last=source.indexOf(endMarker);
  if(first<0||last<=first||source.indexOf(startMarker,first+1)>=0||
     source.indexOf(endMarker,last+1)>=0)
    fail('Notification callable boundaries changed; refusing release.');
  const block=source.slice(first,last).trim();
  if((block.match(/export const /g)||[]).length!==1||
     !block.includes('export const asteriaFriendNotifications=onCall({')||
     !block.includes("process.env.ASTERIA_FRIEND_NOTIFICATIONS_ENABLED!=='1'")||
     !block.includes("await import('./friendNotifications.mjs')")||
     !block.includes("await import('./friendNotificationThrottle.mjs')")||
     !block.includes('chargeFriendNotificationAccess(db,request.auth.uid,data.action)')||
     !block.includes('listFriendNotifications(db,request.auth.uid')||
     /ASTERIA_FRIEND_REQUESTS_ENABLED|asteriaFriendRequests=onCall|asteriaCampaign|defineSecret|sendEmail/.test(block))
    fail('Notification callable isolation cannot be verified.');
  return [
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';",
    'if(!getApps().length)initializeApp();',
    block,''
  ].join('\n');
}
export function buildFriendNotificationsRelease(){
  const packageJson=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  const admin=lock.packages?.['node_modules/firebase-admin']?.version;
  const functions=lock.packages?.['node_modules/firebase-functions']?.version;
  if(packageJson.engines?.node!=='22'||admin!=='14.5.0'||functions!=='7.4.0')
    fail('Unreviewed Firebase runtime or dependencies; release refused.');
  const files={
    'firebase.json':JSON.stringify({functions:[{
      source:'functions',codebase:'asteria',runtime:'nodejs22'
    }]},null,2)+'\n',
    'functions/package.json':JSON.stringify({
      name:'asteria-friends-notifications-only',
      private:true,type:'module',main:'index.mjs',
      engines:{node:'22'},
      dependencies:{'firebase-admin':admin,'firebase-functions':functions}
    },null,2)+'\n',
    'functions/.env.asteria-ttrpg':'ASTERIA_FRIEND_NOTIFICATIONS_ENABLED=0\n',
    'functions/index.mjs':isolatedFriendNotificationsSource()
  };
  for(const file of requiredFiles.filter(x=>x!=='functions/index.mjs'))
    files[file]=read(file);
  if(Object.keys(files).length!==7)
    fail('Unexpected notification release file list.');
  return files;
}
export function stageFriendNotificationsRelease(env=process.env,mode='ci'){
  if(!['ci','production'].includes(mode)||env.GITHUB_ACTIONS!=='true'||
     !isAbsolute(env.RUNNER_TEMP||''))
    fail('Notification staging requires a GitHub Actions runner.');
  if(mode==='ci'){
    if(!['pull_request','push'].includes(env.GITHUB_EVENT_NAME))
      fail('Notification CI requires a source verification event.');
  }else if(env.GITHUB_REF!=='refs/heads/main'||
           env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
           env.ASTERIA_NOTIFICATION_OPERATION!=='friend-notifications-callable-deploy'||
           env.ASTERIA_NOTIFICATION_CONFIRMATION!=='DEPLOY-ASTERIA-FRIEND-NOTIFICATIONS-OFF'||
           env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'){
    fail('Notification production staging requires approved manual main-only confirmation.');
  }
  const directory=join(env.RUNNER_TEMP,'asteria-friends-notifications-release');
  if(existsSync(directory))fail('Notification staging directory already exists.');
  for(const [name,value] of Object.entries(buildFriendNotificationsRelease())){
    const path=join(directory,name);
    mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,value);
  }
  return directory;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const arg=process.argv[2];
    if(arg==='--check')
      console.log(JSON.stringify({
        ready:true,scope:'functions:asteria:asteriaFriendNotifications',
        enabled:false,files:Object.keys(buildFriendNotificationsRelease())
      }));
    else if(arg==='--stage-ci'||arg==='--stage-production')
      console.log(JSON.stringify({
        directory:stageFriendNotificationsRelease(process.env,
          arg==='--stage-ci'?'ci':'production'),
        enabled:false
      }));
    else fail('Unknown notification package operation.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
