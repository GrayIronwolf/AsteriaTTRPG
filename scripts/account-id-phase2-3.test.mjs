import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAccountRegistrationFields,recoverPendingRegistrationProfile}
  from '../src/state/accountRegistrationRecovery.mjs';

const fields=()=>({firstName:' Ada ',lastName:' Lovelace ',email:'ada@example.test',
  username:'Asteria',password:'long-secret',confirmPassword:'long-secret'});
const draft=()=>({uid:'alice',email:'ada@example.test',firstName:'Ada',
  lastName:'Lovelace',username:'Asteria'});
function harness(initial=null){
  let record=initial?structuredClone(initial):null;
  const writes=[];
  return {writes,get:()=>structuredClone(record),
    transaction:async fn=>{
      const operations={
        read:async()=>structuredClone(record),
        create:async value=>{writes.push(['create',structuredClone(value)]);record=structuredClone(value);},
        patch:async value=>{writes.push(['patch',structuredClone(value)]);record={...record,...structuredClone(value)};}
      };
      return fn(operations);
    },
    readCanonical:async()=>structuredClone(record)
  };
}
const restore=(h,d=draft())=>recoverPendingRegistrationProfile({
  uid:'alice',authEmail:'ada@example.test',draft:d,
  transaction:h.transaction,readCanonical:h.readCanonical
});
test('accepts valid registration and trimmed form identity',()=>{
  assert.deepEqual(validateAccountRegistrationFields(fields()),{ok:true,errors:{},message:''});
});
test('requires matching confirmation, with no sensitive password echoed in error',()=>{
  for(const patch of [{confirmPassword:''},{confirmPassword:'incorrect'}]){
    const result=validateAccountRegistrationFields({...fields(),...patch});
    assert.equal(result.ok,false);
    assert.ok(result.errors.confirmPassword);
    assert.equal(JSON.stringify(result).includes('long-secret'),false);
  }
});
test('validates names, email, username and length boundaries',()=>{
  for(const patch of [{firstName:''},{lastName:''},{firstName:'a'.repeat(81)},
    {lastName:'a'.repeat(81)},{email:'invalid'},{username:'a#b'},
    {username:'x'.repeat(25)},{password:'12345'}]){
    assert.equal(validateAccountRegistrationFields({...fields(),...patch}).ok,false);
  }
});
test('recovery creates only missing matching authenticated profile',async()=>{
  const h=harness();
  const result=await restore(h);
  assert.equal(result.uid,'alice');
  assert.equal(result.username,'Asteria');
  assert.equal(result.email,'ada@example.test');
  assert.deepEqual(result.characters,[]);
  assert.equal(h.writes.length,1);
  assert.equal(h.writes[0][0],'create');
  assert.equal(JSON.stringify(h.get()).includes('long-secret'),false);
});
test('existing partial profile preserves character and ID fields',async()=>{
  const existing={uid:'alice',username:'Asteria',usernameLower:'asteria',
    email:'ada@example.test',accountId:'Asteria#01416',characters:[{id:'hero'}],
    firstName:'',lastName:'Lovelace'};
  const h=harness(existing);
  await restore(h);
  assert.equal(h.get().firstName,'Ada');
  assert.equal(h.get().accountId,'Asteria#01416');
  assert.deepEqual(h.get().characters,[{id:'hero'}]);
  assert.deepEqual(h.writes,[['patch',{firstName:'Ada'}]]);
});
test('recovery is idempotent for complete existing account',async()=>{
  const h=harness({uid:'alice',username:'Asteria',usernameLower:'asteria',
    email:'ada@example.test',firstName:'Ada',lastName:'Lovelace',characters:[{id:'hero'}]});
  await restore(h);await restore(h);
  assert.equal(h.writes.length,0);
});
test('cross-account draft, email mismatches and forged username are blocked',async()=>{
  for(const patch of [{uid:'bob'},{email:'bob@example.test'},{username:'bad user'},
    {firstName:''},{lastName:''}]){
    const h=harness();
    await assert.rejects(restore(h,{...draft(),...patch}),/Sign in/);
    assert.equal(h.writes.length,0);
  }
});
test('recovery refuses to overwrite existing username, UID or email',async()=>{
  for(const change of [{uid:'bob'},{email:'other@example.test'},
    {username:'Different'},{usernameLower:'different'}]){
    const h=harness({uid:'alice',username:'Asteria',usernameLower:'asteria',
      email:'ada@example.test',firstName:'Ada',lastName:'Lovelace',...change});
    await assert.rejects(restore(h),/manual review/);
    assert.equal(h.writes.length,0);
  }
});
test('failed storage and canonical verification never claim successful recovery',async()=>{
  await assert.rejects(recoverPendingRegistrationProfile({
    uid:'alice',authEmail:'ada@example.test',draft:draft()}),/unavailable/);
  const h=harness();
  await assert.rejects(restore({...h,readCanonical:async()=>null}),/could not be confirmed/);
});
test('website form and retry UI preserve rollout off and do not create another Auth account',()=>{
  const js=readFileSync(new URL('../js/firebase-auth.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="createConfirmPassword"/);
  assert.match(html,/id="pendingAccountSetupBox"/);
  assert.match(html,/accountIds:false/);
  assert.match(js,/validateAccountRegistrationFields\(/);
  assert.match(js,/recoverPendingRegistrationProfile\(/);
  assert.match(js,/window\.asteriaRetryPendingAccountSetup=retryPendingAccountSetup/);
  assert.match(js,/sessionStorage\.setItem\(PENDING_ACCOUNT_KEY/);
  assert.match(js,/setPendingAccountDraft\(null\)/);
  assert.doesNotMatch(js,/sessionStorage\.setItem\(PENDING_ACCOUNT_KEY,[^\n]*password/i);
  const retrySection=js.split('async function retryPendingAccountSetup()')[1].split('window.asteriaRetryPendingAccountSetup')[0];
  assert.doesNotMatch(retrySection,/createUserWithEmailAndPassword/);
  assert.match(retrySection,/accountIdRegistrationEnabled\(window\.AsteriaFeatureFlags\)/);
});
