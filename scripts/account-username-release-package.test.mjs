import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildUsernameRelease,isolatedUsernameSource,stageUsernameRelease} from './account-username-release-package.mjs';

const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('scoped username package contains only the isolated new callable and its pure helpers',()=>{
  const artifact=buildUsernameRelease();
  assert.deepEqual(Object.keys(artifact).sort(),[
    'firebase.json','functions/accountIdentity.mjs','functions/accountIdentityUsername.mjs',
    'functions/index.mjs','functions/package.json'
  ]);
  const source=artifact['functions/index.mjs'];
  assert.equal((source.match(/export const asteriaAccountUsername=/g)||[]).length,1);
  for(const forbidden of ['asteriaAccountIdentity=onCall','asteriaCampaign','asteriaSecureInvitation',
    'functions:asteria:asteriaAccountIdentity','ASTERIA_RESEND_API_KEY','defineSecret('])
    assert.equal(source.includes(forbidden),false,forbidden);
  assert.equal(JSON.parse(artifact['firebase.json']).functions[0].codebase,'asteria');
  assert.equal(JSON.parse(artifact['functions/package.json']).main,'index.mjs');
});
test('server-only function is authenticated and validates all browser-supplied keys',()=>{
  const server=text('functions/index.mjs');
  const block=server.slice(server.indexOf('// Authenticated username edits keep'),
    server.indexOf('// Phase 1.3: authenticated, server-controlled Account ID finalization.'));
  assert.equal((block.match(/export const asteriaAccountUsername=/g)||[]).length,1);
  assert.match(block,/request\.auth\?\.uid/);
  assert.match(block,/Object\.keys\(input\)\.sort\(\)\.join/);
  assert.match(block,/renameAccountIdentity\(getFirestore\(\),request\.auth\.uid/);
  assert.match(block,/input\.action==='status'/);
  assert.doesNotMatch(block,/input\.uid|input\.accountNumber/);
  assert.equal(isolatedUsernameSource(),buildUsernameRelease()['functions/index.mjs']);
});
test('backend production staging fails closed without exact operator-approved workflow',()=>{
  const env={GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',
    GITHUB_EVENT_NAME:'workflow_dispatch',RUNNER_TEMP:'/tmp',
    ASTERIA_USERNAME_SCOPED_DEPLOY:'1',ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg'};
  for(const patch of [
    {GITHUB_ACTIONS:'false'},
    {GITHUB_REF:'refs/heads/feature'},
    {GITHUB_EVENT_NAME:'pull_request'},
    {RUNNER_TEMP:'relative'},
    {ASTERIA_USERNAME_SCOPED_DEPLOY:'0'},
    {ASTERIA_DEPLOY_PROJECT:'demo-asteria'}]){
    assert.throws(()=>stageUsernameRelease({...env,...patch}),/requires the approved/);
  }
});
test('production deploy workflow changes only one callable, not all Firebase services',()=>{
  const yaml=text('.github/workflows/deploy-asteria-username.yml');
  assert.match(yaml,/workflow_dispatch/);
  assert.match(yaml,/confirmation == 'DEPLOY-ASTERIA-USERNAME-ONLY'/);
  assert.match(yaml,/environment: firebase-production/);
  assert.match(yaml,/--only functions:asteria:asteriaAccountUsername --non-interactive/);
  assert.doesNotMatch(yaml,/--only functions,firestore|--only storage|--only hosting/);
});
test('the My Profile editor becomes visible only after authenticated callable capability check',()=>{
  const script=text('js/asteria-account-profile.js');
  assert.match(script,/canRenameAccountUsername\?\.\(\)/);
  assert.match(script,/get\('accountProfileChangeUsername'\)\.hidden=!available/);
  const backend=text('js/firebase-auth.js');
  assert.match(backend,/canRenameAccountUsername: async function\(\)/);
  assert.match(backend,/httpsCallable\(functionsClient,'asteriaAccountUsername'\)\(\{action:'status'\}\)/);
  assert.match(backend,/renameAccountUsername: async function\(rawUsername\)/);
  assert.match(backend,/getDocFromServer\(doc\(db,'users',uid\)\)/);
});
