import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc,Timestamp} from 'firebase/firestore';

let env;
const campaignId='random-table-campaign';
const definition='campaigns/'+campaignId+'/randomTables/table-one';
const history='campaigns/'+campaignId+'/randomTableRolls/roll-one';
const table={id:'table-one',name:'Altarin',status:'active',category:'encounter',
  revision:1,entries:[{id:'e1',kind:'text',label:'Patrol',weight:1}],
  totalWeight:1,createdAt:Timestamp.now()};
const roll={id:'roll-one',tableId:'table-one',tableName:'Altarin',
  results:[{label:'Patrol',entryId:'e1',draw:1}],rollCount:1,
  createdAt:Timestamp.now(),createdBy:'gm'};
const db=uid=>env.authenticatedContext(uid).firestore();

before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-asteria-random-tables',
  firestore:{rules:readFileSync('firestore.rules','utf8')}});
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  const f=context.firestore();
  await setDoc(doc(f,'campaigns/'+campaignId),{ownerUid:'gm',membershipSchemaVersion:2});
  await setDoc(doc(f,'campaigns/'+campaignId+'/members/alice'),{
   uid:'alice',campaignId,role:'player',status:'active'});
  await setDoc(doc(f,definition),table);
  await setDoc(doc(f,history),roll);
 });
});
test('Campaign GM reads private random tables and history',async()=>{
 await assertSucceeds(getDoc(doc(db('gm'),definition)));
 await assertSucceeds(getDocs(collection(db('gm'),'campaigns/'+campaignId+'/randomTables')));
 await assertSucceeds(getDoc(doc(db('gm'),history)));
 await assertSucceeds(getDocs(collection(db('gm'),'campaigns/'+campaignId+'/randomTableRolls')));
});
test('Players, unauthenticated visitors, and unrelated accounts cannot read GM tables or results',async()=>{
 for(const uid of ['alice','visitor']){
  await assertFails(getDoc(doc(db(uid),definition)));
  await assertFails(getDocs(collection(db(uid),'campaigns/'+campaignId+'/randomTables')));
  await assertFails(getDoc(doc(db(uid),history)));
  await assertFails(getDocs(collection(db(uid),'campaigns/'+campaignId+'/randomTableRolls')));
 }
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),definition)));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),history)));
});
test('Even the GM cannot forge, edit, delete or overwrite server-authored results through the browser',async()=>{
 await assertFails(setDoc(doc(db('gm'),definition),{...table,name:'Forged'}));
 await assertFails(updateDoc(doc(db('gm'),definition),{status:'archived'}));
 await assertFails(deleteDoc(doc(db('gm'),definition)));
 await assertFails(setDoc(doc(db('gm'),history),{...roll,results:[{label:'Forged'}]}));
 await assertFails(updateDoc(doc(db('gm'),history),{rollCount:999}));
 await assertFails(deleteDoc(doc(db('gm'),history)));
 await assertFails(setDoc(doc(db('gm'),'campaigns/'+campaignId+'/randomTables/new'),table));
 await assertFails(setDoc(doc(db('gm'),'campaigns/'+campaignId+'/randomTableRolls/new'),roll));
});
test('Other accounts cannot create new definitions or results',async()=>{
 await assertFails(setDoc(doc(db('alice'),'campaigns/'+campaignId+'/randomTables/new'),table));
 await assertFails(setDoc(doc(db('alice'),'campaigns/'+campaignId+'/randomTableRolls/new'),roll));
});
