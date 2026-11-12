/**
 * Isolated Asteria in-app campaign notification callable installation.
 * No email provider, Resend key, signing secret or invitation sender.
 * All feature gates remain disabled until the v2 release is approved.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(join(ROOT,path),'utf8');
const fail=message=>{throw Error('Campaign notification-only release: '+message);};
export const CHANNEL_TARGETS=Object.freeze(['asteriaCampaignNotifications']);
export const CHANNEL_OPERATION='campaign-notifications-deploy-disabled';
export const CHANNEL_CONFIRMATION='DEPLOY-ASTERIA-CAMPAIGN-NOTIFICATIONS-DISABLED';
export function buildCampaignChannelsRelease(source=read('functions/index.mjs')){
  const cfg=JSON.parse(read('firebase.json'));
  const f=Array.isArray(cfg.functions)?cfg.functions:[cfg.functions];
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  const admin=lock.packages?.['node_modules/firebase-admin']?.version;
  const functions=lock.packages?.['node_modules/firebase-functions']?.version;
  if(f.length!==1||f[0]?.source!=='.'||f[0]?.codebase!=='asteria'||
     f[0]?.runtime!=='nodejs22'||pkg.engines?.node!=='22'||
     admin!=='14.5.0'||functions!=='7.4.0')fail('Unreviewed Firebase runtime.');
  const a=source.indexOf('export const asteriaCampaignNotifications=onCall(');
  const b=source.indexOf('// Phase 2.2: prepares member records only.',a);
  if(a<0||b<=a||source.indexOf('export const asteriaCampaignNotifications=onCall(',a+1)!==-1)
    fail('Approved notification callable boundaries changed.');
  const block=source.slice(a,b).trim();
  if(!block.endsWith('});')||!block.includes("region:'us-central1'")||
     !block.includes('maxInstances:3')||
     !block.includes("process.env.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED!=='1'")||
     !block.includes("await import('./campaignNotifications.mjs')")||
     (block.match(/export const /g)||[]).length!==1||
     /asteriaResendApiKeySecret|ASTERIA_RESEND_API_KEY|campaignEmailInvitations/.test(block))
    fail('Notification callable scope or safeguards changed.');
  const index=[
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';",
    "if(!getApps().length)initializeApp();",block,''
  ].join('\n\n');
  const files={
    'firebase.json':JSON.stringify({functions:[{
      source:'functions',codebase:'asteria',runtime:'nodejs22'
    }]},null,2)+'\n',
    'functions/package.json':JSON.stringify({
      name:'asteria-campaign-notifications-scoped',version:'1.0.0',
      private:true,type:'module',main:'index.mjs',engines:{node:'22'},
      dependencies:{'firebase-admin':admin,'firebase-functions':functions}
    },null,2)+'\n',
    'functions/.env.asteria-ttrpg':'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED=0\n',
    'functions/index.mjs':index,
    'functions/campaignNotifications.mjs':read('functions/campaignNotifications.mjs')
  };
  for(const [name,body] of Object.entries(files)){
    if(/ASTERIA_RESEND_API_KEY|asteriaResendApiKeySecret|campaignEmailInvitations|https:\/\/api\.resend\.com/.test(body))
      fail('Email service must not be in notification package: '+name);
  }
  return {files,targets:[...CHANNEL_TARGETS],selector:'functions:asteria:asteriaCampaignNotifications'};
}
export function stageCampaignChannelsRelease(env=process.env){
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REPOSITORY!=='GrayIronwolf/AsteriaTTRPG'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'||
     env.ASTERIA_CHANNELS_OPERATION!==CHANNEL_OPERATION||
     env.ASTERIA_CHANNELS_CONFIRMATION!==CHANNEL_CONFIRMATION||
     !isAbsolute(env.RUNNER_TEMP||''))fail('Exact reviewed dispatch required.');
  const dir=join(env.RUNNER_TEMP,'asteria-campaign-notifications-disabled');
  if(existsSync(dir))fail('Staging destination already exists.');
  const built=buildCampaignChannelsRelease();
  for(const [name,body] of Object.entries(built.files)){
    const dst=join(dir,name);mkdirSync(dirname(dst),{recursive:true});
    writeFileSync(dst,body);
  }
  return {directory:dir,targets:built.targets,paths:Object.keys(built.files)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check'){
      const data=buildCampaignChannelsRelease();
      console.log(JSON.stringify({verified:true,targets:data.targets,
        paths:Object.keys(data.files),productionChanged:false}));
    }else if(process.argv[2]==='--stage'){
      const data=stageCampaignChannelsRelease();
      console.log(JSON.stringify({staged:true,targets:data.targets,paths:data.paths}));
    }else fail('Choose --check or --stage.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
