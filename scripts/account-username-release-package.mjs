import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const entry=readFileSync(join(root,'functions/index.mjs'),'utf8');
const startTag='// Authenticated username edits keep a permanent UID and five-digit number.';
const endTag='// Phase 1.3: authenticated, server-controlled Account ID finalization.';
export function isolatedUsernameSource(text=entry){
  const start=text.indexOf(startTag),end=text.indexOf(endTag);
  if(start<0||end<=start||text.indexOf(startTag,start+1)!==-1||
     text.indexOf(endTag,end+1)!==-1)throw Error('Scoped callable boundaries changed.');
  const body=text.slice(start,end).trim();
  if((body.match(/export const /g)||[]).length!==1||
     !body.includes('export const asteriaAccountUsername=onCall({')||
     !body.includes("await import('./accountIdentityUsername.mjs')")||
     /ASTERIA_RESEND_API_KEY|defineSecret|asteriaAccountIdentity=onCall|asteriaCampaign/.test(body))
    throw Error('Username callable could not be extracted safely.');
  return [
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {getAuth} from 'firebase-admin/auth';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';",
    "if(!getApps().length)initializeApp();",
    body,''
  ].join('\n');
}
export function buildUsernameRelease(){
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
  const admin=lock.packages?.['node_modules/firebase-admin']?.version;
  const functions=lock.packages?.['node_modules/firebase-functions']?.version;
  if(admin!=='14.5.0'||functions!=='7.4.0'||pkg.engines?.node!=='22')
    throw Error('Unexpected Firebase dependencies; operator review required.');
  return {
    'firebase.json':JSON.stringify({functions:[{source:'functions',codebase:'asteria',runtime:'nodejs22'}]},null,2)+'\n',
    'functions/package.json':JSON.stringify({name:'asteria-account-username-function',private:true,type:'module',main:'index.mjs',engines:{node:'22'},dependencies:{'firebase-admin':admin,'firebase-functions':functions}},null,2)+'\n',
    'functions/index.mjs':isolatedUsernameSource(),
    'functions/accountIdentity.mjs':readFileSync(join(root,'functions/accountIdentity.mjs'),'utf8'),
    'functions/accountIdentityUsername.mjs':readFileSync(join(root,'functions/accountIdentityUsername.mjs'),'utf8')
  };
}
export function stageUsernameRelease(env=process.env,mode='production'){
  if(!['ci','production'].includes(mode)||env.GITHUB_ACTIONS!=='true'||
     !isAbsolute(env.RUNNER_TEMP||''))
    throw Error('Staging requires a GitHub Actions temporary directory.');
  if(mode==='production'&&(env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_USERNAME_SCOPED_DEPLOY!=='1'||
     env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'))
    throw Error('Production staging requires the approved GitHub Actions context.');
  if(mode==='ci'&&!['pull_request','push'].includes(env.GITHUB_EVENT_NAME))
    throw Error('CI staging must be a repository check event.');
  const dir=join(env.RUNNER_TEMP,'asteria-username-release');
  if(existsSync(dir))throw Error('Release directory already exists.');
  for(const [file,content] of Object.entries(buildUsernameRelease())){
    const destination=join(dir,file);
    mkdirSync(resolve(destination,'..'),{recursive:true});
    writeFileSync(destination,content);
  }
  return dir;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check') {
      const files=buildUsernameRelease();
      console.log(JSON.stringify({ready:true,files:Object.keys(files),cloudWrites:false}));
    }else if(process.argv[2]==='--stage-production'||process.argv[2]==='--stage-ci'){
      const mode=process.argv[2]==='--stage-ci'?'ci':'production';
      console.log(JSON.stringify({staged:stageUsernameRelease(process.env,mode),scope:'functions:asteria:asteriaAccountUsername',mode}));
    }else throw Error('Unknown release operation.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
