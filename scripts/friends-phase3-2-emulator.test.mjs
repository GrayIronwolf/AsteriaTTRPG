import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {changeFriendRequest,validateFriendRequestAction}
 from '../functions/friendRequestActions.mjs';
import {listAcceptedFriends,listBlockedFriends,listFriendRequests,
 nextConcurrentInboxQuota,validateBlockedFriendsList}
 from '../functions/friendRequestInbox.mjs';
import {friendRelationshipPath} from '../functions/friendRelationshipModel.mjs';

const projectId='demo-asteria';
const start=new Date('2026-11-11T05:00:00.000Z');
const time=n=>new Date(start.getTime()+n);
const createdAt='2026-11-10T00:00:00.000Z';
let env,app,db;
const disabled=new Set(),auth={
  async getUser(uid){
    if(!['alice','bob','carol'].includes(uid))throw new Error('Not found');
    return {uid,disabled:disabled.has(uid)};
  }
};
async function seed(uid,name,number){
  const lower=name.toLowerCase(),accountId=name+'#'+number,
    accountIdKey=lower+'#'+number;
  await db.doc('users/'+uid).set({uid,username:name,usernameLower:lower,
    accountId,accountIdKey,accountNumber:number,
    accountIdAssignedAt:createdAt,email:'secret@example.test'});
  await db.doc('accountIdAssignments/'+uid).set({
    uid,username:name,usernameLower:lower,accountId,accountIdKey,
    accountNumber:number,createdAt
  });
  await db.doc('accountIdRegistry/'+accountIdKey).set({
    uid,usernameLower:lower,accountId,accountIdKey,accountNumber:number,createdAt
  });
}
const action=(uid,kind,target,version,at=start)=>
 changeFriendRequest(db,auth,uid,{
   action:kind,targetAccountId:target,
   ...(version===undefined?{}:{expectedVersion:version})
 },{now:at});
const blocked=(uid,at=start)=>listBlockedFriends(db,auth,uid,{
 action:'list-blocked',cursor:0
},{now:at});
const friends=(uid,at=start)=>listAcceptedFriends(db,auth,uid,{
 action:'list-friends',cursor:0
},{now:at});
const pair=()=>db.doc(friendRelationshipPath('alice','bob'));
before(async()=>{
 env=await initializeTestEnvironment({projectId,
  firestore:{rules:readFileSync('firestore.rules','utf8')}});
 app=initializeApp({projectId,name:'friends-phase32'});
 db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{
 disabled.clear();await env.clearFirestore();
 await seed('alice','Grayson','01448');
 await seed('bob','Poppa_J','52816');
 await seed('carol','Asteria','00009');
});
test('remove friend requires a current accepted relationship and correct version',async()=>{
 await action('alice','send','Poppa_J#52816');
 await action('bob','accept','Grayson#01448',1,time(1000));
 assert.equal((await friends('alice')).items[0].version,2);
 await assert.rejects(action('carol','remove','Poppa_J#52816',2,time(2000)),/unavailable/);
 await assert.rejects(action('alice','remove','Poppa_J#52816',1,time(2000)),/changed/);
 const removed=await action('alice','remove','Poppa_J#52816',2,time(2000));
 assert.deepEqual(removed,{ok:true,status:'removed',version:3,expiresAtMs:null});
 assert.equal((await friends('alice',time(2001))).items.length,0);
 assert.equal((await friends('bob',time(2001))).items.length,0);
 await assert.rejects(action('alice','send','Poppa_J#52816',undefined,time(2001)),/unavailable/);
});
test('one actor can block a stranger without first sending a request',async()=>{
 const response=await action('alice','block','Poppa_J#52816');
 assert.equal(response.status,'blocked');
 assert.equal(response.version,2);
 assert.deepEqual((await pair().get()).data().blockedByUids,['alice']);
 assert.deepEqual((await blocked('alice')).items.map(x=>x.accountId),['Poppa_J#52816']);
 assert.equal((await blocked('bob')).items.length,0);
 const client=env.authenticatedContext('bob').firestore();
 await assertFails(getDoc(doc(client,friendRelationshipPath('alice','bob'))));
 await assertFails(getDocs(collection(client,'friendRelationships')));
 await assertFails(setDoc(doc(client,friendRelationshipPath('alice','bob')),{status:'accepted'}));
});
test('mutual blocks remain independent and do not expose the other blocker',async()=>{
 await action('alice','block','Poppa_J#52816');
 await action('bob','block','Grayson#01448',undefined,time(1000));
 assert.deepEqual((await pair().get()).data().blockedByUids,['alice','bob']);
 let list=await blocked('alice',time(1001));
 assert.deepEqual(Object.keys(list.items[0]).sort(),
   ['accountId','blockedAtMs','username','version']);
 assert.equal(JSON.stringify(list).includes('blockedByUids'),false);
 assert.equal(JSON.stringify(list).includes('alice~bob'),false);
 const out=await action('alice','unblock','Poppa_J#52816',3,time(2000));
 assert.equal(out.status,'blocked');
 assert.equal((await blocked('alice',time(2001))).items.length,0);
 assert.equal((await blocked('bob',time(2001))).items.length,1);
 const end=await action('bob','unblock','Grayson#01448',4,time(3000));
 assert.equal(end.status,'removed');
 assert.equal((await pair().get()).data().blockedByUids.length,0);
 await assert.rejects(action('bob','send','Grayson#01448',undefined,time(3001)),/unavailable/);
});
test('blocking an accepted friendship hides both accepted lists; stale revisions rejected',async()=>{
 await action('alice','send','Poppa_J#52816');
 await action('bob','accept','Grayson#01448',1,time(1000));
 await assert.rejects(action('alice','block','Poppa_J#52816',1,time(2000)),/changed/);
 await action('alice','block','Poppa_J#52816',2,time(2000));
 assert.equal((await friends('alice',time(2001))).items.length,0);
 assert.equal((await friends('bob',time(2001))).items.length,0);
 await assert.rejects(action('bob','send','Grayson#01448',undefined,time(2100)),/unavailable/);
});
test('malformed management payloads and blocked list queries are denied',()=>{
 for(const bad of [
  {action:'remove',targetAccountId:'Poppa_J#52816'},
  {action:'unblock',targetAccountId:'Poppa_J#52816',expectedVersion:0},
  {action:'block',targetAccountId:'Poppa_J#52816',uid:'bob'},
  {action:'block',targetAccountId:'Poppa_J#52816',expectedVersion:0},
  {action:'remove',targetAccountId:'Poppa_J#52816',pairId:'alice~bob',expectedVersion:1}
 ]) assert.throws(()=>validateFriendRequestAction(bad));
 for(const bad of [
  {},{action:'list-blocked'},{action:'list-blocked',cursor:1},
  {action:'list-blocked',cursor:0,uid:'bob'},{action:'list-friends',cursor:0}
 ]) assert.throws(()=>validateBlockedFriendsList(bad));
});
test('disabled and renamed accounts respect private block management',async()=>{
 await action('alice','block','Poppa_J#52816');
 disabled.add('bob');
 assert.equal((await blocked('alice')).items.length,0);
 disabled.clear();
 await db.doc('users/bob').update({username:'Renamed',usernameLower:'renamed',
  accountId:'Renamed#52816',accountIdKey:'renamed#52816'});
 await db.doc('accountIdAssignments/bob').update({
  username:'Renamed',usernameLower:'renamed',
  accountId:'Renamed#52816',accountIdKey:'renamed#52816'});
 await db.doc('accountIdRegistry/poppa_j#52816').update({
  alias:true,activeAccountIdKey:'renamed#52816'});
 await db.doc('accountIdRegistry/renamed#52816').set({
  uid:'bob',usernameLower:'renamed',accountId:'Renamed#52816',
  accountIdKey:'renamed#52816',accountNumber:'52816',createdAt
 });
 assert.deepEqual((await blocked('alice')).items.map(x=>x.accountId),
  ['Renamed#52816']);
 const response=await action('alice','unblock','Renamed#52816',2,time(1000));
 assert.equal(response.status,'removed');
});

test('three inbox views share quota safely when request timestamps arrive out of order',async()=>{
 await action('alice','send','Poppa_J#52816',undefined,time(1000));
 await action('bob','accept','Grayson#01448',1,time(2000));
 // Reproduce a later timestamp committing before an earlier-started view.
 const first=await blocked('alice',time(5100));
 assert.deepEqual(first.items,[]);
 const second=await friends('alice',time(5098));
 assert.deepEqual(second.items.map(x=>x.accountId),['Poppa_J#52816']);
 const third=await listFriendRequests(db,auth,'alice',{
   action:'list',direction:'incoming',cursor:0
 },{now:time(5099)});
 assert.deepEqual(third.items,[]);
 const quota=(await db.doc('friendRequestInboxThrottle/alice').get()).data();
 assert.equal(quota.windowCount,3);
 assert.equal(quota.lastAttemptAtMs,time(5100).getTime());
 const next=nextConcurrentInboxQuota(quota,'alice',time(5097).getTime());
 assert.equal(next.windowCount,4);
 assert.equal(next.lastAttemptAtMs,quota.lastAttemptAtMs);
 assert.throws(()=>nextConcurrentInboxQuota(quota,'alice',time(-70_000).getTime()),
  /unavailable/);
});
