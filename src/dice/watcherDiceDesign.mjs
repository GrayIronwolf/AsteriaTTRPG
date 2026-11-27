/**
 * Asteria Watcher Dice - visual recipe for the existing Open Dice 1.13 renderer.
 *
 * A Watcher die is a conventional, server-determined die with a visually
 * translucent PBR gel shell. The animated 3D eye is attached to the rendered
 * mesh by watcherEyeRig.mjs. No collider, RNG, face, score or roll history is
 * altered by the appearance.
 */
import {validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {CORE_DICE_TYPES} from './coreDiceDesigns.mjs';

export const WATCHER_IRIS_SWATCHES=Object.freeze([
  '#43AEC2','#247858','#295EA8','#D5B36A','#AE3241','#7947B2',
  '#C982A5','#E7F3FB','#C27B31','#B0E7EF','#F2F3EE','#61412F'
]);
export const WATCHER_SCLERA_SWATCHES=Object.freeze([
  '#E7F3FB','#F2F3EE','#111925','#B0E7EF','#D3DDE4','#C982A5'
]);
export const WATCHER_RESIN_SWATCHES=Object.freeze([
  '#7947B2','#111925','#43AEC2','#247858','#295EA8','#AE3241',
  '#C982A5','#B0E7EF','#D3DDE4','#F2F3EE','#D5B36A','#C27B31',
  '#9C7047','#162C53','#61412F','#304557'
]);
export const WATCHER_SWIRL_PRESETS=Object.freeze([
  'none','aurora','nebula','storm','opal','abyss'
]);
export const WATCHER_GEL_OPACITY=Object.freeze({
  solid:.83,subtle:.66,translucent:.48,clear:.32
});
export const WATCHER_GLOW=Object.freeze({off:0,subtle:.2,medium:.5,strong:.85});
const SWIRL_RECIPES=Object.freeze({
  none:Object.freeze({kind:'noise',contrast:.05,scale:3}),
  aurora:Object.freeze({kind:'veins',contrast:.22,scale:5}),
  nebula:Object.freeze({kind:'marble',contrast:.29,scale:7}),
  storm:Object.freeze({kind:'veins',contrast:.39,scale:9}),
  opal:Object.freeze({kind:'marble',contrast:.16,scale:4}),
  abyss:Object.freeze({kind:'noise',contrast:.24,scale:8})
});
const TRIM_MATERIAL=Object.freeze({
  none:'none',iron:'iron',steel:'iron',bronze:'bronze',
  silver:'silver',gold:'gold'
});
export function watcherVisualQuality({reducedMotion=false,deviceMemory=null,mobile=false,
  visibleDice=1}={}){
  const lite=mobile||deviceMemory!==null&&deviceMemory<=4||visibleDice>8;
  return Object.freeze({
    quality:lite?'balanced':'high',
    animated:!reducedMotion&&!lite,
    segments:lite?14:28,
    eyeLimit:lite?4:12,
    pointerTracking:!reducedMotion&&!lite
  });
}
export function buildWatcherDiceSet(appearance,{id='asteria-watcher',dieType}={}){
  const a=validateDiceAppearance(appearance);
  if(a.familyId!=='dice-watcher'||a.special?.kind!=='watcher')
    throw Error('Watcher Dice requires a validated Watcher appearance.');
  if(dieType!==undefined&&!CORE_DICE_TYPES.includes(dieType))
    throw Error('Unsupported Watcher die type.');
  if(!/^asteria-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw Error('Invalid Watcher dice set identifier.');
  const eye=a.special;
  const perDie=dieType?a.perDie[dieType]||{}:{};
  const numerals=perDie.numberColor||a.numberColor;
  const swirl=SWIRL_RECIPES[eye.swirl||'aurora'];
  return {
    id,name:'Watcher Dice',family:'glass',
    body:{
      color:eye.resinColor,depthColor:a.secondaryColor,
      roughness:eye.transparency==='solid'?.23:.10,
      metalness:0,clearcoat:1,clearcoatRoughness:.06,
      envMapIntensity:1.25,vignette:.4,
      texture:{...swirl,color2:a.secondaryColor,perFace:false},
      normalStrength:.12,
      ...(WATCHER_GLOW[eye.glow]>0
        ?{emissive:{color:eye.irisColor,intensity:WATCHER_GLOW[eye.glow]*.14}}:{})
    },
    edge:{metal:TRIM_MATERIAL[a.trim]},
    numeral:{
      font:'OpenDiceNumerals',style:'engraved',color:numerals,
      weight:800,scale:.95,
      outline:{color:'#111925',width:.082}
    },
    swatch:[eye.resinColor,eye.irisColor,numerals]
  };
}
/** Only official server records may inform a cosmetic eye reaction. */
export function watcherReactionForRecord(record){
  if(!record||record.source!=='server-digital')return 'none';
  if(record.natural==='natural-20')return 'success';
  if(record.natural==='natural-1')return 'failure';
  return 'none';
}
