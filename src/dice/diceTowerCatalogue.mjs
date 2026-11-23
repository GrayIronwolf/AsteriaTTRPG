/**
 * Phase 3.9 — one validated, local-only appearance schema for six physical towers.
 * Tower customisation is deliberately NOT added to Phase 3.7 Firestore collections
 * until the final safety/permission migration is approved.
 */
import {TRAY_FRAME_MATERIALS,TRAY_COLORS,TRAY_WEAR,TRAY_SOUNDS,
 TRAY_EMBLEMS,TRAY_ENGRAVINGS,TRAY_FAMILIES,validateDiceTrayAppearance,
 defaultDiceTrayAppearance} from './diceTrayCatalogue.mjs';

export const TOWER_SCHEMA_VERSION=1;
export const TOWER_VARIATIONS=Object.freeze(['standard','detailed','grand']);
export const TOWER_MATERIALS=TRAY_FRAME_MATERIALS;
export const TOWER_COLORS=TRAY_COLORS;
export const TOWER_TRIMS=Object.freeze(['plain','bevelled','engraved','riveted',
 'gilded','filigree','organic','crystal']);
export const TOWER_MOTIFS=Object.freeze(['none',...TRAY_ENGRAVINGS.filter(x=>x!=='none'),
 ...TRAY_EMBLEMS.filter(x=>x!=='none').slice(0,4)]);
export const TOWER_LIGHTING=Object.freeze(['off','torch','arcane','forge','woodland','celestial']);
export const TOWER_WEAR=TRAY_WEAR;
export const TOWER_SOUNDS=TRAY_SOUNDS;
export const TOWER_QUALITY=Object.freeze(['performance','balanced','high']);
export const TOWER_MAX_VISIBLE_DICE=6;
export const TOWER_MAX_APPEARANCE_BYTES=3200;
export const TOWER_FAMILIES=Object.freeze([
 Object.freeze({id:'tower-castle',name:'Castle Tower',style:'castle',
  description:'Fortified stone battlements and a real arched exit',
  baseMaterial:'stone',accentMaterial:'iron',
  baseColor:'#55677B',accentColor:'#BDA06A',glowColor:'#D9A75B',
  lighting:'torch',trim:'bevelled',motif:'geometric',pairedTray:'obsidian-hexagon'}),
 Object.freeze({id:'tower-dragon',name:'Dragon Tower',style:'dragon',
  description:'Scaled dragon, curved wings, horned head and mouth-shaped portal',
  baseMaterial:'stone',accentMaterial:'bronze',
  baseColor:'#47383A',accentColor:'#AE7040',glowColor:'#E97944',
  lighting:'torch',trim:'engraved',motif:'scales',pairedTray:'knights-iron'}),
 Object.freeze({id:'tower-wizard',name:'Wizard Tower',style:'wizard',
  description:'Arcane spire with glowing rune windows and a pointed roof',
  baseMaterial:'stone',accentMaterial:'silver',
  baseColor:'#32364D',accentColor:'#A8A6C2',glowColor:'#8F67F0',
  lighting:'arcane',trim:'filigree',motif:'runes',pairedTray:'arcane-circle'}),
 Object.freeze({id:'tower-dwarven-forge',name:'Dwarven Forge',style:'forge',
  description:'Riveted iron and carved stone with gears and molten forge detailing',
  baseMaterial:'iron',accentMaterial:'bronze',
  baseColor:'#43494F',accentColor:'#BE8644',glowColor:'#FF8F43',
  lighting:'forge',trim:'riveted',motif:'geometric',pairedTray:'knights-iron'}),
 Object.freeze({id:'tower-nature',name:'Nature Tower',style:'nature',
  description:'A hollow ancient tree with branch railings and a root exit',
  baseMaterial:'walnut',accentMaterial:'bronze',
  baseColor:'#51402B',accentColor:'#678357',glowColor:'#80D499',
  lighting:'woodland',trim:'organic',motif:'vines',pairedTray:'hunters-leather'}),
 Object.freeze({id:'tower-celestial',name:'Celestial Tower',style:'celestial',
  description:'Pale marble columns, luminous suspended crystal and gold arches',
  baseMaterial:'stone',accentMaterial:'gold',
  baseColor:'#D3DDE4',accentColor:'#D5B36A',glowColor:'#B0E7EF',
  lighting:'celestial',trim:'gilded',motif:'stars',pairedTray:'royal-marble'})
]);
const byId=new Map(TOWER_FAMILIES.map(x=>[x.id,x]));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const fields=Object.freeze(['version','designId','variation','baseMaterial','accentMaterial',
 'baseColor','accentColor','glowColor','trim','motif','lighting','wear','sound',
 'pairedTray','quality']);
const enumField=(v,ids,k)=>{if(typeof v!=='string'||!ids.includes(v))throw Error('Invalid tower '+k);return v;};
const color=(v,k)=>{
 if(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v))throw Error('Invalid tower '+k+' HEX');
 return v.toUpperCase();
};
export function getDiceTowerFamily(id){return byId.get(id)||null;}
export function defaultDiceTowerAppearance(id='tower-castle'){
 const f=getDiceTowerFamily(id);
 if(!f)throw Error('Unknown dice tower.');
 return {version:TOWER_SCHEMA_VERSION,designId:id,variation:'standard',
  baseMaterial:f.baseMaterial,accentMaterial:f.accentMaterial,
  baseColor:f.baseColor,accentColor:f.accentColor,glowColor:f.glowColor,
  trim:f.trim,motif:f.motif,lighting:f.lighting,
  wear:'pristine',sound:'stone',pairedTray:f.pairedTray,quality:'balanced'};
}
export function validateDiceTowerAppearance(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
   ![Object.prototype,null].includes(Object.getPrototypeOf(value)))
   throw Error('Dice tower appearance must be a plain object.');
 const keys=Object.keys(value);
 if(keys.some(k=>!fields.includes(k))||fields.some(k=>!own(value,k))||
   JSON.stringify(value).length>TOWER_MAX_APPEARANCE_BYTES)
   throw Error('Tower appearance has unsupported, missing or oversized settings.');
 if(value.version!==TOWER_SCHEMA_VERSION)throw Error('Unsupported tower appearance version.');
 if(!byId.has(value.designId))throw Error('Unknown dice tower.');
 return {
  version:TOWER_SCHEMA_VERSION,designId:value.designId,
  variation:enumField(value.variation,TOWER_VARIATIONS,'variation'),
  baseMaterial:enumField(value.baseMaterial,TOWER_MATERIALS,'base material'),
  accentMaterial:enumField(value.accentMaterial,TOWER_MATERIALS,'accent material'),
  baseColor:color(value.baseColor,'base colour'),
  accentColor:color(value.accentColor,'accent colour'),
  glowColor:color(value.glowColor,'glow colour'),
  trim:enumField(value.trim,TOWER_TRIMS,'trim'),
  motif:enumField(value.motif,TOWER_MOTIFS,'motif'),
  lighting:enumField(value.lighting,TOWER_LIGHTING,'lighting'),
  wear:enumField(value.wear,TOWER_WEAR,'wear'),
  sound:enumField(value.sound,TOWER_SOUNDS,'impact sound'),
  pairedTray:enumField(value.pairedTray,TRAY_FAMILIES.map(x=>x.id),'paired tray'),
  quality:enumField(value.quality,TOWER_QUALITY,'quality')
 };
}
export function pairedDiceTrayForTower(tower){
 const a=validateDiceTowerAppearance(tower);
 return validateDiceTrayAppearance(defaultDiceTrayAppearance(a.pairedTray));
}
