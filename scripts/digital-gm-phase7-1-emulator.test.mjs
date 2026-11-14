import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,updateDoc,deleteDoc,collection} from 'firebase/firestore';

let env;
const path='users/alice/diceWorkspace/current';
const data={version:1,presets:[{id:'preset-123456',name:'Longsword',
  pool:[{sides:8,count:1}],modifier:2,label:'Damage'}],
  history:[{id:'roll-123456',at:1730000000000,pool:[{sides:20,count:1}],
    results:[{sides:20,count:1,faces:[20],sum:20}],
    modifier:0,subtotal:20,total:20,natural:'natural-20',source:'server-digital'}]};
const client=uid=>env.authenticatedContext(uid).firestore();
before(async()=>{
  env=await initializeTestEnvironment({
    projectId:'demo-asteria-phase-7-1-dice',
    firestore:{rules:readFileSync('firestore.rules','utf8')}
  });
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),path),data);
  });
});
test('owner can access own private dice results and presets, never other accounts',async()=>{
  const own=await assertSucceeds(getDoc(doc(client('alice'),path)));
  assert.equal(own.data().history[0].source,'server-digital');
  assert.equal(own.data().presets[0].name,'Longsword');
  await assertSucceeds(getDocs(collection(client('alice'),'users/alice/diceWorkspace')));
  await assertFails(getDoc(doc(client('bob'),path)));
  await assertFails(getDocs(collection(client('bob'),'users/alice/diceWorkspace')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
});
test('even owner cannot forge natural 20, change results, delete or clear history via browser',async()=>{
  const mine=doc(client('alice'),path);
  await assertFails(updateDoc(mine,{history:[]}));
  await assertFails(updateDoc(mine,{history:[{...data.history[0],total:9999}]}));
  await assertFails(updateDoc(mine,{presets:[]}));
  await assertFails(setDoc(mine,data));
  await assertFails(deleteDoc(mine));
  await assertFails(setDoc(doc(client('alice'),'users/alice/diceWorkspace/forged'),
    {history:[],version:1}));
});
test('another signed-in user cannot write dice data under a different owner',async()=>{
  await assertFails(setDoc(doc(client('bob'),path),data));
  await assertFails(deleteDoc(doc(client('bob'),path)));
  await assertFails(setDoc(doc(client('bob'),'users/alice/diceWorkspace/other'),data));
});
test('dice deny rules do not block unrelated owner account nested records',async()=>{
  const own=doc(client('alice'),'users/alice/settings/dice-test');
  await assertSucceeds(setDoc(own,{theme:'dark'}));
  assert.equal((await assertSucceeds(getDoc(own))).data().theme,'dark');
});
