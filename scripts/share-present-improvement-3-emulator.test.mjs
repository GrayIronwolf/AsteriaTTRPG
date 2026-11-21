import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
  from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc}
  from 'firebase/firestore';

const projectId='demo-asteria-playlist-improvement-3';
const campaign='playlist-test';
const path='campaigns/'+campaign+'/presentationPlaylists/current';
let env;
const db=uid=>uid?env.authenticatedContext(uid).firestore():
  env.unauthenticatedContext().firestore();
before(async()=>{
  env=await initializeTestEnvironment({
    projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}
  });
  await env.withSecurityRulesDisabled(async context=>{
    const admin=context.firestore();
    await setDoc(doc(admin,'campaigns/'+campaign),{
      ownerUid:'gm3',membershipSchemaVersion:2
    });
    await setDoc(doc(admin,'campaigns/'+campaign+'/members/player3'),{
      uid:'player3',campaignId:campaign,role:'player',status:'active'
    });
    await setDoc(doc(admin,path),{version:1,revision:0,playlists:[]});
  });
});
after(async()=>env?.cleanup());

test('Phase 3: only verified campaign GM reads private playlist document',async()=>{
  await assertSucceeds(getDoc(doc(db('gm3'),path)));
  await assertSucceeds(getDocs(collection(db('gm3'),'campaigns/'+campaign+'/presentationPlaylists')));
  for(const uid of ['player3','guest3','outsider3',null]){
    await assertFails(getDoc(doc(db(uid),path)));
    await assertFails(getDocs(collection(db(uid),'campaigns/'+campaign+'/presentationPlaylists')));
  }
});
test('Phase 3: no client, even the GM, can write playlist documents',async()=>{
  for(const uid of ['gm3','player3','guest3',null]){
    await assertFails(updateDoc(doc(db(uid),path),{revision:5}));
    await assertFails(setDoc(doc(db(uid),'campaigns/'+campaign+'/presentationPlaylists/other'),{revision:1}));
    await assertFails(deleteDoc(doc(db(uid),path)));
  }
});
