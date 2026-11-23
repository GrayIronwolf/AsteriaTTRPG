import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc,collection} from 'firebase/firestore';
let env;
const path='users/alice/diceAppearances/current';
const data={version:2,revision:0,ownerUid:'alice',defaultCollectionId:null,
 collections:[],assignments:{}};
const client=uid=>env.authenticatedContext(uid).firestore();
before(async()=>{env=await initializeTestEnvironment({
 projectId:'demo-asteria-phase-3-7-appearances',
 firestore:{rules:readFileSync('firestore.rules','utf8')}
});});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),path),data);
  await setDoc(doc(ctx.firestore(),'users/alice/characters/character-12345'),{
   ownerUid:'alice',name:'Owned character'});
 });
});
test('owner reads private appearance library, GM and other users cannot',async()=>{
 const first=await assertSucceeds(getDoc(doc(client('alice'),path)));
 const second=await assertSucceeds(getDoc(doc(client('alice'),path)));
 assert.deepEqual(first.data(),second.data());
 await assertSucceeds(getDocs(collection(client('alice'),'users/alice/diceAppearances')));
 await assertFails(getDoc(doc(client('bob'),path)));
 await assertFails(getDocs(collection(client('bob'),'users/alice/diceAppearances')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
});
test('even owner cannot alter appearance library directly or forge children',async()=>{
 const own=doc(client('alice'),path);
 await assertFails(setDoc(own,data));await assertFails(updateDoc(own,{revision:9}));
 await assertFails(deleteDoc(own));
 await assertFails(setDoc(doc(client('alice'),'users/alice/diceAppearances/forged'),data));
 await assertFails(setDoc(doc(client('alice'),'users/alice/diceAppearances/current/child/forged'),data));
 await assertFails(setDoc(doc(client('bob'),path),data));
});
test('existing roll and character permissions remain unchanged',async()=>{
 await assertSucceeds(getDocs(collection(client('alice'),'users/alice/characters')));
 await assertFails(getDoc(doc(client('bob'),'users/alice/characters/character-12345')));
 await assertFails(setDoc(doc(client('alice'),'users/alice/diceWorkspace/current'),{history:[]}));
 await assertSucceeds(setDoc(doc(client('alice'),'users/alice/settings/test'),{theme:'dark'}));
});
