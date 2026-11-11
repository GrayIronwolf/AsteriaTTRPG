import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {findFriendByAccountId} from '../functions/friendAccountLookup.mjs';

const projectId='demo-asteria';
const createdAt='2026-11-10T00:00:00.000Z';
let env,app,db;
const auth={
  getUser:async uid=>({uid,disabled:false})
};
const seed=async(uid,name,number)=>{
  const lower=name.toLowerCase(),id=name+'#'+number,key=lower+'#'+number;
  await db.doc('users/'+uid).set({uid,username:name,usernameLower:lower,
    accountId:id,accountIdKey:key,accountNumber:number,accountIdAssignedAt:createdAt,
    email:uid+'@private.test',firstName:'private'});
  await db.doc('accountIdAssignments/'+uid).set({uid,username:name,usernameLower:lower,
    accountId:id,accountIdKey:key,accountNumber:number,createdAt});
  await db.doc('accountIdRegistry/'+key).set({uid,usernameLower:lower,
    accountId:id,accountIdKey:key,accountNumber:number,createdAt});
};
before(async()=>{
  env=await initializeTestEnvironment({projectId,
    firestore:{rules:readFileSync('firestore.rules','utf8')}});
  app=initializeApp({projectId,name:'friends-phase12'});
  db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{
  await env.clearFirestore();
  await seed('alice','Grayson','01448');
  await seed('bob','Asteria','00009');
});

test('admin-only exact search returns public handle while private records remain unreadable',async()=>{
  const result=await findFriendByAccountId(db,auth,'alice','ASTERIA#00009');
  assert.deepEqual(result,{found:true,username:'Asteria',accountId:'Asteria#00009'});
  const quota=await db.doc('friendLookupThrottle/alice').get();
  assert.equal(quota.data().windowCount,1);
  for(const uid of ['alice','bob','outsider']){
    const client=env.authenticatedContext(uid).firestore();
    for(const path of [
      'accountIdRegistry/asteria#00009','accountIdAssignments/bob',
      'friendLookupThrottle/alice'
    ]){
      await assertFails(getDoc(doc(client,path)));
      await assertFails(setDoc(doc(client,path),{uid,forged:true}));
    }
    if(uid!=='bob')await assertFails(getDoc(doc(client,'users/bob')));
  }
  const anonymous=env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonymous,'friendLookupThrottle/alice')));
});
test('real Firestore transactions enforce quotas and ignore historical alias handles',async()=>{
  const now=new Date('2026-11-11T00:00:00.000Z');
  for(let i=0;i<10;i++) {
    const result=await findFriendByAccountId(db,auth,'alice','Asteria#00009',{now});
    assert.equal(result.found,true);
  }
  const results=await Promise.allSettled(Array.from({length:2},
    ()=>findFriendByAccountId(db,auth,'alice','Asteria#00009',{now})));
  assert.equal(results.filter(x=>x.status==='rejected').length,2);
  assert.equal((await db.doc('friendLookupThrottle/alice').get()).data().windowCount,10);
  await db.doc('accountIdRegistry/asteria#00009').update({
    alias:true,activeAccountIdKey:'avalon#00009'
  });
  const dayLater=new Date(now.getTime()+25*60*60*1000);
  assert.deepEqual(await findFriendByAccountId(db,auth,'alice','Asteria#00009',
    {now:dayLater}),{found:false});
});
