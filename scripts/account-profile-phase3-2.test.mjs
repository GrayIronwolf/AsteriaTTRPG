import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectAccountProfileDisplay} from '../src/state/accountProfileDisplay.mjs';

const uid='asteria-user-1';
const validProfile=()=>({
  uid,username:'Asteria',usernameLower:'asteria',
  firstName:'Asteria',lastName:'Player',email:'stale-profile@example.invalid',
  accountId:'Asteria#01416',accountNumber:'01416',
  accountIdKey:'asteria#01416',accountIdAssignedAt:'2026-11-09T10:00:00.000Z'
});
const inspect=(profile,opts={})=>inspectAccountProfileDisplay({
  uid,authEmail:'verified-auth@example.test',profile,...opts
});

test('read-only My Profile returns only verified display fields',()=>{
  const result=inspect(validProfile());
  assert.deepEqual(result,{
    status:'assigned',username:'Asteria',name:'Asteria Player',
    email:'verified-auth@example.test',accountId:'Asteria#01416'
  });
  assert.equal(Object.hasOwn(result,'uid'),false);
  assert.equal(JSON.stringify(result).includes('stale-profile@example.invalid'),false);
  assert.equal(Object.hasOwn(result,'accountIdKey'),false);
});
test('leading zeroes are required and preserved in Account ID',()=>{
  const profile={...validProfile(),accountId:'Asteria#00001',
    accountNumber:'00001',accountIdKey:'asteria#00001'};
  assert.equal(inspect(profile).accountId,'Asteria#00001');
  assert.equal(inspect({...profile,accountNumber:1}).status,'review');
  assert.equal(inspect({...profile,accountNumber:'0001'}).status,'review');
});
test('existing legacy profile has pending ID, never fabricated from username',()=>{
  const profile=validProfile();
  for(const key of ['accountId','accountNumber','accountIdKey','accountIdAssignedAt'])delete profile[key];
  assert.deepEqual(inspect(profile),{
    status:'pending',username:'Asteria',name:'Asteria Player',
    email:'verified-auth@example.test',accountId:null
  });
});
test('partial or inconsistent ID fields cannot be copied',()=>{
  const cases=[
    {accountId:'Asteria#99999'}, {accountIdKey:'other#01416'},
    {accountNumber:'99999'}, {accountNumber:1416},
    {accountIdAssignedAt:'yesterday'}, {accountIdAssignedAt:null},
    {usernameLower:'Other'}, {username:'asteria'},{username:' Asteria '},
    {accountIdAssignedAt:'2026-11-09'}
  ];
  for(const patch of cases){
    const result=inspect({...validProfile(),...patch});
    assert.equal(result.status,'review',JSON.stringify(patch));
    assert.equal(result.accountId,null);
  }
  const missing=validProfile();
  delete missing.accountIdKey;
  assert.equal(inspect(missing).status,'review');
});
test('profile ownership mismatches fail closed, not pending',()=>{
  for(const profile of [null,{}, { ...validProfile(),uid:'someone-else' },[],true])
    assert.equal(inspect(profile).status,'unavailable');
  assert.equal(inspect(validProfile(),{uid:'../bad'}).status,'unavailable');
});
test('valid username case is retained while registry identity uses lowercase',()=>{
  const p={...validProfile(),username:'Quest.Master',usernameLower:'quest.master',
    accountId:'Quest.Master#01416',accountIdKey:'quest.master#01416'};
  assert.equal(inspect(p).accountId,'Quest.Master#01416');
  assert.equal(inspect({...p,accountIdKey:'Quest.Master#01416'}).status,'review');
});
test('only a server read can populate Account ID and copy rechecks server',()=>{
  const firebase=readFileSync('js/firebase-auth.js','utf8');
  const ui=readFileSync('js/asteria-account-profile.js','utf8');
  assert.match(firebase,/readAccountProfileForDisplay: async function\(\)/);
  assert.match(firebase,/getDocFromServer\(doc\(db,'users',uid\)\)/);
  assert.match(firebase,/currentUser\?\.uid!==uid \|\| auth\?\.currentUser\?\.uid!==uid/);
  assert.match(ui,/inspectAccountProfileDisplay\(/);
  assert.match(ui,/readAccountProfileForDisplay\?\.\(\)/);
  assert.match(ui,/readAccountProfileForDisplay\(\)/);
  assert.match(ui,/version!==requestVersion/);
  assert.match(ui,/navigator\.clipboard\.writeText\(id\)/);
  assert.match(ui,/get\('accountProfileCopyId'\)\.disabled=!verifiedId/);
  assert.doesNotMatch(ui,/accountIdRegistry|accountIdAssignments|randomInt|localStorage/);
});
test('the Account menu opens My Profile while settings and logout remain intact',()=>{
  const markup=readFileSync('index.html','utf8');
  const menu=readFileSync('js/asteria-account-menu.js','utf8');
  const css=readFileSync('css/asteria-account-profile.css','utf8');
  for(const id of ['accountMenuProfile','accountMenuSettings','accountMenuLogout',
    'accountProfileOverlay','accountProfileTitle','accountProfileId',
    'accountProfileUsername','accountProfileEmail','accountProfileName',
    'accountProfileCopyId','accountProfileRefresh','accountProfileClose']){
    assert.equal((markup.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.match(menu,/window\.AsteriaAccountProfile\?\.open\?\.\(\)/);
  assert.match(menu,/window\.AsteriaWorkspace\?\.openDashboard\?\.\('settings'\)/);
  assert.match(menu,/window\.logout\?\.\(\)/);
  assert.match(markup,/role="dialog" aria-modal="true"/);
  assert.match(markup,/accountIds:true/);
  assert.match(markup,/js\/asteria-account-profile\.js\?v=account-profile-phase3-2/);
  assert.match(css,/@media \(max-width:600px\)/);
});
test('profile is read-only, includes no identity allocation or account mutation',()=>{
  const ui=readFileSync('js/asteria-account-profile.js','utf8');
  assert.doesNotMatch(ui,/setDoc\(|updateDoc\(|runTransaction\(|httpsCallable\(|ensureAccountIdentityProfile\(/);
  assert.match(ui,/asteria:firebase-signed-out/);
  assert.match(ui,/asteria:auth-changed/);
  assert.match(ui,/get\('accountProfileCopyId'\)\.disabled=true/);
});
