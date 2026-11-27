import {effectTimeMs} from './effectsEngine.mjs';
import {resourceDefinitions,resourceSnapshot,storedResource} from './resourceEngine.mjs';
import {resourcePair} from './resourceValues.mjs';

const pending=row=>row&&row.expired!==true&&row.active!==false&&!row.ended&&!row.removedAt;
const combatId=encounter=>encounter?.status==='active'?(encounter.combatId||'legacy-combat'):'';
const conditions=character=>Array.isArray(character?.conditions)?character.conditions:[];

function dueRegeneration(character,combat,now){
  return resourceDefinitions(character).filter(row=>{
    const regen=row.regeneration;
    if(!(Number(regen?.intervalMs)>=1000&&Number(regen?.amount)>0)||combat&&!regen.inCombat)return false;
    let resource;
    try{resource=resourceSnapshot(character,row.id);}catch{return false;}
    const last=Number(character.resourceState?.[row.id]?.recoveryAt);
    return Number.isFinite(last)&&last>0&&resource.current<resource.cap&&now-last>=Number(regen.intervalMs);
  }).map(row=>row.id);
}
/** Pure snapshot audit: writes only when a concrete state transition is due. */
export function characterSystemsRefreshDecision(character,encounter={},now=Date.now()){
  if(!character?.id)return null;
  const combat=combatId(encounter),hp=resourcePair(character.hp)[0];
  const transition=resourceDefinitions(character).filter(row=>{
    if(!row.reset)return false;
    const marker=character.resourceState?.[row.id]||{};
    const mismatch=marker.combatId!==combat;
    const unconscious=row.reset.unconscious!==undefined&&hp<=0&&
      resourcePair(storedResource(character,row.id))[0]!==row.reset.unconscious;
    return mismatch||unconscious;
  }).map(row=>row.id);
  const boundary=conditions(character).filter(row=>pending(row)&&row.encounterId&&
    (row.encounterId!==combat||row.untilRound&&Number(encounter?.round)>=row.untilRound));
  const timed=conditions(character).filter(row=>pending(row)&&row.expiresAt&&
    effectTimeMs(row.expiresAt)>0&&effectTimeMs(row.expiresAt)<=now);
  const regen=dueRegeneration(character,combat,now);
  const outdated=character.coreStateVersion!==1;
  if(!outdated&&!transition.length&&!boundary.length&&!timed.length&&!regen.length)return null;
  return {key:[character.id,character.coreRevision||0,character.coreStateVersion||0,
    combat,encounter?.round||0,hp<=0,transition.join(','),boundary.map(x=>x.id).join(','),
    timed.map(x=>x.id).join(','),regen.join(',')].join(':'),
    outdated,transition,boundary:boundary.map(x=>x.id),timed:timed.map(x=>x.id),regeneration:regen};
}
/** The next condition expiry or resource regeneration boundary, not periodic polling. */
export function nextCharacterSystemsDeadline(characters={},encounter={},now=Date.now()){
  let next=Infinity;
  const combat=combatId(encounter);
  for(const character of Object.values(characters||{})){
    if(!character)continue;
    for(const row of conditions(character))if(pending(row)&&row.expiresAt){
      const deadline=effectTimeMs(row.expiresAt);
      if(deadline>now)next=Math.min(next,deadline);
    }
    for(const row of resourceDefinitions(character)){
      const regen=row.regeneration;
      if(!(Number(regen?.intervalMs)>=1000&&Number(regen?.amount)>0)||combat&&!regen.inCombat)continue;
      let resource;
      try{resource=resourceSnapshot(character,row.id);}catch{continue;}
      if(resource.current>=resource.cap)continue;
      const at=Number(character.resourceState?.[row.id]?.recoveryAt);
      if(Number.isFinite(at)&&at>0){
        const deadline=at+Number(regen.intervalMs);
        if(deadline>now)next=Math.min(next,deadline);
      }
    }
  }
  return next===Infinity?null:next;
}
