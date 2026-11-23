/** Pure pointer-gesture and polygon bounds helpers. Cosmetic interactions never roll dice. */
import {verifyTrayContainment} from './diceTrayGeometry.mjs';
export const DICE_DRAG_DISTANCE=9;
export function diceGesture(start,end,elapsedMs,speed='normal'){
 const dx=Number(end.x)-Number(start.x),dy=Number(end.y)-Number(start.y);
 const distance=Math.hypot(dx,dy),elapsed=Math.max(1,Number(elapsedMs)||1);
 const multiplier={gentle:1.45,normal:1,fast:.7}[speed]||1;
 return {distance,click:distance<DICE_DRAG_DISTANCE,
  flick:distance>=28&&distance/elapsed>.65*multiplier,
  dx,dy};
}
export function fitDieInsideTray(point,outline,margin=.75){
 if(!outline||!Number.isFinite(point?.x)||!Number.isFinite(point?.z))
  return null;
 const target=[point.x,point.z];
 if(verifyTrayContainment(outline,target,margin))
  return {x:point.x,z:point.z};
 if(!verifyTrayContainment(outline,[0,0],margin))return null;
 let low=0,high=1;
 for(let i=0;i<18;i++){
  const mid=(low+high)/2;
  if(verifyTrayContainment(outline,[target[0]*mid,target[1]*mid],margin))low=mid;
  else high=mid;
 }
 return {x:target[0]*low,z:target[1]*low};
}
