import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectAccountIdProductionFinalization} from './account-id-production-finalization.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const modify=(path,from,to)=>name=>name===path?read(name).replace(from,to):read(name);
test('Account ID finalization remains source-ready but operationally disabled',()=>{
 const r=inspectAccountIdProductionFinalization();
 assert.equal(r.sourceChecksPassed,true,JSON.stringify(r.checks));
 assert.equal(r.decision,'SOURCE-READY / PRODUCTION-NOT-ACTIVATED');
 assert.equal(r.productionDeploymentPerformed,false);
 assert.equal(r.accountIdsActivated,false);
 assert.equal(r.legacyAccountsMigrated,false);
 assert.equal(r.liveUserDataRead,false);
});
test('turning on browser flag or relaxing registry rules fails closed',()=>{
 assert.equal(inspectAccountIdProductionFinalization(modify('index.html',
   'accountIds:false','accountIds:true')).sourceChecksPassed,false);
 assert.equal(inspectAccountIdProductionFinalization(modify('firestore.rules',
   'match /accountIdRegistry/{accountIdKey} {\n      allow read, write: if false;',
   'match /accountIdRegistry/{accountIdKey} {\n      allow read, write: if true;')).sourceChecksPassed,false);
});
test('missing backend Auth cutoff or public legacy access fails closed',()=>{
 assert.equal(inspectAccountIdProductionFinalization(modify('functions/index.mjs',
   'ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE',
   'CLIENT_CHOSEN_CUTOFF')).sourceChecksPassed,false);
 assert.equal(inspectAccountIdProductionFinalization(modify('functions/index.mjs',
   'export const asteriaAccountIdentity=onCall',
   'backfillLegacyAccountIdentity();\nexport const asteriaAccountIdentity=onCall')).sourceChecksPassed,false);
});
test('release job must require manual approval and scoped callable-only deployment',()=>{
 assert.equal(inspectAccountIdProductionFinalization(modify(
   '.github/workflows/firebase-deploy.yml',
   "inputs.production_confirmation == 'DEPLOY-ASTERIA-ACCOUNT-ID-CALLABLE'",
   "inputs.production_confirmation == 'NO_APPROVAL'")).sourceChecksPassed,false);
 assert.equal(inspectAccountIdProductionFinalization(modify(
   '.github/workflows/firebase-deploy.yml',
   '--only functions:asteria:asteriaAccountIdentity',
   '--only functions,firestore,storage')).sourceChecksPassed,false);
});
test('Account ID inventory shares the existing authorised Firebase workflow',()=>{
 const workflow=read('.github/workflows/firebase-deploy.yml');
 assert.match(workflow,/account_id_inventory:/);
 assert.match(workflow,/inputs\.operation == 'account-id-inventory'/);
 assert.match(workflow,/account_id_deploy:/);
 assert.match(workflow,/inputs\.operation == 'account-id-callable-deploy'/);
 assert.match(workflow,/inputs\.production_confirmation == 'DEPLOY-ASTERIA-ACCOUNT-ID-CALLABLE'/);
 assert.match(workflow,/--only functions:asteria:asteriaAccountIdentity/);
 assert.match(workflow,/inputs\.operation == 'backup-audit'/);
 assert.match(workflow,/inputs\.operation == 'auth-check'/);
 assert.doesNotMatch(workflow,/^ {2}(push|pull_request|schedule|workflow_run):/m);
});
test('client registration uses authenticated server reads when confirming permanent IDs',()=>{
 const auth=read('js/firebase-auth.js');
 assert.match(auth,/getDocFromServer\(doc\(db,'users',cred\.user\.uid\)\)/);
 assert.match(auth,/getDocFromServer\(doc\(db,'users',user\.uid\)\)/);
 assert.match(auth,/Older registrations may need account review/);
});
