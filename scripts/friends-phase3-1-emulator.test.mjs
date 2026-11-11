import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {listAcceptedFriends,validateAcceptedFriendsList} from '../functions/friendRequestInbox.mjs';
import {createFriendRequestRecord,transitionFriendRelationship}
 from '../functions/friendRelationshipModel.mjs';

const projectId='demo-asteria';
const now=new Date('2026-11-11T04:30:00.000Z');
const createdAt='2026-11-10T00:00:00.000Z';
const disabled=new Set();
let env,app,db;
const auth={async getUser(uid){
 if(disabled.has(uid))return {uid,disabled:true};
 return {uid,disabled:false};
}};
const listing=(uid,cursor=0)=>listAcceptedFriends(db,auth,uid,
 {action:'list-friends',cursor},{now});
async function identity(uid,name,number){
 const lower=name.toLowerCase(),id=name+'#'+number,key=lower+'#'+number;
 await db.doc('users/'+uid).set({uid,username:name,usernameLower:lower,
   accountId:id,accountIdKey:key,accountNumber:number,
   accountIdAssignedAt:createdAt,email:'private@example.test'});
 await db.doc('accountIdAssignments/'+uid).set({uid,username:name,
   usernameLower:lower,accountId:id,accountIdKey:key,accountNumber:number,createdAt});
 await db.doc('accountIdRegistry/'+key).set({uid,usernameLower:lower,
   accountId:id,accountIdKey:key,accountNumber:number,createdAt});
}
async function accepted(a,b,offset=0){
 const request=createFriendRequestRecord(a,b,{
   now:new Date(now.getTime()-60000+offset)});
 const result=transitionFriendRelationship(request,{
   actorUid:b,action:'accept',expectedVersion:1,
   now:new Date(now.getTime()-59000+offset)});
 await db.doc('friendRelationships/'+result.pairId).set(result);
 return result;
}
before(async()=>{
 env=await initializeTestEnvironment({projectId,
   firestore:{rules:readFileSync('firestore.rules','utf8')}});
 app=initializeApp({projectId,name:'friends-phase31'});
 db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{
 disabled.clear();await env.clearFirestore();
 await identity('alice','Grayson','01448');
 await identity('bob','Poppa_J','52816');
 await identity('carol','Asteria','00009');
});
test('friends list requires exact action and bounded pagination',()=>{
 for(const invalid of [null,[],{}, {action:'list-friends'},
  {action:'list',cursor:0},{action:'list-friends',cursor:-1},
  {action:'list-friends',cursor:1},{action:'list-friends',cursor:1020},
  {action:'list-friends',cursor:0,uid:'bob'}])
  assert.throws(()=>validateAcceptedFriendsList(invalid),/Invalid friends list/);
 assert.deepEqual(validateAcceptedFriendsList({action:'list-friends',cursor:20}),
  {cursor:20});
});
test('only accepted mutual friends appear, with public handle and friendship date',async()=>{
 const pair=await accepted('alice','bob');
 const pending=createFriendRequestRecord('alice','carol',{
  now:new Date(now.getTime()-1000)});
 await db.doc('friendRelationships/'+pending.pairId).set(pending);
 const alice=await listing('alice');
 const bob=await listing('bob');
 assert.equal(alice.items.length,1);
 assert.equal(bob.items.length,1);
 assert.deepEqual(alice.items[0],{
   username:'Poppa_J',accountId:'Poppa_J#52816',
   friendsSinceMs:pair.updatedAtMs,version:pair.version});
 assert.deepEqual(bob.items[0],{
   username:'Grayson',accountId:'Grayson#01448',
   friendsSinceMs:pair.updatedAtMs,version:pair.version});
 assert.equal((await listing('carol')).items.length,0);
 assert.equal(alice.nextCursor,null);
 const client=env.authenticatedContext('alice').firestore();
 await assertFails(getDoc(doc(client,'friendRelationships/alice~bob')));
 await assertFails(getDocs(collection(client,'friendRelationships')));
 assert.equal(JSON.stringify(alice).includes('alice~bob'),false);
 assert.equal(JSON.stringify(alice).includes('private@example.test'),false);
});
test('renaming a friend changes only the public handle, not the UID friendship',async()=>{
 await accepted('alice','bob');
 await db.doc('users/bob').update({username:'Renamed',usernameLower:'renamed',
  accountId:'Renamed#52816',accountIdKey:'renamed#52816'});
 await db.doc('accountIdAssignments/bob').update({
  username:'Renamed',usernameLower:'renamed',
  accountId:'Renamed#52816',accountIdKey:'renamed#52816'});
 await db.doc('accountIdRegistry/poppa_j#52816').update({
  alias:true,activeAccountIdKey:'renamed#52816'});
 await db.doc('accountIdRegistry/renamed#52816').set({
  uid:'bob',usernameLower:'renamed',accountId:'Renamed#52816',
  accountIdKey:'renamed#52816',accountNumber:'52816',createdAt});
 const list=await listing('alice');
 assert.deepEqual(list.items.map(x=>x.accountId),['Renamed#52816']);
});
test('removed and blocked friendships disappear without exposing block state',async()=>{
 const record=await accepted('alice','bob');
 const removed=transitionFriendRelationship(record,{
  actorUid:'alice',action:'remove',expectedVersion:2,now});
 await db.doc('friendRelationships/alice~bob').set(removed);
 assert.deepEqual((await listing('alice')).items,[]);
 const blocked=transitionFriendRelationship(record,{
  actorUid:'bob',action:'block',expectedVersion:2,now});
 await db.doc('friendRelationships/alice~bob').set(blocked);
 assert.deepEqual((await listing('alice')).items,[]);
 assert.deepEqual((await listing('bob')).items,[]);
});
test('deleted/disabled identities and broken assignments cannot leak friends',async()=>{
 await accepted('alice','bob');
 disabled.add('bob');
 assert.equal((await listing('alice')).items.length,0);
 disabled.clear();disabled.add('alice');
 await assert.rejects(listing('alice'),/unavailable/);
 disabled.clear();
 await db.doc('accountIdAssignments/bob').delete();
 assert.equal((await listing('alice')).items.length,0);
 await db.doc('accountIdAssignments/alice').delete();
 await assert.rejects(listing('alice'),/unavailable/);
});
test('20-item pages show all accepted friends, without hidden UIDs or duplicates',async()=>{
 for(let i=0;i<22;i++){
   const uid='member'+String(i).padStart(2,'0');
   await identity(uid,'Member'+String(i).padStart(2,'0'),
     String(i).padStart(5,'0'));
   await accepted('alice',uid,i);
 }
 const first=await listing('alice',0);
 const second=await listing('alice',20);
 assert.equal(first.items.length,20);
 assert.equal(first.nextCursor,20);
 assert.equal(second.items.length,2);
 assert.equal(second.nextCursor,null);
 const handles=[...first.items,...second.items].map(x=>x.accountId);
 assert.equal(new Set(handles).size,22);
 assert.equal(JSON.stringify(first).includes('~'),false);
});
test('friends list shares the existing private 30/15min inbox read quota',async()=>{
 await accepted('alice','bob');
 await listing('alice');
 let record=(await db.doc('friendRequestInboxThrottle/alice').get()).data();
 assert.equal(record.windowCount,1);
 await listing('alice');
 record=(await db.doc('friendRequestInboxThrottle/alice').get()).data();
 assert.equal(record.windowCount,2);
 const client=env.authenticatedContext('alice').firestore();
 await assertFails(getDoc(doc(client,'friendRequestInboxThrottle/alice')));
});
