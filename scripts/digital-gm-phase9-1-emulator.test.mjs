import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,setDoc,getDoc,getDocs,updateDoc,deleteDoc} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,deleteObject} from 'firebase/storage';
let env;
const campaign='session-library-security';
const privateNote='campaigns/'+campaign+'/sessionNotes/note1';
const privatePdf='campaigns/'+campaign+'/sessionPdfs/pdf1';
const publicPdf='campaigns/'+campaign+'/sessionPdfsShared/pdf1';
const config='campaigns/'+campaign+'/sessionLibraryConfig/current';
const media='campaigns/'+campaign+'/sessionPdfs/pdf1/document.pdf';
const firestore=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const storage=uid=>uid?env.authenticatedContext(uid).storage():env.unauthenticatedContext().storage();
before(async()=>{env=await initializeTestEnvironment({
 projectId:process.env.GCLOUD_PROJECT||process.env.FIREBASE_PROJECT_ID||'demo-asteria-library',
 firestore:{rules:readFileSync('firestore.rules','utf8')},
 storage:{rules:readFileSync('storage.rules','utf8')}
});});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();await env.clearStorage();
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,'campaigns/'+campaign),{ownerUid:'gm',membershipSchemaVersion:2});
  await setDoc(doc(db,'campaigns/'+campaign+'/members/alice'),{uid:'alice',campaignId:campaign,role:'player',status:'active'});
  await setDoc(doc(db,'campaigns/'+campaign+'/members/co'),{uid:'co',campaignId:campaign,role:'co-gm',status:'active'});
  await setDoc(doc(db,privateNote),{title:'Hidden vault',body:'SECRET',status:'active'});
  await setDoc(doc(db,privatePdf),{id:'pdf1',title:'Handout',status:'uploading',visibility:'gm',storagePath:media});
  await setDoc(doc(db,config),{notes:1,pdfs:1});
 });
});
test('GM-only Firestore private notes and PDF metadata',async()=>{
 for(const uid of ['gm','co']){
  for(const path of [privateNote,privatePdf,config])await assertSucceeds(getDoc(doc(firestore(uid),path)));
  await assertSucceeds(getDocs(collection(firestore(uid),'campaigns/'+campaign+'/sessionNotes')));
 }
 for(const uid of ['alice','visitor',null]){
  for(const path of [privateNote,privatePdf,config])await assertFails(getDoc(doc(firestore(uid),path)));
  await assertFails(getDocs(collection(firestore(uid),'campaigns/'+campaign+'/sessionNotes')));
 }
});
test('Client users cannot forge notes, PDF metadata or published index',async()=>{
 for(const uid of ['gm','co','alice']){
  for(const path of [privateNote,privatePdf,publicPdf,config]){
   await assertFails(setDoc(doc(firestore(uid),path),{visibility:'players'}));
   await assertFails(updateDoc(doc(firestore(uid),path),{visibility:'players'}));
   await assertFails(deleteDoc(doc(firestore(uid),path)));
  }
 }
});
test('PDF bytes are create-only for GM and cannot be read by players before publication',async()=>{
 const content=new TextEncoder().encode('%PDF-1.7\n');
 await assertFails(uploadBytes(ref(storage('alice'),media),content,{contentType:'application/pdf'}));
 await assertFails(uploadBytes(ref(storage('gm'),media),content,{contentType:'text/plain'}));
 await assertSucceeds(uploadBytes(ref(storage('gm'),media),content,{contentType:'application/pdf'}));
 await assertFails(uploadBytes(ref(storage('gm'),media),content,{contentType:'application/pdf'}));
 await assertSucceeds(getBytes(ref(storage('gm'),media)));
 await assertFails(getBytes(ref(storage('alice'),media)));
 await assertFails(getBytes(ref(storage('visitor'),media)));
 await assertFails(getBytes(ref(storage(null),media)));
 await assertSucceeds(deleteObject(ref(storage('gm'),media)));
});
test('Explicit sharing enables active member read and unpublish revokes bytes',async()=>{
 const content=new TextEncoder().encode('%PDF-1.7\n');
 await assertSucceeds(uploadBytes(ref(storage('gm'),media),content,{contentType:'application/pdf'}));
 await env.withSecurityRulesDisabled(async context=>{
  await setDoc(doc(context.firestore(),publicPdf),{id:'pdf1',status:'ready',visibility:'players',storagePath:media});
  await updateDoc(doc(context.firestore(),privatePdf),{status:'ready',visibility:'players'});
 });
 await assertSucceeds(getDoc(doc(firestore('alice'),publicPdf)));
 await assertSucceeds(getDocs(collection(firestore('alice'),'campaigns/'+campaign+'/sessionPdfsShared')));
 await assertSucceeds(getBytes(ref(storage('gm'),media)));
 await assertSucceeds(getBytes(ref(storage('alice'),media)));
 await assertFails(getBytes(ref(storage('visitor'),media)));
 await env.withSecurityRulesDisabled(async context=>{
  await deleteDoc(doc(context.firestore(),publicPdf));
  await updateDoc(doc(context.firestore(),privatePdf),{visibility:'gm'});
 });
 const result=await assertSucceeds(getDoc(doc(firestore('alice'),publicPdf)));
 assert.equal(result.exists(),false);
 await assertFails(getBytes(ref(storage('alice'),media)));
 await assertSucceeds(deleteObject(ref(storage('gm'),media)));
});
