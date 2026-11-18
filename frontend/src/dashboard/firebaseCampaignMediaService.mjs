import {assertGMCampaignId,gmCampaignAccess,gmPartySummary} from './gmDashboardModel.mjs';
import {playerCampaignAccess} from '../player/playerDashboardModel.mjs';
import {battleMapPrivatePins} from '../../../src/state/battleMapFogModel.mjs';
import {validatePresentationAction} from '../../../src/state/playerPresentationModel.mjs';
import {
  mapId,mapForViewer,publishedAtlas,presentationForViewer,timestampRevision,
  battleMapEditableSettings,battleMapDimensions,battleMapFileError,battleMapFileKind,
  battleMapAssetPath,atlasMapCanPreview,BATTLE_MAP_MAX_RECORDS
} from './campaignMediaModel.mjs';

/** Phase 6.4. One already-verified Auth/Firestore/Storage/Functions client.
 * Never mount the legacy runtime or create another Firebase app. */
export function createFirebaseCampaignMediaService({
  auth,db,firestoreSdk,storage,storageSdk,functions,functionsSdk,readCanonical,
  enabled=false
}){
  if(!auth||!db||!firestoreSdk||!storage||!storageSdk||!functions||!functionsSdk||
    typeof readCanonical!=='function')
    throw Error('A verified Firebase media adapter is required.');
  const flags=Object.freeze({enabled:enabled===true});
  const same=uid=>{if(auth.currentUser?.uid!==uid)throw Error('Account changed. Reload the campaign.');};
  const cRef=id=>firestoreSdk.doc(db,'campaigns',id);
  const memberRef=(id,uid)=>firestoreSdk.doc(db,'campaigns',id,'members',uid);
  const mapRef=(id,map)=>firestoreSdk.doc(db,'campaigns',id,'battleMaps',map);
  const mapCol=id=>firestoreSdk.collection(db,'campaigns',id,'battleMaps');
  const atlasCol=id=>firestoreSdk.collection(db,'campaigns',id,'worldAtlasShared');
  const atlasRef=(id,map)=>firestoreSdk.doc(db,'campaigns',id,'worldAtlasShared',map);
  const notesRef=(id,map)=>firestoreSdk.doc(db,'campaigns',id,'battleMaps',map,'gmNotes','private');
  const presentationRef=(id,mode)=>firestoreSdk.doc(db,'campaigns',id,
    mode==='gm'?'presentationControl':'presentationShared','current');
  async function verified(){
    if(!flags.enabled)throw Error('The migrated campaign media workspace is disabled.');
    const uid=auth.currentUser?.uid;
    if(!uid)throw Error('Sign in to access campaign media.');
    const profile=await readCanonical(auth.currentUser);
    same(uid);
    if(profile?.uid!==uid)throw Error('Saved account profile could not be verified.');
    return uid;
  }
  const access=(campaign,member,uid,id,mode)=>
    mode==='gm'?gmCampaignAccess(campaign,member,uid,id).allowed:
      playerCampaignAccess(campaign,member,uid,id).allowed;
  async function check(id,mode='player'){
    assertGMCampaignId(id);
    const uid=await verified();
    let snapshot;
    try{snapshot=await firestoreSdk.getDocFromServer(cRef(id));}
    catch{throw Error('Campaign access is unavailable.');}
    same(uid);
    if(!snapshot.exists())throw Error('Campaign is unavailable.');
    const campaign={...snapshot.data(),id:snapshot.id};
    const v2=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid;
    const memberSnap=v2?await firestoreSdk.getDocFromServer(memberRef(id,uid)):null;
    same(uid);
    const member=memberSnap?.exists()?memberSnap.data():null;
    if(!access(campaign,member,uid,id,mode))
      throw Error('Campaign membership does not allow this operation.');
    return {uid,campaign,member,v2};
  }
  /** Live listeners fail closed on revoked GM/player membership, stale cache,
   * account switch or Firestore permission error. */
  function watch(id,mode,reference,project,onUpdate,onError,targetType='collection'){
    assertGMCampaignId(id);
    let active=true,stops=[];
    const close=()=>{active=false;stops.splice(0).forEach(stop=>{try{stop();}catch{}});};
    const fail=err=>{
      if(!active)return;
      close();onError?.(err instanceof Error?err:Error('Media connection denied.'));
    };
    (async()=>{
      try{
        const initial=await check(id,mode);
        if(!active)return;
        const {uid,v2}=initial;
        let campaign=initial.campaign,member=initial.member,payload;
        const ready={campaign:false,member:!v2,target:false};
        const publish=()=>{
          if(!active||!Object.values(ready).every(Boolean))return;
          try{
            same(uid);
            if(!access(campaign,member,uid,id,mode))
              throw Error('Campaign media access was revoked.');
            onUpdate(project(payload,id,mode));
          }catch(error){fail(error);}
        };
        const attach=(ref,key,decode)=>{
          const stop=firestoreSdk.onSnapshot(ref,{includeMetadataChanges:true},snap=>{
            if(!active||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
            try{
              same(uid);
              if(key!=='target'&&!snap.exists())throw Error('Campaign membership ended.');
              if(key==='campaign')campaign={...snap.data(),id:snap.id};
              if(key==='member')member=decode(snap);
              if(key==='target')payload=decode(snap);
              ready[key]=true;publish();
            }catch(error){fail(error);}
          },fail);
          if(active)stops.push(stop);else stop();
        };
        attach(cRef(id),'campaign',snap=>snap.data());
        if(v2)attach(memberRef(id,uid),'member',snap=>snap.exists()?snap.data():null);
        attach(reference,'target',targetType==='document'||project===presentationProject
          ?snap=>snap.exists()?snap.data():null:project===notesProject
            ?snap=>snap.exists()?snap.data().pins||[]:[]
            :snap=>snap.docs.map(row=>({id:row.id,...row.data()})));

      }catch(error){fail(error);}
    })();
    return close;
  }
  const mapsProject=(rows,id,mode)=>rows.map(row=>mapForViewer(row,id,mode))
    .filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  const atlasProject=(rows,id)=>rows.map(row=>publishedAtlas(row,id))
    .filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  const presentationProject=raw=>presentationForViewer(raw);
  const notesProject=rows=>battleMapPrivatePins(rows);
  const partyProject=rows=>gmPartySummary(rows);
  const encounterProject=rows=>rows.length?rows[0]:null;
  function watchMaps(id,mode,onUpdate,onError){
    const ref=mode==='gm'?firestoreSdk.query(mapCol(id),firestoreSdk.limit(BATTLE_MAP_MAX_RECORDS)):
      firestoreSdk.query(mapCol(id),firestoreSdk.where('visibility','==','players'),
        firestoreSdk.limit(BATTLE_MAP_MAX_RECORDS));
    return watch(id,mode,ref,mapsProject,onUpdate,onError);
  }
  function watchAtlas(id,onUpdate,onError){
    return watch(id,'player',atlasCol(id),atlasProject,onUpdate,onError);
  }
  function watchPresentation(id,mode,onUpdate,onError){
    return watch(id,mode,presentationRef(id,mode),presentationProject,onUpdate,onError);
  }
  function watchPrivatePins(id,map,onUpdate,onError){
    if(!mapId(map))throw Error('Invalid map identifier.');
    return watch(id,'gm',notesRef(id,map),notesProject,onUpdate,onError);
  }
  function watchParty(id,onUpdate,onError){
    return watch(id,'player',firestoreSdk.collection(db,'campaigns',id,'characters'),
      partyProject,onUpdate,onError);
  }
  function watchEncounter(id,onUpdate,onError){
    // Shared encounter data is projected by the calling view with safeCombatPresentation.
    const ref=firestoreSdk.doc(db,'campaigns',id,'systems','encounter');
    return watch(id,'player',ref,raw=>raw||{},onUpdate,onError,'document');
  }
  async function fetchMapMedia(id,map,mode='player'){
    const {uid}=await check(id,mode);
    if(!mapForViewer(map,id,mode))throw Error('Invalid map media reference.');
    const snap=await firestoreSdk.getDocFromServer(mapRef(id,map.id));
    same(uid);
    const fresh=snap.exists()?mapForViewer({id:snap.id,...snap.data()},id,mode):null;
    if(!fresh||fresh.storagePath!==map.storagePath||fresh.contentType!==map.contentType)
      throw Error('The map is unavailable or no longer shared.');
    const blob=await storageSdk.getBlob(storageSdk.ref(storage,fresh.storagePath));
    same(uid);
    return blob;
  }
  async function fetchAtlasMedia(id,map){
    const {uid}=await check(id,'player');
    if(!atlasMapCanPreview(map,id))throw Error('Invalid world-map reference.');
    const snap=await firestoreSdk.getDocFromServer(atlasRef(id,map.id));
    same(uid);
    const fresh=snap.exists()?publishedAtlas({id:snap.id,...snap.data()},id):null;
    if(!fresh||fresh.storagePath!==map.storagePath)
      throw Error('The world map is no longer published.');
    const blob=await storageSdk.getBlob(storageSdk.ref(storage,fresh.storagePath));
    same(uid);
    return blob;
  }
  async function uploadMap(id,file,settings,dimensions){
    const issue=battleMapFileError(file);
    if(issue)throw Error(issue);
    const details=battleMapEditableSettings(settings);
    const size=battleMapDimensions(dimensions?.width,dimensions?.height);
    const {uid}=await check(id,'gm');
    const existing=await firestoreSdk.getDocsFromServer(
      firestoreSdk.query(mapCol(id),firestoreSdk.limit(BATTLE_MAP_MAX_RECORDS)));
    same(uid);
    if(existing.size>=BATTLE_MAP_MAX_RECORDS)throw Error('The campaign has reached its 40-map limit.');
    const reference=firestoreSdk.doc(mapCol(id)),map=reference.id;
    const mime=String(file.type).toLowerCase(),path=battleMapAssetPath(id,map,mime);
    const media=storageSdk.ref(storage,path);
    let uploaded=false;
    try{
      await storageSdk.uploadBytes(media,file,{contentType:mime,
        cacheControl:'private,max-age=0,no-store'});
      uploaded=true;
      await check(id,'gm');same(uid);
      const record={id:map,campaignId:id,...details,...size,kind:battleMapFileKind(mime),
        contentType:mime,storagePath:path,createdBy:uid,
        createdAt:firestoreSdk.serverTimestamp(),updatedAt:firestoreSdk.serverTimestamp()};
      await firestoreSdk.setDoc(reference,record);
      same(uid);
      return {ok:true,id:map};
    }catch(error){
      if(uploaded)await storageSdk.deleteObject(media).catch(()=>{});
      throw error;
    }
  }
  async function saveMap(id,map,settings,expected){
    if(!mapId(map))throw Error('Invalid map identifier.');
    const details=battleMapEditableSettings(settings);
    const {uid}=await check(id,'gm');
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(cRef(id));
      if(!campaignSnap.exists())throw Error('Campaign no longer exists.');
      const campaign={...campaignSnap.data(),id:campaignSnap.id};
      const memberSnap=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid
        ?await tx.get(memberRef(id,uid)):null;
      const snap=await tx.get(mapRef(id,map));
      same(uid);
      if(!access(campaign,memberSnap?.exists()?memberSnap.data():null,uid,id,'gm'))
        throw Error('GM permission has been revoked.');
      if(!snap.exists())throw Error('Battle map no longer exists.');
      const before=snap.data();
      if(timestampRevision(before.updatedAt)!==Number(expected))
        throw Error('Map changed in another session. Reload before saving.');
      if(before.combatId&&(
        JSON.stringify(details.tokens)!==JSON.stringify(before.tokens)||
        details.gridRows!==before.gridRows||details.gridColumns!==before.gridColumns||
        details.metresPerCell!==before.metresPerCell))
        throw Error('End the linked combat before changing token or grid geometry.');
      tx.update(mapRef(id,map),{...details,updatedAt:firestoreSdk.serverTimestamp()});
    });
    same(uid);return {ok:true};
  }
  async function removeMap(id,map){
    if(!mapId(map))throw Error('Invalid map identifier.');
    const {uid}=await check(id,'gm');
    let path;
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(cRef(id));
      if(!campaignSnap.exists())throw Error('Campaign no longer exists.');
      const campaign={...campaignSnap.data(),id:campaignSnap.id};
      const memberSnap=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid
        ?await tx.get(memberRef(id,uid)):null;
      const snap=await tx.get(mapRef(id,map));
      same(uid);
      if(!access(campaign,memberSnap?.exists()?memberSnap.data():null,uid,id,'gm'))
        throw Error('GM permission has been revoked.');
      if(!snap.exists())throw Error('Battle map no longer exists.');
      const previous=snap.data();
      if(previous.combatId)throw Error('End the linked encounter before deleting its map.');
      path=battleMapAssetPath(id,map,previous.contentType);
      if(path!==previous.storagePath)throw Error('Invalid map storage reference.');
      tx.delete(mapRef(id,map));tx.delete(notesRef(id,map));
    });
    same(uid);
    await storageSdk.deleteObject(storageSdk.ref(storage,path)).catch(()=>{});
    return {ok:true};
  }
  async function savePrivatePins(id,map,pins){
    if(!mapId(map))throw Error('Invalid map identifier.');
    const validated=battleMapPrivatePins(pins),{uid}=await check(id,'gm');
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(cRef(id));
      if(!campaignSnap.exists())throw Error('Campaign no longer exists.');
      const campaign={...campaignSnap.data(),id:campaignSnap.id};
      const membership=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid
        ?await tx.get(memberRef(id,uid)):null;
      const mapSnap=await tx.get(mapRef(id,map));
      same(uid);
      if(!access(campaign,membership?.exists()?membership.data():null,uid,id,'gm')||
        !mapSnap.exists())throw Error('GM map permission has been revoked.');
      tx.set(notesRef(id,map),{pins:validated,updatedBy:uid,
        updatedAt:firestoreSdk.serverTimestamp()});
    });
    same(uid);return {ok:true};
  }
  async function managePresentation(id,action){
    const {uid}=await check(id,'gm');
    validatePresentationAction(action);
    const response=await functionsSdk.httpsCallable(functions,'asteriaAction')({
      action:'managePlayerPresentation',args:[id,'gm-scope',action],
      requestId:crypto.randomUUID()
    });
    same(uid);
    if(response.data?.ok!==true)
      throw Error(response.data?.error||'Presentation change was rejected.');
    return response.data;
  }
  return Object.freeze({
    availability:()=>flags,watchMaps,watchAtlas,watchPresentation,watchPrivatePins,
    watchParty,watchEncounter,fetchMapMedia,fetchAtlasMedia,uploadMap,
    saveMap,removeMap,savePrivatePins,managePresentation
  });
}
