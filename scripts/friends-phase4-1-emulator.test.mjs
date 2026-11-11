import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {changeFriendRequest} from '../functions/friendRequestActions.mjs';
import {listFriendNotifications,markFriendNotificationRead}
 from '../functions/friendNotifications.mjs';

const projectId='demo-asteria';
const now=new Date('2026-11-11T06:30:00Z');
const at=n=>new Date(now.getTime()+n);
const createdAt='2026-11-10T00:00:00Z';
let env,app,db;
const auth={async getUser(uid){
 if(!['alice','bob','carol'].includes(uid))throw Error('No account');
 return {uid,disabled:false};
}};
async function seed(uid,username,suffix){
 const usernameLower=username.toLowerCase();
 const accountId=username+'#'+suffix,accountIdKey=usernameLower+'#'+suffix;
 await db.doc('users/'+uid).set({uid,username,usernameLower,
  accountId,accountIdKey,accountNumber:suffix,
  accountIdAssignedAt:createdAt,email:'private@example.test'});
 await db.doc('accountIdAssignments/'+uid).set({uid,username,usernameLower,
  accountId,accountIdKey,accountNumber:suffix,createdAt});
 await db.doc('accountIdRegistry/'+accountIdKey).set({
  uid,usernameLower,accountId,accountIdKey,accountNumber:suffix,createdAt});
}
const change=(actor,action,target,version,time=now,enabled=true)=>
 changeFriendRequest(db,auth,actor,{
  action,targetAccountId:target,...(version===undefined?{}:{expectedVersion:version})
 },{now:time,notificationsEnabled:enabled});
const inbox=uid=>'friendNotificationInbox/'+uid+'/items';
before(async()=>{
 env=await initializeTestEnvironment({projectId,
  firestore:{rules:readFileSync('firestore.rules','utf8')}});
 app=initializeApp({projectId,name:'friends-phase41'});
 db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{
 await env.clearFirestore();
 await seed('alice','Grayson','01448');
 await seed('bob','Poppa_J','52816');
 await seed('carol','Asteria','00009');
});
test('server change atomically emits private incoming and accepted notifications',async()=>{
 await change('alice','send','Poppa_J#52816');
 const incoming=await listFriendNotifications(db,'bob');
 assert.equal(incoming.notifications.length,1);
 assert.equal(incoming.notifications[0].kind,'incoming-request');
 assert.equal((await listFriendNotifications(db,'alice')).notifications.length,0);
 await change('bob','accept','Grayson#01448',1,at(1000));
 assert.equal((await listFriendNotifications(db,'alice')).notifications[0].kind,'request-accepted');
 assert.equal((await db.collection('friendRelationships').get()).size,1);
 const id=incoming.notifications[0].notificationId;
 const ack=await markFriendNotificationRead(db,'bob',id,{now:at(2000)});
 assert.equal(ack.alreadyRead,false);
 assert.equal((await markFriendNotificationRead(db,'bob',id,{now:at(3000)})).alreadyRead,true);
});
test('all direct browser operations are denied for own, other and anonymous inboxes',async()=>{
 await change('alice','send','Poppa_J#52816');
 const notice=(await listFriendNotifications(db,'bob')).notifications[0];
 for(const context of [env.authenticatedContext('alice'),
  env.authenticatedContext('bob'),env.unauthenticatedContext()]){
  const client=context.firestore();
  for(const uid of ['alice','bob','carol']){
   const path=inbox(uid)+'/'+notice.notificationId;
   await assertFails(getDoc(doc(client,path)));
   await assertFails(getDocs(collection(client,inbox(uid))));
   await assertFails(setDoc(doc(client,path),{kind:'incoming-request'}));
   await assertFails(updateDoc(doc(client,path),{readAt:new Date()}));
   await assertFails(deleteDoc(doc(client,path)));
  }
 }
});
test('disabled gate produces no records; stale action and quota failure emit no event',async()=>{
 await change('alice','send','Poppa_J#52816',undefined,now,false);
 assert.equal((await listFriendNotifications(db,'bob')).notifications.length,0);
 await assert.rejects(change('bob','accept','Grayson#01448',7,at(1000)),/changed/);
 assert.equal((await listFriendNotifications(db,'alice')).notifications.length,0);
 await change('bob','accept','Grayson#01448',1,at(1000),true);
 assert.equal((await listFriendNotifications(db,'alice')).notifications.length,1);
 await assert.rejects(change('bob','accept','Grayson#01448',1,at(1000)),/changed/);
 assert.equal((await listFriendNotifications(db,'alice')).notifications.length,1);
});
test('block remains private to actor, and remove sends neutral notices to both',async()=>{
 await change('alice','send','Poppa_J#52816');
 await change('bob','accept','Grayson#01448',1,at(1000));
 await change('alice','remove','Poppa_J#52816',2,at(2000));
 assert.equal((await listFriendNotifications(db,'bob')).notifications[0].kind,'friend-removed');
 await change('alice','block','Poppa_J#52816',3,at(3000));
 assert.equal((await listFriendNotifications(db,'alice')).notifications[0].kind,'player-blocked');
 assert.equal((await listFriendNotifications(db,'bob')).notifications[0].kind,'friend-removed');
 await change('alice','unblock','Poppa_J#52816',4,at(4000));
 assert.equal((await listFriendNotifications(db,'alice')).notifications[0].kind,'player-unblocked');
 assert.equal((await listFriendNotifications(db,'bob')).notifications[0].kind,'friend-removed');
 await assert.rejects(change('alice','send','Poppa_J#52816',undefined,at(5000)),/unavailable/);
});
test('notification read quota documents are inaccessible to browser clients',async()=>{
 await change('alice','send','Poppa_J#52816');
 for(const context of [env.authenticatedContext('alice'),
  env.authenticatedContext('bob'),env.unauthenticatedContext()]){
  const client=context.firestore();
  for(const uid of ['alice','bob']){
   const path='friendNotificationAccessThrottle/'+uid;
   await assertFails(getDoc(doc(client,path)));
   await assertFails(setDoc(doc(client,path),{listCount:999}));
  }
  await assertFails(getDocs(collection(client,'friendNotificationAccessThrottle')));
 }
});
test('recipient cannot read or acknowledge other recipient notifications',async()=>{
 await change('alice','send','Poppa_J#52816');
 const id=(await listFriendNotifications(db,'bob')).notifications[0].notificationId;
 await assert.rejects(markFriendNotificationRead(db,'alice',id),/unavailable/);
 await assert.rejects(listFriendNotifications(db,'alice',{cursor:id}),/unavailable/);
 assert.equal((await listFriendNotifications(db,'bob')).notifications[0].readAt,null);
});
