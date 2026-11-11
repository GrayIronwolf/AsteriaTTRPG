import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildFriendsRelease,isolatedFriendSource,stageFriendsRelease}
  from './friends-phase1-2-release-package.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('release archives a single, disabled-by-default callable with no other Firebase services',()=>{
  const files=buildFriendsRelease();
  assert.deepEqual(Object.keys(files).sort(),[
    'firebase.json','functions/friendAccountLookup.mjs',
    'functions/index.mjs','functions/package.json'
  ]);
  assert.equal(files['functions/index.mjs'],isolatedFriendSource());
  assert.equal((files['functions/index.mjs'].match(/export const /g)||[]).length,1);
  assert.match(files['functions/index.mjs'],/ASTERIA_FRIEND_LOOKUP_ENABLED!=='1'/);
  assert.match(files['functions/index.mjs'],/asteriaFriendAccountLookup=onCall/);
  for(const forbidden of ['asteriaAccountIdentity=onCall','asteriaAccountUsername=onCall',
    'asteriaCampaign', 'defineSecret(', 'ASTERIA_RESEND_API_KEY'])
    assert.equal(files['functions/index.mjs'].includes(forbidden),false,forbidden);
  const config=JSON.parse(files['firebase.json']);
  assert.deepEqual(Object.keys(config),['functions']);
  assert.equal(config.functions[0].codebase,'asteria');
});
test('release package fails closed if callable extraction markers or dependencies drift',()=>{
  const entry=source('functions/index.mjs');
  assert.throws(()=>isolatedFriendSource(entry.replace(
    '// Phase 1.2 Friends System:','// missing marker')),/boundaries/);
  assert.throws(()=>isolatedFriendSource(entry.replace(
    'export const asteriaFriendAccountLookup=onCall({',
    'export const anotherName=onCall({')),/isolation/);
});
test('staging is restricted to approved GitHub Actions contexts',()=>{
  const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
    GITHUB_REF:'refs/heads/main',RUNNER_TEMP:'/tmp',
    ASTERIA_FRIENDS_SCOPED_DEPLOY:'1',ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg'};
  for(const patch of [{GITHUB_ACTIONS:'false'},{RUNNER_TEMP:'relative'},
    {GITHUB_REF:'refs/heads/feature'},{GITHUB_EVENT_NAME:'pull_request'},
    {ASTERIA_FRIENDS_SCOPED_DEPLOY:'0'},{ASTERIA_DEPLOY_PROJECT:'demo-asteria'}])
    assert.throws(()=>stageFriendsRelease({...env,...patch},'production'),/requires/);
  assert.throws(()=>stageFriendsRelease({...env,GITHUB_EVENT_NAME:'workflow_dispatch'},'ci'),/requires/);
});
test('manual Firebase workflow is still scoped, main-only and independently approved',()=>{
  const workflow=source('.github/workflows/firebase-deploy.yml');
  const job=workflow.split(/^  friends_lookup_deploy:\s*$/m)[1]||'';
  assert.match(workflow,/          - friends-lookup-deploy/);
  assert.match(job,/github.ref == 'refs\/heads\/main'/);
  assert.match(job,/github.event_name == 'workflow_dispatch'/);
  assert.match(job,/inputs.operation == 'friends-lookup-deploy'/);
  assert.match(job,/inputs.production_confirmation == 'DEPLOY-ASTERIA-FRIENDS-LOOKUP'/);
  assert.match(job,/environment: firebase-production/);
  assert.match(job,/--only functions:asteria:asteriaFriendAccountLookup --non-interactive/);
  assert.doesNotMatch(job,/--only functions,firestore|--only storage|--only hosting|env.*ASTERIA_FRIEND_LOOKUP_ENABLED: '1'/);
});
test('existing isolated account identity and username callables retain their boundaries',()=>{
  const sourceText=source('functions/index.mjs');
  assert.ok(sourceText.indexOf('// Phase 1.2 Friends System:')<
    sourceText.indexOf('// Authenticated username edits keep'));
  assert.ok(sourceText.indexOf('// Authenticated username edits keep')<
    sourceText.indexOf('// Phase 1.3: authenticated'));
});

test('production deployment, activation and rollback require exact independent approval',()=>{
  const combinations=[
    ['production','friends-lookup-deploy','DEPLOY-ASTERIA-FRIENDS-LOOKUP','0'],
    ['activate','friends-lookup-activate','ACTIVATE-ASTERIA-FRIENDS-LOOKUP','1'],
    ['deactivate','friends-lookup-deactivate','DEACTIVATE-ASTERIA-FRIENDS-LOOKUP','0']
  ];
  for(const [mode,operation,confirmation,value] of combinations){
    const temporary=mkdtempSync(join(tmpdir(),'asteria-friends-release-'));
    const env={
      GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
      GITHUB_REF:'refs/heads/main',RUNNER_TEMP:temporary,
      ASTERIA_FRIENDS_SCOPED_DEPLOY:'1',ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg',
      ASTERIA_FRIENDS_OPERATION:operation,ASTERIA_FRIENDS_CONFIRMATION:confirmation
    };
    try{
      for(const change of [
        {ASTERIA_FRIENDS_CONFIRMATION:'wrong-confirmation'},
        {ASTERIA_FRIENDS_OPERATION:'deploy'},
        {ASTERIA_DEPLOY_PROJECT:'demo-asteria'},
        {GITHUB_REF:'refs/heads/feature'},
        {GITHUB_EVENT_NAME:'push'}
      ]){
        assert.throws(()=>stageFriendsRelease({...env,...change},mode),/approval/);
      }
      const directory=stageFriendsRelease(env,mode);
      const data=readFileSync(join(directory,'functions/.env.asteria-ttrpg'),'utf8');
      assert.equal(data,'ASTERIA_FRIEND_LOOKUP_ENABLED='+value+'\n');
      const functions=readFileSync(join(directory,'functions/index.mjs'),'utf8');
      assert.equal((functions.match(/export const /g)||[]).length,1);
      assert.match(functions,/asteriaFriendAccountLookup=onCall/);
      assert.equal(readFileSync(join(directory,'firebase.json'),'utf8')
        .includes('"hosting"'),false);
    }finally{rmSync(temporary,{recursive:true,force:true});}
  }
});
test('manual feature enable and emergency rollback use one existing identity-authorized workflow',()=>{
  const workflow=source('.github/workflows/firebase-deploy.yml');
  const operation=workflow.split(/^  friends_lookup_activation:\s*$/m)[1]?.split(/^  [a-z_]+:\s*$/m)[0]||'';
  assert.match(workflow,/          - friends-lookup-activate/);
  assert.match(workflow,/          - friends-lookup-deactivate/);
  assert.match(operation,/github\.ref == 'refs\/heads\/main'/);
  assert.match(operation,/github\.event_name == 'workflow_dispatch'/);
  assert.match(operation,/inputs\.operation == 'friends-lookup-activate'/);
  assert.match(operation,/ACTIVATE-ASTERIA-FRIENDS-LOOKUP/);
  assert.match(operation,/DEACTIVATE-ASTERIA-FRIENDS-LOOKUP/);
  assert.match(operation,/environment: firebase-production/);
  assert.match(operation,/stage-activation/);
  assert.match(operation,/stage-deactivation/);
  assert.match(operation,/--only functions:asteria:asteriaFriendAccountLookup --non-interactive/);
  assert.match(operation,/gcloud functions describe asteriaFriendAccountLookup --gen2 --region us-central1/);
  assert.doesNotMatch(operation,/--only firestore|--only hosting|--only storage|--only functions,/);
});
test('browser search canary is explicit and does not enable the general website',()=>{
  const html=source('index.html');
  assert.match(html,/friendAccountLookup:new URLSearchParams\(window\.location\.search\)\.get\('friends-lookup-canary'\)==='1'/);
  assert.doesNotMatch(html,/friendAccountLookup:true/);
  assert.match(source('js/asteria-account-friends.js'),/const enabled=\(\)=>window\.AsteriaFeatureFlags\?\.friendAccountLookup===true/);
});
