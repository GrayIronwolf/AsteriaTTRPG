import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveAuthRuntime, validateLoginInput, validateResetEmail,
  friendlyAuthError, GENERIC_RESET_SUCCESS
} from '../frontend/src/auth/authPolicy.mjs';
import {
  ownedProfile, safeAuthSession, createAuthObserver
} from '../frontend/src/auth/authSessionModel.mjs';
import { canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { createAppServices, previewServices } from '../frontend/src/services/appServices.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const user=(uid='player')=>({uid,email:'player@example.test',emailVerified:false});
const profile=(uid='player')=>({uid,email:'player@example.test',username:'PlayerName',accountId:'PlayerName#01234'});

test('Phase 4.1 never enables Firebase automatically and never targets a second production project',()=>{
  assert.deepEqual(resolveAuthRuntime(),{enabled:false,mode:'disabled'});
  assert.deepEqual(resolveAuthRuntime({enabled:false,mode:'production'}),{enabled:false,mode:'disabled'});
  const prod=resolveAuthRuntime({enabled:true,mode:'production',hostname:'asteriatrrpg.com'});
  const emu=resolveAuthRuntime({enabled:true,mode:'emulator',hostname:'127.0.0.1'});
  assert.equal(prod.projectId,'asteria-ttrpg');
  assert.equal(emu.projectId,'demo-asteria');
  assert.equal(emu.config.apiKey,'demo-key');
  assert.throws(()=>resolveAuthRuntime({enabled:true,mode:'test'}),/Explicit/);
  assert.throws(()=>resolveAuthRuntime({enabled:true,mode:'emulator',hostname:'asteriatrrpg.com'}),/loopback/);
  assert.equal(previewServices.has('auth'),false);
  const auth=createAppServices({auth:{subscribe(){}}});
  assert.equal(auth.has('auth'),true);
  for(const route of ['account','profile','settings','friends','notifications','dashboard','gm-dashboard','character-dashboard','invitation']){
    assert.equal(canActivateRoute(route,auth),false,route);
  }
});

test('Phase 4.1 validates credentials without leaking account existence or raw Firebase errors',()=>{
  assert.deepEqual(validateLoginInput({email:' player@example.test ',password:'secret'}),{email:'player@example.test',password:'secret'});
  assert.throws(()=>validateLoginInput({email:'PlayerName',password:'secret'}),/valid email/);
  assert.throws(()=>validateLoginInput({email:'player@example.test',password:''}),/password/);
  assert.equal(validateResetEmail(' player@example.test '),'player@example.test');
  assert.throws(()=>validateResetEmail('invalid'),/valid email/);
  assert.equal(friendlyAuthError({code:'auth/wrong-password'}),friendlyAuthError({code:'auth/user-not-found'}));
  assert.equal(friendlyAuthError({code:'auth/invalid-credential'}),'Unable to sign in with those credentials.');
  assert.doesNotMatch(friendlyAuthError({message:'secret-key=abcdefgh',code:'unknown'}),/secret|abcdefgh/);
  assert.equal(friendlyAuthError({code:'auth/user-not-found'},'reset'),'Password reset could not be requested at this time.');
  assert.match(GENERIC_RESET_SUCCESS,/If an account exists/);
});

test('Phase 4.1 treats owner verified Firestore profile separately from Firebase emailVerified',()=>{
  assert.equal(ownedProfile(null,profile()),null);
  assert.equal(ownedProfile(user('different'),profile()),null);
  assert.equal(ownedProfile(user(),{...profile(),username:''}),null);
  assert.equal(ownedProfile(user(),{...profile(),email:'other@example.test'}),null);
  assert.equal(safeAuthSession(null).status,'guest');
  const result=safeAuthSession(user(),profile());
  assert.equal(result.status,'authenticated');
  assert.equal(result.user.emailVerified,false);
  assert.equal(result.identity.verified,true);
  assert.equal(result.identity.username,'PlayerName');
  assert.equal(result.identity.notificationCount,0);
  const unavailable=safeAuthSession(user(),null);
  assert.equal(unavailable.status,'authenticated');
  assert.equal(unavailable.identity,null);
  assert.equal(unavailable.profileAvailable,false);
  assert.equal(unavailable.accountId,null);
});

test('Phase 4.1 Auth observer disposes StrictMode listeners and ignores old profile lookups',async()=>{
  let onNext,onError,detached=0;
  const emissions=[];
  const pending=new Map();
  const observe=(next,error)=>{onNext=next;onError=error;return ()=>{detached++;};};
  const readProfile=account=>new Promise(resolve=>pending.set(account.uid,resolve));
  const unsubscribe=createAuthObserver({
    observe,readProfile,publish:value=>emissions.push(value)
  });
  assert.equal(emissions[0].status,'checking');
  onNext(user('old'));
  onNext(user());
  pending.get('old')(profile('old'));
  await Promise.resolve();
  assert.equal(emissions.at(-1).status,'checking');
  pending.get('player')(profile());
  await Promise.resolve();
  assert.equal(emissions.at(-1).identity.username,'PlayerName');
  onNext(null);
  assert.equal(emissions.at(-1).status,'guest');
  onError(new Error('Firebase unavailable'));
  assert.equal(emissions.at(-1).status,'unavailable');
  const count=emissions.length;
  unsubscribe();unsubscribe();
  onNext(user());
  assert.equal(emissions.length,count);
  assert.equal(detached,1);
});

test('Phase 4.1 reuses Asteria registration, owner-scoped data and server-only Account IDs',()=>{
  const src=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  const rootEntry=read('frontend/src/main.jsx');
  const init=read('frontend/src/auth/AuthBootstrap.jsx');
  const authPage=read('frontend/src/pages/AuthPage.jsx');
  assert.match(src,/validateAccountRegistrationFields/);
  assert.match(src,/createUserWithEmailAndPassword/);
  assert.match(src,/sendEmailVerification/);
  assert.match(src,/setPersistence/);
  assert.match(src,/finalizeRegisteredAccountId/);
  assert.match(src,/asteriaAccountIdentity/);
  assert.match(src,/getDocFromServer/);
  assert.match(src,/doc\(db, 'users', user\.uid\)/);
  assert.match(src,/onAuthStateChanged/);
  assert.match(src,/sendPasswordResetEmail/);
  assert.match(src,/signInWithEmailAndPassword/);
  assert.match(src,/signOut\(auth\)/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,''),/accountIdRegistry|accountIdAssignments|deleteUser\(/);
  assert.doesNotMatch(src,/window\.AsteriaFirebase|localStorage|sessionStorage/);
  assert.match(init,/VITE_ASTERIA_AUTH_ENABLED === 'true'/);
  assert.match(init,/createFirebaseAuthAdapter/);
  assert.match(rootEntry,/<AuthBootstrap>/);
  assert.match(authPage,/data-testid="site-auth-form"/);
  assert.match(authPage,/type="password"/);
  assert.doesNotMatch(authPage,/dangerouslySetInnerHTML|localStorage|sessionStorage/);
  assert.doesNotMatch(read('index.html'),/frontend\/src\/auth/);
});

test('Phase 4.1 CI keeps previous regressions and explicit emulator auth/browser gates',()=>{
  const scripts=JSON.parse(read('package.json')).scripts;
  const ci=read('.github/workflows/site-foundation.yml');
  assert.match(scripts['site:check'],/site-auth-phase4-1\.test\.mjs/);
  assert.match(scripts['site:auth-browser'],/site-auth-browser\.cjs/);
  assert.match(ci,/VITE_ASTERIA_AUTH_ENABLED=true/);
  assert.match(ci,/VITE_FIREBASE_MODE=emulator/);
  assert.match(ci,/npm run site:auth-browser/);
  assert.match(ci,/asteria-phase-4-1-auth-evidence/);
  assert.match(ci,/npm run site:appearance-browser/);
  assert.match(ci,/npm run site:discovery-browser/);
  assert.match(ci,/npm run site:entry-browser/);
  assert.match(ci,/npm run site:integration-browser/);
});
