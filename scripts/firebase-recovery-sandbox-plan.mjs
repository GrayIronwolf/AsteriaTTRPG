/**
 * Asteria Step 3.1: offline-only Firebase recovery sandbox preparation.
 *
 * Validates repository files, not a Google Cloud project. It cannot create
 * resources, issue credentials, inspect production data, restore, or deploy.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const readRepo=path=>readFileSync(resolve(root,path),'utf8');

export const SANDBOX_CLOUD_PROJECT_PATTERN=/^asteria-recovery-[a-z0-9]{6,12}$/;
export const PREPARATION_MANIFEST_PATH='config/firebase-recovery-sandbox.plan.json';
export const FIRESTORE_RULES_PATH='config/firebase-recovery-sandbox/firestore.deny.rules';
export const STORAGE_RULES_PATH='config/firebase-recovery-sandbox/storage.deny.rules';
const WORKFLOW_PATH='.github/workflows/firebase-recovery-sandbox-plan.yml';
const PRODUCTION_WORKFLOW_PATH='.github/workflows/firebase-deploy.yml';

const expectedManifest={
  schemaVersion:1,purpose:'asteria-firebase-recovery-step-3-1',
  status:'unprovisioned',executionMode:'offline-plan-only',
  productionProjectId:'asteria-ttrpg',
  localEmulatorProjectId:'demo-asteria',
  sandboxProjectId:null,sandboxLocation:null,
  dataPolicy:'synthetic-only',
  firestore:{
    rulesTemplate:FIRESTORE_RULES_PATH,
    databaseProvisioned:false,backupImported:false
  },
  storage:{
    rulesTemplate:STORAGE_RULES_PATH,
    bucketProvisioned:false,artworkCopied:false
  },
  authentication:{
    providerConfigured:false,
    realUserAccountsAllowed:false,outboundEmailEnabled:false
  },
  integrations:{
    cloudFunctionsDeployed:false,publicHostingEnabled:false,
    emailProviderEnabled:false,webhooksEnabled:false,
    productionFirebaseConfigReuse:false
  },
  security:{
    productionServiceAccountReuse:false,
    productionWorkloadIdentityReuse:false,
    productionOAuthClientReuse:false,
    productionBucketReuse:false,
    credentialsProvisioned:false,
    productionWritesAllowed:false,
    realBackupExportAllowed:false,
    restorationAllowed:false
  },
  approvals:{
    projectCreationApproved:false,billingBudgetApproved:false,
    budgetAlertsConfigured:false,leastPrivilegeIAMReviewed:false,
    sandboxIsolationVerified:false,cleanupPlanApproved:false,
    realDataRestoreApproved:false
  }
};

function isRecord(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function exactPolicy(value,policy){
  if(!isRecord(policy))return value===policy;
  if(!isRecord(value))return false;
  const keys=Object.keys(policy);
  if(keys.length!==Object.keys(value).length)return false;
  return keys.every(key=>Object.prototype.hasOwnProperty.call(value,key)&&
    exactPolicy(value[key],policy[key]));
}
function normalizeRules(source){return source.replace(/\s+/g,'');}
const EXPECTED_FIRESTORE=normalizeRules(`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}`);
const EXPECTED_STORAGE=normalizeRules(`rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} { allow read, write: if false; }
  }
}`);

export function validFutureSandboxId(projectId){
  return typeof projectId==='string'&&
    SANDBOX_CLOUD_PROJECT_PATTERN.test(projectId)&&
    projectId!=='asteria-ttrpg'&&
    !projectId.startsWith('demo-');
}
const check=(name,pass)=>({name,pass:pass===true});
const load=(read,name)=>JSON.parse(read(name));

export function inspectSandboxPreparation({
  manifest=undefined,read=readRepo
}={}){
  const plan=manifest===undefined?load(read,PREPARATION_MANIFEST_PATH):manifest;
  const projects=load(read,'.firebaserc');
  const firebase=load(read,'firebase.json');
  const productionWorkflow=read(PRODUCTION_WORKFLOW_PATH);
  const manualWorkflow=read(WORKFLOW_PATH);
  const index=read('index.html');

  const checks=[
    check('only-unprovisioned-synthetic-plan',exactPolicy(plan,expectedManifest)),
    check('sandbox-project-not-provisioned',plan?.sandboxProjectId===null&&
      plan?.sandboxLocation===null),
    check('production-and-emulator-projects-remain-separate',
      isRecord(projects.projects)&&
      projects.projects.default==='demo-asteria'&&
      projects.projects.production==='asteria-ttrpg'&&
      !Object.prototype.hasOwnProperty.call(projects.projects,'recovery')&&
      !Object.prototype.hasOwnProperty.call(projects.projects,'sandbox')),
    check('live-firebase-config-not-replaced',
      firebase?.firestore?.rules==='firestore.rules'&&
      firebase?.firestore?.indexes==='firestore.indexes.json'&&
      firebase?.storage?.rules==='storage.rules'&&
      Array.isArray(firebase.functions)&&firebase.functions.length>0&&
      firebase?.emulators?.singleProjectMode===true&&
      firebase?.emulators?.auth?.port===9099&&
      firebase?.emulators?.firestore?.port===8080&&
      firebase?.emulators?.storage?.port===9199),
    check('firestore-template-denies-every-request',
      normalizeRules(read(FIRESTORE_RULES_PATH))===EXPECTED_FIRESTORE),
    check('storage-template-denies-every-request',
      normalizeRules(read(STORAGE_RULES_PATH))===EXPECTED_STORAGE),
    check('offline-workflow-no-cloud-or-credentials',
      manualWorkflow.startsWith('name: Firebase recovery sandbox preparation (offline)\non:\n  workflow_dispatch:\n')&&
      manualWorkflow.includes('permissions:\n  contents: read\n')&&
      manualWorkflow.includes('node --test scripts/firebase-recovery-sandbox-plan.test.mjs')&&
      manualWorkflow.includes('node scripts/firebase-recovery-sandbox-plan.mjs --check')&&
      !/\b(id-token|environment|secrets|vars|gcloud|firebase deploy|firebase emulators:exec|workload_identity_provider|service_account)\b/i.test(manualWorkflow)&&
      !/^\s{2}(push|pull_request|schedule|workflow_run):/m.test(manualWorkflow)),
    check('existing-production-deploy-stays-manual-and-confirmed',
      productionWorkflow.includes('workflow_dispatch:')&&
      productionWorkflow.includes("inputs.production_confirmation == 'DEPLOY-ASTERIA-PRODUCTION'")&&
      productionWorkflow.includes('firebase deploy --project asteria-ttrpg')&&
      !productionWorkflow.includes('asteria-recovery-')),
    check('web-feature-flags-still-disabled',
      index.includes('accountIds:true')&&
      index.includes('campaignNotifications:false'))
  ];
  const safe=checks.every(entry=>entry.pass);
  return {
    safe,decision:safe?'PREPARATION-ONLY / CLOUD-UNVERIFIED':'NO-GO',
    checks,
    cloudProjectCreated:false,
    cloudIsolationVerified:false,
    cloudCredentialsUsed:false,
    deploymentPerformed:false,
    productionDataAccessed:false,
    backupRestored:false,
    accountIdsActivated:false,
    nextGate:'Explicit approval, independently provisioned sandbox, billing/IAM review and proof of isolation'
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3||process.argv[2]!=='--check')
      throw Error('Only the offline --check mode is supported.');
    const result=inspectSandboxPreparation();
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(!result.safe)process.exitCode=1;
  }catch{
    process.stderr.write('NO-GO: offline sandbox preparation validation failed.\n');
    process.exitCode=1;
  }
}
