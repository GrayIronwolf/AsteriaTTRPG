import test from 'node:test';
import assert from 'node:assert/strict';
import {proposedEnvironment,describeCanary,run,NAME} from './account-id-canary-operator.mjs';
import {collectMigrationInventory,runMigration,validateMigrationArguments,PROJECT}
  from './account-id-existing-migration.mjs';

const sample=(environmentVariables={})=>({
  name:NAME,state:'ACTIVE',updateTime:'2026-11-10T04:00:00Z',
  serviceConfig:{environmentVariables:{CAMPAIGN_BACKEND:'preserved',...environmentVariables}}
});
const baseAuth=(uids=['a','b'])=>({
  listUsers:async(_size,token)=>token ? {users:[]} :
    {users:uids.map(uid=>({uid}))},
  getUser:async uid=>({uid})
});
const db={projectId:PROJECT};
const accountInspect=async(_db,_auth,uid)=>({status:uid==='a'?'eligible':'already-assigned',username:'Asteria'});
test('general release is independently confirmed and preserves unrelated settings',()=>{
  const original=sample({ASTERIA_ACCOUNT_IDS_ENABLED:'0',
    ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE:'auto-canary',
    ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256:'f'.repeat(64)});
  const patch=proposedEnvironment(original,'release-general',{now:new Date('2026-11-10T05:00:00.000Z')});
  const env=patch.serviceConfig.environmentVariables;
  assert.equal(env.CAMPAIGN_BACKEND,'preserved');
  assert.equal(env.ASTERIA_ACCOUNT_IDS_ENABLED,'1');
  assert.equal(env.ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE,'general');
  assert.equal(env.ASTERIA_ACCOUNT_IDS_GENERAL_RELEASE_APPROVED,'1');
  assert.equal(env.ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE,'2026-11-10T05:00:00.000Z');
  assert.equal(env.ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256,undefined);
  assert.equal(describeCanary(sample(env)).rollout,'GENERAL PUBLIC RELEASE');
  assert.equal(describeCanary(sample(env)).generalRelease,'APPROVED');
});
test('general release cannot accidentally repeat while already enabled',()=>{
  assert.throws(()=>proposedEnvironment(sample({ASTERIA_ACCOUNT_IDS_ENABLED:'1'}),
    'release-general'),/already enabled/);
});
test('general release cannot be activated without exact typed confirmation',async()=>{
  let writes=0,fn=sample();
  const api={get:async()=>fn,update:async(_from,patch)=>{
    writes++;fn=sample(patch.serviceConfig.environmentVariables);
  }};
  await assert.rejects(run({action:'release-general',token:'hidden',api,
    ask:async()=>'ENABLE'}),/Explicit approval/);
  assert.equal(writes,0);
  const result=await run({action:'release-general',token:'hidden',api,
    ask:async()=>'RELEASE-GENERAL'});
  assert.equal(writes,1);
  assert.equal(result.rollout,'GENERAL PUBLIC RELEASE');
  assert.equal(result.generalRelease,'APPROVED');
  await run({action:'disable',token:'hidden',api,ask:async()=>'DISABLE'});
  assert.equal((await run({action:'status',token:'hidden',api})).issuance,'DISABLED');
});
test('existing-account migration requires explicit trusted project and apply approval',()=>{
  assert.deepEqual(validateMigrationArguments(['--project',PROJECT,'--mode','preview']),{
    project:PROJECT,mode:'preview'
  });
  assert.throws(()=>validateMigrationArguments(['--project','demo-asteria','--mode','apply']),/Usage/);
  assert.throws(()=>validateMigrationArguments(['--project',PROJECT,'--mode','apply']),/approval/);
  assert.throws(()=>validateMigrationArguments(['--project',PROJECT,'--mode','apply'],
    {ASTERIA_ACCOUNT_ID_MIGRATION_APPROVAL:'MIGRATE-ASTERIA-EXISTING-ACCOUNTS',GITHUB_ACTIONS:'true'}),/approval/);
});
test('inventory records eligibility without writing or exposing personal information',async()=>{
  const result=await collectMigrationInventory({auth:baseAuth(),db,inspect:accountInspect});
  assert.deepEqual(result.summary,{total:2,eligible:1,alreadyAssigned:1,manualReview:0});
  const result2=await runMigration({auth:baseAuth(),db,mode:'preview',inspect:accountInspect,
    backfill:async()=>{throw Error('Preview performed a write');}});
  assert.equal(result2.decision,'READY');
  assert.equal(result2.summary.assigned,0);
});
test('one coordinated migration assigns only eligible UIDs, never reassigned ones',async()=>{
  const writes=[];
  const result=await runMigration({auth:baseAuth(),db,mode:'apply',inspect:accountInspect,
    backfill:async(_db,_auth,uid,opts)=>{
      writes.push(uid);
      assert.equal(opts.projectId,PROJECT);
      assert.equal(opts.confirmation,'BACKFILL-ACCOUNT-ID:'+uid);
      return {status:'assigned'};
    }});
  assert.deepEqual(writes,['a']);
  assert.equal(result.decision,'COMPLETED');
  assert.equal(result.summary.assigned,1);
  assert.equal(result.summary.alreadyAssigned,1);
});
test('one inconsistent legacy account blocks migration before any writes',async()=>{
  let writes=0;
  const inspect=async(_db,_auth,uid)=>uid==='b'?{status:'manual-review',reason:'mismatch'}:
    {status:'eligible',username:'Asteria'};
  await assert.rejects(runMigration({auth:baseAuth(),db,mode:'apply',inspect,
    backfill:async()=>{writes++;return {status:'assigned'};}}),/reconciliation/);
  assert.equal(writes,0);
});
test('failed migration stops without retrying or changing established IDs',async()=>{
  const writes=[];
  await assert.rejects(runMigration({auth:baseAuth(['a','b']),db,mode:'apply',
    inspect:async(_db,_auth,uid)=>({status:'eligible',username:uid}),
    backfill:async(_db,_auth,uid)=>{
      writes.push(uid);
      if(uid==='b')throw Error('simulation');
      return {status:'assigned'};
    }}),/stopped on an account error/);
  assert.deepEqual(writes,['a','b']);
});

test('read-only inventory explains legacy blocks using category counts, never account details',async()=>{
  const inspect=async(_db,_auth,uid)=>({
    status:'manual-review',
    reason:uid==='a'?'auth-profile-mismatch':'profile-missing',
    email:'private@example.test'
  });
  const inventory=await collectMigrationInventory({db,auth:baseAuth(),inspect});
  assert.deepEqual(inventory.summary,{total:2,eligible:0,alreadyAssigned:0,manualReview:2});
  assert.deepEqual(inventory.reasonCounts,{'auth-profile-mismatch':1,'profile-missing':1});
  const displayed=JSON.stringify(inventory.reasonCounts);
  assert.doesNotMatch(displayed,/private@example.test|\"uid\"|\"email\"/);
  const preview=await runMigration({db,auth:baseAuth(),mode:'preview',inspect});
  assert.equal(preview.decision,'REVIEW REQUIRED');
  assert.deepEqual(preview.reasonCounts,inventory.reasonCounts);
});
test('untrusted reasons are never included verbatim in migration diagnostics',async()=>{
  const inspect=async()=>({status:'manual-review',reason:'uid=secret-account;email=secret@example.test'});
  const inventory=await collectMigrationInventory({db,auth:baseAuth(),inspect});
  assert.deepEqual(inventory.reasonCounts,{unclassified:2});
  assert.doesNotMatch(JSON.stringify(inventory.reasonCounts),/secret|email/);
});
