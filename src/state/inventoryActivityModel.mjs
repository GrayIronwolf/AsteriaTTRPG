import {eventTime} from './liveEventReducer.mjs';

export const INVENTORY_ACTIVITY_KINDS=new Set([
  'loot-reward','currency-reward','gm-currency-reward','inventory','inventory-update',
  'item-received','item-given','item-trade','trade-completed','shop-purchase',
  'shop-sale','item-used','item-equipped','item-unequipped','storage-change'
]);

export function inventoryActivityLabel(record={}){
  const p=record.payload||{};
  const item=p.item||record.item||{};
  const itemName=String(item.identified===false?item.name||'Unidentified item':
    item.name||item.title||'Item');
  const count=Number(item.qty||item.quantity||1);
  if(record.type==='loot-reward')return 'Item reward: '+itemName+' x'+count;
  if(record.type==='currency-reward')return 'Currency reward: '+Number(p.amount||0)+' '+String(p.key||'coins').replaceAll('_',' ');
  if(record.type==='gm-currency-reward')return String(record.message||'GM currency reward');
  return String(record.message||p.message||p.title||String(record.type||'Inventory update').replaceAll('-',' ')).slice(0,220);
}

export function inventoryActivityRecords(character={},events=[],limit=8){
  const owner=String(character.ownerUid||''),id=String(character.id||'');
  if(!id)return [];
  const records=[];
  for(const event of Array.isArray(events)?events:[]){
    if(!event?.id||!INVENTORY_ACTIVITY_KINDS.has(event.type))continue;
    if(String(event.targetCharacterId||'')!==id)continue;
    if(owner&&event.targetOwnerUid&&String(event.targetOwnerUid)!==owner)continue;
    records.push({
      id:'event:'+String(event.id),type:event.type,title:inventoryActivityLabel(event),
      at:eventTime(event),pending:event.status==='pending',source:'event'
    });
  }
  for(const row of Array.isArray(character.actionLog)?character.actionLog:[]){
    if(!row?.id||!INVENTORY_ACTIVITY_KINDS.has(row.type))continue;
    const at=Date.parse(row.at||row.createdAt||'');
    records.push({
      id:'activity:'+String(row.id),type:row.type,title:inventoryActivityLabel(row),
      at:Number.isFinite(at)?at:0,pending:false,source:'activity'
    });
  }
  return [...new Map(records.map(row=>[row.id,row])).values()]
    .sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id))
    .slice(0,Math.max(0,Math.min(30,Number(limit)||0)));
}

// The initial snapshot is history, not a new alert. Only report unseen
// record IDs after hydration, and never repeat them when Firestore replays.
export function inventoryActivityDelta(previousIds,current=[]){
  const ids=new Set(current.map(row=>row.id));
  if(previousIds===null)return {ids,added:[]};
  return {ids,added:current.filter(row=>!previousIds.has(row.id))};
}
