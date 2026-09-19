import { CHARACTERISTIC_ALIASES, collectCharacterEffects, effectiveCharacteristicValue, evaluateEffects } from './effectsEngine.mjs';
import { expireConditions } from './conditionModel.mjs';
import { reconcileTalentEffects, resetTalentRest } from './talentModel.mjs';
import { applyRest } from './specialDamageModel.mjs';

export function reconcileCharacterSystems(character,catalog=[],clock={}) {
  return {...reconcileTalentEffects({...character,conditions:expireConditions(character,clock)},catalog,clock),coreStateVersion:1};
}
export function characterStatistics(character,clock={}) {
  const effects=collectCharacterEffects(character,clock);
  return {effects,characteristics:Object.fromEntries(Object.keys(CHARACTERISTIC_ALIASES).map(key=>[key,effectiveCharacteristicValue(character,key,clock)])),
    movement:evaluateEffects(character.movement ?? character.speed ?? 0,'movement',effects,clock).value,
    initiative:evaluateEffects(character.initiative || 0,'initiative',effects,clock).value,
    carryingCapacity:evaluateEffects(character.carryingCapacity || 0,'carrying-capacity',effects,clock).value};
}
export function processCharacterRest(character,type,catalog=[],clock={},soulRecovery=0) {
  const expire=rows=>Array.isArray(rows)?rows.map(row=>row.duration?.unit==='short-rest' || row.duration==='short-rest' || type==='long' && (row.duration?.unit==='long-rest' || row.duration==='long-rest')?{...row,expired:true}:row):rows;
  let next={...character,conditions:expireConditions(character,clock,type)};
  for(const key of ['activeEffects','effects']) if(next[key]) next[key]=expire(next[key]);
  next=reconcileCharacterSystems(resetTalentRest(next,type),catalog,clock);
  const result=applyRest(next,type,soulRecovery);
  return {...result,entity:reconcileCharacterSystems(result.entity,catalog,clock)};
}
