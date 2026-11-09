import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,updateDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {inspectLegacyAccountIdentity,backfillLegacyAccountIdentity} from '../functions/accountIdentityLegacy.mjs';
let env,app,db;
const auth={getUser:async uid=>({uid,displayName:'Asteria',email:'alice@example.test',disabled:false})};
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-asteria',firestore:{rules:readFileSync('firestore.rules','utf8')}});
  app=initializeApp({projectId:'demo-asteria',name:'legacy-id-phase-2-2'});db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{await env.clearFirestore();});
test('single legacy account gets immutable ID and directory stays private',async()=>{
  await db.doc('users/alice').set({uid:'alice',username:'Asteria',usernameLower:'asteria',
    email:'alice@example.test',firstName:'Keep'});
  assert.equal((await inspectLegacyAccountIdentity(db,auth,'alice')).status,'eligible');
  const result=await backfillLegacyAccountIdentity(db,auth,'alice',{
    enabled:true,confirmation:'BACKFILL-ACCOUNT-ID:alice',projectId:'demo-asteria',
    nextNumber:()=> '01416'
  });
  assert.equal(result.accountId,'Asteria#01416');
  const owner=env.authenticatedContext('alice').firestore();
  const own=doc(owner,'users/alice');
  assert.equal((await assertSucceeds(getDoc(own))).data().firstName,'Keep');
  await assertFails(updateDoc(own,{accountNumber:'00001'}));
  await assertFails(updateDoc(own,{username:'Other'}));
  await assertFails(getDoc(doc(owner,'accountIdAssignments/alice')));
  await assertFails(getDoc(doc(owner,'accountIdRegistry/asteria#01416')));
  await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(),'users/alice')));
});
test('profile mismatch yields no backfill or registry write',async()=>{
  await db.doc('users/alice').set({uid:'alice',username:'Asteria',
    usernameLower:'asteria',email:'wrong@example.test'});
  await assert.rejects(backfillLegacyAccountIdentity(db,auth,'alice',{
    enabled:true,confirmation:'BACKFILL-ACCOUNT-ID:alice',projectId:'demo-asteria'
  }),/manual reconciliation/);
  assert.equal((await db.collection('accountIdRegistry').get()).empty,true);
});
