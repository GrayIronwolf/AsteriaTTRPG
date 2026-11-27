/** Phase 4: device-local Dice Window controls and the existing server roll pool. */
import {DICE_SIDES,MAX_DICE_GROUPS,MAX_DICE_PER_ROLL} from '../state/diceRollModel.mjs';
import {TOWER_FAMILIES} from './diceTowerCatalogue.mjs';

export const DICE_WINDOW_STORAGE_KEY='asteria:dice:window:v1';
export const DICE_CAMERA_PRESETS=Object.freeze(['classic','top-down','cinematic']);
export const DICE_INTERACTION_SPEEDS=Object.freeze(['gentle','normal','fast']);
const towerIds=['off',...TOWER_FAMILIES.map(x=>x.id)];
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
export function defaultDiceWindowSettings(){
 return {version:1,cameraPreset:'classic',cinematicFollow:false,
  interactionSpeed:'normal',towerId:'off',autoHideResult:false};
}
export function validateDiceWindowSettings(value){
 const defaults=defaultDiceWindowSettings(),keys=Object.keys(defaults);
 if(!value||typeof value!=='object'||Array.isArray(value)||
  ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
  JSON.stringify(value).length>1200||
  Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!own(value,k))||
  value.version!==1||!DICE_CAMERA_PRESETS.includes(value.cameraPreset)||
  !DICE_INTERACTION_SPEEDS.includes(value.interactionSpeed)||
  !towerIds.includes(value.towerId)||
  typeof value.cinematicFollow!=='boolean'||typeof value.autoHideResult!=='boolean')
  throw Error('Invalid dice window settings.');
 return {...defaults,...value};
}
export function readDiceWindowSettings(raw){
 try{return validateDiceWindowSettings(JSON.parse(raw));}
 catch{return defaultDiceWindowSettings();}
}
export function addDiceToPool(pool,sides){
 if(!DICE_SIDES.includes(sides)||!Array.isArray(pool))throw Error('Unknown dice.');
 if(pool.reduce((n,row)=>n+row.count,0)>=MAX_DICE_PER_ROLL)return pool;
 const found=pool.findIndex(row=>row.sides===sides);
 if(found<0){
  if(pool.length>=MAX_DICE_GROUPS)return pool;
  return [...pool,{count:1,sides}];
 }
 return pool.map((row,i)=>i===found?{...row,count:row.count+1}:row);
}
export function removeDiceFromPool(pool,sides){
 if(!DICE_SIDES.includes(sides)||!Array.isArray(pool))throw Error('Unknown dice.');
 const index=pool.findIndex(row=>row.sides===sides);
 if(index<0)return pool;
 return pool.flatMap((row,i)=>i===index?
  (row.count>1?[{...row,count:row.count-1}]:[]):[row]);
}
export function formatShareableDiceResult(row){
 if(!row||!Array.isArray(row.results)||!Number.isFinite(row.total))
  throw Error('No confirmed dice result to share.');
 const label=String(row.label||row.expression||'Dice roll').slice(0,80);
 return 'Asteria digital dice — '+label+' | '+String(row.expression)+
  ' | Total: '+String(row.total)+' | Server verified';
}
