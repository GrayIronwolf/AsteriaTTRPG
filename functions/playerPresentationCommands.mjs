import {
  PRESENTATION_DEFAULT,PRESENTATION_THEMES,publicPresentation,presentationDraft,
  validatePresentationAction
} from '../src/state/playerPresentationModel.mjs';
import {restrictedPresentationProjection,sessionTimestampMs} from '../src/state/hybridPresentationSessionModel.mjs';
import {PRESENTATION_MEDIA_SCENES,publishedPresentationAsset} from '../src/state/presentationAssetModel.mjs';
import {publicCombatPresentation} from '../src/state/livePresentationProjectionModel.mjs';
import {validatePresentationPlaylistAction,applyPresentationPlaylistAction}
  from '../src/state/presentationPlaylistModel.mjs';
const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);

/** All edits are GM-only, server-authorized, revision checked and published as
 * an explicit safe projection. Neither players nor GMs can write from browser. */
export function createPlayerPresentationCommands(context,{requireCampaignGM}){
  const {db,doc,runTransaction,currentUser,serverTimestamp}=context;
  return {
    managePlayerPresentation:async(campaignId,_scope,action={})=>{
      try{
        const type=validatePresentationAction(action);
        const result=await runTransaction(db,async transaction=>{
          await requireCampaignGM(transaction,campaignId);
          const controlRef=doc(db,'campaigns',campaignId,'presentationControl','current');
          const sharedRef=doc(db,'campaigns',campaignId,'presentationShared','current');
          const snapshot=await transaction.get(controlRef);
          const previous=exists(snapshot)?snapshot.data():PRESENTATION_DEFAULT;
          if(Number(previous.revision||0)!==action.expectedRevision)
            throw Error('Presentation changed. Refresh and try again.');
          const draft=type==='blackout'
            ?presentationDraft({
              scene:'blank',title:'',subtitle:'',mapId:'',characterIds:[],
              showRound:false,showPartyHP:false,theme:previous.theme||'obsidian'
            })
            :presentationDraft(action.draft);
          if(draft.scene==='battle-map'){
            const map=await transaction.get(doc(db,'campaigns',campaignId,'battleMaps',draft.mapId));
            if(!exists(map)||map.data().visibility!=='players')
              throw Error('Select a battle map published to players.');
          }
          if(draft.scene==='world-map'){
            const map=await transaction.get(doc(db,'campaigns',campaignId,'worldAtlasShared',draft.mapId));
            if(!exists(map)||map.data().status!=='published'||map.data().visibility!=='players')
              throw Error('Select a published world atlas map.');
          }
          if(draft.scene==='party'){
            const records=await Promise.all(draft.characterIds.map(id=>
              transaction.get(doc(db,'campaigns',campaignId,'characters',id))));
            if(records.some((record,i)=>!exists(record)||
              (record.data().id&&record.data().id!==draft.characterIds[i])))
              throw Error('A selected campaign character is no longer available.');
          }
          if(PRESENTATION_MEDIA_SCENES.includes(draft.scene)){
            const media=await transaction.get(doc(db,'campaigns',campaignId,
              'presentationAssets',draft.assetId));
            if(!exists(media)||!publishedPresentationAsset(media.data(),draft.scene))
              throw Error('The selected media is not ready and published.');
          }
          const combatSnap=draft.scene==='combat'?
            await transaction.get(doc(db,'campaigns',campaignId,'systems','encounter')):null;
          const hybridRef=doc(db,'campaigns',campaignId,'hybridSessionControl','current');
          const hybridSnap=await transaction.get(hybridRef);
          const hybrid=exists(hybridSnap)?hybridSnap.data():null;
          const accessRef=doc(db,'campaigns',campaignId,'presentationAssetAccess','current');
          const accessSnap=await transaction.get(accessRef);
          const existingAccess=exists(accessSnap)?accessSnap.data():{};
          const revision=action.expectedRevision+1;
          const safe=publicPresentation(draft,revision);
          transaction.set(controlRef,{...safe,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
          transaction.set(sharedRef,{...safe,updatedAt:serverTimestamp()});
          // Restricted screens receive only allowlisted presentation text. Never
          // copy map IDs, combat/party snapshots, notes or Storage references.
          if(hybrid?.status==='open'&&sessionTimestampMs(hybrid.expiresAt)>Date.now()){
            transaction.set(doc(db,'campaigns',campaignId,'presentationRestricted','current'),{
              ...restrictedPresentationProjection(safe,revision),
              epoch:hybrid.epoch,updatedAt:serverTimestamp()
            });
            if(safe.scene==='combat'){
              transaction.set(doc(db,'campaigns',campaignId,'presentationCombat','current'),{
                ...publicCombatPresentation(exists(combatSnap)?combatSnap.data():{}),
                epoch:hybrid.epoch,visible:true,
                updatedAt:serverTimestamp()
              });
            }
            transaction.set(accessRef,{
              epoch:hybrid.epoch,
              assetId:PRESENTATION_MEDIA_SCENES.includes(safe.scene)?safe.assetId:'',
              mapId:safe.scene==='battle-map'?safe.mapId:'',
              scene:PRESENTATION_MEDIA_SCENES.includes(safe.scene)||safe.scene==='battle-map'?
                safe.scene:'blank',
              expiresAt:hybrid.expiresAt,
              viewerExpiries:existingAccess.epoch===hybrid.epoch?
                {...existingAccess.viewerExpiries}:{},
              updatedAt:serverTimestamp()
            });
          }
          return {revision,scene:safe.scene};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error?.message||String(error)};}

    },
    /**
     * Improvement 1: a single, idempotent, GM-authorised safety action.
     * Unlike ordinary scene edits it cannot fail from a stale client revision
     * or an unavailable hybrid-viewer subscription. Closing the session,
     * revoking every staged media byte grant, and blanking both projections
     * are one Firestore transaction (never separate partial requests).
     */
    /** Saved playlists are GM-only and cannot publish player content. */
    managePresentationPlaylist:async(campaignId,_scope,action={})=>{
      try{
        const validated=validatePresentationPlaylistAction(action);
        const result=await runTransaction(db,async transaction=>{
          await requireCampaignGM(transaction,campaignId);
          const ref=doc(db,'campaigns',campaignId,'presentationPlaylists','current');
          const snapshot=await transaction.get(ref);
          const current=exists(snapshot)?snapshot.data():null;
          const next=applyPresentationPlaylistAction(current,validated);
          transaction.set(ref,{...next,updatedBy:currentUser.uid,
            updatedAt:serverTimestamp()});
          return {revision:next.revision,playlistCount:next.playlists.length};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    },
    emergencyStopPresentation:async(campaignId,_scope)=>{
      try{
        const result=await runTransaction(db,async transaction=>{
          await requireCampaignGM(transaction,campaignId);
          const controlRef=doc(db,'campaigns',campaignId,'presentationControl','current');
          const sharedRef=doc(db,'campaigns',campaignId,'presentationShared','current');
          const restrictedRef=doc(db,'campaigns',campaignId,'presentationRestricted','current');
          const combatRef=doc(db,'campaigns',campaignId,'presentationCombat','current');
          const sessionRef=doc(db,'campaigns',campaignId,'hybridSessionControl','current');
          const accessRef=doc(db,'campaigns',campaignId,'presentationAssetAccess','current');
          const [controlSnap,sessionSnap]=await Promise.all([
            transaction.get(controlRef),transaction.get(sessionRef)
          ]);
          const previous=exists(controlSnap)?controlSnap.data():PRESENTATION_DEFAULT;
          const session=exists(sessionSnap)?sessionSnap.data():{};
          const revision=Math.max(0,Number(previous.revision)||0)+1;
          const sessionRevision=Math.max(0,Number(session.revision)||0)+1;
          const theme=PRESENTATION_THEMES.includes(previous.theme)?previous.theme:'obsidian';
          const safe=publicPresentation(presentationDraft({
            scene:'blank',title:'',subtitle:'',mapId:'',characterIds:[],
            showRound:false,showPartyHP:false,theme
          }),revision);
          // No raw combat, fog or media source references survive this commit.
          transaction.set(controlRef,{...safe,updatedBy:currentUser.uid,
            updatedAt:serverTimestamp(),emergencyStoppedAt:serverTimestamp()});
          transaction.set(sharedRef,{...safe,updatedAt:serverTimestamp()});
          transaction.set(restrictedRef,{
            ...restrictedPresentationProjection({},0),epoch:'',
            updatedAt:serverTimestamp()
          });
          transaction.set(combatRef,{
            active:false,round:0,current:'Combat not active',epoch:'',
            visible:false,updatedAt:serverTimestamp()
          });
          transaction.set(accessRef,{
            assetId:'',mapId:'',scene:'blank',epoch:'',
            expiresAt:new Date(0),viewerExpiries:{},updatedAt:serverTimestamp()
          });
          transaction.set(sessionRef,{
            status:'closed',screenShare:null,revision:sessionRevision,epoch:'',
            grantCount:0,expiresAt:new Date(0),
            mode:session.mode||'in-person',
            updatedBy:currentUser.uid,updatedAt:serverTimestamp(),
            emergencyStoppedAt:serverTimestamp()
          },{merge:true});
          return {status:'stopped',revision,sessionRevision};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
