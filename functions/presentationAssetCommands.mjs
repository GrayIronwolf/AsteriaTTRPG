import {
  PRESENTATION_ASSET_LIMIT,presentationAssetPath,presentationAssetDetails,
  validatePresentationAssetAction
} from '../src/state/presentationAssetModel.mjs';
const exists=record=>typeof record?.exists==='function'?record.exists():Boolean(record?.exists);

/** Reuse the existing campaign action dispatcher and transaction receipts. */
export function createPresentationAssetCommands(context,{requireCampaignGM}){
  const {db,doc,runTransaction,currentUser,serverTimestamp}=context;
  return {
    managePresentationAsset:async(campaignId,_scope,raw={})=>{
      try{
        const type=validatePresentationAssetAction(raw);
        const response=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'presentationAssets',raw.id);
          const countRef=doc(db,'campaigns',campaignId,'presentationAssetConfig','current');
          const sceneRef=doc(db,'campaigns',campaignId,'presentationControl','current');
          const sharedRef=doc(db,'campaigns',campaignId,'presentationShared','current');
          const restrictedRef=doc(db,'campaigns',campaignId,'presentationRestricted','current');
          const accessRef=doc(db,'campaigns',campaignId,'presentationAssetAccess','current');
          const [snap,countSnap,sceneSnap]=await Promise.all([
            tx.get(ref),tx.get(countRef),tx.get(sceneRef)
          ]);
          const record=exists(snap)?snap.data():null;
          if(type==='reserve'){
            if(record)throw Error('The presentation media ID is already in use.');
            const used=Number(countSnap?.data?.()?.count||0);
            if(used>=PRESENTATION_ASSET_LIMIT)
              throw Error('The presentation media library is full.');
            const details=presentationAssetDetails(raw.details);
            tx.set(ref,{id:raw.id,...details,
              storagePath:presentationAssetPath(campaignId,raw.id),
              status:'uploading',visibility:'gm',revision:1,
              createdBy:currentUser.uid,createdAt:serverTimestamp(),
              updatedAt:serverTimestamp()});
            tx.set(countRef,{count:used+1,updatedAt:serverTimestamp()},{merge:true});
            return {id:raw.id,revision:1,status:'uploading'};
          }
          if(!record||record.status==='archived')
            throw Error('Presentation media is no longer available.');
          if(record.revision!==raw.expectedRevision)
            throw Error('Presentation media changed. Refresh before continuing.');
          if(type==='finish'){
            if(record.status!=='uploading')throw Error('Upload is not pending.');
            tx.update(ref,{status:'ready',revision:record.revision+1,
              updatedAt:serverTimestamp()});
            return {id:raw.id,revision:record.revision+1,status:'ready'};
          }
          if(record.status!=='ready'&&type!=='archive')
            throw Error('The presentation file must finish uploading first.');
          if(type==='publish'){
            if(record.visibility==='players')
              throw Error('Presentation media is already published.');
            tx.update(ref,{visibility:'players',revision:record.revision+1,
              updatedAt:serverTimestamp()});
            return {id:raw.id,revision:record.revision+1,status:'published'};
          }
          if(type==='unpublish'||type==='archive'){
            const scene=exists(sceneSnap)?sceneSnap.data():null;
            const onStage=scene?.assetId===raw.id&&
              ['image','cinematic','handout'].includes(scene.scene);
            // Read all participating state before writing. A now-unpublished
            // item cannot remain selected on any viewer's screen.
            const sessionRef=doc(db,'campaigns',campaignId,'hybridSessionControl','current');
            const hybrid=onStage?await tx.get(sessionRef):null;
            if(type==='unpublish'&&record.visibility!=='players')
              throw Error('Presentation media is already private.');
            tx.update(ref,{visibility:'gm',
              status:type==='archive'?'archived':'ready',
              revision:record.revision+1,updatedAt:serverTimestamp()});
            if(type==='archive'){
              const used=Number(countSnap?.data?.()?.count||0);
              tx.set(countRef,{count:Math.max(0,used-1),
                updatedAt:serverTimestamp()},{merge:true});
            }
            if(onStage){
              const revision=Number(scene.revision||0)+1;
              const blank={version:1,revision,scene:'blank',title:'',
                subtitle:'',mapId:'',characterIds:[],showRound:false,
                showPartyHP:false,theme:scene.theme||'obsidian'};
              tx.set(sceneRef,{...blank,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
              tx.set(sharedRef,{...blank,updatedAt:serverTimestamp()});
              tx.set(restrictedRef,{version:1,revision,scene:'blank',title:'',
                subtitle:'',theme:blank.theme,
                epoch:exists(hybrid)?hybrid.data().epoch:'',
                updatedAt:serverTimestamp()});
              tx.set(accessRef,{assetId:'',scene:'blank',epoch:'',
                viewerExpiries:{},expiresAt:new Date(0),
                updatedAt:serverTimestamp()});
            }
            return {id:raw.id,revision:record.revision+1,
              status:type==='archive'?'archived':'private',blackedOut:onStage};
          }
          throw Error('Unsupported presentation asset action.');
        });
        return {ok:true,...response};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
