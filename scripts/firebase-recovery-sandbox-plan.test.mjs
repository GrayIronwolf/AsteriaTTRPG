import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  inspectSandboxPreparation,validFutureSandboxId,
  SANDBOX_CLOUD_PROJECT_PATTERN
} from './firebase-recovery-sandbox-plan.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest=()=>JSON.parse(read('config/firebase-recovery-sandbox.plan.json'));
const altered=(path,replace)=>name=>name===path?replace(read(name)):read(name);

test('default plan is offline only and makes no claim of cloud isolation',()=>{
  const result=inspectSandboxPreparation();
  assert.equal(result.safe,true,JSON.stringify(result.checks));
  assert.equal(result.decision,'PREPARATION-ONLY / CLOUD-UNVERIFIED');
  assert.equal(result.cloudProjectCreated,false);
  assert.equal(result.cloudIsolationVerified,false);
  assert.equal(result.cloudCredentialsUsed,false);
  assert.equal(result.deploymentPerformed,false);
  assert.equal(result.productionDataAccessed,false);
  assert.equal(result.backupRestored,false);
  assert.equal(result.accountIdsActivated,false);
});
test('sandbox plan rejects every premature approval or resource change',()=>{
  const fields={
    status:'ready',
    executionMode:'restore',
    sandboxProjectId:'asteria-recovery-abcdef',
    sandboxLocation:'australia-southeast1',
    dataPolicy:'production',
    firestore:{databaseProvisioned:true},
    storage:{bucketProvisioned:true},
    authentication:{outboundEmailEnabled:true},
    integrations:{cloudFunctionsDeployed:true},
    security:{cloudCredentialsAllowed:true,productionWritesAllowed:true,
      realBackupExportAllowed:true,restoreAuthorized:true},
    approvals:{projectCreationApproved:true,realDataRestoreApproved:true}
  };
  for(const [field,values] of Object.entries(fields)){
    for(const [key,value] of Object.entries(
      values!==null&&typeof values==='object'?values:{[field]:values})){
      const plan=manifest();
      if(field==='status'||field==='executionMode'||field==='sandboxProjectId'||
         field==='sandboxLocation'||field==='dataPolicy')plan[field]=value;
      else plan[field][key]=value;
      assert.equal(inspectSandboxPreparation({manifest:plan}).safe,false,
        field+'.'+key);
    }
  }
});
test('unexpected extra plan fields fail closed',()=>{
 const plan=manifest();plan.credentials={key:'placeholder'};
 assert.equal(inspectSandboxPreparation({manifest:plan}).safe,false);
});
test('only clearly distinct sandbox project identifiers can be considered later',()=>{
 for(const id of ['asteria-recovery-a1b2c3','asteria-recovery-abc123xy'])
   assert.equal(validFutureSandboxId(id),true,id);
 for(const id of ['asteria-ttrpg','demo-asteria','demo-asteria-recovery-sample',
   'asteria-recovery-a','asteria-recovery-ABC123','asteria-recovery-prod!',
   'asteria-recovery-abcdefghijklm',null,''])
   assert.equal(validFutureSandboxId(id),false,String(id));
 assert.ok(SANDBOX_CLOUD_PROJECT_PATTERN.test('asteria-recovery-abc123'));
});
test('live production and emulator config are not modified by the preparation',()=>{
 const original=JSON.parse(read('.firebaserc'));
 assert.deepEqual(original.projects,{default:'demo-asteria',production:'asteria-ttrpg'});
 const config=JSON.parse(read('firebase.json'));
 assert.equal(config.firestore.rules,'firestore.rules');
 assert.equal(config.storage.rules,'storage.rules');
 assert.equal(config.emulators.singleProjectMode,true);
});
test('any Firestore or Storage access in sandbox templates is rejected',()=>{
 const fire='config/firebase-recovery-sandbox/firestore.deny.rules';
 const storage='config/firebase-recovery-sandbox/storage.deny.rules';
 for(const name of [fire,storage]){
  const result=inspectSandboxPreparation({read:altered(name,s=>s.replace(
    'allow read, write: if false;','allow read, write: if true;'))});
  assert.equal(result.safe,false);
 }
});
test('secrets, workload identity, deployment and background triggers fail plan gate',()=>{
 const path='.github/workflows/firebase-recovery-sandbox-plan.yml';
 for(const attack of ['\n      - run: gcloud auth list',
   '\n      - run: firebase deploy --only storage',
   '\n      - run: echo ${{ secrets.FIREBASE_TOKEN }}',
   '\n    environment: firebase-production',
   '\n  schedule:\n    - cron: "0 * * * *"']){
  assert.equal(inspectSandboxPreparation({read:altered(path,s=>s+attack)}).safe,false,
    attack);
 }
});
test('unexpected production Firebase target or enabled account flag fails',()=>{
 assert.equal(inspectSandboxPreparation({read:altered('.firebaserc',
   s=>s.replace('demo-asteria','asteria-ttrpg'))}).safe,false);
 assert.equal(inspectSandboxPreparation({read:altered('index.html',
   s=>s.replace('accountIds:false','accountIds:true'))}).safe,false);
});
test('preparation scripts cannot issue cloud writes or initiate backup restores',()=>{
 const source=read('scripts/firebase-recovery-sandbox-plan.mjs');
 const workflow=read('.github/workflows/firebase-recovery-sandbox-plan.yml');
 assert.doesNotMatch(source,/\b(?:spawn|execFile|execSync|initializeApp|getFirestore|getAuth)\(/);
 assert.doesNotMatch(source,/^\s*(?:gcloud|firebase deploy)\s+/m);
 assert.doesNotMatch(workflow,/google-github-actions\/auth|id-token:\s*write|secrets\./);
 assert.match(source,/backupRestored:false/);
 assert.match(workflow,/workflow_dispatch:/);
});
