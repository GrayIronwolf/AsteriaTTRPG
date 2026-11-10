import test from 'node:test';
import assert from 'node:assert/strict';
import {proposedEnvironment,describeCanary,assertInventoryUnchanged,run,NAME} from './account-id-canary-operator.mjs';

const sample=(env={})=>({
  name:NAME,state:'ACTIVE',updateTime:'2026-11-10T03:00:00Z',
  serviceConfig:{environmentVariables:{KEEP_CAMPAIGN_SETTING:'unchanged',...env}}
});
const email='asteria-example+test@gmail.com';
test('stage never enables issuance; preserves unrelated environment values',()=>{
  const patch=proposedEnvironment(sample(),'stage',{email:' Asteria-Example+Test@Gmail.com '});
  const vars=patch.serviceConfig.environmentVariables;
  assert.equal(patch.name,NAME);
  assert.equal(Object.hasOwn(patch,'etag'),false);
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
    {...sample(),updateTime:''},{...sample(),serviceConfig:null}])
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

test('canary can stage when an ACTIVE Cloud Function has no environment variable map',()=>{
  const f={name:NAME,state:'ACTIVE',updateTime:'2026-11-10T03:00:00Z',serviceConfig:{}};
  const p=proposedEnvironment(f,'stage',{email});
  assert.equal(p.serviceConfig.environmentVariables.ASTERIA_ACCOUNT_IDS_ENABLED,'0');
  assert.equal(p.serviceConfig.environmentVariables.ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE,'canary');
});

test('Cloud Functions v2 response without etag is valid with a timestamp',()=>{
  const value=sample();
  assert.equal(Object.hasOwn(value,'etag'),false);
  assert.doesNotThrow(()=>proposedEnvironment(value,'stage',{email}));
});

test('pre-update recheck stops changed timestamps and runtime variables',()=>{
  const before=sample();
  assert.doesNotThrow(()=>assertInventoryUnchanged(before,structuredClone(before)));
  for(const changed of [
    {...sample(),updateTime:'2026-11-10T03:01:00Z'},
    sample({ASTERIA_ACCOUNT_IDS_ENABLED:'1'}),
    {...sample(),state:'FAILED'}
  ])assert.throws(()=>assertInventoryUnchanged(before,changed),/changed during confirmation/);
});

test('a changed runtime inventory blocks any staging writes',async()=>{
  let reads=0,writes=0;
  const api={
    get:async()=>++reads===1?sample():sample({ANOTHER_KEY:'changed'}),
    update:async()=>{writes++;}
  };
  await assert.rejects(run({action:'stage',token:'hidden',api,ask:async()=>email}),
    /changed during confirmation/);
  assert.equal(writes,0);
});

test('unverified automatic canary stages only one email with issuance still disabled',()=>{
  const value=proposedEnvironment(sample(),'stage-auto',{email});
  const vars=value.serviceConfig.environmentVariables;
  assert.equal(vars.ASTERIA_ACCOUNT_IDS_ENABLED,'0');
  assert.equal(vars.ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE,'auto-canary');
  assert.match(vars.ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256,/^[a-f0-9]{64}$/);
  assert.equal(vars.ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE,undefined);
  assert.equal(describeCanary(sample(vars)).singleAccount,'CONFIGURED');
  assert.equal(describeCanary(sample(vars)).rollout,'UNVERIFIED AUTO-CANARY');
  const activated=proposedEnvironment(sample(vars),'enable',{now:new Date('2026-11-10T04:03:00.000Z')});
  assert.equal(activated.serviceConfig.environmentVariables.ASTERIA_ACCOUNT_IDS_ENABLED,'1');
});
test('unverified canary staging is refused if an existing issuance gate is on',()=>{
  assert.throws(()=>proposedEnvironment(sample({ASTERIA_ACCOUNT_IDS_ENABLED:'1'}),'stage-auto',{email}),/enabled/);
});
test('auto-canary stages through operator dispatch and requires typed confirmation to enable',async()=>{
  let writes=0,fn=sample();
  const api={get:async()=>fn,update:async(_old,body)=>{
    writes++;
    fn=sample(body.serviceConfig.environmentVariables);
  }};
  await run({action:'stage-auto',token:'hidden',api,ask:async()=>email});
  assert.equal(writes,1);
  assert.equal((await run({action:'status',token:'hidden',api})).rollout,'UNVERIFIED AUTO-CANARY');
  await assert.rejects(run({action:'enable',token:'hidden',api,ask:async()=>'NO'}),/Explicit approval/);
  assert.equal(writes,1);
});
