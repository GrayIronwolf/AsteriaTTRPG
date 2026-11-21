import {
  HYBRID_SESSION_DEFAULT,HYBRID_SESSION_MAX_VIEWERS,
  HYBRID_SESSION_MAX_MINUTES,validateHybridSessionAction,
  sessionTimestampMs,restrictedPresentationProjection
} from '../src/state/hybridPresentationSessionModel.mjs';
const exists=value=>typeof value?.exists==='function'?value.exists():Boolean(value?.exists);

export function createHybridPresentationSessionCommands(context,{requireCampaignGM}){
  const {db,doc,runTransaction,currentUser,serverTimestamp,requestId}=context;
  return {
    manageHybridPresentationSession:async(campaignId,_scope,input={})=>{
      try{
        const action=validateHybridSessionAction(input);
        const result=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const sessionRef=doc(db,'campaigns',campaignId,'hybridSessionControl','current');
          const safeRef=doc(db,'campaigns',campaignId,'presentationRestricted','current');
          const current=await tx.get(sessionRef);
          const session=exists(current)?current.data():HYBRID_SESSION_DEFAULT;
          if(Number(session.revision||0)!==action.expectedRevision)
            throw Error('Viewer session changed. Refresh before continuing.');
          const now=Date.now(),revision=action.expectedRevision+1;
          if(action.type==='open'){
            if(session.status==='open'&&sessionTimestampMs(session.expiresAt)>now)
              throw Error('Close the current viewer session before opening another.');
            const epoch='hybrid-'+requestId;
            const next={revision,status:'open',mode:action.mode,epoch,
              grantCount:0,startedAt:new Date(now),
              expiresAt:new Date(now+action.durationMinutes*60*1000),
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
            tx.set(sessionRef,next);
            tx.set(safeRef,{...restrictedPresentationProjection({},0),
              epoch,updatedAt:serverTimestamp()});
            return {status:'open',revision,expiresAt:now+action.durationMinutes*60*1000};
          }
          if(action.type==='close'){
            if(session.status!=='open')throw Error('The viewer session is not open.');
            tx.update(sessionRef,{status:'closed',revision,
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
            tx.set(safeRef,{...restrictedPresentationProjection({},0),
              epoch:session.epoch,updatedAt:serverTimestamp()});
            return {status:'closed',revision};
          }
          if(session.status!=='open'||sessionTimestampMs(session.expiresAt)<=now)
            throw Error('Open an active viewer session before managing access.');
          const grantRef=doc(db,'campaigns',campaignId,'hybridViewerGrants',action.uid);
          const grantSnap=await tx.get(grantRef);
          const old=exists(grantSnap)?grantSnap.data():null;
          if(action.type==='grant'){
            const isNew=old?.epoch!==session.epoch;
            if(isNew&&Number(session.grantCount||0)>=HYBRID_SESSION_MAX_VIEWERS)
              throw Error('The viewer limit has been reached.');
            const until=Math.min(sessionTimestampMs(session.expiresAt),
              now+action.durationMinutes*60*1000);
            const grant={uid:action.uid,epoch:session.epoch,
              status:'active',expiresAt:new Date(until),
              grantedBy:currentUser.uid,grantedAt:serverTimestamp(),
              revision:Number(old?.revision||0)+1};
            tx.set(grantRef,grant);
            tx.update(sessionRef,{revision,grantCount:Number(session.grantCount||0)+(isNew?1:0),
              updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
            return {status:'granted',uid:action.uid,revision,expiresAt:until};
          }
          if(!old||old.epoch!==session.epoch||old.status!=='active')
            throw Error('This viewer has no active access to revoke.');
          tx.update(grantRef,{status:'revoked',
            revokedBy:currentUser.uid,revokedAt:serverTimestamp(),
            revision:Number(old.revision||0)+1});
          tx.update(sessionRef,{revision,
            updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
          return {status:'revoked',uid:action.uid,revision};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
