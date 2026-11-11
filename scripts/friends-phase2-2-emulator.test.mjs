import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {changeFriendRequest} from '../functions/friendRequestActions.mjs';
import {friendRelationshipPath,transitionFriendRelationship}
  from '../functions/friendRelationshipModel.mjs';

const projectId='demo-asteria';
const createdAt='2026-11-10T00:00:00.000Z';
const origin=new Date('2026-11-11T03:00:00.000Z');
const at=ms=>new Date(origin.getTime()+ms);
const day=24*60*60*1000;
let env,app,db;
const disabled=new Set(),auth={
  async getUser(uid){
    if(!['alice','bob','carol',...Array.from({length:13},(_,i)=>'target'+i)].includes(uid))
      throw new Error('User not found');
    return {uid,disabled:disabled.has(uid)};
  }
};
async function seed(uid,name,number){
  const lower=name.toLowerCase(),id=name+'#'+number,key=lower+'#'+number;
  await db.doc('users/'+uid).set({uid,username:name,usernameLower:lower,
    accountId:id,accountIdKey:key,accountNumber:number,
    accountIdAssignedAt:createdAt,email:'private@example.test'});
  await db.doc('accountIdAssignments/'+uid).set({uid,username:name,
    usernameLower:lower,accountId:id,accountIdKey:key,accountNumber:number,
    createdAt});
  await db.doc('accountIdRegistry/'+key).set({uid,usernameLower:lower,
    accountId:id,accountIdKey:key,accountNumber:number,createdAt});
}
const run=(actorUid,action,targetAccountId,expectedVersion,now=origin)=>
  changeFriendRequest(db,auth,actorUid,{
    action,targetAccountId,
    ...(expectedVersion===undefined?{}:{expectedVersion})
  },{now});
const pair=()=>db.doc(friendRelationshipPath('alice','bob'));
before(async()=>{
  env=await initializeTestEnvironment({projectId,
    firestore:{rules:readFileSync('firestore.rules','utf8')}});
  app=initializeApp({projectId,name:'friends-phase22'});
  db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{
  disabled.clear();
  await env.clearFirestore();
  await seed('alice','Grayson','01448');
  await seed('bob','Poppa_J','52816');
  await seed('carol','Asteria','00009');
});
test('send and recipient-only accept create one immutable pair; browser cannot read it',async()=>{
  const sent=await run('alice','send','Poppa_J#52816');
  assert.deepEqual(sent,{ok:true,status:'pending',version:1,
    expiresAtMs:origin.getTime()+14*day});
  const record=(await pair().get()).data();
  assert.deepEqual(record.participantUids,['alice','bob']);
  assert.equal(record.requesterUid,'alice');
  const client=env.authenticatedContext('alice').firestore();
  await assertFails(getDoc(doc(client,friendRelationshipPath('alice','bob'))));
  await assertFails(setDoc(doc(client,friendRelationshipPath('alice','bob')),
    {status:'accepted'}));
  await assert.rejects(run('alice','accept','Poppa_J#52816',1),/unavailable/);
  const accepted=await run('bob','accept','Grayson#01448',1,at(1000));
  assert.deepEqual(accepted,{ok:true,status:'accepted',version:2,expiresAtMs:null});
  assert.equal((await pair().get()).data().status,'accepted');
  assert.equal((await db.collection('friendRelationships').get()).size,1);
  assert.equal((await db.doc('friendRequestIssueThrottle/alice').get()).data().issued,1);
  assert.equal((await db.doc('friendRequestIssueThrottle/bob').get()).exists,false);
});
test('duplicate, reciprocal, stale and forged actions reject without issuing quota units',async()=>{
  await run('alice','send','Poppa_J#52816');
  await assert.rejects(run('alice','send','Poppa_J#52816'),/unavailable/);
  await assert.rejects(run('bob','send','Grayson#01448'),/unavailable/);
  await assert.rejects(run('carol','cancel','Poppa_J#52816',1),/unavailable/);
  await assert.rejects(run('alice','cancel','Poppa_J#52816',3),/changed/);
  assert.equal((await db.doc('friendRequestIssueThrottle/alice').get()).data().issued,1);
  assert.equal((await db.doc('friendRequestIssueThrottle/bob').get()).exists,false);
  await run('alice','cancel','Poppa_J#52816',1,at(2000));
  assert.equal((await pair().get()).data().status,'cancelled');
  await assert.rejects(run('alice','send','Poppa_J#52816',undefined,at(2001)),/unavailable/);
});
test('recipient declines; blocked and disabled accounts cannot receive new requests',async()=>{
  await run('alice','send','Poppa_J#52816');
  await run('bob','decline','Grayson#01448',1,at(500));
  assert.equal((await pair().get()).data().status,'declined');
  await assert.rejects(run('alice','send','Poppa_J#52816',undefined,at(day)),/unavailable/);
  const previous=(await pair().get()).data();
  const blocked=transitionFriendRelationship(previous,{
    actorUid:'bob',action:'block',expectedVersion:previous.version,now:at(day+1000)
  });
  await pair().update(blocked);
  await assert.rejects(run('alice','send','Poppa_J#52816',undefined,at(9*day)),/unavailable/);
  disabled.add('bob');
  await assert.rejects(run('alice','send','Poppa_J#52816',undefined,at(10*day)),/unavailable/);
  assert.equal((await pair().get()).data().status,'blocked');
});
test('self-friending and non-canonical or deleted identities never create relationships',async()=>{
  await assert.rejects(run('alice','send','Grayson#01448'),/unavailable/);
  await db.doc('accountIdRegistry/poppa_j#52816').update({
    alias:true,activeAccountIdKey:'other#52816'
  });
  await assert.rejects(run('alice','send','Poppa_J#52816'),/unavailable/);
  assert.equal((await db.collection('friendRelationships').get()).size,0);
  assert.equal((await db.doc('friendRequestIssueThrottle/alice').get()).exists,false);
});
test('accepted or cancelled request cannot be concurrently accepted again',async()=>{
  await run('alice','send','Poppa_J#52816');
  const outcomes=await Promise.allSettled([
    run('bob','accept','Grayson#01448',1,at(1000)),
    run('bob','accept','Grayson#01448',1,at(1000))
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.equal((await pair().get()).data().version,2);
});
test('ten distinct sends per day enforced atomically, without duplicate pairs',async()=>{
  for(let i=0;i<11;i++)
    await seed('target'+i,'Target'+i,String(i).padStart(5,'0'));
  for(let i=0;i<10;i++){
    const recipient='Target'+i+'#'+String(i).padStart(5,'0');
    const result=await run('alice','send',recipient,undefined,at(i*16*60*1000));
    assert.equal(result.status,'pending');
  }
  assert.equal((await db.doc('friendRequestIssueThrottle/alice').get()).data().issued,10);
  await assert.rejects(run('alice','send','Target10#00010',undefined,
    at(10*16*60*1000)),/Daily friend request limit reached/);
  assert.equal((await db.collection('friendRelationships').get()).size,10);
  assert.equal((await db.doc('accountIdRegistry/target10#00010').get()).exists,true);
});
