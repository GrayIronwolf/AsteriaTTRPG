import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
let env;
const campaignId='digital-calendar-campaign';
const keys=['calendarState','calendarPublic','calendarEntries','calendarSharedEntries'];
const paths=[
 'campaigns/'+campaignId+'/calendarState/current',
 'campaigns/'+campaignId+'/calendarPublic/current',
 'campaigns/'+campaignId+'/calendarEntries/private-one',
 'campaigns/'+campaignId+'/calendarSharedEntries/party-one'
];
const db=uid=>env.authenticatedContext(uid).firestore();
before(async()=>{env=await initializeTestEnvironment({
 projectId:'demo-asteria-calendar',firestore:{rules:readFileSync('firestore.rules','utf8')}
});});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  const firestore=context.firestore();
  await setDoc(doc(firestore,'campaigns/'+campaignId),{
   ownerUid:'gm',membershipSchemaVersion:2
  });
  await setDoc(doc(firestore,'campaigns/'+campaignId+'/members/alice'),{
   uid:'alice',campaignId,role:'player',status:'active'
  });
  await setDoc(doc(firestore,'campaigns/'+campaignId+'/members/co'),{
   uid:'co',campaignId,role:'co-gm',status:'active'
  });
  for(const [i,path] of paths.entries())await setDoc(doc(firestore,path),{
   id:'entry-'+i,revision:1,
   ...(i===0?{history:[{reason:'GM secret'}]}:{}),
   ...(i===2?{description:'GM private note'}:{}),
   ...(i===3?{title:'Party festival'}:{})
  });
 });
});
test('Campaign GM and co-GM read all calendar data',async()=>{
 for(const path of paths){
  await assertSucceeds(getDoc(doc(db('gm'),path)));
  await assertSucceeds(getDoc(doc(db('co'),path)));
 }
 for(const collectionName of keys)
  await assertSucceeds(getDocs(collection(db('gm'),'campaigns/'+campaignId+'/'+collectionName)));
});
test('Players read only calendar date and intentionally shared events',async()=>{
 for(const path of [paths[1],paths[3]])
  await assertSucceeds(getDoc(doc(db('alice'),path)));
 for(const path of [paths[0],paths[2]])
  await assertFails(getDoc(doc(db('alice'),path)));
 await assertSucceeds(getDocs(collection(db('alice'),'campaigns/'+campaignId+'/calendarPublic')));
 await assertSucceeds(getDocs(collection(db('alice'),'campaigns/'+campaignId+'/calendarSharedEntries')));
 await assertFails(getDocs(collection(db('alice'),'campaigns/'+campaignId+'/calendarState')));
 await assertFails(getDocs(collection(db('alice'),'campaigns/'+campaignId+'/calendarEntries')));
});
test('Unauthenticated and unrelated accounts cannot view any campaign calendar data',async()=>{
 for(const path of paths){
  await assertFails(getDoc(doc(db('stranger'),path)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
 }
});
test('Even the GM cannot create, edit, forge or delete calendar documents directly',async()=>{
 for(const uid of ['gm','co','alice']){
  for(let i=0;i<keys.length;i++){
   const path=paths[i];
   await assertFails(setDoc(doc(db(uid),path),{revision:900,reason:'forged'}));
   await assertFails(updateDoc(doc(db(uid),path),{revision:900}));
   await assertFails(deleteDoc(doc(db(uid),path)));
   await assertFails(setDoc(doc(db(uid),'campaigns/'+campaignId+'/'+keys[i]+'/forged'),{id:'forged'}));
  }
 }
});
