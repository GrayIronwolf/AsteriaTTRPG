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
    'functions/friendAccountLookup.mjs','functions/friendNotifications.mjs',
    'functions/friendRelationshipModel.mjs','functions/friendRequestActions.mjs',
    'functions/friendRequestInbox.mjs',
    'functions/index.mjs','functions/package.json'
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
  const job=yaml.split(/^  friend_requests_backend_deploy:\s*$/m)[1]?.split(/^  [a-z_]+:\s*$/m)[0]||'';
  assert.match(yaml,/          - friends-request-backend-deploy/);
  assert.match(job,/github\.ref == 'refs\/heads\/main'/);
  assert.match(job,/inputs\.operation == 'friends-request-backend-deploy'/);
  assert.match(job,/DEPLOY-ASTERIA-FRIEND-REQUESTS-OFF/);
  assert.match(job,/environment: firebase-production/);
  assert.match(job,/--only functions:asteria:asteriaFriendRequests --non-interactive/);
  assert.match(job,/ASTERIA_FRIEND_REQUESTS_ENABLED/);
  assert.doesNotMatch(job,/--only firestore|--only storage|--only hosting|--only functions,/);
});

test('activation and rollback package only the same callable with exact opposing flag values',()=>{
  const map=[
    ['activate','friends-request-backend-activate','ACTIVATE-ASTERIA-FRIEND-REQUESTS','1'],
    ['deactivate','friends-request-backend-deactivate','DEACTIVATE-ASTERIA-FRIEND-REQUESTS','0']
  ];
  for(const [mode,operation,confirmation,flag] of map){
    const temp=mkdtempSync(join(tmpdir(),'asteria-friend-request-operation-'));
    const env={GITHUB_ACTIONS:'true',RUNNER_TEMP:temp,
      GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
      ASTERIA_FRIEND_REQUESTS_OPERATION:operation,
      ASTERIA_FRIEND_REQUESTS_CONFIRMATION:confirmation,
      ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg'};
    try{
      for(const wrong of [
        {ASTERIA_FRIEND_REQUESTS_CONFIRMATION:'wrong'},
        {ASTERIA_FRIEND_REQUESTS_OPERATION:'other'},
        {GITHUB_EVENT_NAME:'push'},
        {GITHUB_REF:'refs/heads/testing'},
        {ASTERIA_DEPLOY_PROJECT:'demo-asteria'}
      ])assert.throws(()=>stageFriendRequestsRelease({...env,...wrong},mode),/approval/);
      const directory=stageFriendRequestsRelease(env,mode);
      assert.equal(readFileSync(join(directory,'functions/.env.asteria-ttrpg'),'utf8'),
        'ASTERIA_FRIEND_REQUESTS_ENABLED='+flag+'\n');
      const source=readFileSync(join(directory,'functions/index.mjs'),'utf8');
      assert.equal((source.match(/export const /g)||[]).length,1);
      assert.match(source,/asteriaFriendRequests=onCall/);
      assert.doesNotMatch(source,/asteriaFriendAccountLookup=onCall/);
    }finally{rmSync(temp,{recursive:true,force:true});}
  }
});
test('activation workflow restricts main branch, individual confirmations and one callable',()=>{
  const yaml=read('.github/workflows/firebase-deploy.yml');
  const job=yaml.split(/^  friend_requests_activation:\s*$/m)[1]?.split(/^  [a-z_]+:\s*$/m)[0]||'';
  assert.match(job,/github\.ref == 'refs\/heads\/main'/);
  assert.match(job,/github\.event_name == 'workflow_dispatch'/);
  assert.match(job,/inputs\.operation == 'friends-request-backend-activate'/);
  assert.match(job,/inputs\.operation == 'friends-request-backend-deactivate'/);
  assert.match(job,/ACTIVATE-ASTERIA-FRIEND-REQUESTS/);
  assert.match(job,/DEACTIVATE-ASTERIA-FRIEND-REQUESTS/);
  assert.match(job,/--stage-activation/);
  assert.match(job,/--stage-deactivation/);
  assert.match(job,/--only functions:asteria:asteriaFriendRequests --non-interactive/);
  assert.match(job,/gcloud functions describe asteriaFriendRequests --gen2/);
  assert.doesNotMatch(job,/--only firestore|--only hosting|--only storage|--only functions,/);
});
