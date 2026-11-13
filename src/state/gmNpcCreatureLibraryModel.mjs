/**
 * Digital GM Toolkit Phase 3.1 — NPC & Creature Library.
 * Existing campaign NPCs remain in world.npcs. Custom creatures live in
 * world.creatures on the same private GM workspace document. Official
 * Creature Compendium entries are displayed read-only and never copied.
 */
export const GM_LIBRARY_KINDS=Object.freeze(['npc','creature']);
export const GM_LIBRARY_MAX_RECORDS=150;
const optionalText=Object.freeze({
  description:800,notes:1200,personality:360,goals:360,
  faction:120,location:120,role:120,species:120,threatTier:40
});
const numericFields=Object.freeze(['hp','sp','mp','ac','initiative','xpReward']);
const safeArray=value=>Array.isArray(value)?value:[];
const short=(value,max=120)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function libraryCollectionKey(kind){
  return kind==='npc'?'npcs':kind==='creature'?'creatures':null;
}
export function libraryDraft(kind='npc',entry={}){
  const row=isRecord(entry)?entry:{};
  return {
    kind:libraryCollectionKey(kind)?kind:'npc',
    name:String(row.name??''),
    ...Object.fromEntries(Object.keys(optionalText).map(key=>[key,String(row[key]??'')])),
    ...Object.fromEntries(numericFields.map(key=>[
      key,row[key]===undefined||row[key]===null?'':String(Array.isArray(row[key])?(row[key][1]??''):row[key])
    ]))
  };
}
export function libraryEncounterReady(row={}){
  const hp=Array.isArray(row.hp)?row.hp[1]:row.hp;
  const xp=row.xpReward??row.xp;
  return Number.isSafeInteger(Number(hp))&&Number(hp)>0&&
    xp!==undefined&&xp!==null&&xp!==''&&
    Number.isSafeInteger(Number(xp))&&Number(xp)>=0;
}
/** Validate and build a record without modifying the original world state. */
export function buildGMLibraryRecord(kind,draft,id,existing={}){
  if(!libraryCollectionKey(kind))return {ok:false,error:'Choose NPC or Creature.'};
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{4,100}$/.test(id))
    return {ok:false,error:'This library record has an invalid identifier.'};
  if(!isRecord(draft)||!isRecord(existing))
    return {ok:false,error:'Invalid library record.'};
  const name=short(draft.name,120);
  if(!name)return {ok:false,error:'Enter a name.'};
  if(String(draft.name??'').trim().length>120)return {ok:false,error:'Name must be 120 characters or less.'};
  const record={...existing,id,name,libraryKind:kind};
  if(!existing.createdAt)record.createdAt=new Date().toISOString();
  record.updatedAt=new Date().toISOString();
  for(const [field,maximum] of Object.entries(optionalText)){
    const original=String(draft[field]??'');
    if(original.trim().length>maximum)
      return {ok:false,error:field+' must be '+maximum+' characters or less.'};
    const value=short(original,maximum);
    if(value)record[field]=value;
    else delete record[field];
  }
  for(const key of numericFields){
    const raw=draft[key];
    if(raw===undefined||raw===null||raw===''){delete record[key];continue;}
    const value=Number(raw);
    if(!Number.isSafeInteger(value)||value<0||value>1000000000||
      (key==='hp'&&value===0))
      return {ok:false,error:'Enter a valid '+key.toUpperCase()+' value.'};
    record[key]=value;
  }
  // Never store a client-supplied publisher permission or compendium identity
  // in a campaign-created NPC/Creature.
  delete record.published;delete record.gmOnly;delete record.visibility;
  delete record.compendiumSlug;delete record.accountUid;delete record.ownerUid;
  return {ok:true,record};
}

/**
 * Return a partial world update for the existing saveGMWorkspace service.
 * Only the targeted world array is written (not a stale whole-world snapshot).
 */
export function updateGMLibrary(world={},kind,draft,id){
  const key=libraryCollectionKey(kind);
  if(!key)return {ok:false,error:'Unknown library type.'};
  const source=safeArray(world?.[key]);
  const index=source.findIndex(row=>row?.id===id);
  if(index<0&&source.length>=GM_LIBRARY_MAX_RECORDS)
    return {ok:false,error:'The campaign has reached the limit of '+GM_LIBRARY_MAX_RECORDS+' '+key+'.'};
  const result=buildGMLibraryRecord(kind,draft,id,index>=0?source[index]:{});
  if(!result.ok)return result;
  const updated=index>=0?source.map((row,i)=>i===index?result.record:row):[...source,result.record];
  return {ok:true,record:result.record,patch:{[key]:updated}};
}
export function removeGMLibraryRecord(world={},kind,id){
  const key=libraryCollectionKey(kind);
  if(!key)return {ok:false,error:'Unknown library type.'};
  const source=safeArray(world?.[key]);
  if(!source.some(row=>row?.id===id))return {ok:false,error:'That record is no longer available.'};
  return {ok:true,patch:{[key]:source.filter(row=>row?.id!==id)}};
}
export function officialCreatureLibraryEntries(entries=[]){
  return safeArray(entries).filter(isRecord).map((entry,index)=>{
    const meta=isRecord(entry.metadata)?entry.metadata:{};
    return {
      id:'official:'+(entry.id||entry.slug||index),
      sourceId:String(entry.id||entry.slug||''),
      kind:'official',
      name:short(entry.title||entry.name||'Unnamed creature'),
      species:short(entry.creatureType||meta.creatureType||entry.category||'Creature'),
      threatTier:short(entry.threatTier||meta.threatTier||entry.tier||''),
      description:short(entry.summary||entry.description||'Official Asteria Creature Compendium',300),
      location:short(entry.biome||meta.biome||'',120),
      official:true
    };
  });
}
export function gmNPCCreatureLibrary(world={},officialEntries=[],{query='',kind='all'}={}){
  const locals=['npc','creature'].flatMap(type=>
    safeArray(world?.[libraryCollectionKey(type)])
      .filter(isRecord).map((row,index)=>({
        ...row,
        id:String(row.id||('legacy-'+type+'-'+index)),
        kind:type,
        name:short(row.name||row.title||'Unnamed '+type),
        official:false
      }))
  );
  const all=[...locals,...officialCreatureLibraryEntries(officialEntries)];
  const term=short(query,100).toLocaleLowerCase();
  const rows=all.filter(row=>(kind==='all'||kind===row.kind)&&(!term||
    [row.name,row.species,row.role,row.faction,row.location,row.personality,
      row.goals,row.description,row.threatTier,row.notes]
      .some(value=>String(value||'').toLocaleLowerCase().includes(term))));
  return {
    rows,
    counts:{
      npc:locals.filter(x=>x.kind==='npc').length,
      creature:locals.filter(x=>x.kind==='creature').length,
      official:all.length-locals.length
    }
  };
}
