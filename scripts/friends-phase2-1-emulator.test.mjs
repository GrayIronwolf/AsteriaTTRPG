import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,getDocs,collection}
  from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {
  createFriendRequestRecord,friendRelationshipPath,
  transitionFriendRelationship,nextFriendRequestIssueQuota
} from '../functions/friendRelationshipModel.mjs';

let env,app,db;
const projectId='demo-asteria';
const now=new Date('2026-11-11T03:00:00.000Z');
const other=new Date(now.getTime()+1000);
before(async()=>{
  env=await initializeTestEnvironment({projectId,
    firestore:{rules:readFileSync('firestore.rules','utf8')}});
  app=initializeApp({projectId,name:'friend-phase2-1-model'});
  db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{await env.clearFirestore();});
test('all visitors, participants and unrelated signed-in users are denied get/list/write for private friend documents',async()=>{
  const item=createFriendRequestRecord('alice','bob',{now});
  const path=friendRelationshipPath('alice','bob');
  await db.doc(path).set(item);
  await db.doc('friendRequestIssueThrottle/alice').set(
    nextFriendRequestIssueQuota(null,'alice',{now}));
  for(const uid of [null,'alice','bob','eve']){
    const fs=uid?env.authenticatedContext(uid).firestore():
      env.unauthenticatedContext().firestore();
    const relationship=doc(fs,path);
    const throttle=doc(fs,'friendRequestIssueThrottle/alice');
    for(const ref of [relationship,throttle]){
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref,{uid:uid||'anonymous',status:'accepted'}));
      await assertFails(updateDoc(ref,{status:'accepted'}));
      await assertFails(deleteDoc(ref));
    }
    await assertFails(getDocs(collection(fs,'friendRelationships')));
    await assertFails(getDocs(collection(fs,'friendRequestIssueThrottle')));
  }
  const persisted=(await db.doc(path).get()).data();
  assert.equal(persisted.status,'pending');
  assert.equal(persisted.pairId,'alice~bob');
});
test('only server admin can atomically progress an existing friendship without creating duplicate pair records',async()=>{
  const path=friendRelationshipPath('alice','bob');
  const initial=createFriendRequestRecord('alice','bob',{now});
  await db.doc(path).create(initial);
  const accepted=await db.runTransaction(async tx=>{
    const ref=db.doc(path);
    const snap=await tx.get(ref);
    const next=transitionFriendRelationship(snap.data(),
      {actorUid:'bob',action:'accept',expectedVersion:1,now:other});
    tx.update(ref,next);
    return next;
  });
  assert.equal(accepted.status,'accepted');
  assert.equal((await db.doc(path).get()).data().version,2);
  await assert.rejects(db.doc(friendRelationshipPath('bob','alice'))
    .create(initial),/ALREADY_EXISTS|already exists/i);
  assert.equal((await db.collection('friendRelationships').get()).size,1);
});
test('client cannot forge block status or reset quota, even when it owns an account profile',async()=>{
  await db.doc('users/alice').set({uid:'alice',username:'Alice'});
  const relationship=createFriendRequestRecord('alice','bob',{now});
  await db.doc(friendRelationshipPath('alice','bob')).set(relationship);
  const client=env.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(client,'friendRelationships/alice~bob'),
    {...relationship,status:'blocked',blockedByUids:['alice']}));
  await assertFails(setDoc(doc(client,'friendRequestIssueThrottle/alice'),
    {uid:'alice',issued:0,windowStartMs:0,updatedAtMs:0}));
  assert.equal((await db.doc('friendRelationships/alice~bob').get()).data().status,'pending');
});
