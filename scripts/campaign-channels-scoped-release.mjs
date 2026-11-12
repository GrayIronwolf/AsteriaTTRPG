/**
 * Stages exactly two optional Campaign v2 communication callables with all
 * delivery and notification feature gates OFF. Never invokes Firebase.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(join(ROOT,path),'utf8');
const fail=message=>{throw Error('Campaign channels release: '+message);};
export const CHANNEL_TARGETS=Object.freeze([
  'asteriaCampaignNotifications','asteriaCampaignEmailInvitations'
]);
export const CHANNEL_OPERATION='campaign-channels-deploy-disabled';
export const CHANNEL_CONFIRMATION='DEPLOY-ASTERIA-CAMPAIGN-CHANNELS-DISABLED';
const requiredModules=Object.freeze([
  'functions/campaignNotifications.mjs',
  'functions/campaignEmailInvitations.mjs',
  'functions/campaignSecureInvitations.mjs',
  'functions/campaignInvitationManager.mjs',
  'functions/campaignEmailTransport.mjs',
  'functions/campaignEmailSecrets.mjs'
]);
const disabledGates=Object.freeze({
  ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED:'0',
  ASTERIA_EMAIL_INVITATION_CONTROLS_ENABLED:'0',
  ASTERIA_EMAIL_DELIVERY_ENABLED:'0',
  ASTERIA_SECURE_INVITATIONS_ENABLED:'0'
});

function reviewedBlock(source,name,endMarker){
  const marker='export const '+name+'=onCall(';
  const begin=source.indexOf(marker);
  const end=source.indexOf(endMarker,begin);
  if(begin<0||end<=begin||source.indexOf(marker,begin+1)!==-1)
    fail('Callable boundaries changed: '+name);
  const text=source.slice(begin,end).trim();
  if((text.match(/export const /g)||[]).length!==1||
     !text.endsWith('});')||!text.includes("region:'us-central1'")||
     !text.includes('maxInstances:3')||!text.includes('request.auth'))
    fail('Callable source contract changed: '+name);
  return text;
}
function isolatedSource(source){
  const notifications=reviewedBlock(source,CHANNEL_TARGETS[0],
    '// Phase 7.2: GM email sends and token-rotating replacements.');
  const email=reviewedBlock(source,CHANNEL_TARGETS[1],
    '// Phase 2.2: prepares member records only.');
  if(!notifications.includes("process.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED!=='1'")||
     !email.includes("process.env.ASTERIA_EMAIL_INVITATION_CONTROLS_ENABLED!=='1'")||
     !email.includes("process.env.ASTERIA_EMAIL_DELIVERY_ENABLED!=='1'")||
     !email.includes("process.env.ASTERIA_SECURE_INVITATIONS_ENABLED!=='1'")||
     !email.includes('secrets:[secureInvitationSigningKey,asteriaResendApiKeySecret]')||
     !notifications.includes("await import('./campaignNotifications.mjs')")||
     !email.includes("await import('./campaignEmailInvitations.mjs')"))
    fail('Required notification/email authorization gates changed.');
  const sections=[
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {getAuth} from 'firebase-admin/auth';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';",
    "import {defineSecret} from 'firebase-functions/params';",
    "import {asteriaResendApiKeySecret} from './campaignEmailSecrets.mjs';",
    "if(!getApps().length)initializeApp();",
    "const secureInvitationSigningKey=defineSecret('ASTERIA_SECURE_INVITE_SIGNING_KEY');",
    notifications,email,''
  ];
  const index=sections.join('\n\n');
  if((index.match(/export const /g)||[]).length!==2)fail('Expected exactly two callable exports.');
  return index;
}
function verifyDependencies(files){
  const allowed=new Set(requiredModules);
  const imports=/(['"])(\.\/[^'"\s]+\.mjs)\1/g;
  for(const [name,body] of Object.entries(files)){
    if(!name.endsWith('.mjs'))continue;
    if(/\brequire\s*\(/.test(body)||/\bimport\s*\(\s*[^'"\s]/.test(body))
      fail('Unreviewed computed import in: '+name);
    for(const match of body.matchAll(imports)){
      const abs=resolve(dirname(join(ROOT,name)),match[2]);
      const relative=abs.slice(ROOT.length+1).replace(/\\/g,'/');
      if(!allowed.has(relative))fail('Unreviewed dependency: '+relative);
    }
  }
}
export function buildCampaignChannelsRelease(source=read('functions/index.mjs')){
  const cfg=JSON.parse(read('firebase.json'));
  const entries=Array.isArray(cfg.functions)?cfg.functions:[cfg.functions];
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  const admin=lock.packages?.['node_modules/firebase-admin']?.version;
  const functions=lock.packages?.['node_modules/firebase-functions']?.version;
  if(entries.length!==1||entries[0]?.source!=='.'||
     entries[0]?.codebase!=='asteria'||entries[0]?.runtime!=='nodejs22'||
     pkg.engines?.node!=='22'||admin!=='14.5.0'||functions!=='7.4.0')
    fail('Unreviewed Firebase source/dependency versions.');
  const files={
    'firebase.json':JSON.stringify({functions:[{
      source:'functions',codebase:'asteria',runtime:'nodejs22'
    }]},null,2)+'\n',
    'functions/package.json':JSON.stringify({
      name:'asteria-campaign-channels-scoped',version:'1.0.0',
      private:true,type:'module',main:'index.mjs',
      engines:{node:'22'},
      dependencies:{'firebase-admin':admin,'firebase-functions':functions}
    },null,2)+'\n',
    'functions/.env.asteria-ttrpg':Object.entries(disabledGates)
      .sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>key+'='+value+'\n').join(''),
    'functions/index.mjs':isolatedSource(source)
  };
  for(const name of requiredModules)files[name]=read(name);
  verifyDependencies(files);
  return {files,targets:[...CHANNEL_TARGETS],
    selector:CHANNEL_TARGETS.map(name=>'functions:asteria:'+name).join(',')};
}
export function stageCampaignChannelsRelease(env=process.env){
  if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='GrayIronwolf/AsteriaTTRPG'||
     env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'||
     env.ASTERIA_CHANNELS_OPERATION!==CHANNEL_OPERATION||
     env.ASTERIA_CHANNELS_CONFIRMATION!==CHANNEL_CONFIRMATION||
     !isAbsolute(env.RUNNER_TEMP||''))
    fail('Exact approved production dispatch is required.');
  const dir=join(env.RUNNER_TEMP,'asteria-campaign-channels-disabled');
  if(existsSync(dir))fail('Staging destination already exists.');
  const staged=buildCampaignChannelsRelease();
  for(const [name,content] of Object.entries(staged.files)){
    const path=join(dir,name);
    mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,content);
  }
  return {directory:dir,targets:staged.targets,paths:Object.keys(staged.files)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check'){
      const result=buildCampaignChannelsRelease();
      console.log(JSON.stringify({verified:true,targets:result.targets,
        paths:Object.keys(result.files),productionChanged:false}));
    }else if(process.argv[2]==='--stage'){
      const result=stageCampaignChannelsRelease();
      console.log(JSON.stringify({staged:true,targets:result.targets,paths:result.paths}));
    }else fail('Choose --check or --stage.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
