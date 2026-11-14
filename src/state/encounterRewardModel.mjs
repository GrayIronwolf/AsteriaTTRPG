// Digital GM Toolkit Phase 7.3. A GM reviews a server-generated encounter
// and possible treasure before either is staged into existing gameplay flows.
export const ENCOUNTER_PLAN_MAX_ENEMIES=8;
export const ENCOUNTER_PLAN_MAX_LOOT_ROLLS=10;
export const ENCOUNTER_PLAN_HISTORY_LIMIT=30;
export const ENCOUNTER_PLAN_SOURCES=Object.freeze(['all','official','campaign']);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const whole=(value,min,max,label)=>{
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw Error(label+' must be a whole number from '+min+' to '+max+'.');
  return value;
};
export function threatTierNumber(value){
  if(Number.isSafeInteger(value)&&value>=1&&value<=20)return value;
  if(typeof value!=='string')return null;
  const match=value.trim().match(/^(?:(?:threat\s*)?tier|tt)\s*[-:]?\s*(\d{1,2})$/i);
  const result=match?Number(match[1]):null;
  return Number.isSafeInteger(result)&&result>=1&&result<=20?result:null;
}
export function validateEncounterPlanAction(input={}){
  if(!object(input))throw Error('Invalid encounter generator action.');
  const type=input.type;
  const keys={
    generate:['type','threatTier','tolerance','count','source','biome','lootTableId','lootRolls','randomTableId'],
    approve:['type','planId','expectedRevision'],
    archive:['type','planId','expectedRevision']
  }[type];
  if(!keys||Object.keys(input).some(key=>!keys.includes(key)))
    throw Error('Unsupported encounter generator action or fields.');
  if(type!=='generate'){
    if(!id(input.planId))throw Error('Choose a valid saved encounter plan.');
    return {type,planId:input.planId,expectedRevision:whole(input.expectedRevision,1,10000,'Plan revision')};
  }
  const threatTier=whole(input.threatTier,1,20,'Threat Tier');
  const tolerance=whole(input.tolerance??0,0,2,'Threat Tier tolerance');
  const count=whole(input.count,1,ENCOUNTER_PLAN_MAX_ENEMIES,'Enemy count');
  const source=input.source??'all';
  if(!ENCOUNTER_PLAN_SOURCES.includes(source))throw Error('Choose a valid creature source.');
  const biome=input.biome??'';
  if(typeof biome!=='string'||biome.trim().length>80)throw Error('Biome must be 80 characters or fewer.');
  const lootTableId=input.lootTableId??'';
  const randomTableId=input.randomTableId??'';
  if(lootTableId&&!id(lootTableId))throw Error('Choose an existing loot table.');
  if(randomTableId&&!id(randomTableId))throw Error('Choose an existing encounter random table.');
  const lootRolls=whole(input.lootRolls??0,0,ENCOUNTER_PLAN_MAX_LOOT_ROLLS,'Loot roll count');
  if(lootTableId&&!lootRolls)throw Error('Choose at least one loot roll.');
  return {type,threatTier,tolerance,count,source,biome:biome.trim(),lootTableId,randomTableId,lootRolls};
}
function safePositiveNumber(value,{allowZero=false}={}){
  const number=Number(value);
  return Number.isSafeInteger(number)&&number>=Number(!allowZero)&&number<=1000000000?number:null;
}
export function encounterCreatureCandidate(record={},kind='campaign'){
  if(!object(record)||!['campaign','official'].includes(kind))return null;
  const meta=object(record.metadata)?record.metadata:{};
  const name=String(record.name||record.title||'').trim().slice(0,120);
  const sourceId=String(record.id||record.slug||'').trim();
  const threatTier=threatTierNumber(record.threatTier??record.tier??meta.threatTier);
  const rawHp=record.hp??meta.hp;
  const hp=safePositiveNumber(Array.isArray(rawHp)?rawHp[1]:rawHp);
  if(!id(sourceId)||!name||!threatTier||hp===null)return null;
  const xpRaw=record.xpReward??record.xp??meta.xpReward??meta.xp;
  const xpReward=xpRaw===undefined||xpRaw===null||xpRaw===''?null:safePositiveNumber(xpRaw,{allowZero:true});
  // Campaign library records require the configured XP from their saved sheet.
  if(kind==='campaign'&&xpReward===null)return null;
  const data={
    sourceId,name,source:kind==='official'?'Official Creature Compendium':'Campaign Creature Library',
    type:String(record.species||record.creatureType||meta.creatureType||record.type||'Creature').slice(0,80),
    threatTier, hp:[hp,hp],xpReward
  };
  const ac=safePositiveNumber(record.ac??meta.armour??meta.ac,{allowZero:true});
  if(ac!==null)data.ac=ac;
  const initiative=safePositiveNumber(record.initiative??meta.initiative,{allowZero:true});
  if(initiative!==null)data.initiative=initiative;
  for(const key of ['sp','mp']){
    const raw=record[key]??meta[key],amount=safePositiveNumber(Array.isArray(raw)?raw[1]:raw,{allowZero:true});
    if(amount!==null&&amount>0)data[key]=[amount,amount];
  }
  const location=record.location??record.biome??meta.biome??'';
  data.biome=String(Array.isArray(location)?location.join(', '):location).trim().slice(0,120);
  return data;
}
export function drawEncounterCreatures(candidates=[],request={},rng){
  if(typeof rng!=='function')throw Error('A secure random source is required.');
  const selected=candidates.filter(row=>row&&row.threatTier>=request.threatTier-request.tolerance&&
    row.threatTier<=request.threatTier+request.tolerance&&
    (request.source==='all'||(request.source==='official')===(row.source==='Official Creature Compendium'))&&
    (!request.biome||String(row.biome||'').toLocaleLowerCase().includes(request.biome.toLocaleLowerCase())));
  if(!selected.length)throw Error('No eligible creatures at this Threat Tier and location. Change the filters or add a campaign creature with HP and XP.');
  const creatures=Array.from({length:request.count},(_,index)=>{
    const draw=rng(selected.length);
    if(!Number.isSafeInteger(draw)||draw<0||draw>=selected.length)
      throw Error('The random generator returned an invalid creature selection.');
    const creature=selected[draw];
    return {...creature,slot:index+1,sourceId:creature.sourceId};
  });
  const known=creatures.every(row=>Number.isSafeInteger(row.xpReward));
  return {creatures,candidateCount:selected.length,
    totalXP:known?creatures.reduce((sum,row)=>sum+row.xpReward,0):null,
    xpUnconfigured:creatures.filter(row=>row.xpReward===null).length};
}
// Only an approved, saved plan may be copied into the existing Combat Command
// encounter setup. Never add combatants directly to Firestore from this helper.
export function planEncounterCombatants(plan={},encounter={}){
  if(plan.status!=='approved'||!Array.isArray(plan.creatures)||!plan.creatures.length)
    throw Error('Approve this encounter plan before preparing combat.');
  if(encounter.status!=='ready')throw Error('Set up or clear the current combat before adding an encounter.');
  const previous=Array.isArray(encounter.combatants)?encounter.combatants:[];
  if(previous.length+plan.creatures.length>160)throw Error('The encounter has too many participants.');
  const prefix=String(plan.id||'');
  if(!id(prefix)||prefix.length>120)throw Error('Invalid approved encounter plan.');
  const present=new Set(previous.map(row=>row.id));
  const added=plan.creatures.map((creature,index)=>{
    const combatantId='enemy-'+prefix+'-'+(index+1);
    if(!id(combatantId))throw Error('Invalid generated combatant identifier.');
    return {id:combatantId,kind:'enemy',sourceId:creature.sourceId,
      name:creature.name,source:creature.source,type:creature.type,
      threatTier:'TT '+creature.threatTier,initiative:creature.initiative??0,
      initiativeSet:false,defeated:false,
      ...(creature.ac!==undefined?{ac:creature.ac}:{}),
      ...(creature.xpReward!==null?{xpReward:creature.xpReward}:{}),
      hp:[...creature.hp],
      ...(creature.sp?{sp:[...creature.sp]}:{}),
      ...(creature.mp?{mp:[...creature.mp]}:{}),
      generatedFromPlan:plan.id};
  }).filter(row=>!present.has(row.id));
  return {added,encounter:{...encounter,
    combatants:[...previous,...added],
    enemies:[...(Array.isArray(encounter.enemies)?encounter.enemies:[]),...added]}};
}
