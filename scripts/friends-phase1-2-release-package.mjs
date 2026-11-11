// Scoped, fail-closed source bundle for the one Friends Phase 1.2 callable.
// No sibling Functions, Firestore rules, website or production data are deployed.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(join(root,path),'utf8');
const startMarker='// Phase 1.2 Friends System: exact, authenticated Account ID discovery only.';
const endMarker='// Authenticated username edits keep a permanent UID and five-digit number.';
const fail=message=>{throw new Error(message);};

export function isolatedFriendSource(entry=read('functions/index.mjs')){
  const begin=entry.indexOf(startMarker),end=entry.indexOf(endMarker);
  if(begin<0||end<=begin||entry.lastIndexOf(startMarker)!==begin||
      entry.lastIndexOf(endMarker)!==end)fail('Friend callable boundaries changed.');
  const block=entry.slice(begin,end).trim();
  if((block.match(/export const /g)||[]).length!==1||
      !block.includes('export const asteriaFriendAccountLookup=onCall({')||
      !block.includes("process.env.ASTERIA_FRIEND_LOOKUP_ENABLED!=='1'")||
      !block.includes("await import('./friendAccountLookup.mjs')")||
      !block.includes('request.auth.uid,input.accountId')||
      /defineSecret|asteriaAccountIdentity=onCall|asteriaAccountUsername=onCall|asteriaCampaign|ASTERIA_RESEND/.test(block))
    fail('Friend function isolation cannot be verified.');
  return [
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {getAuth} from 'firebase-admin/auth';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';",
    "if(!getApps().length)initializeApp();",
    block,''
  ].join('\n');
}

export function buildFriendsRelease(){
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  const admin=lock.packages?.['node_modules/firebase-admin']?.version;
  const functions=lock.packages?.['node_modules/firebase-functions']?.version;
  if(admin!=='14.5.0'||functions!=='7.4.0'||pkg.engines?.node!=='22')
    fail('Unreviewed Firebase dependencies; release refused.');
  return {
    'firebase.json':JSON.stringify({functions:[{source:'functions',
      codebase:'asteria',runtime:'nodejs22'}]},null,2)+'\n',
    'functions/package.json':JSON.stringify({
      name:'asteria-friends-lookup-function',private:true,type:'module',
      main:'index.mjs',engines:{node:'22'},
      dependencies:{'firebase-admin':admin,'firebase-functions':functions}
    },null,2)+'\n',
    'functions/index.mjs':isolatedFriendSource(),
    'functions/friendAccountLookup.mjs':read('functions/friendAccountLookup.mjs')
  };
}

export function stageFriendsRelease(env=process.env,mode='ci'){
  if(!['ci','production'].includes(mode)||env.GITHUB_ACTIONS!=='true'||
      !isAbsolute(env.RUNNER_TEMP||''))
    fail('Staging requires the approved GitHub Actions runner.');
  if(mode==='ci'&&!['pull_request','push'].includes(env.GITHUB_EVENT_NAME))
    fail('CI staging requires a normal code verification event.');
  if(mode==='production'&&(
      env.GITHUB_REF!=='refs/heads/main'||
      env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
      env.ASTERIA_FRIENDS_SCOPED_DEPLOY!=='1'||
      env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'))
    fail('Production staging requires manual main-only approval.');
  const destination=join(env.RUNNER_TEMP,'asteria-friends-lookup-release');
  if(existsSync(destination))fail('Release staging directory already exists.');
  for(const [file,content] of Object.entries(buildFriendsRelease())){
    const path=join(destination,file);
    mkdirSync(resolve(path,'..'),{recursive:true});
    writeFileSync(path,content);
  }
  return destination;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const action=process.argv[2];
    if(action==='--check')
      console.log(JSON.stringify({ready:true,scope:'functions:asteria:asteriaFriendAccountLookup',
        files:Object.keys(buildFriendsRelease()),cloudWrites:false}));
    else if(action==='--stage-ci'||action==='--stage-production')
      console.log(JSON.stringify({directory:stageFriendsRelease(process.env,
        action==='--stage-ci'?'ci':'production')}));
    else fail('Unknown release operation.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
