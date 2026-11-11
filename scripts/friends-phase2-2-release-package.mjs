// Phase 2.2: isolated Firebase release packaging for one disabled callable.
// Never deploy Firestore rules, account search, campaign functions or Hosting.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve,isAbsolute,dirname} from 'node:path';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(join(root,path),'utf8');
const beginMarker='// Phase 2.2 Friends: authenticated request mutations, disabled by default.';
const endMarker='// Phase 1.2 Friends System: exact, authenticated Account ID discovery only.';
function fail(reason){throw new Error(reason);}

export function isolatedFriendRequestsSource(entry=read('functions/index.mjs')){
  const first=entry.indexOf(beginMarker),last=entry.indexOf(endMarker);
  if(first<0||last<first||
     entry.indexOf(beginMarker,first+1)>=0||
     entry.indexOf(endMarker,last+1)>=0)
    fail('Friend request callable isolation boundaries have changed.');
  const block=entry.slice(first,last).trim();
  if((block.match(/export const /g)||[]).length!==1||
     !block.includes('export const asteriaFriendRequests=onCall({')||
     !block.includes("process.env.ASTERIA_FRIEND_REQUESTS_ENABLED!=='1'")||
     !block.includes("await import('./friendRequestActions.mjs')")||
     !block.includes('request.auth.uid,data')||
     /defineSecret|asteriaAccountIdentity=onCall|asteriaAccountUsername=onCall|asteriaCampaign|ASTERIA_RESEND/.test(block))
    fail('Friend request callable isolation cannot be verified.');
  return [
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {getAuth} from 'firebase-admin/auth';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';",
    "if(!getApps().length)initializeApp();",
    block,''
  ].join('\n');
}
export function buildFriendRequestsRelease({enabled=false}={}){
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  const admin=lock.packages?.['node_modules/firebase-admin']?.version;
  const functions=lock.packages?.['node_modules/firebase-functions']?.version;
  if(pkg.engines?.node!=='22'||admin!=='14.5.0'||functions!=='7.4.0')
    fail('Unreviewed Firebase dependencies; request release refused.');
  return {
    'firebase.json':JSON.stringify({functions:[{source:'functions',
      codebase:'asteria',runtime:'nodejs22'}]},null,2)+'\n',
    'functions/package.json':JSON.stringify({
      name:'asteria-friend-requests-only',private:true,type:'module',
      main:'index.mjs',engines:{node:'22'},
      dependencies:{'firebase-admin':admin,'firebase-functions':functions}
    },null,2)+'\n',
    'functions/.env.asteria-ttrpg':'ASTERIA_FRIEND_REQUESTS_ENABLED='+(enabled?'1':'0')+'\n',
    'functions/index.mjs':isolatedFriendRequestsSource(),
    'functions/friendRequestActions.mjs':read('functions/friendRequestActions.mjs'),
    'functions/friendRequestInbox.mjs':read('functions/friendRequestInbox.mjs'),
    'functions/friendRelationshipModel.mjs':read('functions/friendRelationshipModel.mjs'),
    'functions/friendAccountLookup.mjs':read('functions/friendAccountLookup.mjs')
  };
}
export function stageFriendRequestsRelease(env=process.env,mode='ci'){
  if(!['ci','production','activate','deactivate'].includes(mode)||env.GITHUB_ACTIONS!=='true'||
     !isAbsolute(env.RUNNER_TEMP||''))
    fail('Staging requires the approved GitHub Actions runner.');
  if(mode==='ci'&&!['pull_request','push'].includes(env.GITHUB_EVENT_NAME))
    fail('CI requires an ordinary source verification event.');
  if(mode!=='ci'){
    const approvals={
      production:['friends-request-backend-deploy','DEPLOY-ASTERIA-FRIEND-REQUESTS-OFF'],
      activate:['friends-request-backend-activate','ACTIVATE-ASTERIA-FRIEND-REQUESTS'],
      deactivate:['friends-request-backend-deactivate','DEACTIVATE-ASTERIA-FRIEND-REQUESTS']
    };
    const approval=approvals[mode];
    if(!approval||env.GITHUB_REF!=='refs/heads/main'||
       env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
       env.ASTERIA_FRIEND_REQUESTS_OPERATION!==approval[0]||
       env.ASTERIA_FRIEND_REQUESTS_CONFIRMATION!==approval[1]||
       env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg')
      fail('Production deployment requires manual main-only approval.');
  }
  const directory=join(env.RUNNER_TEMP,'asteria-friend-requests-release');
  if(existsSync(directory))fail('Friend request staging directory already exists.');
  const files=buildFriendRequestsRelease({enabled:mode==='activate'});
  for(const [name,content] of Object.entries(files)){
    const filepath=join(directory,name);
    mkdirSync(dirname(filepath),{recursive:true});
    writeFileSync(filepath,content);
  }
  return directory;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const action=process.argv[2];
    if(action==='--check')
      console.log(JSON.stringify({ready:true,
        scope:'functions:asteria:asteriaFriendRequests',
        files:Object.keys(buildFriendRequestsRelease()),featureEnabled:false}));
    else if(['--stage-ci','--stage-production',
      '--stage-activation','--stage-deactivation'].includes(action)){
      const mode={'--stage-ci':'ci','--stage-production':'production',
        '--stage-activation':'activate','--stage-deactivation':'deactivate'}[action];
      console.log(JSON.stringify({directory:stageFriendRequestsRelease(process.env,mode),
        enabled:mode==='activate'}));
    }
    else fail('Unknown release operation.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
