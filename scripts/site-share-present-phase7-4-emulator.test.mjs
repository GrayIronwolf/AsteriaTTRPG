import {before,after,beforeEach,afterEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
  from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc} from 'firebase/firestore';
import {ref,getBytes,uploadBytes,deleteObject} from 'firebase/storage';
const root='campaigns/phase74-security';
const rawCombat=root+'/systems/encounter';
const publicCombat=root+'/combatPublic/current';
const restrictedCombat=root+'/presentationCombat/current';
const rawMap=root+'/battleMaps/map-74';
const publicMap=root+'/battleMapsPublic/map-74';
const storagePath=root+'/battleMaps/map-74/scene.png';
const manifest=root+'/presentationAssetAccess/current';
const stage=root+'/presentationRestricted/current';
const session=root+'/hybridSessionControl/current';
const grant=root+'/hybridViewerGrants/invitee';
const now=Date.now(),epoch='hybrid-secure-74';
const payload=new TextEncoder().encode('SAFE TEST MAP');
let env;
const f=uid=>uid?env.authenticatedContext(uid).firestore():
  env.unauthenticatedContext().firestore();
const s=uid=>uid?env.authenticatedContext(uid).storage():
  env.unauthenticatedContext().storage();
const change=async(path,patch)=>env.withSecurityRulesDisabled(
  async context=>updateDoc(doc(context.firestore(),path),patch));
before(async()=>{
  env=await initializeTestEnvironment({
    projectId:'demo-asteria-share-present-phase74',
    firestore:{rules:readFileSync('firestore.rules','utf8')},
    storage:{rules:readFileSync('storage.rules','utf8')}
  });
});
after(async()=>env?.cleanup());
afterEach(async()=>{await deleteObject(ref(s('gm'),storagePath)).catch(()=>{});});
beforeEach(async()=>{
  await env.clearFirestore();await env.clearStorage();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,root),{ownerUid:'gm',membershipSchemaVersion:2});
    await setDoc(doc(db,root+'/members/alice'),{
      uid:'alice',campaignId:'phase74-security',role:'player',status:'active'
    });
    await setDoc(doc(db,rawCombat),{
      combatId:'live74',status:'active',round:3,
      combatants:[{id:'lich',name:'SECRET LICH',hp:[100,100]}]
    });
    await setDoc(doc(db,publicCombat),{
      version:1,status:'active',round:3,
      combatants:[{id:'lich',name:'Creature'}]
    });
    await setDoc(doc(db,restrictedCombat),{
      active:true,round:3,current:'GM turn',epoch
    });
    await setDoc(doc(db,rawMap),{
      id:'map-74',campaignId:'phase74-security',kind:'image',
      contentType:'image/png',name:'Map',visibility:'players',
      storagePath,secretPins:[{name:'Hidden boss'}]
    });
    await setDoc(doc(db,publicMap),{
      id:'map-74',name:'Map',visibility:'players',
      kind:'image',contentType:'image/png',
      fogCells:'1000',gridColumns:2,gridRows:2,tokens:[]
    });
    await setDoc(doc(db,session),{
      status:'open',epoch,expiresAt:new Date(now+600000)
    });
    await setDoc(doc(db,grant),{
      uid:'invitee',status:'active',epoch,expiresAt:new Date(now+300000)
    });
    await setDoc(doc(db,manifest),{
      assetId:'',mapId:'map-74',scene:'battle-map',epoch,
      viewerExpiries:{invitee:new Date(now+300000)},
      expiresAt:new Date(now+600000)
    });
    await setDoc(doc(db,stage),{
      scene:'battle-map',mapId:'map-74',epoch,
      version:1,revision:2,theme:'obsidian',title:'',subtitle:''
    });
  });
  await assertSucceeds(uploadBytes(ref(s('gm'),storagePath),payload,{
    contentType:'image/png'
  }));
});
test('7.4: GM can read raw combat and map; linked player and guest cannot',async()=>{
  for(const path of [rawCombat,rawMap]){
    await assertSucceeds(getDoc(doc(f('gm'),path)));
    await assertFails(getDoc(doc(f('alice'),path)));
    await assertFails(getDoc(doc(f('invitee'),path)));
    await assertFails(getDoc(doc(f('outsider'),path)));
  }
  await assertFails(getDocs(collection(f('alice'),root+'/battleMaps')));
  await assertFails(getDocs(collection(f('invitee'),root+'/battleMaps')));
});
test('7.4: campaign player sees only safe combat and filtered public map',async()=>{
  await assertSucceeds(getDoc(doc(f('alice'),publicCombat)));
  const result=await assertSucceeds(getDoc(doc(f('alice'),publicMap)));
  if(result.data().secretPins!==undefined)throw Error('GM map secrets leaked.');
  await assertSucceeds(getDocs(collection(f('alice'),root+'/battleMapsPublic')));
  await assertFails(getDoc(doc(f('outsider'),publicMap)));
});
test('7.4: restricted guest can access only exact staged map and approved image bytes',async()=>{
  const guest=f('invitee');
  await assertSucceeds(getDoc(doc(guest,publicMap)));
  await assertSucceeds(getBytes(ref(s('invitee'),storagePath)));
  await assertFails(getDoc(doc(guest,publicCombat)));
  await assertFails(getDoc(doc(guest,restrictedCombat)));
  await assertFails(getDocs(collection(guest,root+'/battleMapsPublic')));
  await assertFails(getBytes(ref(s('outsider'),storagePath)));
  await change(stage,{scene:'combat',mapId:''});
  await change(manifest,{scene:'blank',mapId:''});
  await assertFails(getBytes(ref(s('invitee'),storagePath)));
  await assertSucceeds(getDoc(doc(guest,restrictedCombat)));
});
test('7.4: revoked grant, expired session and private source revoke map bytes',async()=>{
  await assertSucceeds(getBytes(ref(s('invitee'),storagePath)));
  await change(manifest,{viewerExpiries:{}});
  await assertFails(getBytes(ref(s('invitee'),storagePath)));
  await change(manifest,{viewerExpiries:{invitee:new Date(now+300000)}});
  await change(session,{status:'closed'});
  await assertFails(getDoc(doc(f('invitee'),publicMap)));
  await change(session,{status:'open'});
  await change(rawMap,{visibility:'gm'});
  await assertFails(getBytes(ref(s('invitee'),storagePath)));
  await assertFails(getBytes(ref(s('alice'),storagePath)));
  await assertSucceeds(getBytes(ref(s('gm'),storagePath)));
});
test('7.4: no browser may forge or modify public projections',async()=>{
  for(const uid of ['gm','alice','invitee']){
    await assertFails(setDoc(doc(f(uid),publicCombat),{status:'active'}));
    await assertFails(updateDoc(doc(f(uid),publicCombat),{round:900}));
    await assertFails(setDoc(doc(f(uid),publicMap),{visibility:'players'}));
    await assertFails(updateDoc(doc(f(uid),publicMap),{fogCells:'1111'}));
  }
});

test('Improvement 1: remote invitee cannot download fogged original map media',async()=>{
  await assertSucceeds(getBytes(ref(s('invitee'),storagePath)));
  // Visual-only fog masks pixels in the DOM, not the downloaded source asset.
  // Remote guests must fail closed until a sanitized media derivative exists.
  await change(rawMap,{fogEnabled:true});
  await assertFails(getBytes(ref(s('invitee'),storagePath)));
  await change(rawMap,{fogEnabled:false});
  await assertSucceeds(getBytes(ref(s('invitee'),storagePath)));
});
