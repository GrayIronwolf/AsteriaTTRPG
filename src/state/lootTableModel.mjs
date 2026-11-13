// Phase 6.1: GM-only reusable weighted loot tables and read-only roll previews.
// This model never grants inventory items, currency or party loot.
export const MAX_LOOT_TABLE_ENTRIES=40;
export const MAX_LOOT_TABLE_WEIGHT=10000;
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const bounded=(value,max,label,{optional=false}={})=>{
  if(value===undefined||value===null) {
    if(optional)return '';
    throw Error('Enter '+label+'.');
  }
  if(typeof value!=='string')throw Error('Invalid '+label+'.');
  const text=value.trim();
  if((!text&&!optional)||text.length>max)throw Error('Invalid '+label+' length.');
  return text;
};
const whole=(value,min,max,label)=>{
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw Error(label+' must be a whole number from '+min+' to '+max+'.');
  return value;
};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const maxCurrency=1000000000;

export function validateLootTable(input={},tableId='',previous={}){
  if(!object(input)||!object(previous)||!validId(tableId))
    throw Error('Choose a valid loot table.');
  const entries=input.entries;
  if(!Array.isArray(entries)||entries.length<1||entries.length>MAX_LOOT_TABLE_ENTRIES)
    throw Error('A loot table requires 1 to 40 entries.');
  const seen=new Set();
  const clean=entries.map((entry,index)=>{
    if(!object(entry))throw Error('Loot entry '+(index+1)+' is invalid.');
    const id=String(entry.id||'');
    if(!validId(id)||seen.has(id))throw Error('Each loot entry must have a unique identifier.');
    seen.add(id);
    const kind=entry.kind;
    if(!['item','currency','nothing'].includes(kind))
      throw Error('Loot entry type must be item, currency or nothing.');
    const base={
      id,kind,weight:whole(entry.weight,1,1000,'Entry weight'),
      note:bounded(entry.note??'',500,'entry note',{optional:true})
    };
    if(kind==='nothing')return base;
    if(kind==='item'){
      const name=bounded(entry.name,160,'item name');
      const definitionId=bounded(entry.definitionId??'',160,'item ID',{optional:true});
      if(definitionId&&!/^[A-Za-z0-9:._-]{1,160}$/.test(definitionId))
        throw Error('Invalid item definition ID.');
      const minimum=whole(entry.minQuantity,1,1000000,'Minimum quantity');
      const maximum=whole(entry.maxQuantity,minimum,1000000,'Maximum quantity');
      return {...base,name,definitionId,minQuantity:minimum,maxQuantity:maximum};
    }
    const minimum=whole(entry.minCopper,0,maxCurrency,'Minimum copper');
    const maximum=whole(entry.maxCopper,minimum,maxCurrency,'Maximum copper');
    return {...base,minCopper:minimum,maxCopper:maximum};
  });
  const weight=clean.reduce((sum,entry)=>sum+entry.weight,0);
  if(weight>MAX_LOOT_TABLE_WEIGHT)throw Error('Total loot-table weight must not exceed 10,000.');
  return {
    id:tableId,name:bounded(input.name,100,'table name'),
    description:bounded(input.description??'',800,'description',{optional:true}),
    location:bounded(input.location??'',120,'location',{optional:true}),
    threatTier:whole(input.threatTier??1,1,20,'Threat tier'),
    status:input.status==='archived'?'archived':'active',
    entries:clean,totalWeight:weight,
    revision:Number(previous.revision||0)+1
  };
}

export function rollLootTable(table={},rng){
  if(!object(table)||table.status!=='active'||!Array.isArray(table.entries))
    throw Error('Only an active loot table can be rolled.');
  const total=table.entries.reduce((sum,row)=>sum+row.weight,0);
  if(!Number.isSafeInteger(total)||total<=0||total>MAX_LOOT_TABLE_WEIGHT)
    throw Error('Loot-table weights are invalid.');
  if(typeof rng!=='function')throw Error('Secure random generator is required.');
  const take=limit=>{
    const draw=rng(limit);
    if(!Number.isSafeInteger(draw)||draw<0||draw>=limit)
      throw Error('Loot roll could not be completed.');
    return draw;
  };
  let draw=take(total);
  let selected=null;
  for(const row of table.entries){
    if(draw<row.weight){selected=row;break;}
    draw-=row.weight;
  }
  if(!selected)throw Error('No loot entry matched the roll.');
  const base={tableId:table.id,entryId:selected.id,kind:selected.kind,
    note:selected.note||'',weight:selected.weight,totalWeight:total};
  if(selected.kind==='nothing')return {...base,label:'Nothing found'};
  if(selected.kind==='currency'){
    const range=selected.maxCopper-selected.minCopper+1;
    return {...base,currencyCopper:selected.minCopper+take(range)};
  }
  const range=selected.maxQuantity-selected.minQuantity+1;
  return {...base,item:{name:selected.name,definitionId:selected.definitionId,
    quantity:selected.minQuantity+take(range)}};
}
