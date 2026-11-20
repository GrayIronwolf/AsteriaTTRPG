import {encounterResourcePair} from './encounterResourceModel.mjs';

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
  return result;
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
  if(enemies.some(row=>!row))throw Error('Each enemy needs a name and valid HP/stat values.');
  return {name,notes,mapId,enemies};
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
