import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
  from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc}
  from 'firebase/firestore';
import {ref,getBytes,uploadBytes} from 'firebase/storage';

const projectId='demo-asteria-share-present-phase77',campaign='phase77-security';
const prefix='campaigns/'+campaign;
const originalMap=prefix+'/battleMaps/map77';
const publicMap=prefix+'/battleMapsPublic/map77';
const originalBytes=prefix+'/battleMaps/map77/scene.png';
const originalEncounter=prefix+'/systems/encounter';
const publicCombat=prefix+'/combatPublic/current';
const stage=prefix+'/presentationRestricted/current';
const session=prefix+'/hybridSessionControl/current';
const grant=prefix+'/hybridViewerGrants/guest77';
const manifest=prefix+'/presentationAssetAccess/current';
const now=Date.now();
const until=new Date(now+300000);
const end=new Date(now+600000);
const epoch='phase77-first-epoch';
const payload=new TextEncoder().encode('published phase77 map');
let env;
const db=uid=>uid?env.authenticatedContext(uid).firestore():
  env.unauthenticatedContext().firestore();
const storage=uid=>uid?env.authenticatedContext(uid).storage():
  env.unauthenticatedContext().storage();
const edit=async(path,patch)=>env.withSecurityRulesDisabled(async context=>
  updateDoc(doc(context.firestore(),path),patch));

before(async()=>{
  env=await initializeTestEnvironment({projectId,
    firestore:{rules:readFileSync('firestore.rules','utf8')},
    storage:{rules:readFileSync('storage.rules','utf8')}
  });
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async context=>{
    const admin=context.firestore();
    await setDoc(doc(admin,prefix),{
      ownerUid:'gm77',membershipSchemaVersion:2
    });
    await setDoc(doc(admin,prefix+'/members/player77'),{
      uid:'player77',campaignId:campaign,role:'player',status:'active'
    });
    await setDoc(doc(admin,originalMap),{
      id:'map77',campaignId:campaign,kind:'image',contentType:'image/png',
      storagePath:originalBytes,name:'Public encounter map',
      visibility:'players',gmNotes:'GM_ONLY_MAP_SECRET'
    });
    await setDoc(doc(admin,publicMap),{
      id:'map77',kind:'image',contentType:'image/png',
      visibility:'players',name:'Public encounter map',
      tokens:[],fogCells:'1111'
    });
    await setDoc(doc(admin,originalEncounter),{
      status:'active',combatId:'fight77',
      privateNotes:'GM_ONLY_COMBAT_SECRET',combatants:[{name:'Secret enemy'}]
    });
    await setDoc(doc(admin,publicCombat),{
      status:'active',round:3,combatants:[{name:'Creature'}]
    });
    await setDoc(doc(admin,session),{
      status:'open',epoch,expiresAt:end
    });
    await setDoc(doc(admin,grant),{
      uid:'guest77',status:'active',epoch,expiresAt:until
    });
    await setDoc(doc(admin,stage),{
      version:1,revision:1,epoch,scene:'battle-map',mapId:'map77',
      theme:'obsidian',title:'',subtitle:''
    });
    await setDoc(doc(admin,manifest),{
      assetId:'',scene:'battle-map',mapId:'map77',epoch,
      expiresAt:end,viewerExpiries:{guest77:until}
    });
  });
  await assertSucceeds(uploadBytes(ref(storage('gm77'),originalBytes),payload,
    {contentType:'image/png'}));
});

test('7.7: player, GM, invited guest, outsider and anonymous have distinct boundaries',async()=>{
  await assertSucceeds(getDoc(doc(db('gm77'),originalEncounter)));
  await assertSucceeds(getDoc(doc(db('gm77'),originalMap)));
  for(const uid of ['player77','guest77','outsider77',null]){
    await assertFails(getDoc(doc(db(uid),originalEncounter)));
    await assertFails(getDoc(doc(db(uid),originalMap)));
  }
  await assertSucceeds(getDoc(doc(db('player77'),publicCombat)));
  await assertSucceeds(getDoc(doc(db('player77'),publicMap)));
  await assertSucceeds(getDoc(doc(db('guest77'),publicMap)));
  await assertFails(getDoc(doc(db('guest77'),publicCombat)));
  for(const uid of ['outsider77',null]){
    await assertFails(getDoc(doc(db(uid),publicCombat)));
    await assertFails(getDoc(doc(db(uid),publicMap)));
    await assertFails(getDoc(doc(db(uid),stage)));
    await assertFails(getBytes(ref(storage(uid),originalBytes)));
  }
  await assertFails(getDocs(collection(db('guest77'),prefix+'/battleMapsPublic')));
  await assertFails(getDocs(collection(db('guest77'),prefix+'/battleMaps')));
  await assertSucceeds(getBytes(ref(storage('guest77'),originalBytes)));
});

test('7.7: revocation and session closure stop both scene and original-byte access',async()=>{
  await assertSucceeds(getDoc(doc(db('guest77'),stage)));
  await assertSucceeds(getBytes(ref(storage('guest77'),originalBytes)));
  await edit(grant,{status:'revoked'});
  await assertFails(getDoc(doc(db('guest77'),stage)));
  // The Storage manifest is independently enforced: server revocation must
  // also invalidate the manifest, which the existing callable updates.
  await edit(manifest,{viewerExpiries:{}});
  await assertFails(getBytes(ref(storage('guest77'),originalBytes)));
  await edit(grant,{status:'active'});
  await edit(manifest,{viewerExpiries:{guest77:until}});
  await edit(session,{status:'closed'});
  await assertFails(getDoc(doc(db('guest77'),stage)));
  // Closing the session also clears the manifest through the trusted command.
  await edit(manifest,{scene:'blank',mapId:'',viewerExpiries:{}});
  await assertFails(getBytes(ref(storage('guest77'),originalBytes)));
});

test('7.7: rotating session epoch, changing stage and unpublishing map deny guest',async()=>{
  await edit(session,{epoch:'phase77-rotated'});
  await assertFails(getDoc(doc(db('guest77'),stage)));
  await edit(grant,{epoch:'phase77-rotated'});
  await edit(stage,{epoch:'phase77-rotated'});
  await assertSucceeds(getDoc(doc(db('guest77'),stage)));
  await edit(stage,{scene:'combat',mapId:''});
  await edit(manifest,{scene:'blank',mapId:''});
  await assertFails(getDoc(doc(db('guest77'),publicMap)));
  await assertFails(getBytes(ref(storage('guest77'),originalBytes)));
  await edit(stage,{scene:'battle-map',mapId:'map77'});
  await edit(manifest,{scene:'battle-map',mapId:'map77'});
  await edit(originalMap,{visibility:'gm'});
  await assertFails(getBytes(ref(storage('guest77'),originalBytes)));
  await assertFails(getBytes(ref(storage('player77'),originalBytes)));
});

test('7.7: expired guest and unauthorized writes never regain source access',async()=>{
  await edit(grant,{expiresAt:new Date(now-1000)});
  await edit(manifest,{viewerExpiries:{guest77:new Date(now-1000)}});
  await assertFails(getDoc(doc(db('guest77'),stage)));
  await assertFails(getBytes(ref(storage('guest77'),originalBytes)));
  for(const uid of ['player77','guest77','outsider77']){
    await assertFails(updateDoc(doc(db(uid),stage),{scene:'battle-map'}));
    await assertFails(updateDoc(doc(db(uid),manifest),{scene:'battle-map'}));
    await assertFails(updateDoc(doc(db(uid),grant),{status:'active'}));
  }
});
