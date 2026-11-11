// Guarded Firestore rules release for the default database.
// Never overwrite unknown live rules or deploy index/storage changes.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

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

// Diagnostic only. This produces hashes and rule-path presence flags; it never
// writes deployed rules, publishes live rule source, or authorizes a deployment.
const normalizeForDiagnostic=value=>
  value.replace(/^\\uFEFF/,'').replace(/\\r\\n/g,'\\n').replace(/\\n*$/,'\\n');

const lineDiffCounts=(expected,actual)=>{
  const left=expected.split('\\n'),right=actual.split('\\n');
  let prev=new Uint16Array(right.length+1);
  for(let i=0;i<left.length;i++){
    const next=new Uint16Array(right.length+1);
    for(let j=0;j<right.length;j++)
      next[j+1]=left[i]===right[j]?prev[j]+1:
        Math.max(next[j],prev[j+1]);
    prev=next;
  }
  const common=prev[right.length];
  return {linesOnlyInLive:right.length-common,linesOnlyInReviewed:left.length-common};
};
export function auditLiveFriendRules(live,source=read('firestore.rules'),
  history=[]){
  if(typeof live!=='string'||live.length<100||live.length>256000)
    fail('Live Firestore rules are missing or outside safe audit limits.');
  const {baseline,approved,baselineSha256,approvedSha256}=
    approvedFriendRuleSources(source);
  let state='blocked-drift';
  if(live===baseline)state='ready';
  else if(live===approved)state='already-current';
  else if(normalizeForDiagnostic(live)===normalizeForDiagnostic(baseline))
    state='blocked-format-only-baseline';
  else if(normalizeForDiagnostic(live)===normalizeForDiagnostic(approved))
    state='blocked-format-only-current';
  const match=name=>
    live.includes('match /'+name+' {');
  const knownPaths={
    users:match('users/{uid}'),
    friendRelationships:match('friendRelationships/{pairId}'),
    friendRequestInbox:match('friendRequestInbox/{uid}'),
    friendRequestInboxThrottle:match('friendRequestInboxThrottle/{uid}'),
    friendNotificationInbox:match('friendNotificationInbox/{uid}'),
    friendNotificationAccessThrottle:match('friendNotificationAccessThrottle/{uid}'),
    friendLookupThrottle:match('friendLookupThrottle/{uid}'),
    accountIdRegistry:match('accountIdRegistry/{accountIdKey}'),
    campaigns:match('campaigns/{campaignId}'),
    campaignNotificationInbox:match('campaignNotificationInbox/{uid}')
  };
  const candidate=history.find(entry=>entry&&/^[a-f0-9]{40}$/.test(entry.sha)&&
    typeof entry.content==='string'&&
    (entry.content===live||
      normalizeForDiagnostic(entry.content)===normalizeForDiagnostic(live)));
  const diff=lineDiffCounts(baseline,live);
  return {
    state,
    deploymentPermitted:state==='ready'||state==='already-current',
    liveSha256:checksum(live),
    baselineSha256,approvedSha256,
    liveLineCount:live.split('\\n').length,
    baselineLineCount:baseline.split('\\n').length,
    liveMatchCount:(live.match(/\\bmatch\\s+\\//g)||[]).length,
    baselineMatchCount:(baseline.match(/\\bmatch\\s+\\//g)||[]).length,
    ...diff,knownPaths,
    historicalMatch: candidate?
      {commit:candidate.sha,match:live===candidate.content?'exact':'line-endings-only'}:null,
    nextStep:state==='ready'?'Reviewed baseline is live; rules-only release may be requested.':
      state==='already-current'?'Reviewed rules are already live; no rules deployment needed.':
      'STOP: source differs from reviewed baseline. Reconcile live rules before deployment.'
  };
}
// Git history is read-only, local to the checked-out public source tree.
export function readHistoricalRulesForAudit({limit=40}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>80)
    fail('Invalid rule history audit limit.');
  let revisions=[];
  try{
    revisions=execFileSync('git',['log','--format=%H',
      '--max-count='+limit,'--','firestore.rules'],
    {cwd:root,encoding:'utf8',maxBuffer:64000})
      .trim().split('\\n').filter(value=>/^[a-f0-9]{40}$/.test(value));
  }catch{return [];}
  const history=[];
  for(const sha of revisions){
    try{
      history.push({sha,content:execFileSync('git',['show',sha+':firestore.rules'],
        {cwd:root,encoding:'utf8',maxBuffer:256000})});
    }catch{/* Old entries lacking rules are ignored. */}
  }
  return history;
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
    }else if(arg==='--compare-ruleset'||arg==='--stage-production'||
             arg==='--audit-ruleset'){
      const pathname=process.argv[3];
      if(!pathname||!isAbsolute(pathname))fail('Provide absolute local ruleset snapshot path.');
      const live=extractLiveRulesFromRuleset(JSON.parse(readFileSync(pathname,'utf8')));
      if(arg==='--audit-ruleset'){
        console.log(JSON.stringify(auditLiveFriendRules(live,read('firestore.rules'),
          readHistoricalRulesForAudit())));
      }else{
        const result=arg==='--compare-ruleset'?
          evaluateLiveFriendRules(live):stageFriendRules(process.env,live);
        console.log(JSON.stringify({state:result.state,directory:result.directory||null,
          baselineSha256:result.baselineSha256,approvedSha256:result.approvedSha256}));
      }
    }else fail('Unknown Firestore rules release operation.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
