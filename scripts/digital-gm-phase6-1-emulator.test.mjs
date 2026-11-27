import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {getDoc,getDocs,setDoc,updateDoc,deleteDoc,doc,collection,query,where,Timestamp} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,deleteObject} from 'firebase/storage';
import {battleMapProjectionHarness} from './helpers/battle-map-projection-harness.mjs';

const projectId='demo-asteria-maps';
let env,projections;
const campaign={
  id:'camp',ownerUid:'gm',membershipSchemaVersion:2,
  playerCharacterLinks:{hero:'alice'}
};
const image='campaigns/camp/battleMaps/static-map/scene.png';
const video='campaigns/camp/battleMaps/video-map/scene.mp4';
const map=(id,visibility,contentType,kind)=>({
  id,campaignId:'camp',name:'Test '+id,description:'Scene',
  visibility,kind,contentType,
  storagePath:'campaigns/camp/battleMaps/'+id+'/scene.'+(kind==='video'?'mp4':'png'),
  gridColumns:20,gridRows:15,gridOpacity:40,gridVisible:true,
  tokens:[],width:1920,height:1080,createdBy:'gm',
  createdAt:Timestamp.now(),updatedAt:Timestamp.now()
});
const firestore=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const storage=uid=>uid?env.authenticatedContext(uid).storage():env.unauthenticatedContext().storage();
before(async()=>{
  env=await initializeTestEnvironment({
    projectId,firestore:{rules:readFileSync('firestore.rules','utf8')},
    storage:{rules:readFileSync('storage.rules','utf8')}
  });
  projections=battleMapProjectionHarness(projectId);
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'campaigns/camp'),campaign);
    for(const [uid,role] of [['alice','player'],['co','co-gm'],['suspended','player']])
      await setDoc(doc(db,'campaigns/camp/members/'+uid),{
        uid,role,campaignId:'camp',status:uid==='suspended'?'suspended':'active'
      });
  });
});
after(async()=>{await env?.cleanup();await projections?.close();});
test('campaign GM can create a private image map but player and outsider cannot',async()=>{
  await assertSucceeds(setDoc(doc(firestore('gm'),'campaigns/camp/battleMaps/static-map'),
    map('static-map','gm','image/png','image')));
  await assertFails(getDoc(doc(firestore('alice'),'campaigns/camp/battleMaps/static-map')));
  await assertFails(getDoc(doc(firestore('visitor'),'campaigns/camp/battleMaps/static-map')));
  await assertFails(setDoc(doc(firestore('alice'),'campaigns/camp/battleMaps/forged'),
    {...map('forged','players','image/png','image'),createdBy:'alice'}));
});
test('GM can upload image or MP4; player cannot upload, replace, list or delete media',async()=>{
  await assertSucceeds(uploadBytes(ref(storage('gm'),image),new Uint8Array([1,2,3]),{contentType:'image/png'}));
  await assertSucceeds(uploadBytes(ref(storage('gm'),video),new Uint8Array([0,1,2,3]),{contentType:'video/mp4'}));
  await assertFails(getBytes(ref(storage('alice'),image)));
  await assertFails(getBytes(ref(storage('alice'),video)));
  await assertFails(uploadBytes(ref(storage('alice'),'campaigns/camp/battleMaps/unsafe/scene.mp4'),new Uint8Array([1]),{contentType:'video/mp4'}));
  await assertFails(uploadBytes(ref(storage('gm'),image),new Uint8Array([2]),{contentType:'image/png'}));
  await assertFails(deleteObject(ref(storage('alice'),image)));
});
test('published image and video projections and media are readable only by active campaign members',async()=>{
  await assertSucceeds(setDoc(doc(firestore('gm'),'campaigns/camp/battleMaps/video-map'),
    map('video-map','players','video/mp4','video')));
  await assertSucceeds(updateDoc(doc(firestore('gm'),'campaigns/camp/battleMaps/static-map'),{visibility:'players'}));
  await projections.sync('camp','static-map');
  await projections.sync('camp','video-map');
  await assertFails(getDoc(doc(firestore('alice'),'campaigns/camp/battleMaps/static-map')));
  await assertFails(getDocs(query(collection(firestore('alice'),'campaigns/camp/battleMaps'),where('visibility','==','players'))));
  await assertFails(getDocs(collection(firestore('alice'),'campaigns/camp/battleMaps')));
  const published=await assertSucceeds(getDocs(query(
    collection(firestore('alice'),'campaigns/camp/battleMapsPublic'),where('visibility','==','players'))));
  assert.deepEqual(published.docs.map(row=>row.id).sort(),['static-map','video-map']);
  for(const [id,kind] of [['static-map','image'],['video-map','video']]){
    const view=await assertSucceeds(getDoc(doc(firestore('alice'),'campaigns/camp/battleMapsPublic/'+id)));
    assert.equal(view.data().kind,kind);
    assert.equal('storagePath' in view.data(),false);
    await assertFails(getDoc(doc(firestore('visitor'),'campaigns/camp/battleMapsPublic/'+id)));
    await assertFails(getDoc(doc(firestore('suspended'),'campaigns/camp/battleMapsPublic/'+id)));
  }
  await assertFails(updateDoc(doc(firestore('gm'),'campaigns/camp/battleMapsPublic/static-map'),{name:'forged'}));
  assert.ok((await assertSucceeds(getBytes(ref(storage('alice'),image)))).byteLength>0);
  assert.ok((await assertSucceeds(getBytes(ref(storage('alice'),video)))).byteLength>0);
  await assertFails(getBytes(ref(storage('visitor'),video)));
  await assertFails(getDoc(doc(firestore('suspended'),'campaigns/camp/battleMaps/video-map')));
});
test('unpublishing removes the player projection and revokes authenticated Storage reads',async()=>{
  await assertSucceeds(updateDoc(doc(firestore('co'),'campaigns/camp/battleMaps/video-map'),{visibility:'gm'}));
  await projections.sync('camp','video-map');
  await assertFails(getDoc(doc(firestore('alice'),'campaigns/camp/battleMaps/video-map')));
  const projected=await assertSucceeds(getDoc(doc(firestore('alice'),'campaigns/camp/battleMapsPublic/video-map')));
  assert.equal(projected.exists(),false);
  await assertFails(getBytes(ref(storage('alice'),video)));
  await assertSucceeds(getBytes(ref(storage('co'),video)));
});
test('bounded fields, immutable file references, and media types are enforced',async()=>{
  const record=doc(firestore('gm'),'campaigns/camp/battleMaps/static-map');
  await assertFails(updateDoc(record,{storagePath:'campaigns/other/battleMaps/static-map/scene.png'}));
  await assertFails(updateDoc(record,{kind:'video'}));
  await assertFails(updateDoc(record,{gridColumns:200}));
  await assertFails(updateDoc(record,{tokens:Array.from({length:61},(_,i)=>({id:'t'+i,x:50,y:50}))}));
  await assertFails(setDoc(doc(firestore('gm'),'campaigns/camp/battleMaps/invalid-map'),
    {...map('invalid-map','players','video/quicktime','video')}));
  await assertFails(uploadBytes(ref(storage('gm'),'campaigns/camp/battleMaps/bad/scene.mp4'),
    new Uint8Array([1,2]),{contentType:'text/html'}));
  await assertFails(uploadBytes(ref(storage('gm'),'campaigns/camp/battleMaps/bad/scene.mov'),
    new Uint8Array([1,2]),{contentType:'video/mp4'}));
});
test('GM deletion removes published map access and storage can be cleaned',async()=>{
  await assertSucceeds(deleteDoc(doc(firestore('gm'),'campaigns/camp/battleMaps/static-map')));
  await projections.sync('camp','static-map');
  const projected=await assertSucceeds(getDoc(doc(firestore('alice'),'campaigns/camp/battleMapsPublic/static-map')));
  assert.equal(projected.exists(),false);
  await assertFails(getBytes(ref(storage('alice'),image)));
  await assertSucceeds(deleteObject(ref(storage('gm'),image)));
});
