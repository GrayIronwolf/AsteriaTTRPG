// Prepared-only, independently approved Friends notification activation/rollback.
// All active settings are staged to isolated function bundles. This module
// never changes production on its own and never edits the live website flag.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve,isAbsolute,dirname} from 'node:path';
import {buildFriendNotificationsRelease} from './friends-notifications-scoped-release.mjs';
import {buildFriendRequestsRelease} from './friends-phase2-2-release-package.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const fail=message=>{throw new Error(message);};
const approvalByOperation=Object.freeze({
  'friend-notifications-read-activate':'ACTIVATE-ASTERIA-FRIEND-NOTIFICATION-READS',
  'friend-notifications-read-deactivate':'DEACTIVATE-ASTERIA-FRIEND-NOTIFICATION-READS',
  'friend-notifications-events-activate':'ACTIVATE-ASTERIA-FRIEND-NOTIFICATION-EVENTS',
  'friend-notifications-events-deactivate':'DEACTIVATE-ASTERIA-FRIEND-NOTIFICATION-EVENTS'
});
const isOn=operation=>operation.endsWith('-activate');
const isRead=operation=>operation.startsWith('friend-notifications-read-');
function assertSourceAndScope(){
  const site=readFileSync(join(root,'index.html'),'utf8');
  if((site.match(/friendNotificationsEnabled:false/g)||[]).length!==1||
     /friendNotificationsEnabled:true/.test(site))
    fail('The production website must remain disabled until separately approved.');
  const request=readFileSync(join(root,'functions/index.mjs'),'utf8');
  const actions=readFileSync(join(root,'functions/friendRequestActions.mjs'),'utf8');
  if(!request.includes("notificationsEnabled:process.env.ASTERIA_FRIEND_NOTIFICATIONS_ENABLED==='1'")||
     !request.includes("if(process.env.ASTERIA_FRIEND_REQUESTS_ENABLED!=='1')")||
     !actions.includes("if(notificationsEnabled)")||
     !actions.includes("enqueueFriendNotifications(tx,db,actorUid,input.action,previous,next,{now})"))
    fail('Notification event wiring has changed; release refused.');
}
export function buildFriendsNotificationActivationRelease(operation){
  if(!Object.hasOwn(approvalByOperation,operation))fail('Unknown notification activation operation.');
  assertSourceAndScope();
  const active=isOn(operation);
  const inbox=isRead(operation);
  const files=inbox?buildFriendNotificationsRelease():buildFriendRequestsRelease({enabled:true});
  const env=inbox?'ASTERIA_FRIEND_NOTIFICATIONS_ENABLED='+Number(active)+'\n':
    'ASTERIA_FRIEND_REQUESTS_ENABLED=1\n'+
    'ASTERIA_FRIEND_NOTIFICATIONS_ENABLED='+Number(active)+'\n';
  files['functions/.env.asteria-ttrpg']=env;
  const entry=files['functions/index.mjs'];
  if((entry.match(/export const /g)||[]).length!==1||
     !entry.includes(inbox?'export const asteriaFriendNotifications=onCall({':
       'export const asteriaFriendRequests=onCall({')||
     entry.includes(inbox?'export const asteriaFriendRequests=onCall({':
       'export const asteriaFriendNotifications=onCall({'))
    fail('Refusing non-isolated function release.');
  const configuration=JSON.parse(files['firebase.json']);
  if(Object.keys(configuration).join(',')!=='functions'||
     configuration.functions.length!==1||
     configuration.functions[0].codebase!=='asteria'||
     configuration.functions[0].runtime!=='nodejs22')
    fail('Refusing a broad Firebase release.');
  return {files,enabled:active,
    functionName:inbox?'asteriaFriendNotifications':'asteriaFriendRequests',
    operation};
}
export function stageFriendsNotificationActivation(env=process.env,operation){
  if(!Object.hasOwn(approvalByOperation,operation)||
     env.GITHUB_ACTIONS!=='true'||
     !isAbsolute(env.RUNNER_TEMP||'')||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'||
     env.ASTERIA_NOTIFICATION_ACTIVATION_OPERATION!==operation||
     env.ASTERIA_NOTIFICATION_ACTIVATION_CONFIRMATION!==approvalByOperation[operation])
    fail('Notification activation staging requires exact authorized main-only confirmation.');
  const directory=join(env.RUNNER_TEMP,isRead(operation)?
    'asteria-friend-notification-reads-activation':
    'asteria-friend-notification-events-activation');
  if(existsSync(directory))fail('Notification activation output already exists.');
  const release=buildFriendsNotificationActivationRelease(operation);
  for(const [name,body] of Object.entries(release.files)){
    const filepath=join(directory,name);
    mkdirSync(dirname(filepath),{recursive:true});
    writeFileSync(filepath,body);
  }
  return {...release,directory,files:Object.keys(release.files)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const action=process.argv[2];
    if(action==='--check'){
      const details=Object.keys(approvalByOperation).map(operation=>{
        const {enabled,functionName,files}=buildFriendsNotificationActivationRelease(operation);
        return {operation,enabled,functionName,files:Object.keys(files)};
      });
      console.log(JSON.stringify({ready:true,productionActivated:false,details}));
    }else if(action==='--stage'){
      const release=stageFriendsNotificationActivation(process.env,process.argv[3]);
      console.log(JSON.stringify({operation:release.operation,
        functionName:release.functionName,enabled:release.enabled,
        directory:release.directory,files:release.files}));
    }else fail('Unknown notification activation package command.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
