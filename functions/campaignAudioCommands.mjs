import {
 audioUploadDetails,audioSettings,audioTrackPath,audioPublicTrack,
 validateAudioAction,AUDIO_TRACK_LIMIT
} from '../src/state/campaignAudioModel.mjs';

const exists=snapshot=>typeof snapshot?.exists==='function'?snapshot.exists():Boolean(snapshot?.exists);
const current=snapshot=>exists(snapshot)?(snapshot.data()||{}):{};
const baseLive=snapshot=>({...{version:1,revision:0,ambient:null,effect:null},...current(snapshot)});
const cueOf=(live,trackId)=>live?.ambient?.trackId===trackId||live?.effect?.trackId===trackId;
function removeTrackFromLive(live,trackId){
 return {...live,ambient:live.ambient?.trackId===trackId?null:live.ambient||null,
  effect:live.effect?.trackId===trackId?null:live.effect||null};
}
/** Every action requires campaign GM membership, verified server-side. */
export function createCampaignAudioCommands(context,{requireCampaignGM}){
 const {db,doc,runTransaction,currentUser,serverTimestamp}=context;
 const now=context.now||(()=>Date.now());
 return {manageCampaignAudio:async(campaignId,_scope,action={})=>{
  try{
   const type=validateAudioAction(action);
   const result=await runTransaction(db,async tx=>{
    await requireCampaignGM(tx,campaignId);
    const tracksBase=['campaigns',campaignId,'audioTracks'];
    const sharedBase=['campaigns',campaignId,'audioTracksShared'];
    const liveRef=doc(db,'campaigns',campaignId,'audioLive','current');
    const configRef=doc(db,'campaigns',campaignId,'audioConfig','current');
    if(type==='reserve-track'){
     const ref=doc(db,...tracksBase,action.id);
     const [original,configSnap]=await Promise.all([tx.get(ref),tx.get(configRef)]);
     if(exists(original))throw Error('Audio track ID is already in use.');
     const config=current(configSnap);
     if(Number(config.activeTracks||0)>=AUDIO_TRACK_LIMIT)throw Error('Campaign audio library is full.');
     const details=audioUploadDetails(action.details);
     const track={id:action.id,...details,storagePath:audioTrackPath(campaignId,action.id,details.contentType),
      visibility:'gm',status:'uploading',revision:1,
      createdBy:currentUser.uid,createdAt:serverTimestamp(),
      updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
     tx.set(ref,track);
     tx.set(configRef,{activeTracks:Number(config.activeTracks||0)+1,
      updatedAt:serverTimestamp()},{merge:true});
     return {id:action.id,revision:1,storagePath:track.storagePath};
    }
    if(type.endsWith('-track')){
     const ref=doc(db,...tracksBase,action.id);
     const sharedRef=doc(db,...sharedBase,action.id);
     const snapshot=await tx.get(ref);
     if(!exists(snapshot))throw Error('Audio track was not found.');
     const track=snapshot.data();
     if(track.revision!==action.expectedRevision)throw Error('Audio track changed. Refresh and try again.');
     if(track.status==='archived')throw Error('Archived audio tracks cannot be edited.');
     if(type==='finish-track'){
      if(track.status!=='uploading')throw Error('Track is not awaiting upload.');
      const updated={...track,status:'ready',revision:track.revision+1,
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(ref,updated);
      return {id:action.id,revision:updated.revision};
     }
     if(type==='update-track'){
      if(track.status!=='ready')throw Error('Finish the upload first.');
      const settings=audioSettings(action.settings);
      const updated={...track,...settings,revision:track.revision+1,
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      // Reading live state comes before all writes.
      const liveSnap=track.visibility==='players'?await tx.get(liveRef):null;
      const live=baseLive(liveSnap);
      tx.set(ref,updated);
      if(track.visibility==='players')tx.set(sharedRef,audioPublicTrack(updated));
      if(track.visibility==='players' && (
       (live.ambient?.trackId===track.id&&settings.category==='effect')||
       (live.effect?.trackId===track.id&&settings.category!=='effect')
      )){
       const cleaned=removeTrackFromLive(live,track.id);
       tx.set(liveRef,{...cleaned,revision:live.revision+1,updatedAt:serverTimestamp()});
      }
      return {id:action.id,revision:updated.revision};
     }
     if(type==='publish-track'){
      if(track.status!=='ready'||track.visibility!=='gm')throw Error('Only a ready private track can be published.');
      const updated={...track,visibility:'players',revision:track.revision+1,
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(ref,updated);
      tx.set(sharedRef,audioPublicTrack(updated));
      return {id:action.id,revision:updated.revision,visibility:'players'};
     }
     if(type==='unpublish-track'||type==='archive-track'){
      if(type==='unpublish-track'&&track.visibility!=='players')throw Error('Track is already private.');
      const [liveSnap,configSnap]=await Promise.all([
       tx.get(liveRef),type==='archive-track'?tx.get(configRef):Promise.resolve(null)
      ]);
      const live=baseLive(liveSnap);
      const updated={...track,visibility:'gm',
       status:type==='archive-track'?'archived':track.status,
       revision:track.revision+1,updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(ref,updated);
      tx.delete(sharedRef);
      if(cueOf(live,track.id)){
       const cleaned=removeTrackFromLive(live,track.id);
       tx.set(liveRef,{...cleaned,revision:live.revision+1,updatedAt:serverTimestamp()});
      }
      if(type==='archive-track')tx.set(configRef,{
       activeTracks:Math.max(0,Number(current(configSnap).activeTracks||0)-1),
       updatedAt:serverTimestamp()},{merge:true});
      return {id:action.id,revision:updated.revision,storagePath:track.storagePath};
     }
    }
    // Live cues never accept client-provided titles, paths, timestamps or permissions.
    const liveSnap=await tx.get(liveRef);
    const live=baseLive(liveSnap);
    if(live.revision!==action.expectedLiveRevision)
     throw Error('Live audio changed. Refresh and try again.');
    let next={...live};
    const timestamp=now();
    if(type==='play-ambient'||type==='play-effect'){
     const trackRef=doc(db,...tracksBase,action.trackId);
     const snapshot=await tx.get(trackRef);
     if(!exists(snapshot))throw Error('Sound was not found.');
     const track=snapshot.data();
     if(track.status!=='ready'||track.visibility!=='players')throw Error('Publish this sound before broadcasting.');
     if(type==='play-ambient'){
      if(track.category==='effect')throw Error('Sound effects cannot be used as ambient tracks.');
      next.ambient={trackId:track.id,status:'playing',startedAt:timestamp,
       positionMs:0,volume:track.volume,loop:track.loop};
     }else{
      if(track.category!=='effect')throw Error('Only sound effects can use the effect cue.');
      next.effect={trackId:track.id,cueId:String(live.revision+1),
       issuedAt:timestamp,volume:track.volume};
     }
    }else if(type==='pause-ambient'){
     if(!live.ambient||live.ambient.status!=='playing')throw Error('Ambient audio is not playing.');
     const elapsed=Math.max(0,timestamp-Number(live.ambient.startedAt||timestamp));
     next.ambient={...live.ambient,status:'paused',positionMs:Math.min(86400000,
      Number(live.ambient.positionMs||0)+elapsed)};
    }else if(type==='resume-ambient'){
     if(!live.ambient||live.ambient.status!=='paused')throw Error('Ambient audio is not paused.');
     // A withdrawn track cannot resume.
     const trackSnap=await tx.get(doc(db,...tracksBase,live.ambient.trackId));
     if(!exists(trackSnap)||trackSnap.data().visibility!=='players'||trackSnap.data().status!=='ready')
      throw Error('The ambient track is no longer shared.');
     next.ambient={...live.ambient,status:'playing',startedAt:timestamp};
    }else if(type==='stop-ambient'){
     next.ambient=null;
    }else if(type==='stop-effect'){
     next.effect=null;
    }else throw Error('Unsupported sound cue.');
    tx.set(liveRef,{...next,revision:live.revision+1,updatedAt:serverTimestamp()});
    return {revision:live.revision+1};
   });
   return {ok:true,...result};
  }catch(error){return {ok:false,error:error?.message||String(error)};}
 }};
}
