import test from 'node:test';
import assert from 'node:assert/strict';
import {proposedEnvironment,describeCanary,run,NAME} from './account-id-canary-operator.mjs';

const sample=(env={})=>({
  name:NAME,state:'ACTIVE',etag:'opaque-version',
  serviceConfig:{environmentVariables:{KEEP_CAMPAIGN_SETTING:'unchanged',...env}}
});
const email='asteria-example+test@gmail.com';
test('stage never enables issuance; preserves unrelated environment values',()=>{
  const patch=proposedEnvironment(sample(),'stage',{email:' Asteria-Example+Test@Gmail.com '});
  const vars=patch.serviceConfig.environmentVariables;
  assert.equal(patch.etag,'opaque-version');
  assert.equal(vars.KEEP_CAMPAIGN_SETTING,'unchanged');
  assert.equal(vars.ASTERIA_ACCOUNT_IDS_ENABLED,'0');
  assert.equal(vars.ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE,'canary');
  assert.match(vars.ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256,/^[0-9a-f]{64}$/);
  assert.equal(vars.ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE,undefined);
  assert.ok(!JSON.stringify(patch).includes(email));
});
test('cannot stage while issuance is enabled',()=>{
  assert.throws(()=>proposedEnvironment(sample({ASTERIA_ACCOUNT_IDS_ENABLED:'1'}),'stage',{email}),/enabled/);
});
test('enable requires verified staging and creates canonical UTC cutoff',()=>{
  const vars=proposedEnvironment(sample(),'stage',{email}).serviceConfig.environmentVariables;
  const clock=new Date('2026-11-10T03:33:12.456Z');
  const patch=proposedEnvironment(sample(vars),'enable',{now:clock});
  assert.equal(patch.serviceConfig.environmentVariables.ASTERIA_ACCOUNT_IDS_ENABLED,'1');
  assert.equal(patch.serviceConfig.environmentVariables.ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE,
    '2026-11-10T03:33:12.456Z');
  assert.equal(patch.serviceConfig.environmentVariables.KEEP_CAMPAIGN_SETTING,'unchanged');
  assert.equal(describeCanary(sample(patch.serviceConfig.environmentVariables)).cutoff,'CONFIGURED');
});
test('no arbitrary activation with absent digest, missing mode, or preexisting cutoff',()=>{
  const stage=proposedEnvironment(sample(),'stage',{email}).serviceConfig.environmentVariables;
  for(const changed of [
    {...stage,ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE:'general'},
    {...stage,ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256:undefined},
    {...stage,ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE:'2026-11-09T00:00:00.000Z'},
    {...stage,ASTERIA_ACCOUNT_IDS_ENABLED:'1'}
  ])assert.throws(()=>proposedEnvironment(sample(changed),'enable'),/not safely staged/);
});
test('disable only changes issuance gate and preserves the configured canary',()=>{
  const vars=proposedEnvironment(sample(),'stage',{email}).serviceConfig.environmentVariables;
  const enabled=proposedEnvironment(sample(vars),'enable',{now:new Date('2026-11-10T03:33:12.456Z')})
    .serviceConfig.environmentVariables;
  const disabled=proposedEnvironment(sample(enabled),'disable').serviceConfig.environmentVariables;
  assert.equal(disabled.ASTERIA_ACCOUNT_IDS_ENABLED,'0');
  assert.equal(disabled.ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256,enabled.ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256);
  assert.equal(disabled.KEEP_CAMPAIGN_SETTING,'unchanged');
});
test('failed inventory, wrong name, non-ACTIVE function and malformed mail fail closed',()=>{
  assert.throws(()=>proposedEnvironment(sample({}),'stage',{email:''}),/email required/);
  for(const f of [null,{...sample(),state:'FAILED'},{...sample(),name:'projects/other/locations/us-central1/functions/wrong'},
    {...sample(),etag:''},{...sample(),serviceConfig:{}}])
    assert.throws(()=>proposedEnvironment(f,'disable'),/inventory incomplete/);
});
test('read-only status redacts email and env map; dispatch requires typed confirmation',async()=>{
  let writes=0;
  let fn=sample();
  const api={
    get:async()=>fn,
    update:async(_prior,patch)=>{
      writes++;fn=sample(patch.serviceConfig.environmentVariables);
    }
  };
  const token='unprinted-access-token';
  const initial=await run({action:'status',token,api});
  assert.equal(initial.issuance,'DISABLED');
  assert.equal(initial.singleAccount,'NOT CONFIGURED');
  assert.equal(writes,0);
  await run({action:'stage',token,api,ask:async()=>email});
  assert.equal(writes,1);
  assert.equal((await run({action:'status',token,api})).singleAccount,'CONFIGURED');
  await assert.rejects(run({action:'enable',token,api,ask:async()=>'no'}),/Explicit approval/);
  assert.equal(writes,1);
  await run({action:'enable',token,api,ask:async()=>'ENABLE'});
  assert.equal(writes,2);
  assert.equal((await run({action:'status',token,api})).issuance,'ENABLED');
  await run({action:'disable',token,api,ask:async()=>'DISABLE'});
  assert.equal(writes,3);
  assert.equal((await run({action:'status',token,api})).issuance,'DISABLED');
  assert.ok(!JSON.stringify(await run({action:'status',token,api})).includes(email));
  assert.ok(!JSON.stringify(await run({action:'status',token,api})).includes(token));
});
