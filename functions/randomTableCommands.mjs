import {randomInt} from 'node:crypto';
import {
  validateRandomTable,randomLootLinks,rollRandomTable,randomBatchCount
} from '../src/state/randomTableModel.mjs';

const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);

/** GM-authorized command running inside the existing audited asteriaAction
 * transaction and idempotent action-receipt system. All rolled data is from
 * persisted validated tables, never from user-supplied entries or results.
 */
export function createRandomTableCommands(context,{requireCampaignGM}){
  const {db,currentUser,doc,runTransaction,serverTimestamp,requestId}=context;
  return {
    manageRandomTable:async(campaignId,_scope,action={})=>{
      try{
        if(!action||typeof action!=='object'||Array.isArray(action)||
          Object.keys(action).some(key=>![
            'type','tableId','expectedRevision','table','count'
          ].includes(key)))throw Error('Invalid random table action.');
        const type=action.type;
        if(!['save','archive','roll','batch'].includes(type))
          throw Error('Choose save, archive, roll or batch.');
        const tableId=action.tableId;
        if(!validId(tableId))throw Error('Choose a valid random table.');
        const permitted={
          save:['type','tableId','expectedRevision','table'],
          archive:['type','tableId','expectedRevision'],
          roll:['type','tableId','expectedRevision'],
          batch:['type','tableId','expectedRevision','count']
        }[type];
        if(Object.keys(action).some(key=>!permitted.includes(key)))
          throw Error('Invalid fields for random table action.');
        if(!Number.isSafeInteger(action.expectedRevision)||action.expectedRevision<0)
          throw Error('Choose a valid table revision.');
        if(type==='batch')randomBatchCount(action.count);
        const output=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'randomTables',tableId);
          const snapshot=await tx.get(ref);
          const previous=exists(snapshot)?snapshot.data():null;
          if(type==='save'){
            if(previous?.revision!==action.expectedRevision&&previous||
              !previous&&action.expectedRevision!==0)
              throw Error('The random table changed. Refresh it before saving.');
            const clean=validateRandomTable(action.table,tableId,previous);
            // Reference validation is server-side, not a client-side label check.
            const links=randomLootLinks(clean);
            const lootSnaps=await Promise.all(links.map(id=>
              tx.get(doc(db,'campaigns',campaignId,'lootTables',id))));
            for(let i=0;i<links.length;i++)
              if(!exists(lootSnaps[i])||lootSnaps[i].data()?.status!=='active')
                throw Error('Linked loot table '+links[i]+' must be an existing active table.');
            tx.set(ref,{...clean,createdAt:previous?.createdAt||serverTimestamp(),
              createdBy:previous?.createdBy||currentUser.uid,
              updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
            return {tableId,revision:clean.revision,status:clean.status};
          }
          if(!previous)throw Error('The random table does not exist.');
          if(previous.revision!==action.expectedRevision)
            throw Error('The random table changed. Refresh it and try again.');
          if(type==='archive'){
            if(previous.status==='archived')throw Error('This table is already archived.');
            tx.update(ref,{status:'archived',revision:previous.revision+1,
              updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
            return {tableId,revision:previous.revision+1,status:'archived'};
          }
          if(previous.status!=='active')throw Error('Only an active table can be rolled.');
          const count=type==='batch'?action.count:1;
          const results=Array.from({length:count},(_,index)=>({
            rollNumber:index+1,...rollRandomTable(previous,randomInt)
          }));
          const historyId='random-roll-'+requestId;
          const historyRef=doc(db,'campaigns',campaignId,'randomTableRolls',historyId);
          const existing=await tx.get(historyRef);
          if(exists(existing))throw Error('This roll was already recorded.');
          const history={id:historyId,tableId,tableName:previous.name,
            tableRevision:previous.revision,category:previous.category,
            results,rollCount:count,createdAt:serverTimestamp(),createdBy:currentUser.uid};
          tx.set(historyRef,history);
          return {tableId,revision:previous.revision,historyId,results,rollCount:count,
            preview:true,applied:false};
        });
        return {ok:true,...output};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
