import {rollLootTable} from './lootTableModel.mjs';
import {lootTableDropFromRoll} from './lootTableDropModel.mjs';

export const MAX_LOOT_BATCH_ROLLS=10;
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);

export function validateLootBatchRequest(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw Error('Choose a valid treasure batch.');
  const count=input.count;
  if(!Number.isSafeInteger(count)||count<1||count>MAX_LOOT_BATCH_ROLLS)
    throw Error('Choose between 1 and 10 whole loot rolls.');
  if(input.source!==undefined&&typeof input.source!=='string')
    throw Error('Enter a valid treasure source.');
  const source=(input.source||'').trim();
  if(source.length>160)throw Error('Treasure source must be at most 160 characters.');
  return {count,source};
}

// All entries are prepared before the server writes anything. Blank rolls do not
// generate documents. Canonical item validation is inherited from Phase 6.2.
export function prepareLootBatch(table,input,batchId,rng){
  const {count,source}=validateLootBatchRequest(input);
  if(!id(batchId))throw Error('Choose a valid treasure batch identifier.');
  const results=[];
  for(let index=0;index<count;index++){
    const roll=rollLootTable(table,rng);
    const rollNumber=index+1;
    const candidateId='party-loot-'+batchId+'-r'+rollNumber;
    if(!id(candidateId))throw Error('Treasure identifier is invalid.');
    const generated=lootTableDropFromRoll(table,roll,candidateId);
    if(generated){
      generated.drop.title=String(table.name||'Treasure').slice(0,130)+' — Roll '+rollNumber;
      if(source)generated.drop.source=source;
    }
    results.push({
      rollNumber,roll,lootId:generated?candidateId:null,
      generated:Boolean(generated),payload:generated
    });
  }
  return {
    batchId,totalRolls:count,generatedCount:results.filter(row=>row.generated).length,
    emptyCount:results.filter(row=>!row.generated).length,
    results
  };
}
