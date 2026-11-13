// Phase 12.2 — pure, read-only selectors for responsive inventory and merchant views.
// Keep live item identifiers and original merchant stock indices unchanged.
const rows=value=>Array.isArray(value)?value:[];
const normalizedQuery=value=>String(value||'').trim().toLowerCase();

export function inventoryStorageSummary(items=[],storages=[]){
  const ids=new Set(rows(storages).map(storage=>storage?.id));
  const countsByStorage=new Map();
  const unassignedItems=[];
  let nonEquippedCount=0,totalWeight=0;
  for(const item of rows(items)){
    if(!item)continue;
    const quantity=Number(item.qty||1),weight=Number(item.weight||0);
    if(Number.isFinite(quantity)&&Number.isFinite(weight))
      totalWeight+=weight*quantity;
    if(item.equipped)continue;
    nonEquippedCount++;
    if(ids.has(item.storageId)){
      countsByStorage.set(item.storageId,(countsByStorage.get(item.storageId)||0)+1);
    }else{
      unassignedItems.push(item);
    }
  }
  return {countsByStorage,unassignedItems,nonEquippedCount,totalWeight};
}

// Searching merchant stock may filter items, but purchase actions must continue
// to receive their indices in the original, authoritative stock array.
export function filterMerchantStockRows(stock=[],search=''){
  const term=normalizedQuery(search);
  const matches=[];
  rows(stock).forEach((row,index)=>{
    const name=String(row?.item?.name||row?.item?.title||'').toLowerCase();
    if(!term||name.includes(term))matches.push({...row,index});
  });
  return matches;
}

export function filterInventoryNames(items=[],search=''){
  const term=normalizedQuery(search);
  if(!term)return rows(items);
  return rows(items).filter(item=>String(item?.name||'').toLowerCase().includes(term));
}

export function pendingActionKeys(requests=[],typeKey='',targetKey='',characterId=''){
  const result=new Set();
  for(const request of rows(requests)){
    if(request?.status!=='pending')continue;
    if(characterId&&request.characterId!==characterId)continue;
    if(typeof request[typeKey]!=='string'||typeof request[targetKey]!=='string')continue;
    result.add(JSON.stringify([request[typeKey],request[targetKey]]));
  }
  return result;
}

export const actionKey=(type,target)=>JSON.stringify([type,target]);
