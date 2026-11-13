import {randomInt} from 'node:crypto';
import {validateLootTable,rollLootTable} from '../src/state/lootTableModel.mjs';

const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);

export function createLootTableCommands(context,{requireCampaignGM}){
  const {db,currentUser,doc,runTransaction,serverTimestamp,requestId}=context;
  return {
    manageLootTable:async(campaignId,_scope,action={})=>{
      try{
        const type=String(action.type||'');
        if(!['save','archive','preview'].includes(type))
          throw Error('Choose save, archive or preview.');
        const tableId=String(action.tableId||'');
        if(!validId(tableId))throw Error('Choose a valid loot table identifier.');
        const output=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'lootTables',tableId);
          const snapshot=await tx.get(ref);
          const previous=exists(snapshot)?snapshot.data():null;
          if(type==='save'){
            if(previous){
              if(!Number.isSafeInteger(action.expectedRevision)||
                action.expectedRevision!==previous.revision)
                throw Error('This loot table changed. Refresh it before saving.');
            }else if(action.expectedRevision!==0)
              throw Error('New loot tables require revision zero.');
            const clean=validateLootTable(action.table,tableId,previous||{});
            tx.set(ref,{...clean,createdAt:previous?.createdAt||serverTimestamp(),
              createdBy:previous?.createdBy||currentUser.uid,
              updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
            return {tableId,revision:clean.revision,status:clean.status};
          }
          if(!previous)throw Error('The selected loot table no longer exists.');
          if(type==='archive'){
            if(!Number.isSafeInteger(action.expectedRevision)||
               action.expectedRevision!==previous.revision)
              throw Error('This loot table changed. Refresh it before archiving.');
            if(previous.status==='archived')throw Error('This loot table is already archived.');
            tx.update(ref,{status:'archived',revision:previous.revision+1,
              updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
            return {tableId,revision:previous.revision+1,status:'archived'};
          }
          const roll=rollLootTable(previous,randomInt);
          // A preview is private to the caller's authenticated GM receipt.
          // Never publish the result or deliver a reward to a character.
          return {tableId,revision:previous.revision,roll,preview:true,
            requestId};
        });
        return {ok:true,...output};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
