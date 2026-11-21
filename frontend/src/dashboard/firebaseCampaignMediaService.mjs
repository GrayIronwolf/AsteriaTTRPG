import {assertGMCampaignId,gmCampaignAccess,gmPartySummary} from './gmDashboardModel.mjs';
import {playerCampaignAccess} from '../player/playerDashboardModel.mjs';
import {battleMapPrivatePins} from '../../../src/state/battleMapFogModel.mjs';
import {validatePresentationAction} from '../../../src/state/playerPresentationModel.mjs';
import {validateHybridSessionAction,hybridViewerCanRead,sanitizeRestrictedPresentation} from '../../../src/state/hybridPresentationSessionModel.mjs';
import {
  presentationAssetFileError,presentationAssetDetails,
  presentationAssetPath,presentationAssetId,safePresentationAssetCard,
  PRESENTATION_ASSET_LIMIT
} from '../../../src/state/presentationAssetModel.mjs';
import {
  CAMPAIGN_MEDIA_LIBRARY_SOURCES,CAMPAIGN_MEDIA_LIBRARY_LIMIT_PER_SOURCE,
  buildCampaignMediaLibrary,campaignMediaLibraryReference,classifyCampaignMediaRecord
} from '../../../src/state/campaignMediaLibraryModel.mjs';
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
  const publicMapCol=id=>firestoreSdk.collection(db,'campaigns',id,'battleMapsPublic');
  const publicMapRef=(id,map)=>firestoreSdk.doc(db,'campaigns',id,'battleMapsPublic',map);
  const combatPublicRef=id=>firestoreSdk.doc(db,'campaigns',id,'combatPublic','current');
  const atlasCol=id=>firestoreSdk.collection(db,'campaigns',id,'worldAtlasShared');
  const atlasRef=(id,map)=>firestoreSdk.doc(db,'campaigns',id,'worldAtlasShared',map);
  const notesRef=(id,map)=>firestoreSdk.doc(db,'campaigns',id,'battleMaps',map,'gmNotes','private');
  const hybridSessionRef=id=>firestoreSdk.doc(db,'campaigns',id,'hybridSessionControl','current');
  const hybridGrantsCol=id=>firestoreSdk.collection(db,'campaigns',id,'hybridViewerGrants');
  const hybridGrantRef=(id,uid)=>firestoreSdk.doc(db,'campaigns',id,'hybridViewerGrants',uid);
  const restrictedRef=id=>firestoreSdk.doc(db,'campaigns',id,'presentationRestricted','current');
  const assetCol=id=>firestoreSdk.collection(db,'campaigns',id,'presentationAssets');
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
  function watchMaps(id,mode,onUpdate,onError){
    const ref=mode==='gm'?
      firestoreSdk.query(mapCol(id),firestoreSdk.limit(BATTLE_MAP_MAX_RECORDS)):
      firestoreSdk.query(publicMapCol(id),firestoreSdk.limit(BATTLE_MAP_MAX_RECORDS));
    const projection=(rows,campaignId)=>mode==='gm'?
      mapsProject(rows,campaignId,'gm'):
      mapsProject(rows.map(row=>({...row,
        storagePath:battleMapAssetPath(campaignId,row.id,row.contentType)
      })),campaignId,'player');
    return watch(id,mode,ref,projection,onUpdate,onError);
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
    return watch(id,'player',combatPublicRef(id),raw=>raw||{},
      onUpdate,onError,'document');
  }
  /**
   * GM-only aggregated view of the five existing canonical media collections.
   * No client-side publish/write access. Every source plus membership must have
   * a fresh server snapshot before the first library result is emitted.
   */
  function watchGMMediaLibrary(id,onUpdate,onError){
    assertGMCampaignId(id);
    let active=true,stops=[];
    const close=()=>{active=false;stops.splice(0).forEach(stop=>{try{stop();}catch{}});};
    const fail=error=>{
      if(!active)return;
      close();onError?.(error instanceof Error?error:Error('Media library unavailable.'));
    };
    (async()=>{
      try{
        const initial=await check(id,'gm');
        if(!active)return;
        const {uid,v2}=initial;
        let campaign=initial.campaign,member=initial.member;
        const values=Object.fromEntries(CAMPAIGN_MEDIA_LIBRARY_SOURCES
          .map(source=>[source,[]]));
        const ready=Object.fromEntries([
          ['campaign',false],['member',!v2],
          ...CAMPAIGN_MEDIA_LIBRARY_SOURCES.map(source=>[source,false])
        ]);
        const publish=()=>{
          if(!active||!Object.values(ready).every(Boolean))return;
          try{
            same(uid);
            if(!access(campaign,member,uid,id,'gm'))
              throw Error('GM library access was revoked.');
            onUpdate(buildCampaignMediaLibrary(id,values));
          }catch(error){fail(error);}
        };
        const listen=(reference,key,project)=>{
          const stop=firestoreSdk.onSnapshot(reference,
            {includeMetadataChanges:true},snapshot=>{
              if(!active||snapshot.metadata?.fromCache||
                snapshot.metadata?.hasPendingWrites)return;
              try{
                same(uid);
                if((key==='campaign'||key==='member')&&!snapshot.exists())
                  throw Error('Campaign library membership ended.');
                const value=project(snapshot);
                if(key==='campaign')campaign=value;
                else if(key==='member')member=value;
                else values[key]=value;
                ready[key]=true;publish();
              }catch(error){fail(error);}
            },fail);
          if(active)stops.push(stop);else stop();
        };
        listen(cRef(id),'campaign',snapshot=>({...snapshot.data(),id:snapshot.id}));
        if(v2)listen(memberRef(id,uid),'member',snapshot=>
          snapshot.exists()?snapshot.data():null);
        for(const source of CAMPAIGN_MEDIA_LIBRARY_SOURCES){
          const query=firestoreSdk.query(
            firestoreSdk.collection(db,'campaigns',id,source),
            firestoreSdk.limit(CAMPAIGN_MEDIA_LIBRARY_LIMIT_PER_SOURCE)
          );
          listen(query,source,snapshot=>snapshot.docs.map(row=>({
            ...row.data(),id:row.id
          })));
        }
      }catch(error){fail(error);}
    })();
    return close;
  }

  /**
   * GM previews are fresh-source-checked and fetched with existing Storage
   * permissions. No source URL or token is returned to an unverified user.
   * Any object URL is temporary and owned/revoked by the calling component.
   */
  async function fetchGMMediaLibraryPreview(id,reference){
    const ref=campaignMediaLibraryReference(reference);
    const {uid}=await check(id,'gm');
    const snapshot=await firestoreSdk.getDocFromServer(firestoreSdk.doc(
      db,'campaigns',id,ref.source,ref.sourceId
    ));
    same(uid);
    if(!snapshot.exists())throw Error('Original campaign media was removed.');
    const raw={...snapshot.data(),id:snapshot.id};
    const record=classifyCampaignMediaRecord(id,ref.source,raw);
    if(!record||!record.previewable)
      throw Error('The original media is not available for preview.');
    // Verify against the canonical model; never accept a path from the browser.
    const blob=await storageSdk.getBlob(storageSdk.ref(storage,raw.storagePath));
    same(uid);
    return {blob,contentType:record.contentType};
  }

  async function fetchMapMedia(id,map,mode='player'){
    const {uid}=await check(id,mode);
    if(!mapForViewer(map,id,mode))throw Error('Invalid map media reference.');
    const snap=await firestoreSdk.getDocFromServer(mode==='gm'?
      mapRef(id,map.id):publicMapRef(id,map.id));
    same(uid);
    const fresh=snap.exists()?mapForViewer({id:snap.id,...snap.data(),
      storagePath:mode==='gm'?snap.data().storagePath:
        battleMapAssetPath(id,map.id,snap.data().contentType)},id,mode):null;
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
  async function manageHybridSession(id,action){
    const {uid}=await check(id,'gm');
    validateHybridSessionAction(action);
    const response=await functionsSdk.httpsCallable(functions,'asteriaAction')({
      action:'manageHybridPresentationSession',args:[id,'gm-scope',action],
      requestId:crypto.randomUUID()
    });
    same(uid);
    if(response.data?.ok!==true)
      throw Error(response.data?.error||'Hybrid viewer session command failed.');
    return response.data;
  }

  function watchGMHybridSession(id,onUpdate,onError){
    let active=true,stops=[],campaign=null,member=null;
    const state={session:null,grants:[]};
    const ready={campaign:false,member:false,session:false,grants:false};
    const close=()=>{active=false;stops.splice(0).forEach(stop=>stop());};
    const fail=error=>{if(!active)return;close();onError?.(error);};
    (async()=>{
      try{
        const initial=await check(id,'gm');
        if(!active)return;
        const {uid,v2}=initial;
        campaign=initial.campaign;member=initial.member;ready.member=!v2;
        const publish=()=>{
          if(!active||!Object.values(ready).every(Boolean))return;
          try{
            same(uid);
            if(!access(campaign,member,uid,id,'gm'))
              throw Error('GM hybrid session permissions were revoked.');
            onUpdate({...state,grants:[...state.grants]});
          }catch(error){fail(error);}
        };
        const listen=(ref,key,project)=>{
          const stop=firestoreSdk.onSnapshot(ref,
            {includeMetadataChanges:true},snapshot=>{
              if(!active||snapshot.metadata?.fromCache||
                snapshot.metadata?.hasPendingWrites)return;
              try{
                same(uid);
                if(key==='campaign'&&!snapshot.exists())
                  throw Error('Campaign access ended.');
                const value=project(snapshot);
                if(key==='campaign')campaign=value;
                else if(key==='member')member=value;
                else state[key]=value;
                ready[key]=true;publish();
              }catch(error){fail(error);}
            },fail);
          if(active)stops.push(stop);else stop();
        };
        listen(cRef(id),'campaign',snap=>({...snap.data(),id:snap.id}));
        if(v2)listen(memberRef(id,uid),'member',snap=>
          snap.exists()?snap.data():null);
        listen(hybridSessionRef(id),'session',snap=>snap.exists()?snap.data():null);
        listen(firestoreSdk.query(hybridGrantsCol(id),firestoreSdk.limit(24)),
          'grants',snap=>snap.docs.map(row=>({...row.data(),uid:row.id})));
      }catch(error){fail(error);}
    })();
    return close;
  }

  // An invited account may NOT be a campaign member. Only the recipient's
  // exact per-UID grant, session status and text-only safe feed are watched.
  function watchRestrictedViewer(id,onUpdate,onError){
    assertGMCampaignId(id);
    let active=true,stops=[],timer=null;
    const state={grant:null,session:null,scene:null};
    const ready={grant:false,session:false,scene:false};
    const close=()=>{
      active=false;
      if(timer!==null)clearTimeout(timer);
      stops.splice(0).forEach(stop=>stop());
    };
    const fail=error=>{if(!active)return;close();onError?.(error);};
    (async()=>{
      try{
        const uid=await verified();
        const first=await firestoreSdk.getDocFromServer(hybridGrantRef(id,uid));
        same(uid);
        if(!active)return;
        if(!first.exists()||first.data().uid!==uid)
          throw Error('A GM invitation is required to open this display.');
        const publish=()=>{
          if(!active||!Object.values(ready).every(Boolean))return;
          try{
            same(uid);
            if(timer!==null){clearTimeout(timer);timer=null;}
            if(!hybridViewerCanRead(state.session,state.grant,uid))
              throw Error('Viewer access expired, was revoked, or the session closed.');
            if(state.scene?.epoch!==state.session.epoch)
              throw Error('This presentation belongs to an earlier session.');
            const deadline=Math.min(state.grant.expiresAt?.toMillis?.()||0,
              state.session.expiresAt?.toMillis?.()||0);
            const delay=deadline-Date.now();
            if(delay<=0)throw Error('Viewer session expired.');
            timer=setTimeout(()=>fail(Error('Viewer session expired.')),
              Math.min(delay,2147483647));
            onUpdate(sanitizeRestrictedPresentation(state.scene));
          }catch(error){fail(error);}
        };
        const listen=(ref,key,project)=>{
          const stop=firestoreSdk.onSnapshot(ref,
            {includeMetadataChanges:true},snapshot=>{
              if(!active||snapshot.metadata?.fromCache||
                snapshot.metadata?.hasPendingWrites)return;
              try{
                same(uid);
                if(!snapshot.exists())throw Error('Viewer access is unavailable.');
                state[key]=project(snapshot);
                ready[key]=true;publish();
              }catch(error){fail(error);}
            },fail);
          if(active)stops.push(stop);else stop();
        };
        listen(hybridGrantRef(id,uid),'grant',snap=>snap.data());
        listen(hybridSessionRef(id),'session',snap=>snap.data());
        listen(restrictedRef(id),'scene',snap=>snap.data());
      }catch(error){fail(error);}
    })();
    return close;
  }

  function watchPresentationAssets(id,onUpdate,onError){
    return watch(id,'gm',firestoreSdk.query(assetCol(id),
      firestoreSdk.limit(PRESENTATION_ASSET_LIMIT)),
      rows=>rows.map(row=>safePresentationAssetCard(row,id)).filter(Boolean)
        .sort((a,b)=>a.name.localeCompare(b.name)),onUpdate,onError);
  }

  async function managePresentationAsset(id,action){
    const {uid}=await check(id,'gm');
    const response=await functionsSdk.httpsCallable(functions,'asteriaAction')({
      action:'managePresentationAsset',args:[id,'gm-scope',action],
      requestId:crypto.randomUUID()
    });
    same(uid);
    if(response.data?.ok!==true)
      throw Error(response.data?.error||'Presentation media operation failed.');
    return response.data;
  }
  async function uploadPresentationAsset(id,file,name,description=''){
    const issue=presentationAssetFileError(file);
    if(issue)throw Error(issue);
    const details=presentationAssetDetails({
      name:String(name||file.name||'').slice(0,120),
      description:String(description||'').slice(0,380),
      contentType:file.type,size:file.size
    });
    const {uid}=await check(id,'gm');
    const newRef=firestoreSdk.doc(assetCol(id));
    const assetId=newRef.id;
    await managePresentationAsset(id,{type:'reserve',id:assetId,details});
    same(uid);
    const path=presentationAssetPath(id,assetId);
    let uploaded=false;
    try{
      await storageSdk.uploadBytes(storageSdk.ref(storage,path),file,{
        contentType:details.contentType,cacheControl:'private,max-age=0,no-store'
      });
      uploaded=true;
      await check(id,'gm');same(uid);
      await managePresentationAsset(id,{
        type:'finish',id:assetId,expectedRevision:1
      });
      same(uid);
      return {ok:true,id:assetId};
    }catch(error){
      // If upload completed, keep the private record for explicit GM cleanup
      // rather than deleting an object still in a separate network request.
      if(!uploaded)await managePresentationAsset(id,{
        type:'archive',id:assetId,expectedRevision:1
      }).catch(()=>{});
      throw error;
    }
  }

  async function fetchPresentationAsset(id,assetId,{restricted=false}={}){
    if(!presentationAssetId(assetId))
      throw Error('Invalid presentation media reference.');
    const {uid}=restricted?{uid:await verified()}:await check(id,'player');
    // Storage enforces final publication, active scene and exact-recipient
    // authorization on every byte fetch. No raw Storage path from Firestore.
    const blob=await storageSdk.getBlob(storageSdk.ref(storage,
      presentationAssetPath(id,assetId)));
    same(uid);
    return blob;
  }

  // Restricted viewer subscriptions intentionally do not call campaign
  // membership checks. Firestore authorizes only staged and sanitized data.
  function watchRestrictedStageDocument(id,collection,documentId,onUpdate,onError){
    assertGMCampaignId(id);
    if(!mapId(documentId))throw Error('Invalid restricted presentation reference.');
    let active=true,stop=()=>{};
    (async()=>{
      try{
        const uid=await verified();
        const grant=await firestoreSdk.getDocFromServer(hybridGrantRef(id,uid));
        same(uid);
        if(!grant.exists()||grant.data().uid!==uid||
          grant.data().status!=='active')
          throw Error('A valid restricted viewer invitation is required.');
        if(!active)return;
        const target=firestoreSdk.doc(db,'campaigns',id,collection,documentId);
        stop=firestoreSdk.onSnapshot(target,{includeMetadataChanges:true},snapshot=>{
          if(!active||snapshot.metadata?.fromCache||
            snapshot.metadata?.hasPendingWrites)return;
          try{
            same(uid);
            if(!snapshot.exists())throw Error('The presented content was withdrawn.');
            onUpdate(snapshot.data());
          }catch(error){if(active){active=false;stop();onError?.(error);}}
        },error=>{if(active){active=false;stop();onError?.(error);}});
      }catch(error){if(active){active=false;onError?.(error);}}
    })();
    return ()=>{active=false;stop();};
  }
  function watchRestrictedMap(id,selectedMapId,onUpdate,onError){
    return watchRestrictedStageDocument(id,'battleMapsPublic',selectedMapId,
      raw=>{
        const safe=mapForViewer({
          ...raw,id:selectedMapId,
          storagePath:battleMapAssetPath(id,selectedMapId,raw.contentType)
        },id,'player');
        if(!safe)throw Error('The presented map is no longer available.');
        onUpdate(safe);
      },onError);
  }
  function watchRestrictedCombat(id,onUpdate,onError){
    return watchRestrictedStageDocument(id,'presentationCombat','current',
      onUpdate,onError);
  }
  async function fetchRestrictedMapMedia(id,map){
    if(!map?.id||!mapId(map.id)||!mapForViewer(map,id,'player'))
      throw Error('Choose an approved published presentation map.');
    const uid=await verified();
    const source=await firestoreSdk.getDocFromServer(publicMapRef(id,map.id));
    same(uid);
    if(!source.exists())throw Error('The published map is no longer available.');
    const path=battleMapAssetPath(id,map.id,source.data().contentType);
    if(map.storagePath!==path)
      throw Error('The presentation map source changed.');
    const blob=await storageSdk.getBlob(storageSdk.ref(storage,path));
    same(uid);
    return blob;
  }

  async function rebuildPresentationProjections(id){
    const {uid}=await check(id,'gm');
    const response=await functionsSdk.httpsCallable(functions,'asteriaAction')({
      action:'rebuildPresentationProjections',
      args:[id,'gm-scope',{}],requestId:crypto.randomUUID()
    });
    same(uid);
    if(response.data?.ok!==true)
      throw Error(response.data?.error||'Safe player display refresh failed.');
    return response.data;
  }

  async function emergencyStopPresentation(id){
    // This command intentionally uses no revision/stream preflight: a broken
    // display subscription must never prevent a GM attempting to stop sharing.
    const uid=await verified();
    const response=await functionsSdk.httpsCallable(functions,'asteriaAction')({
      action:'emergencyStopPresentation',args:[id,'gm-scope',{}],
      requestId:crypto.randomUUID()
    });
    same(uid);
    if(response.data?.ok!==true)
      throw Error(response.data?.error||'Emergency stop was not confirmed.');
    return response.data;
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
    watchParty,watchEncounter,watchGMMediaLibrary,fetchGMMediaLibraryPreview,
    fetchMapMedia,fetchAtlasMedia,uploadMap,
    saveMap,removeMap,savePrivatePins,managePresentation,emergencyStopPresentation,
    manageHybridSession,watchGMHybridSession,watchRestrictedViewer,
    watchPresentationAssets,managePresentationAsset,uploadPresentationAsset,
    fetchPresentationAsset,
    watchRestrictedMap,watchRestrictedCombat,fetchRestrictedMapMedia,rebuildPresentationProjections
  });
}
