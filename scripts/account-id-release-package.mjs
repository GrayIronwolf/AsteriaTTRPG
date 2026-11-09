/**
 * Build a minimal, reproducible Account ID functions source package.
 * Keeps website dependencies and broad npm overrides out of Firebase upload.
 * The Firebase CLI is installed separately from the website as part of CI.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const sourcePath='functions/index.mjs';
const marker='// Phase 1.3: authenticated, server-controlled Account ID finalization.';
const fileNames=[
  'functions/accountIdentity.mjs',
  'functions/accountIdentityProfile.mjs',
  'functions/accountIdentityIssuance.mjs'
];
const deployment="functions:asteria:asteriaAccountIdentity";
const production='asteria-ttrpg';
const safe=(value)=>typeof value==='string'&&value.length>0;
const die=(message)=>{throw new Error(message)};
const read=(p)=>readFileSync(resolve(root,p),'utf8');

export function extractAccountIdCallable(source) {
  if(typeof source!=='string')die('Account ID source missing.');
  const start=source.indexOf(marker);
  if(start<0||start!==source.lastIndexOf(marker))
    die('Account ID callable boundary is missing or ambiguous.');
  const body=source.slice(start).trimEnd();
  if((body.match(/export const /g)||[]).length!==1||
    !body.includes('export const asteriaAccountIdentity=onCall({')||
    !body.endsWith('});')||
    !body.includes("process.env.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'")||
    !body.includes('ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE')||
    !body.includes('issueNewRegistrationAccountId(getFirestore(),firebaseUser,request.auth.uid,')||
    /defineSecret\(|ASTERIA_RESEND_API_KEY|asteriaCampaignEmailInvitations|asteriaSecureInvitation|ASTERIA_SECURE_INVITE_SIGNING_KEY/.test(body)||
    /^\s*import\s/m.test(body))
      die('Account ID callable cannot be isolated safely.');
  return [
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {getAuth} from 'firebase-admin/auth';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';",
    "if(!getApps().length)initializeApp();",
    body,
    ''
  ].join('\n');
}

export function releasePackageFiles({reader=read}={}) {
  const pkg=JSON.parse(reader('package.json'));
  const lock=JSON.parse(reader('package-lock.json'));
  const firebase=JSON.parse(reader('firebase.json'));
  const original=reader(sourcePath);
  if(pkg.main!==sourcePath||pkg.engines?.node!=='22'||
    !Array.isArray(firebase.functions)||firebase.functions.length!==1||
    firebase.functions[0].source!=='.'||firebase.functions[0].codebase!=='asteria'||
    firebase.functions[0].runtime!=='nodejs22')
    die('Current Asteria Firebase source/codebase unexpectedly changed.');
  const admin=lock.packages?.['node_modules/firebase-admin']?.version;
  const functions=lock.packages?.['node_modules/firebase-functions']?.version;
  const cli=lock.packages?.['node_modules/firebase-tools']?.version;
  if(admin!=='14.5.0'||functions!=='7.4.0'||cli!=='15.35.0'||
     pkg.devDependencies?.['firebase-tools']!==cli)
    die('Pinned SDK/CLI version verification failed.');
  const originalInstalledMinimatch=lock.packages?.['node_modules/minimatch']?.version;
  if(!safe(originalInstalledMinimatch))
    die('Root dependency inventory incomplete.');
  const entry=extractAccountIdCallable(original);
  const packageJson={
    name:'asteria-account-id-function',
    version:'1.0.0',
    private:true,
    type:'module',
    main:'index.mjs',
    engines:{node:'22'},
    dependencies:{'firebase-admin':admin,'firebase-functions':functions}
  };
  const stageFirebase={
    functions:[{
      source:'functions',codebase:'asteria',runtime:'nodejs22',
      ignore:['node_modules','.git','.runtimeconfig.json',
        'firebase-debug.log','firebase-debug.*.log','.env','.env.*']
    }]
  };
  const files={
    'firebase.json':JSON.stringify(stageFirebase,null,2)+'\n',
    'functions/package.json':JSON.stringify(packageJson,null,2)+'\n',
    'functions/index.mjs':entry
  };
  for(const name of fileNames)files[name]=reader(name);
  if(Object.keys(files).length!==6||
     Object.keys(files).some(p=>p.includes('..')||p.includes('\\')))
    die('Unexpected Account ID artifact file inventory.');
  if(Object.values(files).some(content=>
    /ASTERIA_RESEND_API_KEY|ASTERIA_SECURE_INVITE_SIGNING_KEY/.test(content)))
    die('Unrelated secrets must not enter the Account ID package.');
  return {files,versions:{admin,functions,cli},
    mainCodebase:'asteria',deployment,production,
    rootMinimatchVersion:originalInstalledMinimatch};
}

export function verifyStagingContext(mode,env=process.env) {
  if(!['ci','production'].includes(mode)||
    env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||
    !safe(env.RUNNER_TEMP)||!isAbsolute(env.RUNNER_TEMP))
    die('Staging requires a GitHub Actions temporary directory.');
  if(mode==='production'&&(
    env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
    env.ASTERIA_ACCOUNT_ID_SCOPED_DEPLOY!=='1'||
    env.ASTERIA_DEPLOY_PROJECT!==production))
    die('Live Account ID package preparation requires the approved deployment context.');
  if(mode==='ci'&&!['pull_request','push'].includes(env.GITHUB_EVENT_NAME))
    die('CI packaging is only allowed for source verification events.');
  const stage=resolve(env.RUNNER_TEMP,'asteria-account-id-release');
  const within=relative(resolve(env.RUNNER_TEMP),stage);
  if(within.startsWith('..'+sep)||within==='..'||isAbsolute(within))
    die('Invalid staging destination.');
  return stage;
}

export function stageReleasePackage(mode,{env=process.env,reader=read,
  write=(path,text)=>writeFileSync(path,text),
  mkdir=(p)=>mkdirSync(p,{recursive:true}), exists=existsSync
}={}) {
  const stage=verifyStagingContext(mode,env);
  const pack=releasePackageFiles({reader});
  if(exists(stage))die('Fresh runner staging destination must not already exist.');
  for(const [name,contents] of Object.entries(pack.files)){
    const out=join(stage,name);
    mkdir(resolve(out,'..'));
    write(out,contents);
  }
  return {stage,exportedFunction:'asteriaAccountIdentity',
    selectedDeployment:deployment,sourceFiles:Object.keys(pack.files).length,
    runtimeDependencies:pack.versions,
    productionWritesPerformed:false,accountIdsEnabled:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    if(process.argv.length===3&&process.argv[2]==='--check'){
      const plan=releasePackageFiles();
      process.stdout.write(JSON.stringify({ready:true,files:Object.keys(plan.files),
        versions:plan.versions,rootMinimatchVersion:plan.rootMinimatchVersion,
        cloudAccessPerformed:false})+'\n');
    } else if(process.argv.length===3&&
      ['--stage-ci','--stage-production'].includes(process.argv[2])){
      const mode=process.argv[2]==='--stage-ci'?'ci':'production';
      process.stdout.write(JSON.stringify(stageReleasePackage(mode))+'\n');
    } else die('Unsupported release packaging command.');
  }catch{
    process.stderr.write('Account ID release package failed closed.\n');
    process.exitCode=1;
  }
}
