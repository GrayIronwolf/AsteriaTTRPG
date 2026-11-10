import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  canSendVerificationEmail,verificationResendAvailable,
  accountIdCompletionEnabled,canCompleteNewAccountId,
  ACCOUNT_ID_REGISTRATION_WINDOW_MS
} from '../src/state/accountEmailVerification.mjs';

const now=Date.parse('2026-11-10T02:00:00.000Z');
const user=(patch={})=>({
  uid:'new-account',email:'new@example.test',emailVerified:true,displayName:'NewPlayer',
  metadata:{creationTime:'2026-11-10T01:58:00.000Z'},...patch
});
test('verification email only targets unverified authenticated email account',()=>{
  assert.equal(canSendVerificationEmail(user({emailVerified:false})),true);
  for(const entry of [null,{},user(),user({email:''}),user({email:'invalid'}),
    user({uid:''}),user({emailVerified:undefined})])
    assert.equal(canSendVerificationEmail(entry),false);
});
test('resend cooldown blocks rapid requests without persisting credentials',()=>{
  assert.equal(verificationResendAvailable(undefined,now),true);
  assert.equal(verificationResendAvailable(now,now+59999),false);
  assert.equal(verificationResendAvailable(now,now+60000),true);
});
test('website canary activation is independent and fails closed by default',()=>{
  for(const flags of [null,{}, {accountIds:false},{accountIdCanary:false},
    {accountIdCanary:'true'}])assert.equal(accountIdCompletionEnabled(flags),false);
  assert.equal(accountIdCompletionEnabled({accountIdCanary:true}),true);
  assert.equal(accountIdCompletionEnabled({accountIds:true}),true);
});
test('canary completion requires fresh Firebase Auth verification and 15 min window',()=>{
  assert.equal(canCompleteNewAccountId(user(),{accountIdCanary:true},now),true);
  assert.equal(ACCOUNT_ID_REGISTRATION_WINDOW_MS,900000);
  for(const value of [
    user({emailVerified:false}),user({email:''}),user({displayName:''}),
    user({metadata:{creationTime:'2026-11-10T01:44:59.000Z'}}),
    user({metadata:{creationTime:'2026-11-10T02:00:01.000Z'}}),
    user({metadata:{creationTime:'untrusted'}})
  ])assert.equal(canCompleteNewAccountId(value,{accountIdCanary:true},now),false);
  assert.equal(canCompleteNewAccountId(user(),{accountIds:false},now),false);
});
test('website source sends native Firebase email, refreshes Auth and never activates flags',()=>{
  const js=readFileSync(new URL('../js/firebase-auth.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../js/asteria-account-security.js',import.meta.url),'utf8');
  assert.match(js,/sendEmailVerification\(cred\.user\)/);
  assert.match(js,/sendEmailVerification\(user\)/);
  assert.match(js,/await reload\(user\)/);
  assert.match(js,/canCompleteNewAccountId\(user,window\.AsteriaFeatureFlags\)/);
  assert.match(js,/httpsCallable\(functionsClient,'asteriaAccountIdentity'\)/);
  assert.match(js,/getDocFromServer\(doc\(db,'users',uid\)\)/);
  assert.match(html,/accountIds:true/);
  assert.match(ui,/accountIdCanary!==true/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|accountIdCanary\s*=\s*true/);
});

test('canary test-only entrypoint is explicit and does not enable general account ID registration',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/accountIds:true,accountIdAutoCanary:new URLSearchParams\(window\.location\.search\)\.get\('account-id-auto-canary'\)==='1',accountIdCanary:new URLSearchParams\(window\.location\.search\)\.get\('account-id-canary'\)==='1'/);
  assert.doesNotMatch(html,/accountIds:false/);
  assert.doesNotMatch(html,/localStorage\.setItem\([^\n]*accountIdCanary/);
  assert.doesNotMatch(html,/sessionStorage\.setItem\([^\n]*accountIdCanary/);
});
