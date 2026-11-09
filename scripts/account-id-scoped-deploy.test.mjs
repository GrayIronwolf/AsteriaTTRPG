import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  buildScopedAccountIdentityEntry,
  checkScopedAccountIdDeployment,
  prepareScopedAccountIdDeploy
} from './account-id-scoped-deploy.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('functions/index.mjs');
const manifest=JSON.parse(read('package.json'));
const firebase=JSON.parse(read('firebase.json'));
const trusted={
  GITHUB_ACTIONS:'true',
  GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch',
  ASTERIA_ACCOUNT_ID_SCOPED_DEPLOY:'1',
  ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg'
};

test('generated entry exports exactly the current Account ID callable and no secrets',()=>{
  const generated=buildScopedAccountIdentityEntry(source);
  const original=source.slice(source.lastIndexOf(
    '// Phase 1.3: authenticated, server-controlled Account ID finalization.')).trimEnd();
  assert.ok(generated.includes(original));
  assert.equal((generated.match(/export const /g)||[]).length,1);
  assert.match(generated,/export const asteriaAccountIdentity=onCall/);
  assert.match(generated,/getAuth\(\)\.getUser\(request\.auth\.uid\)/);
  assert.match(generated,/process\.env\.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'/);
  assert.match(generated,/ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE/);
  assert.doesNotMatch(generated,/defineSecret\(|ASTERIA_RESEND_API_KEY|ASTERIA_SECURE_INVITE_SIGNING_KEY|asteriaCampaignEmailInvitations/);
  assert.doesNotMatch(generated,/export const asteriaAction|export const asteriaInvite/);
});
test('production Firebase codebase and package must be unchanged before entry preparation',()=>{
  const r=checkScopedAccountIdDeployment({source,manifest,firebase});
  assert.equal(r.originalMain,'functions/index.mjs');
  assert.equal(r.temporaryMain,'functions/accountIdentityScopedDeployEntry.mjs');
  assert.equal(r.exportCount,1);
  assert.equal(r.accountIdGenerationEnabled,false);
  assert.equal(r.unrelatedSecretDeclarations,false);
});
test('unexpected codebase or changed package entrypoint aborts before writing',()=>{
  for(const changed of [
    {...manifest,main:'functions/another.mjs'},
    {...manifest,main:'functions/accountIdentityScopedDeployEntry.mjs'}
  ])assert.throws(()=>checkScopedAccountIdDeployment({source,manifest:changed,firebase}));
  assert.throws(()=>checkScopedAccountIdDeployment({source,manifest,
    firebase:{...firebase,functions:[{...firebase.functions[0],codebase:'else'}]}}));
});
test('changes to callable source fail closed and do not deploy a guessed body',()=>{
  for(const changed of [
    source.replace("process.env.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'",
      "process.env.ASTERIA_ACCOUNT_IDS_ENABLED==='1'"),
    source.replace('ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE','CLIENT_CUTOFF'),
    source+'\nexport const anotherCallable=onCall({});',
    source.replace('issueNewRegistrationAccountId(getFirestore(),firebaseUser,request.auth.uid,',
      'issueNewRegistrationAccountId(getFirestore(),request.data.uid,request.auth.uid,'),
    source.replace('// Phase 1.3: authenticated, server-controlled Account ID finalization.','// Removed source boundary.')
  ])assert.throws(()=>buildScopedAccountIdentityEntry(changed));
});
test('the CLI refuses preparation without the exact approved workflow context',()=>{
  for(const key of Object.keys(trusted)){
    const env={...trusted};delete env[key];
    assert.throws(()=>prepareScopedAccountIdDeploy({env,read,write:()=>{throw Error('unexpected write');}}));
  }
  for(const env of [
    {...trusted,GITHUB_REF:'refs/heads/feature'},
    {...trusted,ASTERIA_DEPLOY_PROJECT:'demo-asteria'},
    {...trusted,GITHUB_EVENT_NAME:'push'},
    {...trusted,ASTERIA_ACCOUNT_ID_SCOPED_DEPLOY:'0'}
  ])assert.throws(()=>prepareScopedAccountIdDeploy({env,read,write:()=>{throw Error('unexpected write');}}));
});
test('approved preparation only writes two ephemeral, expected runner paths',()=>{
  const writes=new Map();
  const result=prepareScopedAccountIdDeploy({env:trusted,read,write:(path,s)=>writes.set(path,s)});
  assert.deepEqual([...writes.keys()],[
    'functions/accountIdentityScopedDeployEntry.mjs','package.json'
  ]);
  assert.equal(JSON.parse(writes.get('package.json')).main,
    'functions/accountIdentityScopedDeployEntry.mjs');
  assert.equal(result.scope,'functions:asteria:asteriaAccountIdentity');
  assert.equal(result.secretManagerReferences,0);
  assert.equal(result.productionFeatureFlagsChanged,false);
});
test('operator-only preparation never writes cloud data or touches persisted environment config',()=>{
  const script=read('scripts/account-id-scoped-deploy.mjs');
  assert.doesNotMatch(script,/\b(?:exec|spawn|execFile)\(/);
  assert.doesNotMatch(script,/gcloud functions|firebase deploy|secretmanager\.secrets\.get/);
  assert.doesNotMatch(script,/^import .*from ['"]firebase-(?:admin|functions)/m);
  assert.doesNotMatch(script,/write\('firebase\.json'|write\('index\.html'|write\('functions\/index\.mjs'/);
  assert.match(script,/GITHUB_REF!=='refs\/heads\/main'/);
  assert.match(script,/GITHUB_EVENT_NAME!=='workflow_dispatch'/);
});
