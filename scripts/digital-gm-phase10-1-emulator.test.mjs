import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
let env;
const campaign='player-presentation-security';
const control='campaigns/'+campaign+'/presentationControl/current';
const shared='campaigns/'+campaign+'/presentationShared/current';
const fire=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
before(async()=>{
 env=await initializeTestEnvironment({
  projectId:process.env.GCLOUD_PROJECT||process.env.FIREBASE_PROJECT_ID||'demo-asteria-presentation',
  firestore:{rules:readFileSync('firestore.rules','utf8')}
 });
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,'campaigns/'+campaign),{ownerUid:'gm',membershipSchemaVersion:2});
  await setDoc(doc(db,'campaigns/'+campaign+'/members/alice'),{
   uid:'alice',campaignId:campaign,role:'player',status:'active'});
  await setDoc(doc(db,'campaigns/'+campaign+'/members/co'),{
   uid:'co',campaignId:campaign,role:'co-gm',status:'active'});
  await setDoc(doc(db,'campaigns/'+campaign+'/members/former'),{
   uid:'former',campaignId:campaign,role:'player',status:'inactive'});
  await setDoc(doc(db,control),{version:1,revision:1,scene:'title',
   title:'Public',subtitle:'',mapId:'',characterIds:[],
   showRound:false,showPartyHP:false,theme:'obsidian',updatedBy:'gm'});
  await setDoc(doc(db,shared),{version:1,revision:1,scene:'title',
   title:'Public',subtitle:'',mapId:'',characterIds:[],
   showRound:false,showPartyHP:false,theme:'obsidian'});
 });
});
test('Only active campaign GMs can see private scene controls',async()=>{
 for(const uid of ['gm','co'])await assertSucceeds(getDoc(doc(fire(uid),control)));
 for(const uid of ['alice','former','outsider',null])
  await assertFails(getDoc(doc(fire(uid),control)));
});
test('Only active campaign members can see the safe projector projection',async()=>{
 for(const uid of ['gm','co','alice'])
  await assertSucceeds(getDoc(doc(fire(uid),shared)));
 for(const uid of ['former','outsider',null])
  await assertFails(getDoc(doc(fire(uid),shared)));
});
test('Clients cannot forge public or private presentation records',async()=>{
 for(const uid of ['gm','co','alice']){
  for(const path of [control,shared]){
   await assertFails(setDoc(doc(fire(uid),path),{title:'Injected'}));
   await assertFails(updateDoc(doc(fire(uid),path),{title:'Injected'}));
   await assertFails(deleteDoc(doc(fire(uid),path)));
  }
 }
});
test('Revoking player membership immediately removes presentation read permissions',async()=>{
 await assertSucceeds(getDoc(doc(fire('alice'),shared)));
 await env.withSecurityRulesDisabled(async context=>{
  await updateDoc(doc(context.firestore(),'campaigns/'+campaign+'/members/alice'),{status:'inactive'});
 });
 await assertFails(getDoc(doc(fire('alice'),shared)));
});
