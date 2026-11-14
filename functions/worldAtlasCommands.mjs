import {atlasMapSettings,atlasPins,atlasRoutes,atlasImageDimensions,
 atlasImagePath,atlasPublicProjection,validateAtlasAction,ATLAS_MAX_MAPS}
 from '../src/state/worldAtlasModel.mjs';
const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);
export function createWorldAtlasCommands(context,{requireCampaignGM}){
 const {db,doc,runTransaction,currentUser,serverTimestamp}=context;
 return {manageWorldAtlas:async(campaignId,_scope,action={})=>{
  try{
   const type=validateAtlasAction(action);
   const result=await runTransaction(db,async tx=>{
    await requireCampaignGM(tx,campaignId);
    const ref=doc(db,'campaigns',campaignId,'worldAtlas',action.mapId);
    const shared=doc(db,'campaigns',campaignId,'worldAtlasShared',action.mapId);
    if(type==='create'){
     const countRef=doc(db,'campaigns',campaignId,'atlasConfig','current');
     const [old,meta]=await Promise.all([tx.get(ref),tx.get(countRef)]);
     if(exists(old))throw Error('This world map already exists.');
     const count=meta?.data()?.activeMaps||0;
     if(count>=ATLAS_MAX_MAPS)throw Error('Campaign world-map limit reached.');
     const settings=atlasMapSettings(action.settings);
     const dims=atlasImageDimensions(action.width,action.height);
     const map={id:action.mapId,...settings,...dims,visibility:'gm',status:'draft',
      revision:1,pins:[],routes:[],contentType:action.contentType,
      storagePath:atlasImagePath(campaignId,action.mapId,action.contentType),
      createdBy:currentUser.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
     tx.set(ref,map);
     tx.set(countRef,{activeMaps:count+1,updatedAt:serverTimestamp()},{merge:true});
     return {mapId:map.id,revision:1,status:'draft',storagePath:map.storagePath};
    }
    const snapshot=await tx.get(ref);
    if(!exists(snapshot))throw Error('Map not found.');
    const map=snapshot.data();
    if(map.revision!==action.expectedRevision)throw Error('Map changed. Refresh before editing.');
    if(map.status==='archived')throw Error('Archived maps cannot be edited.');
    if(type==='update'){
     const settings=atlasMapSettings(action.settings),pins=atlasPins(action.pins);
     const routes=atlasRoutes(action.routes,pins);
     const updated={...map,...settings,pins,routes,
      visibility:map.status==='published'?'players':'gm',
      revision:map.revision+1,updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
     tx.set(ref,updated);
     if(map.status==='published')
      tx.set(shared,{...atlasPublicProjection(updated),updatedAt:serverTimestamp()});
     return {mapId:map.id,status:updated.status,revision:updated.revision};
    }
    if(type==='publish'){
     if(map.status!=='draft')throw Error('Only drafts can be published.');
     const updated={...map,status:'published',visibility:'players',revision:map.revision+1,
      publishedBy:currentUser.uid,publishedAt:serverTimestamp(),updatedAt:serverTimestamp()};
     tx.set(ref,updated);
     tx.set(shared,{...atlasPublicProjection(updated),updatedAt:serverTimestamp()});
     return {mapId:map.id,status:'published',revision:updated.revision};
    }
    if(type==='unpublish'){
     if(map.status!=='published')throw Error('Only published maps can be withdrawn.');
     tx.set(ref,{...map,status:'draft',visibility:'gm',revision:map.revision+1,
      updatedAt:serverTimestamp()});
     tx.delete(shared);
     return {mapId:map.id,status:'draft',revision:map.revision+1};
    }
    if(type==='archive'){
     const countRef=doc(db,'campaigns',campaignId,'atlasConfig','current');
     const countSnap=await tx.get(countRef);
     tx.update(ref,{status:'archived',visibility:'gm',revision:map.revision+1,
      updatedAt:serverTimestamp()});
     tx.delete(shared);
     tx.set(countRef,{activeMaps:Math.max(0,(countSnap?.data()?.activeMaps||0)-1),
      updatedAt:serverTimestamp()},{merge:true});
     return {mapId:map.id,status:'archived',revision:map.revision+1,storagePath:map.storagePath};
    }
    throw Error('Unsupported world map operation.');
   });
   return {ok:true,...result};
  }catch(error){return {ok:false,error:error?.message||String(error)};}
 }};
}
