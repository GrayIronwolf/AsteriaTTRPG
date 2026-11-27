import {
  validateEncounterCompletionAction,hasEncounterBundle
} from '../src/state/encounterCompletionModel.mjs';

const exists=snapshot=>typeof snapshot?.exists==='function'?snapshot.exists():Boolean(snapshot?.exists);

export function createEncounterCompletionCommands(context,{requireCampaignGM}){
  const {db,doc,runTransaction,currentUser,serverTimestamp}=context;
  return {
    manageEncounterCompletion:async(campaignId,_scope,action={})=>{
      try{
        const input=validateEncounterCompletionAction(action);
        const result=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'encounterHistory',input.encounterId);
          const snap=await tx.get(ref);
          if(!exists(snap))throw Error('Completed encounter history was not found.');
          const history=snap.data();
          if(history.revision!==input.expectedRevision)
            throw Error('The encounter review changed. Refresh before continuing.');
          if(history.reopened===true)throw Error('Complete the reopened encounter before reviewing rewards.');
          if(history.status!=='pending-review')
            throw Error('This encounter has already been approved for delivery.');
          if(input.type==='review'){
            const permitted=new Set((history.participants||[])
              .filter(row=>row.kind==='player'&&row.characterId)
              .map(row=>row.characterId));
            if(input.rewards.length!==permitted.size||
              input.rewards.some(row=>!permitted.has(row.characterId)))
              throw Error('Review every linked encounter participant exactly once.');
            tx.update(ref,{
              outcome:input.outcome,notes:input.notes,rewards:input.rewards,
              revision:history.revision+1,updatedBy:currentUser.uid,
              updatedAt:serverTimestamp()
            });
            return {encounterId:history.id,revision:history.revision+1,
              status:'pending-review'};
          }
          const recipients=(history.rewards||[]).filter(row=>
            row.xp>0||hasEncounterBundle(row));
          if(history.outcome==='unresolved')
            throw Error('Choose and save an encounter outcome before approving rewards.');
          tx.update(ref,{
            status:'approved',revision:history.revision+1,
            approvedBy:currentUser.uid,approvedAt:serverTimestamp(),
            updatedBy:currentUser.uid,updatedAt:serverTimestamp()
          });
          return {encounterId:history.id,revision:history.revision+1,
            status:'approved',recipientCount:recipients.length,
            distributed:false};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
