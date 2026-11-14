import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {getDoc,getDocs,setDoc,updateDoc,deleteDoc,doc,collection,query,where,Timestamp} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,deleteObject} from 'firebase/storage';

const projectId='demo-asteria-maps';
let env;
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
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'campaigns/camp'),campaign);
    for(const [uid,role] of [['alice','player'],['co','co-gm'],['suspended','player']])
      await setDoc(doc(db,'campaigns/camp/members/'+uid),{
        uid,role,campaignId:'camp',status:uid==='suspended'?'suspended':'active'
      });
  });
});
after(async()=>env?.cleanup());
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
test('published image and video maps are readable only by active campaign members',async()=>{
  await assertSucceeds(setDoc(doc(firestore('gm'),'campaigns/camp/battleMaps/video-map'),
    map('video-map','players','video/mp4','video')));
  await assertSucceeds(updateDoc(doc(firestore('gm'),'campaigns/camp/battleMaps/static-map'),{visibility:'players'}));
  await assertSucceeds(getDoc(doc(firestore('alice'),'campaigns/camp/battleMaps/static-map')));
  await assertSucceeds(getDocs(query(collection(firestore('alice'),'campaigns/camp/battleMaps'),where('visibility','==','players'))));
  await assertFails(getDocs(collection(firestore('alice'),'campaigns/camp/battleMaps')));
  assert.ok((await assertSucceeds(getBytes(ref(storage('alice'),image)))).length>0);
  assert.ok((await assertSucceeds(getBytes(ref(storage('alice'),video)))).length>0);
  await assertFails(getBytes(ref(storage('visitor'),video)));
  await assertFails(getDoc(doc(firestore('suspended'),'campaigns/camp/battleMaps/video-map')));
});
test('unpublishing immediately revokes both Firestore and authenticated Storage reads',async()=>{
  await assertSucceeds(updateDoc(doc(firestore('co'),'campaigns/camp/battleMaps/video-map'),{visibility:'gm'}));
  await assertFails(getDoc(doc(firestore('alice'),'campaigns/camp/battleMaps/video-map')));
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
  await assertFails(getBytes(ref(storage('alice'),image)));
  await assertSucceeds(deleteObject(ref(storage('gm'),image)));
});
