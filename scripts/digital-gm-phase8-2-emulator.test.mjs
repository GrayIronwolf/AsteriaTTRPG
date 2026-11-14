import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
let env;
const campaignId='digital-gm-weather-campaign';
const names=['weatherConfig','weatherZones','weatherReports','weatherSharedReports'];
const paths=[
 'campaigns/'+campaignId+'/weatherConfig/current',
 'campaigns/'+campaignId+'/weatherZones/forest',
 'campaigns/'+campaignId+'/weatherReports/private-report',
 'campaigns/'+campaignId+'/weatherSharedReports/published-report'
];
const db=uid=>env.authenticatedContext(uid).firestore();
before(async()=>{env=await initializeTestEnvironment({
 projectId:'demo-asteria-weather',firestore:{rules:readFileSync('firestore.rules','utf8')}
});});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  const f=context.firestore();
  await setDoc(doc(f,'campaigns/'+campaignId),{
   ownerUid:'gm',membershipSchemaVersion:2});
  for(const [uid,role] of [['alice','player'],['co','co-gm']])
   await setDoc(doc(f,'campaigns/'+campaignId+'/members/'+uid),
    {uid,campaignId,role,status:'active'});
  for(const [index,path] of paths.entries())
   await setDoc(doc(f,path),{id:'weather-'+index,status:index===3?'published':'draft',revision:1});
 });
});
test('GM and co-GM can inspect all private and public weather data',async()=>{
 for(const uid of ['gm','co'])
  for(const path of paths)await assertSucceeds(getDoc(doc(db(uid),path)));
 for(const name of names)
  await assertSucceeds(getDocs(collection(db('gm'),'campaigns/'+campaignId+'/'+name)));
});
test('Players may read published weather but cannot inspect GM private data',async()=>{
 await assertSucceeds(getDoc(doc(db('alice'),paths[3])));
 await assertSucceeds(getDocs(collection(db('alice'),'campaigns/'+campaignId+'/weatherSharedReports')));
 for(const path of paths.slice(0,3))await assertFails(getDoc(doc(db('alice'),path)));
 for(const name of names.slice(0,3))
  await assertFails(getDocs(collection(db('alice'),'campaigns/'+campaignId+'/'+name)));
});
test('Outsiders and unauthenticated users cannot read any campaign weather',async()=>{
 for(const path of paths){
  await assertFails(getDoc(doc(db('visitor'),path)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
 }
});
test('Even GM clients cannot forge reports, change published projections or delete weather',async()=>{
 for(const uid of ['gm','co','alice']){
  for(let index=0;index<names.length;index++){
   const path=paths[index],collectionName=names[index];
   await assertFails(updateDoc(doc(db(uid),path),{revision:300}));
   await assertFails(setDoc(doc(db(uid),path),{revision:300}));
   await assertFails(deleteDoc(doc(db(uid),path)));
   await assertFails(setDoc(doc(db(uid),'campaigns/'+campaignId+'/'+collectionName+'/forged'),{revision:1}));
  }
 }
});
