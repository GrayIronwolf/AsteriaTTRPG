// Phase 5.3: prepare one-function releases; never run deployment implicitly.
// The existing GitHub Actions WIF workflow is the only production executor.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewFunctionEnvironment} from './firebase-runtime-env-review.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=p=>readFileSync(join(ROOT,p),'utf8');
const fail=m=>{throw Error(m);};
const operations=Object.freeze({
  'campaign-friends-recipients-deploy-off':['recipients',false,'DEPLOY-ASTERIA-CAMPAIGN-FRIEND-RECIPIENTS-OFF'],
  'campaign-friends-recipients-enable':['recipients',true,'ENABLE-ASTERIA-CAMPAIGN-FRIEND-RECIPIENTS'],
  'campaign-friends-recipients-disable':['recipients',false,'DISABLE-ASTERIA-CAMPAIGN-FRIEND-RECIPIENTS'],
  'campaign-friends-invites-deploy-off':['invites',false,'DEPLOY-ASTERIA-CAMPAIGN-FRIEND-INVITES-OFF'],
  'campaign-friends-invites-enable':['invites',true,'ENABLE-ASTERIA-CAMPAIGN-FRIEND-INVITES'],
  'campaign-friends-invites-disable':['invites',false,'DISABLE-ASTERIA-CAMPAIGN-FRIEND-INVITES']
});
const secureFlags=[
  'ASTERIA_SECURE_INVITATIONS_ENABLED','ASTERIA_INVITATION_ACCEPTANCE_ENABLED',
  'ASTERIA_INVITATION_MANAGER_ENABLED','ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED',
  'ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED',
  'ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED'
];
const marker={
  recipients:{
    begin:'// Friends Phase 5.1: read-only campaign recipient selection.',
    end:'// Phase 4.1 Friends: private social inbox, independently gated from campaigns.',
    name:'asteriaCampaignFriendRecipients',
    required:[
      'functions/campaignFriendRecipients.mjs',
      'functions/friendAccountLookup.mjs','functions/friendRequestInbox.mjs',
      'functions/friendRelationshipModel.mjs'
    ]},
  invites:{
    begin:'// Phase 6.1: server-only issuance.',
    end:'// Phase 7.3: account-scoped in-app notification inbox.',
    name:'asteriaSecureInvitation',
    required:[
      'functions/campaignSecureInvitations.mjs',
      'functions/campaignInvitationAcceptance.mjs',
      'functions/campaignInvitationManager.mjs',
      'functions/campaignMembership.mjs',
      'functions/campaignNotifications.mjs',
      'functions/campaignFriendInvitations.mjs',
      'functions/friendAccountLookup.mjs','functions/friendRelationshipModel.mjs'
    ]}
};
function isolatedSource(kind,source=read('functions/index.mjs')){
  const spec=marker[kind];
  if(!spec)fail('Unexpected function type.');
  const a=source.indexOf(spec.begin),b=source.indexOf(spec.end);
  if(a<0||b<=a||source.indexOf(spec.begin,a+1)!==-1||
     source.indexOf(spec.end,b+1)!==-1)
    fail('Isolated callable source boundaries changed.');
  const block=source.slice(a,b).trim();
  if((block.match(/export const /g)||[]).length!==1||
     !block.includes('export const '+spec.name+'=onCall({')||
     !block.includes('region:\x27us-central1\x27')||
     !block.includes('maxInstances:3')||
     !block.includes('request.auth'))
    fail('Function isolation no longer matches reviewed source.');
  if(kind==='recipients'){
    if(!block.includes("process.env.ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED!=='1'")||
       !block.includes("await import('./campaignFriendRecipients.mjs')")||
       /defineSecret|asteriaSecureInvitation|AST[ERIA]+_SECURE_INVITATIONS_ENABLED/.test(block))
      fail('Unexpected recipient callable changes.');
  }else if(!block.includes("defineSecret('ASTERIA_SECURE_INVITE_SIGNING_KEY')")||
     !block.includes('secrets:[secureInvitationSigningKey]')||
     !block.includes("process.env.ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED!=='1'")||
     !block.includes("process.env.ASTERIA_SECURE_INVITATIONS_ENABLED!=='1'")||
     !block.includes("process.env.ASTERIA_INVITATION_ACCEPTANCE_ENABLED!=='1'")||
     !block.includes("process.env.ASTERIA_INVITATION_MANAGER_ENABLED!=='1'")||
     !block.includes("await import('./campaignFriendInvitations.mjs')")||
     !block.includes("await import('./campaignInvitationAcceptance.mjs')"))
    fail('Unexpected signed invitation or activation guard changes.');
  const imports=[
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {getAuth} from 'firebase-admin/auth';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';"
  ];
  if(kind==='invites')imports.push("import {defineSecret} from 'firebase-functions/params';");
  return [...imports,'if(!getApps().length)initializeApp();',block,''].join('\n');
}

export function parsePhase53LiveState(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     typeof value.exists!=='boolean'||
     !value.env||typeof value.env!=='object'||Array.isArray(value.env))
    fail('Live Cloud Function metadata requires reconciliation.');
  const result={exists:value.exists,env:reviewFunctionEnvironment(value.env,secureFlags)};
  if(!result.exists&&Object.keys(result.env).length)
    fail('Absent Cloud Function has a nonempty environment.');
  return result;
}
export function buildPhase53Release(operation,{
  live={exists:false,env:{}},recipientReady=false,acceptanceReady=false
}={}){
  const choice=operations[operation];
  if(!choice)fail('Unknown Phase 5.3 operation.');
  const [kind,enabled]=choice;
  const spec=marker[kind];
  const previous=parsePhase53LiveState(live);
  const isInitial=operation.endsWith('-deploy-off');
  if(!isInitial&&!previous.exists)
    fail('Cannot activate or disable a function that has never been deployed.');
  if(isInitial&&kind==='recipients'&&previous.env.ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED==='1')
    fail('Disabled deploy would interrupt an active recipient service.');
  const next={...previous.env};
  if(kind==='recipients'){
    if(Object.keys(next).some(k=>k!=='ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED'))
      fail('Recipient service contains unexpected other feature flags.');
    next.ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED=enabled?'1':'0';
  }else{
    for(const f of secureFlags)next[f]=next[f]||'0';
    if(isInitial&&next.ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED==='1')
      fail('Disabled deploy would interrupt existing direct friend invitations.');
    if(enabled&&(!recipientReady||!acceptanceReady||
       next.ASTERIA_SECURE_INVITATIONS_ENABLED!=='1'||
       next.ASTERIA_INVITATION_ACCEPTANCE_ENABLED!=='1'||
       next.ASTERIA_INVITATION_MANAGER_ENABLED!=='1'))
      fail('Existing campaign v2 issuance, acceptance, manager and recipient service must be verified active.');
    next.ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED=enabled?'1':
      next.ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED;
    next.ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED=enabled?'1':'0';
  }
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  const admin=lock.packages?.['node_modules/firebase-admin']?.version;
  const sdk=lock.packages?.['node_modules/firebase-functions']?.version;
  if(pkg.engines?.node!=='22'||admin!=='14.5.0'||sdk!=='7.4.0')
    fail('Unreviewed production dependencies.');
  const site=read('index.html');
  const assignment=site.match(/window\.AsteriaFeatureFlags = Object\.freeze\(\{([^}\n]*)\}\);/);
  const canary="new URLSearchParams(window.location.search).get('campaign-inapp-canary')==='1'";
  const siteFlags=assignment?.[1]||'';
  const safeGate=key=>siteFlags.includes(key+':false')||
    (siteFlags.includes(key+':'+canary)&&
      siteFlags.includes('campaignInAppCanary:'+canary));
  if(!safeGate('campaignFriendRecipients')||
     !safeGate('campaignFriendInvitations')||
     !siteFlags.includes('friendNotificationsEnabled:true'))
    fail('Website gates or existing friends notifications changed unexpectedly.');
  const files={
    'firebase.json':JSON.stringify({functions:[{source:'functions',codebase:'asteria',runtime:'nodejs22'}]},null,2)+'\n',
    'functions/package.json':JSON.stringify({
      name:'asteria-friends-phase53-'+kind,private:true,type:'module',
      main:'index.mjs',engines:{node:'22'},
      dependencies:{'firebase-admin':admin,'firebase-functions':sdk}
    },null,2)+'\n',
    'functions/.env.asteria-ttrpg':Object.entries(next).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,v])=>k+'='+v+'\n').join(''),
    'functions/index.mjs':isolatedSource(kind)
  };
  for(const f of spec.required)files[f]=read(f);
  if((files['functions/index.mjs'].match(/export const /g)||[]).length!==1||
     !files['functions/index.mjs'].includes('export const '+spec.name+'=onCall('))
    fail('Refusing multi-function production release.');
  return {files,functionName:spec.name,enabled,operation,kind};
}
export function stagePhase53Release(env=process.env,operation){
  const approval=operations[operation];
  if(!approval||env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_DEPLOY_PROJECT!=='asteria-ttrpg'||
     env.ASTERIA_PHASE53_OPERATION!==operation||
     env.ASTERIA_PHASE53_CONFIRMATION!==approval[2]||
     !isAbsolute(env.RUNNER_TEMP||'')||
     !isAbsolute(env.ASTERIA_PHASE53_LIVE_FILE||'')||
     !resolve(env.ASTERIA_PHASE53_LIVE_FILE).startsWith(resolve(env.RUNNER_TEMP)+'/'))
    fail('Phase 5.3 production staging requires exact main-only manual approval.');
  const live=JSON.parse(readFileSync(env.ASTERIA_PHASE53_LIVE_FILE,'utf8'));
  const packageDetails=buildPhase53Release(operation,{
    live,
    recipientReady:env.ASTERIA_PHASE53_RECIPIENT_READY==='1',
    acceptanceReady:env.ASTERIA_PHASE53_ACCEPTANCE_READY==='1'
  });
  const directory=join(env.RUNNER_TEMP,'asteria-phase53-'+packageDetails.kind);
  if(existsSync(directory))fail('Release directory already exists.');
  for(const [name,body] of Object.entries(packageDetails.files)){
    const path=join(directory,name);
    mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,body);
  }
  return {...packageDetails,directory,files:Object.keys(packageDetails.files)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check'){
      const details=Object.keys(operations).map(operation=>{
        const kind=operations[operation][0];
        const initiallyAbsent=operation.endsWith('-deploy-off');
        const live={exists:!initiallyAbsent,
          env:initiallyAbsent?{}:kind==='invites'?{
            ASTERIA_SECURE_INVITATIONS_ENABLED:'1',
            ASTERIA_INVITATION_ACCEPTANCE_ENABLED:'1',
            ASTERIA_INVITATION_MANAGER_ENABLED:'1'
          }:{ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED:'0'}};
        const info=buildPhase53Release(operation,{
          live,recipientReady:true,acceptanceReady:true
        });
        return {operation,functionName:info.functionName,enabled:info.enabled,
          files:Object.keys(info.files)};
      });
      console.log(JSON.stringify({ready:true,productionChanged:false,details}));
    }else if(process.argv[2]==='--stage'){
      const info=stagePhase53Release(process.env,process.argv[3]);
      console.log(JSON.stringify({operation:info.operation,directory:info.directory,
        target:info.functionName,enabled:info.enabled,
        files:info.files}));
    }else fail('Unknown Phase 5.3 release command.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
