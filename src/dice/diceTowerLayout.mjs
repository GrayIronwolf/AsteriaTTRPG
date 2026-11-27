/**
 * Phase 3.9 — six visual families, one true prediction-compatible chute.
 * Castle remains the tuned reference; each other family/variation changes
 * box-body geometry slightly without changing the verified spawn/exit protocol.
 * Static THREE boxes and Cannon colliders use the same resulting layout.
 */
import {castleTowerLayout,castleTowerSpawn,inspectCastleTowerRecording} from './castleDiceTowerGeometry.mjs';
import {validateDiceTowerAppearance,getDiceTowerFamily} from './diceTowerCatalogue.mjs';

export const TOWER_PHYSICS_VERSION=1;
const profile=Object.freeze({
 'tower-castle':{shift:0,tilt:0,guard:0,deck:0},
 'tower-dragon':{shift:.025,tilt:.012,guard:.02,deck:.045},
 'tower-wizard':{shift:-.035,tilt:-.013,guard:.035,deck:0},
 'tower-dwarven-forge':{shift:.045,tilt:.018,guard:.04,deck:.055},
 'tower-nature':{shift:-.025,tilt:.016,guard:.02,deck:-.015},
 'tower-celestial':{shift:.015,tilt:-.015,guard:.045,deck:.02}
});
export function diceTowerLayout(outline,appearance){
 const config=validateDiceTowerAppearance(appearance);
 const base=castleTowerLayout(outline);
 const style=getDiceTowerFamily(config.designId);
 const shape=profile[style.id];
 const v=config.variation==='grand'?2:config.variation==='detailed'?1:0;
 const boxes=base.boxes.map(original=>{
  const b={...original};
  if(b.role==='baffle'){
   b.x+=shape.shift*(v+1);
   b.angleZ+=shape.tilt*(v+1);
   b.w+=v*.012;
  }
  if(b.role==='ramp')b.w+=shape.deck+v*.018;
  if(b.role==='guide')b.h+=shape.guard+v*.028;
  return b;
 });
 return {...base,id:config.designId,familyId:style.id,style:style.style,
  variation:config.variation,version:TOWER_PHYSICS_VERSION,boxes};
}
export function diceTowerSpawn(seed,layout){
 return castleTowerSpawn(seed,layout);
}
export function inspectDiceTowerRecording(layout,recording){
 const outcome=inspectCastleTowerRecording(layout,recording);
 if(!outcome)return null;
 return {...outcome,type:'asteria-dice-tower-physics',towerId:layout.id,
  variation:layout.variation||'standard'};
}
export function physicalTowerFaceStatus(layout,recording){
 const outcome=inspectDiceTowerRecording(layout,recording);
 return Boolean(outcome&&outcome.exitComplete&&outcome.upper===outcome.diceCount&&
  outcome.middle===outcome.diceCount&&outcome.lower===outcome.diceCount);
}
