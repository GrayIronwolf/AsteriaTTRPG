import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,query,where,setDoc} from 'firebase/firestore';

let env;
const projectId='demo-asteria-universal-check';
const client=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const path='campaigns/c/checkRequests/';
before(async()=>{
  env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    const entries=[
      ['campaigns/c',{ownerUid:'gm',membershipSchemaVersion:2}],
      ['campaigns/c/members/alice',{uid:'alice',role:'player',status:'active',campaignId:'c'}],
      ['campaigns/c/members/bob',{uid:'bob',role:'player',status:'active',campaignId:'c'}],
      [path+'a',{id:'a',campaignId:'c',ownerUid:'alice',gmUid:'gm',status:'pending',createdAt:new Date()}],
      [path+'b',{id:'b',campaignId:'c',ownerUid:'bob',gmUid:'gm',status:'submitted',createdAt:new Date()}],
      ['campaigns/c/checkGroups/g',{type:'group',participantIds:['a','b'],results:{a:{result:{die:18}}}}],
      ['campaigns/c/checkCommandReceipts/alice_123',{uid:'alice',response:{dice:{die:20}}}]
    ];
    for(const [key,value] of entries)await setDoc(doc(db,key),value);
  });
});
after(async()=>env?.cleanup());

test('players can read their own request and owner-filtered query but not other participants',async()=>{
  const db=client('alice');
  assert.equal((await assertSucceeds(getDoc(doc(db,path+'a')))).exists(),true);
  await assertFails(getDoc(doc(db,path+'b')));
  await assertSucceeds(getDocs(query(collection(db,'campaigns/c/checkRequests'),where('ownerUid','==','alice'))));
  await assertFails(getDocs(collection(db,'campaigns/c/checkRequests')));
  await assertFails(getDocs(query(collection(db,'campaigns/c/checkRequests'),where('ownerUid','==','bob'))));
});
test('GM can read all check requests and group adjudication but not write server-owned documents',async()=>{
  const db=client('gm');
  assert.equal((await assertSucceeds(getDocs(collection(db,'campaigns/c/checkRequests')))).size,2);
  await assertSucceeds(getDoc(doc(db,'campaigns/c/checkGroups/g')));
  await assertFails(setDoc(doc(db,path+'new'),{ownerUid:'gm'}));
  await assertFails(setDoc(doc(db,'campaigns/c/checkGroups/new'),{id:'new'}));
});
test('private group results and idempotency receipts are inaccessible to players, visitors and GM receipts',async()=>{
  for(const uid of ['alice','bob','visitor',null]){
    const db=client(uid);
    await assertFails(getDoc(doc(db,'campaigns/c/checkGroups/g')));
    await assertFails(getDoc(doc(db,'campaigns/c/checkCommandReceipts/alice_123')));
  }
  await assertFails(getDoc(doc(client('gm'),'campaigns/c/checkCommandReceipts/alice_123')));
  await assertFails(getDoc(doc(client(null),path+'a')));
});
test('revoked player membership immediately blocks existing check results',async()=>{
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),'campaigns/c/members/alice'),
      {uid:'alice',role:'player',status:'suspended',campaignId:'c'});
  });
  await assertFails(getDoc(doc(client('alice'),path+'a')));
});
