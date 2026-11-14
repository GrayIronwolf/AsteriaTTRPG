import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,Timestamp} from 'firebase/firestore';
let env;
const campaign='phase73-campaign';
const path='campaigns/'+campaign+'/encounterPlans/plan-one';
const plan={id:'plan-one',status:'draft',revision:1,threatTier:1,
 creatures:[{sourceId:'ash-imp',name:'Ash Imp',hp:[24,24],xpReward:null}],createdAt:Timestamp.now()};
const db=uid=>env.authenticatedContext(uid).firestore();
before(async()=>{env=await initializeTestEnvironment({
 projectId:'demo-asteria-encounter-rewards',firestore:{rules:readFileSync('firestore.rules','utf8')}
});});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  const f=context.firestore();
  await setDoc(doc(f,'campaigns/'+campaign),{ownerUid:'gm',membershipSchemaVersion:2});
  await setDoc(doc(f,'campaigns/'+campaign+'/members/alice'),{
   uid:'alice',campaignId:campaign,role:'player',status:'active'});
  await setDoc(doc(f,'campaigns/'+campaign+'/members/co'),{
   uid:'co',campaignId:campaign,role:'co-gm',status:'active'});
  await setDoc(doc(f,path),plan);
 });
});
test('Campaign GM and active co-GM can inspect private encounter proposals',async()=>{
 await assertSucceeds(getDoc(doc(db('gm'),path)));
 await assertSucceeds(getDocs(collection(db('gm'),'campaigns/'+campaign+'/encounterPlans')));
 await assertSucceeds(getDoc(doc(db('co'),path)));
});
test('Players and unauthenticated callers cannot read generated proposals',async()=>{
 for(const uid of ['alice','visitor']){
  await assertFails(getDoc(doc(db(uid),path)));
  await assertFails(getDocs(collection(db(uid),'campaigns/'+campaign+'/encounterPlans')));
 }
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
});
test('No browser client can create, edit, replace or delete a proposal',async()=>{
 for(const uid of ['gm','co','alice']){
  await assertFails(setDoc(doc(db(uid),path),{...plan,status:'approved'}));
  await assertFails(updateDoc(doc(db(uid),path),{revision:99}));
  await assertFails(deleteDoc(doc(db(uid),path)));
  await assertFails(setDoc(doc(db(uid),'campaigns/'+campaign+'/encounterPlans/forged'),plan));
 }
});
