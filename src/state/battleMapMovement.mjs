import {DEFAULT_COMBAT_ACTIONS} from './combatRules.mjs';
import {characterStatistics} from './characterSystems.mjs';

export const MAP_MOVE_AP=Object.freeze(Object.fromEntries(DEFAULT_COMBAT_ACTIONS
  .filter(row=>['walk','dash'].includes(row.key)).map(row=>[row.key,row.ap])));
export function approvedMapMovementAward(option,approval,activeMovement){
  const routeKind=approval.mapTravel;
  if(!routeKind)return null;
  if(!approval.feasible||String(approval.sourceReason||'').trim().length<5||
    !Number.isFinite(approval.distance)||approval.distance<=0)
    throw Error('Map movement requires confirmed feasibility, a source reason and positive distance.');
  if(activeMovement?.routeKind)throw Error('Complete the current source-granted map movement first.');
  if(option.key==='jump'&&routeKind==='jump'){
    if(!activeMovement||!(activeMovement.remaining>=approval.distance))
      throw Error('The jump must fit within already paid movement.');
    return {kind:'jump',routeKind,remaining:approval.distance,previous:activeMovement};
  }
  if(!['spell','talent'].includes(option.kind)||!['ground','jump','teleport'].includes(routeKind))
    throw Error('Choose a map movement type supported by the action source.');
  return {kind:option.kind,routeKind,remaining:approval.distance,previous:activeMovement??null};
}
export function spendMapMovement(movement,cost,diagonalParity){
  const remaining=Math.max(0,Math.round((movement.remaining-cost)*100)/100);
  if(movement.kind==='jump'){
    const previous=movement.previous;
    return {...previous,remaining:Math.max(0,Math.round((previous.remaining-cost)*100)/100)};
  }
  if(movement.routeKind==='jump'||movement.routeKind==='teleport'||(movement.routeKind&&remaining===0))
    return movement.previous??null;
  return {...movement,remaining,diagonalParity};
}
function walkingDistance(raw){
  if(typeof raw==='number')return raw;
  if(typeof raw!=='string')return null;
  const exact=raw.trim().match(/^(\d+(?:\.\d+)?)\s*(?:m|metres?)?$/i);
  const walking=raw.match(/(\d+(?:\.\d+)?)\s*m\s*\(walking\)/i);
  return exact||walking?Number((exact||walking)[1]):null;
}
export function walkingAllowance(character,clock){
  const base=walkingDistance(character.movement??character.speed);
  if(!Number.isFinite(base)||base<=0)return null;
  const distance=characterStatistics({...character,movement:base},clock).movement;
  return Number.isFinite(distance)&&distance>0?distance:null;
}
export function validateMapOpportunity(encounter,actorId){
  const actor=encounter.combat?.participants?.[actorId]||{};
  if(actor.outOfTurn?.round===encounter.round)
    throw Error('This participant has already used their out-of-turn opportunity this round.');
}
