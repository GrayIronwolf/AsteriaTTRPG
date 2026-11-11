// Safe production staging for the five previously approved campaign core callables.
// Nothing is deployed by this script; it creates files in the trusted runner temp.
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const die=message=>{throw Error(message);};
const read=path=>readFileSync(join(ROOT,path),'utf8');
const DEFINITIONS=Object.freeze([
  ['asteriaCampaignUCN','// Phase 6.1: server-only issuance.'],
  ['asteriaMembershipPreparation','// Phase 2.3: per-campaign access cutover.'],
  ['asteriaCampaignAccessCutover','// Phase 3.2: per-user pending join requests.'],
  ['asteriaCampaignJoinRequest','// Phase 3.3: manual GM review'],
  ['asteriaCampaignJoinReview','// Friends Phase 5.1: read-only campaign recipient selection.']
]);
export const CAMPAIGN_CORE_TARGETS=Object.freeze(DEFINITIONS.map(([name])=>name));
const BLOCKED=/ASTERIA_RESEND_API_KEY|ASTERIA_SECURE_INVITE_SIGNING_KEY|defineSecret\s*\(|asteriaCampaignEmailInvitations\s*=\s*onCall/;

function isolatedEntrypoint(source){
  const blocks=DEFINITIONS.map(([name,nextMarker])=>{
    const marker='export const '+name+'=onCall(';
    const start=source.indexOf(marker);
    const end=source.indexOf(nextMarker,start);
    if(start<0||end<=start||
       source.indexOf(marker,start+1)!==-1||
       source.indexOf(nextMarker,end+1)!==-1)
      die('Unreviewed campaign callable boundary: '+name);
    const block=source.slice(start,end).trim();
    if((block.match(/export const /g)||[]).length!==1||
       !block.includes("region:'us-central1'")||
       !block.includes('maxInstances:3')||
       !block.includes('request.auth')||
       !block.endsWith('});')||
       BLOCKED.test(block))
      die('Campaign callable changed; review source before deploying '+name);
    return block;
  });
  const result=[
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';",
    'if(!getApps().length)initializeApp();',
    ...blocks,''
  ].join('\n\n');
  if((result.match(/export const /g)||[]).length!==5||BLOCKED.test(result))
    die('Isolated entrypoint must export exactly five secret-free callables.');
  return result;
}

function collectDependencies(files){
  const queue=['functions/index.mjs'];
  const seen=new Set();
  // All reviewed relative JS imports in this package use literal .mjs paths.
  const refs=/(["'])(\.{1,2}\/[^"'\s]+\.mjs)\1/g;
  while(queue.length){
    const filename=queue.shift();
    if(seen.has(filename))continue;
    seen.add(filename);
    const body=files[filename];
    if(!body||/\bimport\s*\(\s*[^"'\s]/.test(body)||
       /\brequire\s*\(/.test(body))
      die('Unreviewed dynamic module dependency: '+filename);
    for(const match of body.matchAll(refs)){
      const absolute=resolve(dirname(join(ROOT,filename)),match[2]);
      const path=relative(ROOT,absolute).replace(/\\/g,'/');
      if(!(/^(functions\/|src\/state\/)/.test(path))||
         !path.endsWith('.mjs')||path.startsWith('..'))
        die('Unreviewed module outside campaign source scope: '+path);
      if(!Object.hasOwn(files,path)){
        let imported;
        try{imported=read(path);}catch{die('Missing required runtime module: '+path);}
        if(BLOCKED.test(imported))
          die('Campaign runtime would import unrelated email or signing secrets: '+path);
        files[path]=imported;
      }
      queue.push(path);
    }
  }
  return files;
}

export function buildCampaignCoreRelease(source=read('functions/index.mjs')){
  const current=JSON.parse(read('firebase.json'));
  const functions=Array.isArray(current.functions)?current.functions:[current.functions];
  const rootPkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  const admin=lock.packages?.['node_modules/firebase-admin']?.version;
  const sdk=lock.packages?.['node_modules/firebase-functions']?.version;
  if(functions.length!==1||functions[0]?.source!=='.'||
     functions[0]?.codebase!=='asteria'||
     functions[0]?.runtime!=='nodejs22'||
     rootPkg.main!=='functions/index.mjs'||rootPkg.engines?.node!=='22'||
     admin!=='14.5.0'||sdk!=='7.4.0')
    die('Unreviewed source codebase or production dependency versions.');
  const isolated=isolatedEntrypoint(source);
  const files={
    'firebase.json':JSON.stringify({functions:[{
      source:'.',codebase:'asteria',runtime:'nodejs22',
      ignore:['node_modules','.git','.env','.env.*','*.log']
    }]},null,2)+'\n',
    'package.json':JSON.stringify({
      name:'asteria-campaign-core-scoped-release',version:'1.0.0',private:true,type:'module',
      main:'functions/index.mjs',engines:{node:'22'},
      dependencies:{'firebase-admin':admin,'firebase-functions':sdk}
    },null,2)+'\n',
    'functions/index.mjs':isolated
  };
  collectDependencies(files);
  if(Object.keys(files).some(path=>path.includes('.env'))||
     Object.values(files).some(body=>BLOCKED.test(body)))
    die('Production stage unexpectedly contains a feature environment or secret.');
  return {files,targets:[...CAMPAIGN_CORE_TARGETS],
    selector:CAMPAIGN_CORE_TARGETS.map(name=>'functions:asteria:'+name).join(',')};
}

export function stageCampaignCoreRelease(env=process.env,mode='production'){
  const validProduction=mode==='production'&&
    env.GITHUB_REF==='refs/heads/main'&&
    env.GITHUB_EVENT_NAME==='workflow_dispatch'&&
    env.ASTERIA_CAMPAIGN_OPERATION==='campaign-backend-deploy'&&
    env.ASTERIA_CAMPAIGN_CONFIRMATION==='DEPLOY-ASTERIA-CAMPAIGN-BACKEND'&&
    env.ASTERIA_DEPLOY_PROJECT==='asteria-ttrpg';
  const validCi=mode==='ci'&&env.CI==='true'&&
    ['pull_request','push'].includes(env.GITHUB_EVENT_NAME);
  if(env.GITHUB_ACTIONS!=='true'||!isAbsolute(env.RUNNER_TEMP||'')||
     !(validProduction||validCi))
    die('Manual main-only production approval or trusted CI event required before staging.');
  const dir=join(env.RUNNER_TEMP,'asteria-campaign-core-release');
  if(existsSync(dir))die('Refusing to overwrite an existing campaign release directory.');
  const result=buildCampaignCoreRelease();
  for(const [path,content] of Object.entries(result.files)){
    const destination=join(dir,path);
    mkdirSync(dirname(destination),{recursive:true});
    writeFileSync(destination,content);
  }
  return {directory:dir,targets:result.targets,paths:Object.keys(result.files)};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check'){
      const release=buildCampaignCoreRelease();
      console.log(JSON.stringify({ready:true,productionChanged:false,
        targets:release.targets,paths:Object.keys(release.files)}));
    }else if(['--stage','--stage-ci'].includes(process.argv[2])){
      const stage=stageCampaignCoreRelease(process.env,
        process.argv[2]==='--stage'?'production':'ci');
      console.log(JSON.stringify(stage));
    }else die('Choose --check, --stage or --stage-ci.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
