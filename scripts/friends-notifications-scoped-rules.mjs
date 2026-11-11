// Guarded Firestore rules release for the default database.
// Never overwrite unknown live rules or deploy index/storage changes.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=p=>readFileSync(join(root,p),'utf8');
const markerStart='    // Phase 4.1: recipient-private friend notification events are Admin-only.';
const markerEnd='    match /friendRequestInboxThrottle/{uid} {';
const fail=message=>{throw new Error(message);};
const checksum=value=>createHash('sha256').update(value).digest('hex');
export function approvedFriendRuleSources(source=read('firestore.rules')){
  const a=source.indexOf(markerStart),b=source.indexOf(markerEnd);
  if(a<0||b<=a||source.indexOf(markerStart,a+1)>=0||
     source.indexOf(markerEnd,b+1)>=0)fail('Private-rule markers are missing or duplicated.');
  const addition=source.slice(a,b);
  if(!addition.includes('match /friendNotificationInbox/{uid} {')||
     !addition.includes('match /friendNotificationAccessThrottle/{uid} {')||
     (addition.match(/allow read, write: if false;/g)||[]).length!==2||
     (addition.match(/allow get, list, create, update, delete: if false;/g)||[]).length!==1||
     addition.includes('allow read: if true')||
     source.includes('friendNotificationsEnabled:true'))
    fail('Unexpected private-rule contents; refusing deploy.');
  const baseline=source.slice(0,a)+source.slice(b);
  if(!baseline.startsWith("rules_version = '2';")||
     !baseline.includes('match /campaigns/{campaignId} {')||
     !baseline.includes('match /accountIdRegistry/{accountIdKey} {'))
    fail('Incomplete Firestore rules baseline.');
  return {baseline,approved:source,baselineSha256:checksum(baseline),
    approvedSha256:checksum(source)};
}
export function evaluateLiveFriendRules(live,source=read('firestore.rules')){
  const files=approvedFriendRuleSources(source);
  if(typeof live!=='string')fail('Live Firestore source is unavailable.');
  if(live===files.approved)return {state:'already-current',...files};
  if(live===files.baseline)return {state:'ready',...files};
  fail('Live Firestore rules diverge from the reviewed baseline. Do not deploy.');
}
export function extractLiveRulesFromRuleset(payload){
  if(!payload||typeof payload!=='object'||!Array.isArray(payload.source?.files)||
     payload.source.files.length!==1||
     typeof payload.source.files[0].content!=='string')
    fail('Ruleset must contain exactly one readable rules source file.');
  return payload.source.files[0].content;
}
export function stageFriendRules(env=process.env,live){
  if(env.GITHUB_ACTIONS!=='true'||!isAbsolute(env.RUNNER_TEMP||'')||
     env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'||
     env.ASTERIA_NOTIFICATION_OPERATION!=='friend-notifications-rules-deploy'||
     env.ASTERIA_NOTIFICATION_CONFIRMATION!=='DEPLOY-ASTERIA-FRIEND-NOTIFICATION-RULES')
    fail('Rules deploy staging requires manual approved production workflow.');
  const checked=evaluateLiveFriendRules(live);
  if(checked.state!=='ready')return {directory:null,...checked};
  const directory=join(env.RUNNER_TEMP,'asteria-friends-notification-rules');
  if(existsSync(directory))fail('Rules release directory already exists.');
  const config={
    firestore:{rules:'firestore.rules'}
  };
  for(const [path,body] of Object.entries({
    'firebase.json':JSON.stringify(config,null,2)+'\n',
    'firestore.rules':checked.approved
  })){
    const name=join(directory,path);
    mkdirSync(dirname(name),{recursive:true});
    writeFileSync(name,body);
  }
  return {directory,...checked};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const arg=process.argv[2];
    if(arg==='--check'){
      const {baselineSha256,approvedSha256}=approvedFriendRuleSources();
      console.log(JSON.stringify({baselineSha256,approvedSha256,scope:'firestore:rules',
        deploysIndexes:false,deploysStorage:false}));
    }else if(arg==='--compare-ruleset'||arg==='--stage-production'){
      const pathname=process.argv[3];
      if(!pathname||!isAbsolute(pathname))fail('Provide absolute local ruleset snapshot path.');
      const live=extractLiveRulesFromRuleset(JSON.parse(readFileSync(pathname,'utf8')));
      const result=arg==='--compare-ruleset'?
        evaluateLiveFriendRules(live):stageFriendRules(process.env,live);
      console.log(JSON.stringify({state:result.state,directory:result.directory||null,
        baselineSha256:result.baselineSha256,approvedSha256:result.approvedSha256}));
    }else fail('Unknown Firestore rules release operation.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
