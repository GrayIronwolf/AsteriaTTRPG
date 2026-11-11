import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  buildFriendRequestsRelease,isolatedFriendRequestsSource,
  stageFriendRequestsRelease
} from './friends-phase2-2-release-package.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('release contains exactly one disabled request callable with private dependencies',()=>{
  const files=buildFriendRequestsRelease();
  assert.deepEqual(Object.keys(files).sort(),[
    'firebase.json','functions/.env.asteria-ttrpg',
    'functions/friendAccountLookup.mjs','functions/friendRelationshipModel.mjs',
    'functions/friendRequestActions.mjs','functions/index.mjs','functions/package.json'
  ]);
  assert.equal(files['functions/index.mjs'],isolatedFriendRequestsSource());
  assert.equal((files['functions/index.mjs'].match(/export const /g)||[]).length,1);
  assert.match(files['functions/index.mjs'],/asteriaFriendRequests=onCall/);
  assert.match(files['functions/index.mjs'],/ASTERIA_FRIEND_REQUESTS_ENABLED!=='1'/);
  assert.equal(files['functions/.env.asteria-ttrpg'],'ASTERIA_FRIEND_REQUESTS_ENABLED=0\n');
  for(const name of ['asteriaFriendAccountLookup=onCall','asteriaAccountUsername=onCall',
    'asteriaAccountIdentity=onCall','asteriaCampaign','defineSecret('])
    assert.equal(files['functions/index.mjs'].includes(name),false,name);
  const configuration=JSON.parse(files['firebase.json']);
  assert.deepEqual(Object.keys(configuration),['functions']);
  assert.equal(configuration.functions[0].codebase,'asteria');
});
test('release extraction refuses marker changes and unknown exports',()=>{
  const entry=read('functions/index.mjs');
  assert.throws(()=>isolatedFriendRequestsSource(entry.replace(
    '// Phase 2.2 Friends:','// marker changed:')),/boundaries/);
  assert.throws(()=>isolatedFriendRequestsSource(entry.replace(
    'export const asteriaFriendRequests=onCall({',
    'export const differentCall=onCall({')),/isolation/);
});
test('production staging requires explicit trusted main-only approval',()=>{
  const base={GITHUB_ACTIONS:'true',RUNNER_TEMP:'/tmp',
    GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    ASTERIA_FRIEND_REQUESTS_OPERATION:'friends-request-backend-deploy',
    ASTERIA_FRIEND_REQUESTS_CONFIRMATION:'DEPLOY-ASTERIA-FRIEND-REQUESTS-OFF',
    ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg'};
  for(const bad of [
    {GITHUB_REF:'refs/heads/testing'},{GITHUB_ACTIONS:'false'},
    {GITHUB_EVENT_NAME:'push'},{RUNNER_TEMP:'relative'},
    {ASTERIA_FRIEND_REQUESTS_OPERATION:'friends-lookup-deploy'},
    {ASTERIA_FRIEND_REQUESTS_CONFIRMATION:'ACTIVATE-FRIENDS'},
    {ASTERIA_DEPLOY_PROJECT:'demo-asteria'}
  ]) assert.throws(()=>stageFriendRequestsRelease({...base,...bad},'production'),/requires/);
  assert.throws(()=>stageFriendRequestsRelease(base,'ci'),/requires/);
});
test('CI staging writes only the disabled isolated files',()=>{
  const temp=mkdtempSync(join(tmpdir(),'asteria-friend-actions-test-'));
  try{
    const dir=stageFriendRequestsRelease({
      GITHUB_ACTIONS:'true',RUNNER_TEMP:temp,GITHUB_EVENT_NAME:'pull_request'
    },'ci');
    const functionSource=readFileSync(join(dir,'functions/index.mjs'),'utf8');
    const env=readFileSync(join(dir,'functions/.env.asteria-ttrpg'),'utf8');
    assert.match(functionSource,/asteriaFriendRequests=onCall/);
    assert.equal(env,'ASTERIA_FRIEND_REQUESTS_ENABLED=0\n');
    assert.equal((functionSource.match(/export const /g)||[]).length,1);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
test('manual workflow never deploys other functions, rules, website or enablement',()=>{
  const yaml=read('.github/workflows/firebase-deploy.yml');
  const job=yaml.split(/^  friend_requests_backend_deploy:\s*$/m)[1]||'';
  assert.match(yaml,/          - friends-request-backend-deploy/);
  assert.match(job,/github\.ref == 'refs\/heads\/main'/);
  assert.match(job,/inputs\.operation == 'friends-request-backend-deploy'/);
  assert.match(job,/DEPLOY-ASTERIA-FRIEND-REQUESTS-OFF/);
  assert.match(job,/environment: firebase-production/);
  assert.match(job,/--only functions:asteria:asteriaFriendRequests --non-interactive/);
  assert.match(job,/ASTERIA_FRIEND_REQUESTS_ENABLED/);
  assert.doesNotMatch(job,/--only firestore|--only storage|--only hosting|--only functions,/);
});
