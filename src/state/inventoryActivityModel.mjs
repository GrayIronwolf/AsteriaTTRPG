import {eventTime} from './liveEventReducer.mjs';

// Phase 7.1 — read-only, owner-scoped inventory and trade journal.
// All entries come from existing trusted transactions and targeted events.
// No additional collection, client writes, or hidden GM item metadata.
export const INVENTORY_ACTIVITY_CATEGORIES=Object.freeze([
  {id:'all',label:'All activity'},
  {id:'loot',label:'Treasure'},
  {id:'trade',label:'Trading'},
  {id:'shop',label:'Merchants'},
  {id:'stash',label:'Stashes'},
  {id:'currency',label:'Currency'},
  {id:'equipment',label:'Equipment'},
  {id:'inventory',label:'Inventory'}
]);

const GROUPS=Object.freeze({
  loot:Object.freeze(['loot-reward','loot-received','party-loot-claimed','party-loot-vote','party-loot-awarded']),
  trade:Object.freeze([
    'item-received','item-given','item-trade','trade-completed',
    'item-give-requested','item-trade-requested','item-identify-requested',
    'item-give-accepted','item-trade-accepted','item-identify-accepted',
    'item-trade-ready','item-trade-completed','item-trade-declined',
    'item-request-cancelled','merchant-bargain'
  ]),
  shop:Object.freeze(['shop-purchase','shop-sale']),
  stash:Object.freeze([
    'party-stash-deposit','party-stash-withdraw','storage-change',
    'item-stored','item-storage-swapped','storage-renamed'
  ]),
  currency:Object.freeze([
    'currency-reward','gm-currency-reward','party-currency-split','currency-adjusted'
  ]),
  equipment:Object.freeze(['item-equipped','item-unequipped','quick-slot']),
  inventory:Object.freeze([
    'inventory','inventory-update','inventory-adjusted','item-used',
    'custom-item-added','item-stack-split','item-identified','spell-learned'
  ])
});

export const INVENTORY_ACTIVITY_KINDS=new Set(Object.values(GROUPS).flat());
const CATEGORY_BY_KIND=new Map(Object.entries(GROUPS).flatMap(([category,kinds])=>
  kinds.map(type=>[type,category])));

export function inventoryActivityCategory(type=''){
  return CATEGORY_BY_KIND.get(type)||'inventory';
}

export function inventoryActivityLabel(record={}){
  const p=record.payload||{};
  const item=p.item||record.item||{};
  // Never search or display unrevealed trueName, cursed properties, or GM notes.
  const itemName=String(item.identified===false?item.name||'Unidentified item':
    item.name||item.title||'Item');
  const count=Number(item.qty||item.quantity||1);
  if(record.type==='loot-reward')return ('Item reward: '+itemName+' x'+count).slice(0,220);
  if(record.type==='currency-reward')return ('Currency reward: '+Number(p.amount||0)+' '+
    String(p.key||'coins').replaceAll('_',' ')).slice(0,220);
  if(record.type==='gm-currency-reward')return String(record.message||'GM currency reward').slice(0,220);
  return String(record.message||p.message||p.title||
    String(record.type||'Inventory update').replaceAll('-',' ')).slice(0,220);
}

export function inventoryActivityRecords(character={},events=[],limit=8){
  const owner=String(character.ownerUid||''),id=String(character.id||'');
  if(!id)return [];
  const records=new Map();
  for(const event of Array.isArray(events)?events:[]){
    if(!event?.id||!INVENTORY_ACTIVITY_KINDS.has(event.type))continue;
    if(String(event.targetCharacterId||'')!==id)continue;
    if(owner&&event.targetOwnerUid&&String(event.targetOwnerUid)!==owner)continue;
    // Server event mirrors carry the originating action ID. Use it as a stable
    // journal key so late local snapshots do not appear as a second transaction.
    const activityId=typeof event.payload?.activityId==='string'&&event.payload.activityId.trim()
      ?event.payload.activityId.trim():null;
    const key=activityId?'activity:'+activityId:'event:'+String(event.id);
    const row={
      id:key,type:event.type,title:inventoryActivityLabel(event),
      category:inventoryActivityCategory(event.type),
      at:eventTime(event),pending:event.status==='pending',source:'event'
    };
    const prior=records.get(key);
    if(!prior||row.at>prior.at)records.set(key,row);
  }
  for(const row of Array.isArray(character.actionLog)?character.actionLog:[]){
    if(!row?.id||!INVENTORY_ACTIVITY_KINDS.has(row.type))continue;
    const at=Date.parse(row.at||row.createdAt||'');
    const key='activity:'+String(row.id);
    const record={
      id:key,type:row.type,title:inventoryActivityLabel(row),
      category:inventoryActivityCategory(row.type),
      at:Number.isFinite(at)?at:0,pending:false,source:'activity'
    };
    const existing=records.get(key);
    // Local and server records describe the same already-committed transaction;
    // preserve its server timestamp when the local action timestamp is missing.
    records.set(key,{...record,at:record.at||existing?.at||0});
  }
  return [...records.values()]
    .sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id))
    .slice(0,Math.max(0,Math.min(100,Number.isFinite(Number(limit))?Number(limit):0)));
}

export function filterInventoryActivityRecords(records=[],{category='all',query=''}={}){
  const search=String(query||'').trim().toLocaleLowerCase();
  const categories=new Set(INVENTORY_ACTIVITY_CATEGORIES.map(row=>row.id));
  if(!categories.has(category))return [];
  return (Array.isArray(records)?records:[]).filter(row=>
    (category==='all'||row.category===category)&&
    (!search||String(row.title||'').toLocaleLowerCase().includes(search)));
}

// The first snapshot is history, not a new alert. Only show unseen IDs
// after hydration, and never repeat them on Firestore replay.
export function inventoryActivityDelta(previousIds,current=[]){
  const ids=new Set(current.map(row=>row.id));
  if(previousIds===null)return {ids,added:[]};
  return {ids,added:current.filter(row=>!previousIds.has(row.id))};
}
