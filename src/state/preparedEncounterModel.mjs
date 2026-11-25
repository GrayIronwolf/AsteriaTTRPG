import {enemyProfileSnapshot,ENEMY_PROFILE_FIELDS} from './enemyProfileModel.mjs';
import {encounterResourcePair} from './encounterResourceModel.mjs';
import {preparedEnemySpawn} from './preparedBattleMapModel.mjs';
import {validatePreparedWaves,validatePreparedEvents} from './encounterWaveModel.mjs';

/** Phase 6.2: reusable GM-only encounter templates, never live combat state. */
export const PREPARED_ENCOUNTER_MAX_PLANS=30;
export const PREPARED_ENCOUNTER_MAX_ENEMIES=60;
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const templateId=value=>typeof value==='string'&&/^prepared-[A-Za-z0-9_-]{1,95}$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const number=(value,minimum,maximum)=>{
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=minimum&&n<=maximum?n:null;
};

export function normalizePreparedEnemy(row){
  if(!object(row)||row.characterId||row.kind==='player')return null;
  const name=text(row.name,120),hp=encounterResourcePair(row,'hp');
  if(!name||!hp||!Number.isFinite(hp[1])||hp[1]<=0||hp[1]>1e9)return null;
  const result={name,kind:'enemy',type:text(row.type,80)||'Creature',
    hp:[...hp],defeated:false,initiativeSet:row.initiativeSet===true};
  for(const key of ['sp','mp']){
    const pair=encounterResourcePair(row,key);
    if(pair&&pair[1]<=1e9)result[key]=[...pair];
  }
  for(const key of ['xpReward','ac']){
    if(row[key]===undefined||row[key]===null||row[key]==='')continue;
    const val=number(row[key],0,1000000000);
    if(val===null)return null;
    result[key]=val;
  }
  if(row.initiative!==undefined&&row.initiative!==null&&row.initiative!==''){
    const val=number(row.initiative,-100,1000);
    if(val===null)return null;
    result.initiative=val;
  }
  if(id(row.sourceId))result.sourceId=row.sourceId;
  if(id(row.sourceRef))result.sourceRef=row.sourceRef;
  if(id(row.preparedEnemyId))result.preparedEnemyId=row.preparedEnemyId;
  if(typeof row.sourceVersion==='string'&&row.sourceVersion.length<=40)
    result.sourceVersion=row.sourceVersion;
  try{
    Object.assign(result,enemyProfileSnapshot(row));
    if(object(row.sourceSnapshot)){
      const snapshot=row.sourceSnapshot,stats={};
      if(text(snapshot.name,120))stats.name=text(snapshot.name,120);
      if(text(snapshot.type,80))stats.type=text(snapshot.type,80);
      for(const key of ['hp','sp','mp']){
        const pair=encounterResourcePair(snapshot,key);
        if(pair&&pair[1]<=1e9)stats[key]=[...pair];
      }
      for(const key of ['xpReward','ac','initiative']){
        if(snapshot[key]===undefined)continue;
        const n=number(snapshot[key],key==='initiative'?-100:0,key==='initiative'?1000:1e9);
        if(n!==null)stats[key]=n;
      }
      result.sourceSnapshot={...stats,...enemyProfileSnapshot(snapshot)};
    }
  }catch{return null;}
  try{
    const spawn=preparedEnemySpawn(row.spawn);
    if(spawn)result.spawn=spawn;
  }catch{return null;}
  return result;
}

export const PREPARED_ENEMY_REFRESH_FIELDS=Object.freeze([
  'name','type','hp','sp','mp','ac','initiative','xpReward',...ENEMY_PROFILE_FIELDS
]);
/** Compare the last copied source against the current Library entry, not
 * the GM's encounter-specific overrides. Nothing is changed until saved. */
export function comparePreparedEnemySource(saved,latest){
  if(!object(saved?.sourceSnapshot))return null;
  const source=normalizePreparedEnemy(latest);
  if(!source)return null;
  return PREPARED_ENEMY_REFRESH_FIELDS.filter(field=>
    JSON.stringify(saved.sourceSnapshot[field]??null)!==
    JSON.stringify(source[field]??null)
  ).map(field=>({
    field,previous:structuredClone(saved.sourceSnapshot[field]??null),
    latest:structuredClone(source[field]??null),
    customized:JSON.stringify(saved[field]??null)!==
      JSON.stringify(saved.sourceSnapshot[field]??null)
  }));
}
/** Only explicitly chosen fields are copied; map spawn, ID and other overrides
 * remain untouched. Revisions are checked by the existing save service. */
export function refreshPreparedEnemyFields(saved,latest,fields=[]){
  if(!object(saved?.sourceSnapshot))throw Error('This older enemy has no source snapshot. Match it manually.');
  const source=normalizePreparedEnemy(latest);
  if(!source)throw Error('The Library source is not encounter-ready.');
  const selected=new Set(fields);
  if([...selected].some(field=>!PREPARED_ENEMY_REFRESH_FIELDS.includes(field)))
    throw Error('Unknown source refresh field.');
  const result=structuredClone(saved),snapshot=structuredClone(saved.sourceSnapshot);
  for(const field of selected){
    if(source[field]===undefined){delete result[field];delete snapshot[field];}
    else{result[field]=structuredClone(source[field]);snapshot[field]=structuredClone(source[field]);}
  }
  result.sourceSnapshot=snapshot;
  if(selected.size)result.sourceVersion=source.sourceVersion||result.sourceVersion;
  return normalizePreparedEnemy(result);
}

export function validatePreparedEncounterInput(input){
  if(!object(input))throw Error('Invalid prepared encounter.');
  const name=text(input.name,100),notes=text(input.notes||'',1200);
  if(!name||name!==String(input.name||'').trim()||notes!==String(input.notes||'').trim())
    throw Error('Encounter name must be 1–100 characters; notes must be 1,200 or fewer.');
  const mapId=input.mapId||'';
  if(mapId&&!id(mapId))throw Error('Choose a valid campaign battle map.');
  if(!Array.isArray(input.enemies)||input.enemies.length<1||
     input.enemies.length>PREPARED_ENCOUNTER_MAX_ENEMIES)
    throw Error('Prepare between 1 and 60 enemies before saving.');
  const enemies=input.enemies.map(normalizePreparedEnemy);
  if(enemies.some(row=>!row))throw Error('Each enemy needs a name and valid HP/stat/starting position values.');
  if(!mapId&&enemies.some(enemy=>enemy.spawn))
    throw Error('Choose a battle map before setting enemy starting positions.');
  const folder=input.folder??'';
  if(typeof folder!=='string'||folder.trim().length>60)
    throw Error('Encounter folder must be at most 60 characters.');
  const tags=input.tags??[];
  if(!Array.isArray(tags)||tags.length>8||tags.some(tag=>
    typeof tag!=='string'||!tag.trim()||tag.trim().length>32))
    throw Error('Use at most eight tags, each no longer than 32 characters.');
  const normalizedTags=[...new Set(tags.map(tag=>tag.trim()))];
  const archived=input.archived??false;
  if(typeof archived!=='boolean')throw Error('Invalid encounter archive status.');
  const waves=validatePreparedWaves(input.waves??[],normalizePreparedEnemy,
    enemies.length,mapId);
  const events=validatePreparedEvents(input.events??[]);
  return {name,notes,mapId,enemies,folder:folder.trim(),
    tags:normalizedTags,archived,waves,events};
}
export function normalizePreparedEncounters(raw){
  if(!Array.isArray(raw))return [];
  const seen=new Set(),plans=[];
  for(const item of raw){
    if(!object(item)||!templateId(item.id)||seen.has(item.id))continue;
    try{
      const payload=validatePreparedEncounterInput(item);
      const revision=number(item.revision,1,100000);
      if(revision===null)continue;
      plans.push({
        id:item.id,...payload,revision,
        createdBy:id(item.createdBy)?item.createdBy:'',
        updatedBy:id(item.updatedBy)?item.updatedBy:'',
        createdAt:text(item.createdAt,40),updatedAt:text(item.updatedAt,40)
      });
      seen.add(item.id);
      if(plans.length===PREPARED_ENCOUNTER_MAX_PLANS)break;
    }catch{/* Unknown or malformed saved plans do not enter the UI or combat. */}
  }
  return plans;
}

/** Build fresh enemy IDs from the server request, never reuse previous encounter IDs. */
export function instantiatePreparedEnemies(plan,requestId){
  const payload=validatePreparedEncounterInput(plan);
  if(!id(requestId)||requestId.length>100)throw Error('Invalid combat request identifier.');
  return payload.enemies.map((row,index)=>{
    const enemyId='enemy-'+requestId+'-'+(index+1);
    if(!id(enemyId))throw Error('Prepared combatant identifier is too long.');
    return {...row,id:enemyId};
  });
}

/** Preserve only currently linked PCs, then replace the enemy roster atomically. */
export function preparedEncounterRoster(plan,previous=[],requestId){
  const players=(Array.isArray(previous)?previous:[]).filter(row=>row?.characterId&&id(row.id));
  const enemies=instantiatePreparedEnemies(plan,requestId);
  if(players.length+enemies.length>160)
    throw Error('Too many combatants to load this prepared encounter.');
  return [...players,...enemies];
}
