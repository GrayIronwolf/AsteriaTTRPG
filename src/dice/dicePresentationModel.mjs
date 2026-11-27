/** Phase 3.10: device-local cosmetic settings. Never submitted with rolls. */
import {TRAY_SOUNDS,TRAY_SOUND_LEVELS,validateDiceTrayAppearance} from './diceTrayCatalogue.mjs';
export const PRESENTATION_VERSION=1;
export const PRESENTATION_STORAGE_KEY='asteria:dice:presentation:v1';
export const GRAPHICS=['auto','high','balanced','performance'];
export const EFFECT_LEVELS=['off','subtle','full'];
export const ELEMENTS=['none','fire','water','earth','air','life','death','light',
 'dark','arcane','celestial','infernal','frost','lightning'];
export const REDUCED_MOTION=['system','on','off'];
export const SOUND_PACKS=['auto',...TRAY_SOUNDS];
export const COLORS=Object.freeze({
 none:['#B0E7EF','#D5B36A'],fire:['#F78C49','#FFC86A'],
 water:['#4EB0E0','#B0E7EF'],earth:['#A8AE73','#D2BC7B'],
 air:['#A9D7EF','#E4F7FF'],life:['#74C990','#E7FFAC'],
 death:['#9A77AC','#C4AFD1'],light:['#F7DE85','#FFF9D6'],
 dark:['#7A6DB0','#B6A2D6'],arcane:['#9A78DD','#CFB8FF'],
 celestial:['#B0E7EF','#FAEBC3'],infernal:['#DD5C4B','#F6AA57'],
 frost:['#A7DCF6','#F5FCFF'],lightning:['#AFA6FE','#F5F8FF']
});
const keys=['version','graphics','effects','criticalEffects','element','soundPack','volume','muted','reducedMotion'];
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(o));
const pick=(x,arr,k)=>{if(typeof x!=='string'||!arr.includes(x))throw Error('Invalid '+k);return x;};
export function defaultDicePresentation(){
 return {version:PRESENTATION_VERSION,graphics:'auto',effects:'subtle',
  criticalEffects:'subtle',element:'none',soundPack:'auto',volume:'medium',
  muted:false,reducedMotion:'system'};
}
export function validateDicePresentation(v){
 if(!plain(v)||JSON.stringify(v).length>1200||v.version!==1||
  Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(v,k)))
  throw Error('Invalid dice presentation settings.');
 if(typeof v.muted!=='boolean')throw Error('Invalid mute setting.');
 return {version:1,graphics:pick(v.graphics,GRAPHICS,'graphics'),
  effects:pick(v.effects,EFFECT_LEVELS,'effects'),
  criticalEffects:pick(v.criticalEffects,EFFECT_LEVELS,'critical effects'),
  element:pick(v.element,ELEMENTS,'element'),soundPack:pick(v.soundPack,SOUND_PACKS,'sound'),
  volume:pick(v.volume,TRAY_SOUND_LEVELS,'volume'),muted:v.muted,
  reducedMotion:pick(v.reducedMotion,REDUCED_MOTION,'reduced motion')};
}
export function deviceDicePresentation(raw){
 try{
  if(typeof raw!=='string'||raw.length>1200)return defaultDicePresentation();
  return validateDicePresentation(JSON.parse(raw));
 }catch{return defaultDicePresentation();}
}
export function isReducedDiceMotion(p,environment={}){
 const v=validateDicePresentation(p);
 return v.reducedMotion==='on'||v.reducedMotion==='system'&&Boolean(environment.systemReducedMotion);
}
export function diceGraphicsProfile(settings,environment={}){
 const p=validateDicePresentation(settings);
 const memory=Number.isFinite(environment.deviceMemory)?environment.deviceMemory:null;
 const cpus=Number.isFinite(environment.hardwareConcurrency)?environment.hardwareConcurrency:null;
 const width=Number.isFinite(environment.viewportWidth)?environment.viewportWidth:1000;
 const low=(memory!==null&&memory<=2)||(cpus!==null&&cpus<=2)||width<430;
 const mobile=width<800||(memory!==null&&memory<=4);
 const tier=p.graphics==='auto'?(low?'performance':mobile?'balanced':'high'):p.graphics;
 const reducedMotion=isReducedDiceMotion(p,environment);
 return {tier,requested:p.graphics,reducedMotion,
  pixelRatio:reducedMotion?.75:tier==='high'?1.5:tier==='balanced'?1:.75,
  particleLimit:reducedMotion||tier==='performance'?0:tier==='high'?20:10,
  watcherLimit:reducedMotion?0:tier==='high'?6:tier==='balanced'?3:1,
  reason:p.graphics==='auto'?'adaptive':'user-selected'};
}
export function diceEffectForRecord(record,settings,profile){
 const p=validateDicePresentation(settings),q=profile||diceGraphicsProfile(p);
 const critical=record?.natural==='natural-20'?'success':
  record?.natural==='natural-1'?'failure':null;
 const showCritical=Boolean(record&&critical&&p.criticalEffects!=='off'&&
   !q.reducedMotion&&q.particleLimit>0);
 const showElement=Boolean(record&&p.element!=='none'&&p.effects!=='off'&&
   !q.reducedMotion&&q.particleLimit>0);
 const full=showCritical&&p.criticalEffects==='full'||showElement&&p.effects==='full';
 const count=showCritical||showElement?Math.min(q.particleLimit,full?20:10):0;
 const [primary,secondary]=COLORS[showElement?p.element:'celestial'];
 return {critical:showCritical?critical:null,element:showElement?p.element:null,
  intensity:full?'full':'subtle',count,primary,secondary,
  label:critical==='success'?'Natural 20':critical==='failure'?'Natural 1':null};
}
export function diceSoundAppearance(tray,settings,tower=null){
 const p=validateDicePresentation(settings),t=validateDiceTrayAppearance(tray);
 const sound=p.muted?'off':p.soundPack==='auto'?
  (TRAY_SOUNDS.includes(tower?.sound)?tower.sound:t.sound):p.soundPack;
 return validateDiceTrayAppearance({...t,sound,soundVolume:p.volume});
}
