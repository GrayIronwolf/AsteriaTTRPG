import {validatePreparedEncounterInput} from './preparedEncounterModel.mjs';

export const PREPARED_LOAD_CONFIRMATION='replace-staged-enemies';
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const validRevision=value=>Number.isSafeInteger(value)&&value>=0;
export const MAX_STAGED_ENCOUNTERS=12;

export function stagedEncounterList(raw){
  return (Array.isArray(raw)?raw:[])
    .filter(row=>validId(row?.id)&&validRevision(row.templateRevision)&&row.templateRevision>0&&
      Number.isSafeInteger(row.stagedAt)&&row.stagedAt>=0)
    .slice(0,MAX_STAGED_ENCOUNTERS)
    .map(({id,templateRevision,stagedAt})=>({id,templateRevision,stagedAt}));
}

export function updateStagedEncounter(raw,input,plan,now){
  if(!validId(input.preparedId))throw Error('Choose a valid prepared encounter.');
  const current=stagedEncounterList(raw);
  const remaining=current.filter(row=>row.id!==input.preparedId);
  if(input.operation==='unstage-prepared')return remaining;
  if(input.operation!=='stage-prepared'||!plan||plan.id!==input.preparedId||plan.archived||
    plan.revision!==input.expectedPreparedRevision)
    throw Error('Choose and review the current revision of an active template.');
  validatePreparedEncounterInput(plan);
  if(current.some(row=>row.id===plan.id&&row.templateRevision===plan.revision))return current;
  if(remaining.length>=MAX_STAGED_ENCOUNTERS)throw Error('Remove a staged encounter before adding another.');
  return [...remaining,{id:plan.id,templateRevision:plan.revision,stagedAt:now}];
}

/** Only the reusable template and public GM combat projection enter this summary. */
export function previewPreparedEncounterLoad(plan,combat,maps=[],pending=null){
  const issues=[];
  if(!plan||typeof plan!=='object')return {
    eligible:false,issues:['The selected prepared encounter is unavailable.'],
    incomingEnemies:0,stagedEnemies:0,linkedPlayers:0,mapName:''
  };
  let payload;
  try{payload=validatePreparedEncounterInput(plan);}
  catch(error){issues.push(error.message);}
  if(plan.archived===true)issues.push('Restore the archived encounter before loading.');
  if(!validRevision(plan.revision)||plan.revision<1)
    issues.push('The saved encounter revision is invalid.');
  if(!combat||!validRevision(combat.revision))
    issues.push('Current combat revision is unavailable.');
  else if(!['ready','ended'].includes(combat.status))
    issues.push('End the active encounter before loading a prepared encounter.');
  const rows=Array.isArray(combat?.combatants)?combat.combatants:[];
  const linked=rows.filter(row=>validId(row?.characterId));
  const keys=linked.map(row=>row.characterId);
  if(new Set(keys).size!==keys.length)
    issues.push('Current combat has duplicate linked characters. Resolve these first.');
  if(pending?.status||combat?.pending?.status)
    issues.push('Resolve the pending combat action before replacing the roster.');
  if(combat?.battleMapId)
    issues.push('The current battle map must be unlinked before loading another encounter.');
  const available=Array.isArray(maps)?maps:[];
  const map=payload?.mapId?available.find(row=>row.id===payload.mapId):null;
  if(payload?.mapId&&!map)
    issues.push('The saved battle map is unavailable. Edit the template first.');
  return {
    eligible:issues.length===0,issues,
    incomingEnemies:payload?.enemies.length||0,
    stagedEnemies:rows.length-linked.length,
    linkedPlayers:linked.length,
    mapName:map?.name||(payload?.mapId?'Unavailable':'No battle map'),
    templateRevision:plan.revision,
    combatRevision:combat?.revision,
    preparedId:plan.id
  };
}

/** All server-side guards must run before touching live combat documents. */
export function validatePreparedLoadRequest(input,plan,encounter){
  if(!input||input.operation!=='load-prepared'||!validId(input.preparedId)||
    !validRevision(input.revision)||!validRevision(input.expectedPreparedRevision)||
    input.expectedPreparedRevision===0||input.confirmation!==PREPARED_LOAD_CONFIRMATION||
    input.replace!==true||input.mapId!==undefined)
    throw Error('Confirm the exact prepared encounter and combat revisions before loading.');
  if(!plan||plan.id!==input.preparedId)
    throw Error('Prepared encounter was removed. Refresh the library.');
  if(plan.archived===true)
    throw Error('Restore this archived encounter before loading combat.');
  validatePreparedEncounterInput(plan);
  if(plan.revision!==input.expectedPreparedRevision)
    throw Error('Prepared encounter changed. Review the latest version before loading.');
  if(!['ready','ended'].includes(encounter?.status))
    throw Error('End active combat before loading a prepared encounter.');
  if(encounter?.battleMapId)
    throw Error('Unlink the current combat map before loading a prepared encounter.');
  const players=(Array.isArray(encounter?.combatants)?encounter.combatants:[])
    .filter(row=>row?.characterId);
  if(players.some(row=>!validId(row.id)||!validId(row.characterId))||
    new Set(players.map(row=>row.id)).size!==players.length||
    new Set(players.map(row=>row.characterId)).size!==players.length)
    throw Error('Repair duplicate or invalid linked characters before loading.');
  return Object.freeze({
    preparedId:plan.id,preparedRevision:plan.revision,
    enemyCount:plan.enemies.length,linkedPlayers:players.length,
    mapId:plan.mapId||''
  });
}
