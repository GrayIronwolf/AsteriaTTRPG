import {DEFAULT_COMBAT_ACTIONS} from './combatRules.mjs';
import {characterStatistics} from './characterSystems.mjs';

export const MAP_MOVE_AP=Object.freeze(Object.fromEntries(DEFAULT_COMBAT_ACTIONS
  .filter(row=>['walk','dash'].includes(row.key)).map(row=>[row.key,row.ap])));
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
