import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {ensureAccountIdentityProfile} from '../functions/accountIdentityProfile.mjs';

const projectId='demo-asteria';
let env,adminApp,db;
const user=uid=>env.authenticatedContext(uid).firestore();
before(async()=>{
  env=await initializeTestEnvironment({projectId,
    firestore:{rules:readFileSync('firestore.rules','utf8')}});
  adminApp=initializeApp({projectId,name:'account-id-phase13'});
  db=getFirestore(adminApp);
});
after(async()=>{await env?.cleanup();await deleteApp(adminApp);});
beforeEach(async()=>{await env.clearFirestore();});

test('legacy users can update ordinary profile fields until ID assignment',async()=>{
  const own=doc(user('alice'),'users/alice');
  await assertSucceeds(setDoc(own,{uid:'alice',username:'Asteria',firstName:'Old'}));
  await assertSucceeds(updateDoc(own,{username:'Updated',firstName:'New'}));
  assert.equal((await assertSucceeds(getDoc(own))).data().firstName,'New');
});
test('users cannot fabricate identity fields during profile creation or updates',async()=>{
  const own=doc(user('alice'),'users/alice');
  await assertFails(setDoc(own,{uid:'alice',username:'Asteria',accountId:'Asteria#01234'}));
  await assertSucceeds(setDoc(own,{uid:'alice',username:'Asteria'}));
  await assertFails(updateDoc(own,{accountNumber:'01234'}));
  await assertFails(updateDoc(own,{accountIdKey:'asteria#01234'}));
  await assertFails(updateDoc(own,{accountIdAssignedAt:'2026-11-09T09:30:00Z'}));
});
test('Admin allocates atomic identity; user can see own ID but cannot change it or username',async()=>{
  await db.doc('users/alice').set({uid:'alice',username:'Asteria',role:'account'});
  const result=await ensureAccountIdentityProfile(db,'alice',{nextNumber:()=> '01416'});
  assert.equal(result.accountId,'Asteria#01416');
  const own=doc(user('alice'),'users/alice');
  assert.equal((await assertSucceeds(getDoc(own))).data().accountNumber,'01416');
  await assertSucceeds(updateDoc(own,{firstName:'Allowed'}));
  await assertFails(updateDoc(own,{accountId:'Asteria#99999'}));
  await assertFails(updateDoc(own,{accountNumber:'99999'}));
  await assertFails(updateDoc(own,{accountIdKey:'asteria#99999'}));
  await assertFails(updateDoc(own,{accountIdAssignedAt:'forged'}));
  await assertFails(updateDoc(own,{username:'Another'}));
  await assertFails(updateDoc(own,{usernameLower:'another'}));
  await assertFails(deleteDoc(own));
  await assertFails(getDoc(doc(user('bob'),'users/alice')));
  assert.equal((await db.doc('users/alice').get()).data().firstName,'Allowed');
});
test('assignment and registry stay completely private, including owner reads and writes',async()=>{
  await db.doc('users/alice').set({uid:'alice',username:'Asteria'});
  await ensureAccountIdentityProfile(db,'alice',{nextNumber:()=> '00007'});
  for(const uid of ['alice','bob']){
    const ref1=doc(user(uid),'accountIdAssignments/alice');
    const ref2=doc(user(uid),'accountIdRegistry/asteria#00007');
    await assertFails(getDoc(ref1));
    await assertFails(getDoc(ref2));
    await assertFails(setDoc(ref1,{uid}));
    await assertFails(setDoc(ref2,{uid}));
  }
});
test('simultaneous real Firestore transactions safely handle duplicate candidate',async()=>{
  await db.doc('users/alice').set({uid:'alice',username:'Asteria'});
  await db.doc('users/bob').set({uid:'bob',username:'asteria'});
  let a=0,b=0;
  const [first,second]=await Promise.all([
    ensureAccountIdentityProfile(db,'alice',{nextNumber:()=>['00011','00012'][a++]}),
    ensureAccountIdentityProfile(db,'bob',{nextNumber:()=>['00011','00013'][b++]})
  ]);
  assert.notEqual(first.accountNumber,second.accountNumber);
  assert.equal((await db.doc('accountIdRegistry/asteria#'+first.accountNumber).get()).data().uid,'alice');
  assert.equal((await db.doc('accountIdRegistry/asteria#'+second.accountNumber).get()).data().uid,'bob');
});
