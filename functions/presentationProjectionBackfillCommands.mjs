import {
  synchronizeCombatPresentation,synchronizeBattleMapPresentation
} from './livePresentationProjectionTriggers.mjs';

/**
 * Explicit migration bootstrap for campaigns whose existing encounter/maps
 * predate server-side projection triggers. This callable never opens access.
 * GM permission is verified using the established canonical action handler.
 */
export function createPresentationProjectionBackfillCommands(context,{requireCampaignGM}){
  const {db,runTransaction}=context;
  return {
    rebuildPresentationProjections:async(campaignId,_scope,action={})=>{
      try{
        if(Object.keys(action).length||!campaignId)
          throw Error('Unsupported projection refresh request.');
        await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
        });
        const maps=await db.collection('campaigns/'+campaignId+'/battleMaps').limit(40).get();
        await synchronizeCombatPresentation(db,campaignId);
        let count=0;
        for(const snapshot of maps.docs){
          await synchronizeBattleMapPresentation(db,campaignId,snapshot.id);
          count++;
        }
        return {ok:true,mapsChecked:count,combatRefreshed:true};
      }catch(error){
        return {ok:false,error:error?.message||'The safe display could not be refreshed.'};
      }
    }
  };
}
