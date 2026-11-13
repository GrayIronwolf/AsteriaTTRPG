import {randomInt} from 'node:crypto';
import {validateLootTable,rollLootTable} from '../src/state/lootTableModel.mjs';
import {lootTableDropFromRoll} from '../src/state/lootTableDropModel.mjs';
import {prepareLootBatch} from '../src/state/lootBatchModel.mjs';

const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);

export function createLootTableCommands(context,{requireCampaignGM}){
  const {db,currentUser,doc,runTransaction,serverTimestamp,requestId}=context;
  return {
    manageLootTable:async(campaignId,_scope,action={})=>{
      try{
        const type=String(action.type||'');
        if(!['save','archive','preview','generate','batch'].includes(type))
          throw Error('Choose save, archive, preview, generate or batch.');
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
          if(['generate','batch'].includes(type)&&action.expectedRevision!==previous.revision)
            throw Error('The loot table changed. Refresh before generating treasure.');
          if(type==='batch'){
            const batchId='loot-batch-'+requestId;
            const batch=prepareLootBatch(previous,action.batch||{},batchId,randomInt);
            // All reads and validation precede all writes. The action receipt
            // makes retries idempotent, and GM review remains the reveal gate.
            const generated=batch.results.filter(row=>row.generated);
            const snapshots=await Promise.all(generated.flatMap(row=>[
              tx.get(doc(db,'campaigns',campaignId,'partyLootDrafts',row.lootId)),
              tx.get(doc(db,'campaigns',campaignId,'partyLoot',row.lootId))
            ]));
            if(snapshots.some(exists))throw Error('This treasure batch was already generated.');
            for(const row of generated){
              const {drop,secretItem}=row.payload;
              tx.set(doc(db,'campaigns',campaignId,'partyLootDrafts',row.lootId),{
                ...drop,visibility:'hidden',createdBy:currentUser.uid,
                createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
                generatedFrom:{tableId,revision:previous.revision,entryId:row.roll.entryId,
                  batchId,rollNumber:row.rollNumber},
                ...(secretItem?{secretItem}:{})
              });
            }
            // The receipt contains only a compact GM summary; no client-supplied
            // item payload can bypass the saved table.
            return {tableId,revision:previous.revision,batchId,
              totalRolls:batch.totalRolls,generatedCount:batch.generatedCount,
              emptyCount:batch.emptyCount,
              results:batch.results.map(({rollNumber,lootId,generated,roll})=>({
                rollNumber,lootId,generated,kind:roll.kind,
                label:roll.kind==='item'?roll.item.name:
                  roll.kind==='currency'?roll.currencyCopper+' copper':'Nothing found'
              }))};
          }
          const roll=rollLootTable(previous,randomInt);
          if(type==='generate'){
            const lootId='party-loot-'+requestId;
            const generated=lootTableDropFromRoll(previous,roll,lootId);
            if(!generated){
              // No item is minted for an empty or zero-copper roll.
              return {tableId,revision:previous.revision,roll,
                generated:false,lootId:null};
            }
            const privateRef=doc(db,'campaigns',campaignId,'partyLootDrafts',lootId);
            const publicRef=doc(db,'campaigns',campaignId,'partyLoot',lootId);
            const [privateSnapshot,publicSnapshot]=await Promise.all([
              tx.get(privateRef),tx.get(publicRef)
            ]);
            if(exists(privateSnapshot)||exists(publicSnapshot))
              throw Error('This treasure roll already has a drop.');
            const base={...generated.drop,visibility:'hidden',
              createdBy:currentUser.uid,createdAt:serverTimestamp(),
              updatedAt:serverTimestamp(),
              generatedFrom:{tableId,revision:previous.revision,entryId:roll.entryId}};
            tx.set(privateRef,{...base,
              ...(generated.secretItem?{secretItem:generated.secretItem}:{})});
            return {tableId,revision:previous.revision,roll,
              generated:true,lootId};
          }
          // Preview remains GM-only, receipt-backed and non-delivering.
          return {tableId,revision:previous.revision,roll,preview:true,
            requestId};
        });
        return {ok:true,...output};
      }catch(error){return {ok:false,error:error?.message||String(error)};}
    }
  };
}
