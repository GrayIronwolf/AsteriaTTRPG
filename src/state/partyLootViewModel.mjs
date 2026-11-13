// Phase 8.3: read-only search and queue selectors for existing party stash/loot data.
// Player projections intentionally omit private fields and never inspect GM drafts.
import {safePlayerLootItem} from './lootCollectionModel.mjs';
const list=value=>Array.isArray(value)?value:[];
const searchText=value=>String(value??'').trim().toLocaleLowerCase();
const contains=(value,query)=>searchText(value).includes(query);
const nameForPlayer=item=>item?.identified===false?
  'Unidentified Item':String(item?.name||item?.title||'Item');
const nameForGM=item=>String(item?.name||item?.title||'Item');

export function playerStashItems(stash={},query=''){
  const term=searchText(query);
  return list(stash?.items).filter(item=>contains(nameForPlayer(item),term))
    .map(item=>({
      id:item?.id,
      name:nameForPlayer(item),
      qty:item?.qty
    }));
}

export function playerAvailableLoot(partyLoot={}, {search='',kind='all'}={}){
  const term=searchText(search);
  return list(partyLoot?.loot)
    .filter(drop=>drop?.visibility==='revealed'&&drop?.status==='available')
    .filter(drop=>kind==='all'||drop?.kind===kind)
    .filter(drop=>[
      drop.title,drop.source,drop.note,
      drop.kind==='item'?nameForPlayer(drop.item):'copper'
    ].some(value=>contains(value,term)))
    .map(drop=>({
      id:drop.id,
      title:drop.title||'Found Treasure',
      source:drop.source||'Campaign',
      note:drop.note||'',
      kind:drop.kind,
      ...(drop.kind==='item'&&drop.distribution?.status==='open'?{distribution:{status:'open',tally:drop.distribution.tally||{}}}:{}),
      ...(drop.kind==='currency'?{currencyCopper:drop.currencyCopper}:{
        item:safePlayerLootItem(drop.item)
      })
    }));
}

// These selectors must only be used beneath the existing GM dashboard access
// gate. Unlike player selectors, private GM drafts may include hidden item data.
export function gmVisibleStashes(partyLoot={}, {search='',status='all'}={}){
  const term=searchText(search);
  return list(partyLoot?.stashes)
    .filter(stash=>status==='all'||stash?.status===status)
    .filter(stash=>[
      stash?.name,
      stash?.kind,
      stash?.description
    ].some(value=>contains(value,term)));
}

export function gmLootReviewRows(partyLoot={}, {search='',kind='all',status='all'}={}){
  const term=searchText(search);
  const matches=drop=>
    (kind==='all'||drop?.kind===kind)&&
    [
      drop?.title,drop?.source,drop?.note,
      drop?.kind==='item'?nameForGM(drop.secretItem||drop.item):'copper'
    ].some(value=>contains(value,term));
  return {
    hidden:list(partyLoot?.drafts)
      .filter(drop=>drop?.visibility==='hidden'&&drop?.status==='available')
      .filter(matches),
    revealed:list(partyLoot?.loot)
      .filter(drop=>drop?.visibility==='revealed')
      .filter(drop=>status==='all'||drop?.status===status)
      .filter(matches)
  };
}


export function playerAwardedLoot(partyLoot={}){
  return list(partyLoot?.loot)
    .filter(drop=>drop?.kind==='item'&&drop.visibility==='revealed'&&
      drop.status==='claimed'&&drop.distribution?.status==='awarded')
    .slice(-20).reverse()
    .map(drop=>({
      id:drop.id,
      title:String(drop.title||'Treasure').slice(0,160),
      itemName:nameForPlayer(drop.item),
      winnerCharacterId:String(drop.claimedByCharacterId||'')
    }));
}
