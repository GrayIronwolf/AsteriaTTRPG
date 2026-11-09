import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountIdRegistrationEnabled,finalizeRegisteredAccountId} from '../src/state/accountIdRegistration.mjs';

const uid='new-account-uid', username='Asteria';
const canonical={uid,username,usernameLower:'asteria',accountNumber:'01416',
  accountId:'Asteria#01416',accountIdKey:'asteria#01416',
  accountIdAssignedAt:'2026-11-09T09:45:00.000Z'};
const request=async input=>({data:{username,accountNumber:'01416',accountId:'Asteria#01416'}});
const read=async()=>structuredClone(canonical);
const enroll=(params={})=>finalizeRegisteredAccountId({
  enabled:true,uid,username,requestAssignment:request,readProfile:read,...params
});

test('account ID rollout stays off until explicitly set true',()=>{
  for(const flags of [null,{}, {accountIds:false},{accountIds:'true'},{campaignNotifications:true}])
    assert.equal(accountIdRegistrationEnabled(flags),false);
  assert.equal(accountIdRegistrationEnabled({accountIds:true}),true);
});
test('disabled registration makes no external calls',async()=>{
  let called=false;
  const result=await finalizeRegisteredAccountId({
    enabled:false,uid,username,
    requestAssignment:()=>{called=true;throw Error('unexpected');},
    readProfile:()=>{called=true;throw Error('unexpected');}
  });
  assert.equal(result,null);
  assert.equal(called,false);
});
test('enabled registration requests only ensure, never browser-selected IDs',async()=>{
  let input;
  const result=await enroll({requestAssignment:async value=>{input=value;return request(value);}});
  assert.deepEqual(input,{action:'ensure'});
  assert.deepEqual(result,{
    accountId:'Asteria#01416',accountNumber:'01416',
    accountIdKey:'asteria#01416',
    accountIdAssignedAt:'2026-11-09T09:45:00.000Z'
  });
});
test('server and stored profile must agree with submitted username exactly',async()=>{
  await assert.rejects(enroll({requestAssignment:async()=>({
    data:{username:'Other',accountNumber:'01416',accountId:'Other#01416'}
  })}),/could not be verified/);
  await assert.rejects(enroll({readProfile:async()=>({...canonical,username:'Other'})}),
    /could not be confirmed/);
});
test('rejects malformed server numbers, forged account IDs or bad canonical projection',async()=>{
  for(const output of [
    {username,accountNumber:'1416',accountId:'Asteria#1416'},
    {username,accountNumber:'01416',accountId:'Other#01416'},
    {username,accountNumber:1416,accountId:'Asteria#1416'},
    null
  ])await assert.rejects(enroll({requestAssignment:async()=>({data:output})}),
    /could not be verified/);
  for(const patch of [
    {accountId:'Fake#01416'},{accountNumber:'00000'},
    {accountIdKey:'other#01416'},{uid:'other'},
    {accountIdAssignedAt:'not a date'},{accountIdAssignedAt:null}
  ])await assert.rejects(enroll({readProfile:async()=>({...canonical,...patch})}),
    /could not be confirmed/);
});
test('missing verified profile data and invalid UID or username fail',async()=>{
  await assert.rejects(enroll({readProfile:async()=>null}),/could not be confirmed/);
  await assert.rejects(enroll({uid:'../other'}),/valid account profile/);
  await assert.rejects(enroll({username:'bad@name'}),/valid account profile/);
  await assert.rejects(enroll({readProfile:null}),/currently unavailable/);
});
test('server errors propagate to registration handler for pending-state messaging',async()=>{
  await assert.rejects(enroll({requestAssignment:async()=>{throw Error('Backend unavailable');}}),
    /Backend unavailable/);
});
test('registration source gates rollout, confirms Firestore storage and handles pending state',()=>{
  const auth=readFileSync(new URL('../js/firebase-auth.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/accountIds:false/);
  assert.match(auth,/accountIdRegistrationEnabled\(window\.AsteriaFeatureFlags\)/);
  assert.match(auth,/if\(!profileStored \|\| !functionsClient\)/);
  assert.match(auth,/finalizeRegisteredAccountId\(/);
  assert.match(auth,/httpsCallable\(functionsClient,'asteriaAccountIdentity'\)/);
  assert.match(auth,/readProfile: async\(\)=>\{/);
  assert.match(auth,/Account ID is pending/);
  assert.match(auth,/Account ID could not be confirmed/);
  assert.match(auth,/saveLocalProfile\(cred\.user\.uid, currentProfile\)/);
  assert.doesNotMatch(auth,/requestAssignment:[^\n]+username/);
});
