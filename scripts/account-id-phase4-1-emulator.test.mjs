import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,updateDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {ensureAccountIdentityProfile} from '../functions/accountIdentityProfile.mjs';
import {inspectLegacyAccountIdentity,backfillLegacyAccountIdentity}
  from '../functions/accountIdentityLegacy.mjs';

const projectId='demo-asteria';
let env,app,db;
const member=uid=>env.authenticatedContext(uid).firestore();
const auth={getUser:async uid=>({
  uid,email:uid+'@example.test',
  displayName:uid==='bob'?'asteria':'Asteria',disabled:false
})};
before(async()=>{
  env=await initializeTestEnvironment({
    projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}
  });
  app=initializeApp({projectId,name:'account-id-release41'});
  db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{await env.clearFirestore();});
const seed=async(uid,username)=>db.doc('users/'+uid).set({
  uid,username,usernameLower:username.toLowerCase(),email:uid+'@example.test',
  firstName:'Preserve',characters:[{id:'hero',xp:120,inventory:[{name:'Potion',qty:2}]}]
});

test('two account owners cannot claim a shared normalized username and suffix',async()=>{
  await seed('alice','Asteria');await seed('bob','asteria');
  let a=0,b=0;
  const [one,two]=await Promise.all([
    ensureAccountIdentityProfile(db,'alice',{nextNumber:()=>['01416','01417'][a++]}),
    ensureAccountIdentityProfile(db,'bob',{nextNumber:()=>['01416','01418'][b++]})
  ]);
  assert.notEqual(one.accountNumber,two.accountNumber);
  for(const [uid,result] of [['alice',one],['bob',two]]){
    const profile=(await db.doc('users/'+uid).get()).data();
    assert.equal(profile.accountId,result.accountId);
    assert.equal(profile.characters[0].inventory[0].qty,2);
    assert.equal((await db.doc('accountIdRegistry/'+profile.accountIdKey).get()).data().uid,uid);
    assert.equal((await assertSucceeds(getDoc(doc(member(uid),'users/'+uid)))).data().accountId,result.accountId);
  }
});
test('signed-in strangers cannot see private account profiles or either mapping',async()=>{
  await seed('alice','Asteria');
  await ensureAccountIdentityProfile(db,'alice',{nextNumber:()=> '00001'});
  await assertFails(getDoc(doc(member('bob'),'users/alice')));
  for(const uid of ['alice','bob','eve']){
    await assertFails(getDoc(doc(member(uid),'accountIdAssignments/alice')));
    await assertFails(getDoc(doc(member(uid),'accountIdRegistry/asteria#00001')));
  }
  await assertFails(updateDoc(doc(member('alice'),'users/alice'),{accountNumber:'77777'}));
  await assertFails(updateDoc(doc(member('alice'),'users/alice'),{username:'Other'}));
  await assertSucceeds(updateDoc(doc(member('alice'),'users/alice'),{firstName:'Allowed'}));
  assert.equal((await db.doc('users/alice').get()).data().firstName,'Allowed');
});
test('preflight is read-only and one approved legacy assignment is idempotent',async()=>{
  await seed('alice','Asteria');
  const beforeCount=(await db.collection('accountIdRegistry').get()).size;
  assert.equal((await inspectLegacyAccountIdentity(db,auth,'alice')).status,'eligible');
  assert.equal((await db.collection('accountIdRegistry').get()).size,beforeCount);
  const consent={enabled:true,confirmation:'BACKFILL-ACCOUNT-ID:alice',
    projectId,nextNumber:()=> '01416'};
  const assigned=await backfillLegacyAccountIdentity(db,auth,'alice',consent);
  assert.equal(assigned.accountId,'Asteria#01416');
  const repeated=await backfillLegacyAccountIdentity(db,auth,'alice',consent);
  assert.equal(repeated.status,'already-assigned');
  assert.equal((await db.collection('accountIdRegistry').get()).size,1);
});
test('mismatched legacy account cannot be allocated or overwrite private user data',async()=>{
  await seed('alice','Asteria');
  await db.doc('users/alice').update({email:'other@example.test'});
  assert.equal((await inspectLegacyAccountIdentity(db,auth,'alice')).status,'manual-review');
  await assert.rejects(backfillLegacyAccountIdentity(db,auth,'alice',{
    enabled:true,confirmation:'BACKFILL-ACCOUNT-ID:alice',projectId
  }),/manual reconciliation/);
  assert.equal((await db.collection('accountIdRegistry').get()).empty,true);
  assert.equal((await db.doc('users/alice').get()).data().characters[0].xp,120);
});
