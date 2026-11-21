import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
  from '@firebase/rules-unit-testing';
import {doc,collection,setDoc,getDoc,getDocs,updateDoc}
  from 'firebase/firestore';
import {ref,uploadBytes,getBytes,deleteObject}
  from 'firebase/storage';

const projectId='demo-asteria-presentation-phase73',campaign='present73';
const root='campaigns/'+campaign,assetId='frame-73';
const path=root+'/presentationAssets/'+assetId+'/content';
const recordRef=root+'/presentationAssets/'+assetId;
const accessRef=root+'/presentationAssetAccess/current';
const sessionRef=root+'/hybridSessionControl/current';
const grantRef=root+'/hybridViewerGrants/invitee';
const bytes=new TextEncoder().encode('SECURE PRESENTATION');
const epoch='hybrid-media-test',now=Date.now();
let env;
const firestore=uid=>uid?env.authenticatedContext(uid).firestore():
  env.unauthenticatedContext().firestore();
const storage=uid=>uid?env.authenticatedContext(uid).storage():
  env.unauthenticatedContext().storage();
const mutate=async(path,patch)=>env.withSecurityRulesDisabled(async context=>
  updateDoc(doc(context.firestore(),path),patch));

before(async()=>{
  env=await initializeTestEnvironment({
    projectId,firestore:{rules:readFileSync('firestore.rules','utf8')},
    storage:{rules:readFileSync('storage.rules','utf8')}
  });
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();await env.clearStorage();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,root),{ownerUid:'gm',membershipSchemaVersion:2});
    await setDoc(doc(db,root+'/members/alice'),{
      uid:'alice',campaignId:campaign,role:'player',status:'active'
    });
    await setDoc(doc(db,recordRef),{
      id:assetId,status:'uploading',visibility:'gm',revision:1,
      kind:'image',name:'Private opening scene',description:'',
      contentType:'image/png',size:bytes.length,storagePath:path
    });
    await setDoc(doc(db,sessionRef),{
      status:'open',epoch,expiresAt:new Date(now+600000)
    });
    await setDoc(doc(db,grantRef),{
      uid:'invitee',status:'active',epoch,expiresAt:new Date(now+300000)
    });
    await setDoc(doc(db,accessRef),{
      assetId:'',scene:'blank',epoch,expiresAt:new Date(now+600000),
      viewerExpiries:{invitee:new Date(now+300000)}
    });
  });
});
test('7.3: only GM can create correct MIME/length original bytes, never overwrite',async()=>{
  await assertFails(uploadBytes(ref(storage('alice'),path),bytes,{contentType:'image/png'}));
  await assertFails(uploadBytes(ref(storage('gm'),path),bytes,{contentType:'text/html'}));
  await assertFails(uploadBytes(ref(storage('gm'),path),
    new Uint8Array([1,2,3]),{contentType:'image/png'}));
  await assertSucceeds(uploadBytes(ref(storage('gm'),path),bytes,{contentType:'image/png'}));
  await assertFails(uploadBytes(ref(storage('gm'),path),bytes,{contentType:'image/png'}));
  await assertFails(getBytes(ref(storage('invitee'),path)));
  await assertFails(getBytes(ref(storage('alice'),path)));
  await assertSucceeds(getBytes(ref(storage('gm'),path)));
});
test('7.3: published and currently staged bytes serve linked player and invited viewer',async()=>{
  await assertSucceeds(uploadBytes(ref(storage('gm'),path),bytes,{contentType:'image/png'}));
  await mutate(recordRef,{status:'ready',visibility:'players'});
  await mutate(accessRef,{assetId,scene:'image'});
  const player=await assertSucceeds(getBytes(ref(storage('alice'),path)));
  const invitee=await assertSucceeds(getBytes(ref(storage('invitee'),path)));
  if(player.byteLength!==bytes.length||invitee.byteLength!==bytes.length)
    throw Error('The approved media bytes did not load.');
  await assertFails(getBytes(ref(storage('outsider'),path)));
  await assertFails(getBytes(ref(storage(null),path)));
  await assertFails(getDoc(doc(firestore('invitee'),recordRef)));
  await assertFails(getDoc(doc(firestore('invitee'),accessRef)));
  await assertFails(getDocs(collection(firestore('invitee'),root+'/presentationAssets')));
  await assertSucceeds(getDoc(doc(firestore('gm'),recordRef)));
});
test('7.3: revoke recipient, expire, close session, or switch scene prevents future byte reads',async()=>{
  await assertSucceeds(uploadBytes(ref(storage('gm'),path),bytes,{contentType:'image/png'}));
  await mutate(recordRef,{status:'ready',visibility:'players'});
  await mutate(accessRef,{assetId,scene:'image'});
  await assertSucceeds(getBytes(ref(storage('invitee'),path)));
  await mutate(accessRef,{viewerExpiries:{}});
  await assertFails(getBytes(ref(storage('invitee'),path)));
  await mutate(accessRef,{viewerExpiries:{invitee:new Date(now+300000)}});
  await mutate(accessRef,{scene:'blank'});
  await assertFails(getBytes(ref(storage('invitee'),path)));
  await mutate(accessRef,{scene:'image'});
  await mutate(accessRef,{expiresAt:new Date(now-1000)});
  await assertFails(getBytes(ref(storage('invitee'),path)));
  await mutate(accessRef,{expiresAt:new Date(now+600000)});
  await mutate(recordRef,{visibility:'gm'});
  await assertFails(getBytes(ref(storage('invitee'),path)));
  await assertFails(getBytes(ref(storage('alice'),path)));
  await assertSucceeds(getBytes(ref(storage('gm'),path)));
});
test('7.3: published state cannot be forged in Firestore or Storage by browser',async()=>{
  await assertSucceeds(uploadBytes(ref(storage('gm'),path),bytes,{contentType:'image/png'}));
  for(const uid of ['gm','alice','invitee']){
    await assertFails(setDoc(doc(firestore(uid),recordRef),{
      status:'ready',visibility:'players'
    }));
    await assertFails(updateDoc(doc(firestore(uid),recordRef),{
      visibility:'players'
    }));
    await assertFails(updateDoc(doc(firestore(uid),accessRef),{
      viewerExpiries:{invitee:new Date(now+600000)}
    }));
    if(uid!=='gm')await assertFails(deleteObject(ref(storage(uid),path)));
  }
});
