import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,setDoc,getDoc,getDocs,updateDoc,deleteDoc} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,deleteObject} from 'firebase/storage';
let env;
const camp='recording-security-campaign';
const paths={
 control:'campaigns/'+camp+'/recordingControl/current',
 notice:'campaigns/'+camp+'/recordingNotice/current',
 consentAlice:'campaigns/'+camp+'/recordingConsents/alice',
 consentBob:'campaigns/'+camp+'/recordingConsents/bob',
 quota:'campaigns/'+camp+'/recordingQuota/current',
 privateArchive:'campaigns/'+camp+'/recordingArchives/clip',
 publicArchive:'campaigns/'+camp+'/recordingArchivesShared/clip',
 session:'campaigns/'+camp+'/recordingSessions/req'
};
const media='campaigns/'+camp+'/sessionRecordings/clip/recording.webm';
const db=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const storage=uid=>uid?env.authenticatedContext(uid).storage():env.unauthenticatedContext().storage();
before(async()=>{
 env=await initializeTestEnvironment({
  projectId:process.env.GCLOUD_PROJECT||process.env.FIREBASE_PROJECT_ID||'demo-asteria-recording',
  firestore:{rules:readFileSync('firestore.rules','utf8')},
  storage:{rules:readFileSync('storage.rules','utf8')}
 });
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();await env.clearStorage();
 await env.withSecurityRulesDisabled(async context=>{
  const f=context.firestore();
  await setDoc(doc(f,'campaigns/'+camp),{ownerUid:'gm',membershipSchemaVersion:2});
  for(const uid of ['alice','bob','co']){
   await setDoc(doc(f,'campaigns/'+camp+'/members/'+uid),{
    uid,campaignId:camp,role:uid==='co'?'co-gm':'player',status:'active'});
  }
  await setDoc(doc(f,paths.control),{status:'consent',revision:1,requestId:'req',participants:['alice','bob']});
  await setDoc(doc(f,paths.notice),{status:'consent',revision:1,requestId:'req'});
  await setDoc(doc(f,paths.consentAlice),{uid:'alice',requestId:'req',decision:'agree'});
  await setDoc(doc(f,paths.consentBob),{uid:'bob',requestId:'req',decision:'decline'});
  await setDoc(doc(f,paths.quota),{activeArchives:1,reservedBytes:15});
  await setDoc(doc(f,paths.session),{id:'req',status:'completed'});
  await setDoc(doc(f,paths.privateArchive),{id:'clip',status:'uploading',visibility:'gm',
   storagePath:media,contentType:'audio/webm',title:'Private'});
 });
});
test('Recording controls and participant lists remain GM-private',async()=>{
 for(const uid of ['gm','co']){
  for(const path of [paths.control,paths.quota,paths.privateArchive,paths.session,paths.consentBob]){
   await assertSucceeds(getDoc(doc(db(uid),path)));
  }
  await assertSucceeds(getDocs(collection(db(uid),'campaigns/'+camp+'/recordingConsents')));
 }
 for(const uid of ['alice','visitor',null]){
  for(const path of [paths.control,paths.quota,paths.privateArchive,paths.session]){
   await assertFails(getDoc(doc(db(uid),path)));
  }
  await assertFails(getDocs(collection(db(uid),'campaigns/'+camp+'/recordingConsents')));
 }
 await assertSucceeds(getDoc(doc(db('alice'),paths.consentAlice)));
 await assertFails(getDoc(doc(db('alice'),paths.consentBob)));
});
test('Recording notices and shared index are member-readable but immutable',async()=>{
 for(const uid of ['gm','alice','co']){
  await assertSucceeds(getDoc(doc(db(uid),paths.notice)));
  await assertSucceeds(getDocs(collection(db(uid),'campaigns/'+camp+'/recordingArchivesShared')));
  for(const path of Object.values(paths)){
   await assertFails(setDoc(doc(db(uid),path),{status:'recording'}));
   await assertFails(updateDoc(doc(db(uid),path),{status:'recording'}));
   await assertFails(deleteDoc(doc(db(uid),path)));
  }
 }
 for(const uid of ['visitor',null]){
  await assertFails(getDoc(doc(db(uid),paths.notice)));
  await assertFails(getDocs(collection(db(uid),'campaigns/'+camp+'/recordingArchivesShared')));
 }
});
test('Create-only GM audio uploads require archive reservation and correct MIME',async()=>{
 const sample=Uint8Array.from([26,69,223,163,0,0,0,0]);
 await assertFails(uploadBytes(ref(storage('alice'),media),sample,{contentType:'audio/webm'}));
 await assertFails(uploadBytes(ref(storage('gm'),media),sample,{contentType:'video/webm'}));
 await assertFails(uploadBytes(ref(storage('gm'),
  'campaigns/'+camp+'/sessionRecordings/clip/recording.exe'),sample,{contentType:'audio/webm'}));
 await assertSucceeds(uploadBytes(ref(storage('gm'),media),sample,{contentType:'audio/webm'}));
 await assertFails(uploadBytes(ref(storage('gm'),media),sample,{contentType:'audio/webm'}));
 await assertSucceeds(getBytes(ref(storage('gm'),media)));
 await assertFails(getBytes(ref(storage('alice'),media)));
 await assertFails(getBytes(ref(storage('visitor'),media)));
 await assertSucceeds(deleteObject(ref(storage('gm'),media)));
});
test('Publishing enables member playback, withdrawal immediately revokes it',async()=>{
 const sample=Uint8Array.from([26,69,223,163,0,0,0,0]);
 await assertSucceeds(uploadBytes(ref(storage('gm'),media),sample,{contentType:'audio/webm'}));
 await env.withSecurityRulesDisabled(async context=>{
  await updateDoc(doc(context.firestore(),paths.privateArchive),{status:'ready',visibility:'players'});
  await setDoc(doc(context.firestore(),paths.publicArchive),{
   id:'clip',status:'ready',visibility:'players',storagePath:media,title:'Public'});
 });
 await assertSucceeds(getDoc(doc(db('alice'),paths.publicArchive)));
 await assertSucceeds(getBytes(ref(storage('alice'),media)));
 await assertFails(getBytes(ref(storage('visitor'),media)));
 await env.withSecurityRulesDisabled(async context=>{
  await deleteDoc(doc(context.firestore(),paths.publicArchive));
  await updateDoc(doc(context.firestore(),paths.privateArchive),{visibility:'gm'});
 });
 const withdrawn=await assertSucceeds(getDoc(doc(db('alice'),paths.publicArchive)));
 assert.equal(withdrawn.exists(),false);
 await assertFails(getBytes(ref(storage('alice'),media)));
 await assertSucceeds(deleteObject(ref(storage('gm'),media)));
});
