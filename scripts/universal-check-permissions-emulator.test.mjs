import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {universalCheckAction} from '../functions/universalCheckCommands.mjs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,query,where,setDoc} from 'firebase/firestore';

let env,adminApp,adminDb;
const projectId='demo-asteria-universal-check';
const client=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const path='campaigns/c/checkRequests/';
before(async()=>{
  env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
  adminApp=initializeApp({projectId},'universal-check-emulator');
  adminDb=getFirestore(adminApp);
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    const entries=[
      ['campaigns/c',{id:'c',ownerUid:'gm',membershipSchemaVersion:2,playerCharacterLinks:{ca:'alice',cb:'bob'}}],
      ['campaigns/c/members/alice',{uid:'alice',role:'player',status:'active',campaignId:'c'}],
      ['campaigns/c/members/bob',{uid:'bob',role:'player',status:'active',campaignId:'c'}],
      [path+'a',{id:'a',campaignId:'c',ownerUid:'alice',gmUid:'gm',status:'pending',createdAt:new Date()}],
      [path+'b',{id:'b',campaignId:'c',ownerUid:'bob',gmUid:'gm',status:'submitted',createdAt:new Date()}],
      ['campaigns/c/characters/ca',{id:'ca',name:'Alice',ownerUid:'alice',sharedCampaignId:'c',characteristics:{agility:40},skills:[{name:'Stealth',rankName:'Expert'}]}],
      ['campaigns/c/characters/cb',{id:'cb',name:'Bob',ownerUid:'bob',sharedCampaignId:'c',characteristics:{agility:40},skills:[{name:'Stealth',rankName:'Expert'}]}],
      ['campaigns/c/checkGroups/g',{type:'group',participantIds:['a','b'],results:{a:{result:{die:18}}}}],
      ['campaigns/c/checkCommandReceipts/alice_123',{uid:'alice',response:{dice:{die:20}}}]
    ];
    for(const [key,value] of entries)await setDoc(doc(db,key),value);
  });
});
after(async()=>{await env?.cleanup();await deleteApp(adminApp);});

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

test('real Firestore transactions resolve simultaneous opposed submissions and duplicate retries once',async()=>{
  const invoke=(uid,action,fields,operationId=randomUUID())=>
    universalCheckAction(adminDb,uid,{campaignId:'c',action,...fields,operationId},()=>new Date());
  const created=await invoke('gm','create',{type:'opposed',characterIds:['ca','cb'],
    skill:'Stealth',characteristic:'agility',dc:0});
  const [a,b]=created.ids;
  const leftId=randomUUID(),rightId=randomUUID();
  const [left,right]=await Promise.all([
    invoke('alice','submit',{requestId:a,mode:'physical',die:10},leftId),
    invoke('bob','submit',{requestId:b,mode:'physical',die:15},rightId)
  ]);
  assert.equal(left.ok,true);
  assert.equal(right.ok,true);
  const saved=await adminDb.doc('campaigns/c/checkGroups/'+created.groupId).get();
  assert.equal(saved.data().status,'resolved');
  assert.equal(saved.data().adjudication.outcome,'winner');
  assert.equal(saved.data().adjudication.winnerId,b);
  const duplicate=await invoke('alice','submit',{requestId:a,mode:'physical',die:10},leftId);
  assert.deepEqual(duplicate,left);
  const aliceRow=(await adminDb.doc('campaigns/c/checkRequests/'+a).get()).data();
  assert.equal(aliceRow.groupOutcome.winnerId,b);
  assert.equal(aliceRow.dice.die,10);
});
