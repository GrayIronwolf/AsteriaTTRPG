import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,deleteObject} from 'firebase/storage';
let env;
const campaign='audio-security';
const paths={
 private:'campaigns/'+campaign+'/audioTracks/storm',
 public:'campaigns/'+campaign+'/audioTracksShared/storm',
 live:'campaigns/'+campaign+'/audioLive/current',
 config:'campaigns/'+campaign+'/audioConfig/current'
};
const media='campaigns/'+campaign+'/audioTracks/storm/audio.mp3';
const db=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const storage=uid=>uid?env.authenticatedContext(uid).storage():env.unauthenticatedContext().storage();
before(async()=>{
 env=await initializeTestEnvironment({
  projectId:process.env.GCLOUD_PROJECT||process.env.FIREBASE_PROJECT_ID||'demo-asteria-audio',
  firestore:{rules:readFileSync('firestore.rules','utf8')},
  storage:{rules:readFileSync('storage.rules','utf8')}
 });
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();await env.clearStorage();
 await env.withSecurityRulesDisabled(async context=>{
  const firestore=context.firestore();
  await setDoc(doc(firestore,'campaigns/'+campaign),{ownerUid:'gm',membershipSchemaVersion:2});
  await setDoc(doc(firestore,'campaigns/'+campaign+'/members/alice'),{
   uid:'alice',campaignId:campaign,role:'player',status:'active'});
  await setDoc(doc(firestore,'campaigns/'+campaign+'/members/co'),{
   uid:'co',campaignId:campaign,role:'co-gm',status:'active'});
  await setDoc(doc(firestore,paths.private),{id:'storm',status:'uploading',visibility:'gm',
   storagePath:media,contentType:'audio/mpeg',name:'Storm'});
  await setDoc(doc(firestore,paths.config),{activeTracks:1});
  await setDoc(doc(firestore,paths.live),{version:1,revision:0,ambient:null,effect:null});
 });
});
test('Private track configuration is exclusively GM-readable',async()=>{
 for(const uid of ['gm','co']){
  await assertSucceeds(getDoc(doc(db(uid),paths.private)));
  await assertSucceeds(getDoc(doc(db(uid),paths.config)));
  await assertSucceeds(getDocs(collection(db(uid),'campaigns/'+campaign+'/audioTracks')));
 }
 for(const uid of ['alice','outsider',null]){
  await assertFails(getDoc(doc(db(uid),paths.private)));
  await assertFails(getDoc(doc(db(uid),paths.config)));
  await assertFails(getDocs(collection(db(uid),'campaigns/'+campaign+'/audioTracks')));
 }
});
test('Member-visible transport is read-only to all clients',async()=>{
 for(const uid of ['gm','co','alice']){
  await assertSucceeds(getDoc(doc(db(uid),paths.live)));
  await assertSucceeds(getDocs(collection(db(uid),'campaigns/'+campaign+'/audioTracksShared')));
  for(const path of Object.values(paths)){
   await assertFails(setDoc(doc(db(uid),path),{status:'playing'}));
   await assertFails(updateDoc(doc(db(uid),path),{status:'playing'}));
   await assertFails(deleteDoc(doc(db(uid),path)));
  }
 }
 await assertFails(getDoc(doc(db('outsider'),paths.live)));
 await assertFails(getDoc(doc(db(null),paths.live)));
});
test('GM uploads are create-only, typed and bounded; private bytes cannot leak',async()=>{
 const sample=new Uint8Array([73,68,51,3,0,0,0,0,0,0]);
 await assertFails(uploadBytes(ref(storage('alice'),media),sample,{contentType:'audio/mpeg'}));
 await assertFails(uploadBytes(ref(storage('gm'),media),sample,{contentType:'text/plain'}));
 await assertFails(uploadBytes(ref(storage('gm'),
  'campaigns/'+campaign+'/audioTracks/storm/audio.exe'),sample,{contentType:'audio/mpeg'}));
 await assertSucceeds(uploadBytes(ref(storage('gm'),media),sample,{contentType:'audio/mpeg'}));
 await assertFails(uploadBytes(ref(storage('gm'),media),sample,{contentType:'audio/mpeg'}));
 await assertSucceeds(getBytes(ref(storage('gm'),media)));
 for(const uid of ['alice','outsider',null])await assertFails(getBytes(ref(storage(uid),media)));
 await assertSucceeds(deleteObject(ref(storage('gm'),media)));
});
test('Publishing grants member access; withdrawal revokes player bytes and shared metadata',async()=>{
 const sample=new Uint8Array([73,68,51,3,0,0,0,0,0,0]);
 await assertSucceeds(uploadBytes(ref(storage('gm'),media),sample,{contentType:'audio/mpeg'}));
 await env.withSecurityRulesDisabled(async context=>{
  await updateDoc(doc(context.firestore(),paths.private),{status:'ready',visibility:'players'});
  await setDoc(doc(context.firestore(),paths.public),{
   id:'storm',status:'ready',visibility:'players',storagePath:media,name:'Storm'});
 });
 await assertSucceeds(getDoc(doc(db('alice'),paths.public)));
 await assertSucceeds(getBytes(ref(storage('alice'),media)));
 await assertFails(getBytes(ref(storage('outsider'),media)));
 await env.withSecurityRulesDisabled(async context=>{
  await updateDoc(doc(context.firestore(),paths.private),{visibility:'gm'});
  await deleteDoc(doc(context.firestore(),paths.public));
 });
 const withdrawn=await assertSucceeds(getDoc(doc(db('alice'),paths.public)));
 assert.equal(withdrawn.exists(),false);
 await assertFails(getBytes(ref(storage('alice'),media)));
 await assertSucceeds(deleteObject(ref(storage('gm'),media)));
});
