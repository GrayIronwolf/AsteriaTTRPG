import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {getDoc,doc,getDocs,collection} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {listFriendRequests,validateFriendRequestList,
  nextFriendInboxQuota,FRIEND_INBOX_LIMITS} from '../functions/friendRequestInbox.mjs';
import {createFriendRequestRecord,transitionFriendRelationship} from '../functions/friendRelationshipModel.mjs';

const projectId='demo-asteria';
const now=new Date('2026-11-11T04:00:00.000Z');
const createdAt='2026-11-10T00:00:00.000Z';
let env,app,db;
const inactive=new Set(),auth={
 async getUser(uid){
   if(inactive.has(uid))return {uid,disabled:true};
   return {uid,disabled:false};
 }
};
const query=(actor,direction,cursor=0)=>listFriendRequests(db,auth,actor,
  {action:'list',direction,cursor},{now});
async function identity(uid,name,number){
 const lower=name.toLowerCase(),id=name+'#'+number,key=lower+'#'+number;
 await db.doc('users/'+uid).set({uid,username:name,usernameLower:lower,
   accountId:id,accountIdKey:key,accountNumber:number,
   accountIdAssignedAt:createdAt,email:'hidden@example.test'});
 await db.doc('accountIdAssignments/'+uid).set({uid,username:name,
   usernameLower:lower,accountId:id,accountIdKey:key,accountNumber:number,createdAt});
 await db.doc('accountIdRegistry/'+key).set({uid,usernameLower:lower,
   accountId:id,accountIdKey:key,accountNumber:number,createdAt});
}
async function request(from,to,ms=0){
 const created=createFriendRequestRecord(from,to,{now:new Date(now.getTime()-60_000+ms)});
 await db.doc('friendRelationships/'+created.pairId).set(created);
 return created;
}
before(async()=>{
 env=await initializeTestEnvironment({projectId,
  firestore:{rules:readFileSync('firestore.rules','utf8')}});
 app=initializeApp({projectId,name:'friends-phase23'});
 db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{
 inactive.clear();await env.clearFirestore();
 await identity('alice','Grayson','01448');
 await identity('bob','Poppa_J','52816');
 await identity('carol','Asteria','00009');
});
test('inbox rejects malformed cursors, actions and private arbitrary parameters',()=>{
 for(const payload of [
  null,[],{}, {action:'list',direction:'incoming'},
  {action:'list',direction:'friends',cursor:0},
  {action:'list',direction:'incoming',cursor:-20},
  {action:'list',direction:'incoming',cursor:19},
  {action:'list',direction:'incoming',cursor:1020},
  {action:'list',direction:'incoming',cursor:0,uid:'bob'}
 ])assert.throws(()=>validateFriendRequestList(payload),/Invalid/);
 assert.deepEqual(validateFriendRequestList({
   action:'list',direction:'incoming',cursor:20
 }),{direction:'incoming',cursor:20});
});
test('only incoming and outgoing pending summaries are visible, without UIDs or pair IDs',async()=>{
 await request('alice','bob');
 await request('carol','alice');
 let result=await query('alice','incoming');
 assert.equal(result.items.length,1);
 assert.deepEqual(result.items.map(x=>x.accountId),['Asteria#00009']);
 assert.equal(result.items[0].direction,'incoming');
 assert.equal(result.items[0].status,'pending');
 assert.equal(result.items[0].version,1);
 assert.deepEqual(Object.keys(result.items[0]).sort(),[
   'accountId','direction','expiresAtMs','requestedAtMs','status','username','version'
 ]);
 assert.equal(result.nextCursor,null);
 result=await query('alice','outgoing');
 assert.deepEqual(result.items.map(x=>x.accountId),['Poppa_J#52816']);
 assert.equal((await query('bob','outgoing')).items.length,0);
 const client=env.authenticatedContext('alice').firestore();
 await assertFails(getDoc(doc(client,'friendRelationships/alice~bob')));
 await assertFails(getDocs(collection(client,'friendRelationships')));
});
test('accepted, expired, blocked or invalid records are not shown in inbox',async()=>{
 const original=await request('alice','bob');
 let accepted=transitionFriendRelationship(original,{
   action:'accept',actorUid:'bob',expectedVersion:1,
   now:new Date(original.requestedAtMs+100)
 });
 await db.doc('friendRelationships/alice~bob').set(accepted);
 assert.equal((await query('alice','outgoing')).items.length,0);
 const blocked=transitionFriendRelationship(accepted,{
   action:'block',actorUid:'alice',expectedVersion:2,
   now:new Date(original.requestedAtMs+200)
 });
 await db.doc('friendRelationships/alice~bob').set(blocked);
 assert.equal((await query('bob','incoming')).items.length,0);
 await db.doc('friendRelationships/alice~bob').update({status:'pending'});
 assert.equal((await query('bob','incoming')).items.length,0);
});
test('renamed current accounts are resolved on read; old aliases remain hidden',async()=>{
 await request('alice','bob');
 await db.doc('users/alice').update({
   username:'Renamed',usernameLower:'renamed',
   accountId:'Renamed#01448',accountIdKey:'renamed#01448'
 });
 await db.doc('accountIdAssignments/alice').update({
   username:'Renamed',usernameLower:'renamed',
   accountId:'Renamed#01448',accountIdKey:'renamed#01448'
 });
 await db.doc('accountIdRegistry/grayson#01448').update({
   alias:true,activeAccountIdKey:'renamed#01448'
 });
 await db.doc('accountIdRegistry/renamed#01448').set({
   uid:'alice',usernameLower:'renamed',accountId:'Renamed#01448',
   accountIdKey:'renamed#01448',accountNumber:'01448',createdAt
 });
 const result=await query('bob','incoming');
 assert.deepEqual(result.items.map(x=>x.accountId),['Renamed#01448']);
});
test('disabled participants and invalid actor identity are suppressed',async()=>{
 await request('alice','bob');
 inactive.add('alice');
 assert.equal((await query('bob','incoming')).items.length,0);
 inactive.clear();inactive.add('bob');
 await assert.rejects(query('bob','incoming'),/unavailable/);
 inactive.clear();
 await db.doc('accountIdAssignments/bob').delete();
 await assert.rejects(query('bob','incoming'),/unavailable/);
});
test('bounded scan pagination never returns private pair paths or unbounded arrays',async()=>{
 for(let i=0;i<22;i++){
   const id='member'+String(i).padStart(2,'0');
   await identity(id,'Member'+String(i).padStart(2,'0'),
     String(i).padStart(5,'0'));
   await request(id,'alice',i);
 }
 const first=await query('alice','incoming',0);
 const second=await query('alice','incoming',20);
 assert.equal(first.items.length,20);
 assert.equal(first.nextCursor,20);
 assert.equal(second.items.length,2);
 assert.equal(second.nextCursor,null);
 assert.equal(new Set([...first.items,...second.items].map(x=>x.accountId)).size,22);
 assert.equal(JSON.stringify(first).includes('~'),false);
});

test('inbox reads have per-account quotas and a private Firestore collection',async()=>{
 assert.equal(FRIEND_INBOX_LIMITS.perWindow,30);
 assert.equal(FRIEND_INBOX_LIMITS.perDay,120);
 let quota=null;
 const base=now.getTime();
 for(let i=0;i<30;i++)quota=nextFriendInboxQuota(quota,'alice',base+i);
 assert.equal(quota.windowCount,30);
 assert.throws(()=>nextFriendInboxQuota(quota,'alice',base+31),/rate limit/);
 assert.throws(()=>nextFriendInboxQuota({...quota,windowCount:0},'alice',base+31),/unavailable/);
 assert.throws(()=>nextFriendInboxQuota({...quota,uid:'bob'},'alice',base+31),/unavailable/);
 const next=nextFriendInboxQuota(quota,'alice',base+15*60*1000);
 assert.equal(next.windowCount,1);
 assert.equal(next.dayCount,31);
 await query('alice','incoming');
 const persisted=(await db.doc('friendRequestInboxThrottle/alice').get()).data();
 assert.equal(persisted.windowCount,1);
 const client=env.authenticatedContext('alice').firestore();
 await assertFails(getDoc(doc(client,'friendRequestInboxThrottle/alice')));
 await assertFails(getDocs(collection(client,'friendRequestInboxThrottle')));
});
