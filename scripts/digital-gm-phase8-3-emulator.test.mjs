import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,setDoc,getDoc,getDocs,updateDoc,deleteDoc} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,deleteObject} from 'firebase/storage';
let env;
const campaign='atlas-security-campaign';
const paths={
 private:'campaigns/'+campaign+'/worldAtlas/map-one',
 public:'campaigns/'+campaign+'/worldAtlasShared/map-one',
 config:'campaigns/'+campaign+'/atlasConfig/current'
};
const media='campaigns/'+campaign+'/worldAtlas/map-one/atlas.png';
const firestore=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const storage=uid=>uid?env.authenticatedContext(uid).storage():env.unauthenticatedContext().storage();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-asteria-maps',
 firestore:{rules:readFileSync('firestore.rules','utf8')},
 storage:{rules:readFileSync('storage.rules','utf8')}});});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();await env.clearStorage();
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,'campaigns/'+campaign),{ownerUid:'gm',membershipSchemaVersion:2});
  await setDoc(doc(db,'campaigns/'+campaign+'/members/alice'),{
   uid:'alice',campaignId:campaign,role:'player',status:'active'});
  await setDoc(doc(db,'campaigns/'+campaign+'/members/co'),{
   uid:'co',campaignId:campaign,role:'co-gm',status:'active'});
  await setDoc(doc(db,paths.private),{
   id:'map-one',status:'draft',visibility:'gm',revision:1,
   storagePath:media,pins:[{id:'secret',description:'Hidden GM vault'}]});
  await setDoc(doc(db,paths.config),{activeMaps:1});
 });
});
test('Only GM roles can read private world-map records',async()=>{
 await assertSucceeds(getDoc(doc(firestore('gm'),paths.private)));
 await assertSucceeds(getDoc(doc(firestore('co'),paths.private)));
 await assertSucceeds(getDocs(collection(firestore('gm'),'campaigns/'+campaign+'/worldAtlas')));
 for(const uid of ['alice','visitor',null]){
  await assertFails(getDoc(doc(firestore(uid),paths.private)));
  await assertFails(getDocs(collection(firestore(uid),'campaigns/'+campaign+'/worldAtlas')));
 }
});
test('Private maps and draft images cannot be read by players',async()=>{
 await assertSucceeds(uploadBytes(ref(storage('gm'),media),new Uint8Array([1,2,3]),
  {contentType:'image/png'}));
 await assertSucceeds(getBytes(ref(storage('gm'),media)));
 await assertFails(getBytes(ref(storage('alice'),media)));
 await assertFails(getBytes(ref(storage('visitor'),media)));
 await assertFails(getBytes(ref(storage(null),media)));
});
test('Published projection grants only campaign members read access and withdrawing revokes it',async()=>{
 await assertSucceeds(uploadBytes(ref(storage('gm'),media),new Uint8Array([1,2,3]),
  {contentType:'image/png'}));
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),paths.public),{id:'map-one',status:'published',
   visibility:'players',pins:[],routes:[]});
 });
 await assertSucceeds(getDoc(doc(firestore('alice'),paths.public)));
 await assertSucceeds(getDocs(collection(firestore('alice'),'campaigns/'+campaign+'/worldAtlasShared')));
 console.log('ATLAS: reached player media read');
 await assertSucceeds(getBytes(ref(storage('alice'),media)));
 await assertFails(getBytes(ref(storage('visitor'),media)));
 await env.withSecurityRulesDisabled(async ctx=>{
  await deleteDoc(doc(ctx.firestore(),paths.public));
 });
 await assertFails(getDoc(doc(firestore('alice'),paths.public)));
 await assertFails(getBytes(ref(storage('alice'),media)));
});
test('No client can forge, delete or modify Firestore projections or secret atlas records',async()=>{
 for(const uid of ['gm','co','alice']){
  for(const path of Object.values(paths)){
   await assertFails(setDoc(doc(firestore(uid),path),{status:'published'}));
   await assertFails(updateDoc(doc(firestore(uid),path),{status:'published'}));
   await assertFails(deleteDoc(doc(firestore(uid),path)));
  }
  await assertFails(setDoc(doc(firestore(uid),'campaigns/'+campaign+'/worldAtlasShared/forged'),{id:'forged'}));
 }
});
test('Atlas uploads are create-only GM operations with bounded image formats',async()=>{
 await assertFails(uploadBytes(ref(storage('alice'),media),new Uint8Array([1]),{contentType:'image/png'}));
 await assertFails(uploadBytes(ref(storage('gm'),'campaigns/'+campaign+'/worldAtlas/map-one/atlas.mp4'),
  new Uint8Array([1]),{contentType:'video/mp4'}));
 await assertFails(uploadBytes(ref(storage('gm'),'campaigns/'+campaign+'/worldAtlas/unknown/atlas.png'),
  new Uint8Array([1]),{contentType:'image/png'}));
 console.log('ATLAS: passed preupload checks');
 await assertSucceeds(uploadBytes(ref(storage('gm'),media),new Uint8Array([1,2,3]),{contentType:'image/png'}));
 console.log('ATLAS: upload successful');
 await assertFails(uploadBytes(ref(storage('gm'),media),new Uint8Array([2]),{contentType:'image/png'}));
 await assertFails(deleteObject(ref(storage('alice'),media)));
 console.log('ATLAS: reached GM delete');
 await assertSucceeds(deleteObject(ref(storage('gm'),media)));
});
