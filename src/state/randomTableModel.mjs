// Digital GM Toolkit 7.2: campaign-private reusable weighted random tables.
// These tables are descriptive GM prompts only. They cannot create NPCs,
// combat encounters, items, money, quests or other gameplay state.
export const RANDOM_TABLE_CATEGORIES=Object.freeze([
  {id:'encounter',label:'Random encounters'},
  {id:'npc',label:'NPCs & characters'},
  {id:'event',label:'Events & complications'},
  {id:'travel',label:'Travel discoveries'},
  {id:'custom',label:'Custom generators'}
]);
export const MAX_RANDOM_TABLE_ENTRIES=40;
export const MAX_RANDOM_TABLE_WEIGHT=10000;
export const MAX_RANDOM_TABLE_ROLLS=10;
export const MAX_RANDOM_TABLE_LOOT_LINKS=12;
export const MAX_RANDOM_TABLE_HISTORY=80;

const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const whole=(value,min,max,label)=>{
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw Error(label+' must be a whole number between '+min+' and '+max+'.');
  return value;
};
const text=(value,max,label,optional=false)=>{
  if(typeof value!=='string'||value.trim().length>max||(!optional&&!value.trim()))
    throw Error('Enter valid '+label+' (up to '+max+' characters).');
  return value.trim();
};
function knownKeys(source,keys,label){
  if(!object(source)||Object.keys(source).some(k=>!keys.includes(k)))
    throw Error('Invalid '+label+' fields.');
}
export function validateRandomTable(data,tableId,previous=null){
  if(!validId(tableId))throw Error('Choose a valid random table identifier.');
  knownKeys(data,['name','description','location','threatTier','category','entries'],'random table');
  const category=RANDOM_TABLE_CATEGORIES.find(item=>item.id===data.category)?.id;
  if(!category)throw Error('Choose a valid random table category.');
  if(!Array.isArray(data.entries)||data.entries.length<1||
     data.entries.length>MAX_RANDOM_TABLE_ENTRIES)
    throw Error('A random table requires 1–40 weighted entries.');
  const seen=new Set(),lootLinks=new Set();
  const entries=data.entries.map((entry,index)=>{
    knownKeys(entry,['id','kind','label','description','weight','note','lootTableId'],
      'random entry '+(index+1));
    if(!validId(entry.id)||seen.has(entry.id))
      throw Error('Each entry requires a unique identifier.');
    seen.add(entry.id);
    if(!['text','loot-link'].includes(entry.kind))
      throw Error('Each entry must be a narrative or an existing loot-table reference.');
    const clean={id:entry.id,kind:entry.kind,weight:whole(entry.weight,1,1000,'Entry weight'),
      label:text(entry.label,160,'result label'),
      description:text(entry.description??'',650,'result description',true),
      note:text(entry.note??'',500,'GM note',true)};
    if(entry.kind==='loot-link'){
      if(!validId(entry.lootTableId))throw Error('Choose an existing loot table.');
      clean.lootTableId=entry.lootTableId;
      lootLinks.add(entry.lootTableId);
    }else if(entry.lootTableId)throw Error('Narrative entries cannot reference loot tables.');
    return clean;
  });
  if(lootLinks.size>MAX_RANDOM_TABLE_LOOT_LINKS)
    throw Error('A table may reference at most 12 distinct loot tables.');
  const totalWeight=entries.reduce((sum,entry)=>sum+entry.weight,0);
  if(totalWeight>MAX_RANDOM_TABLE_WEIGHT)
    throw Error('Total entry weight must not exceed 10,000.');
  if(previous && previous.status==='archived')
    throw Error('Archived tables cannot be changed. Make a new table instead.');
  if(previous && (!Number.isSafeInteger(previous.revision)||previous.revision<1))
    throw Error('Saved random table revision is invalid.');
  return {
    id:tableId,
    name:text(data.name,100,'table name'),
    category,
    description:text(data.description??'',800,'table description',true),
    location:text(data.location??'',120,'location',true),
    threatTier:whole(data.threatTier,1,20,'Threat Tier'),
    status:'active',
    entries,totalWeight,
    revision:(previous?.revision||0)+1
  };
}
export function randomLootLinks(table){
  return Array.from(new Set(table.entries.filter(entry=>entry.kind==='loot-link')
    .map(entry=>entry.lootTableId)));
}
export function rollRandomTable(table,rng){
  if(!object(table)||table.status!=='active'||
    !Array.isArray(table.entries)||table.entries.length<1||
    table.entries.length>MAX_RANDOM_TABLE_ENTRIES)
    throw Error('An active random table is required.');
  const total=table.entries.reduce((sum,entry)=>{
    if(!Number.isSafeInteger(entry.weight)||entry.weight<1||entry.weight>1000)
      throw Error('Invalid random table weights.');
    return sum+entry.weight;
  },0);
  if(total<1||total>MAX_RANDOM_TABLE_WEIGHT||total!==table.totalWeight)
    throw Error('The table weights changed. Refresh the table.');
  if(typeof rng!=='function')throw Error('A secure random source is required.');
  const index=rng(total);
  if(!Number.isSafeInteger(index)||index<0||index>=total)
    throw Error('The dice source returned an invalid result.');
  let remaining=index,selected=null;
  for(const entry of table.entries){
    if(remaining<entry.weight){selected=entry;break;}
    remaining-=entry.weight;
  }
  if(!selected)throw Error('The weighted roll could not be resolved.');
  return {
    tableId:table.id,tableName:table.name,
    category:table.category,revision:table.revision,
    entryId:selected.id,kind:selected.kind,label:selected.label,
    description:selected.description,note:selected.note,
    ...(selected.kind==='loot-link'?{lootTableId:selected.lootTableId}:{}),
    weight:selected.weight,totalWeight:total,
    draw:index+1,chancePercent:Math.round(selected.weight/total*10000)/100
  };
}
export function randomBatchCount(value){
  return whole(value,1,MAX_RANDOM_TABLE_ROLLS,'Number of rolls');
}
export function randomTableStarter(category,idFactory){
  if(!RANDOM_TABLE_CATEGORIES.some(item=>item.id===category)||typeof idFactory!=='function')
    throw Error('Choose a valid template.');
  const options={
    encounter:['A travelling patrol','Wildlife crossing the route','An abandoned camp'],
    npc:['A cautious merchant','A wandering scholar','An injured traveller'],
    event:['A sudden change in weather','A local dispute','A surprising announcement'],
    travel:['Unusual tracks ahead','A hidden path','A weathered landmark'],
    custom:['First possibility','Second possibility','Third possibility']
  }[category];
  return options.map(label=>({id:idFactory(),kind:'text',label,description:'',
    weight:1,note:''}));
}
