/** Phase 3.1: versioned visual-only catalogue. No Firebase writes or gameplay effects. */
import {DICE_SIDES} from '../state/diceRollModel.mjs';
export const APPEARANCE_VERSION=1;
export const MAX_APPEARANCE_COLLECTIONS=20;
export const MATERIALS=Object.freeze(['obsidian','steel','bronze','gemstone','crystal','marble','wood','resin']);
export const FINISHES=Object.freeze(['matte','satin','polished','brushed','weathered']);
export const TRIMS=Object.freeze(['none','iron','steel','bronze','silver','gold']);
export const NUMBER_STYLES=Object.freeze(['classic','engraved','runic','modern','serif','gothic','geometric','celestial']);
export const PATTERNS=Object.freeze(['none','runes','filigree','knotwork','vines','stars','constellations','cracks','grain','waves','geometric','scales']);
export const SPECIAL_SYMBOLS=Object.freeze(['none','asteria-star','raven','wolf','dragon','moon','sun','sword','shield','leaf','eye','cat-paw']);
export const GLOW=Object.freeze(['off','subtle','medium','strong']);
export const WEAR=Object.freeze(['pristine','light','battle-worn','ancient']);
export const TRANSPARENCY=Object.freeze(['solid','subtle','translucent','clear']);
export const EYE_TYPES=Object.freeze(['human','feline','dragon','reptilian','eldritch','celestial']);
export const EYE_PUPILS=Object.freeze(['round','vertical-slit','horizontal-slit','diamond','eldritch']);
export const EYE_MOTION=Object.freeze(['off','subtle','normal','lively']);
export const BLINK=Object.freeze(['off','rare','normal','frequent']);
export const CAT_PATTERNS=Object.freeze(['solid','tabby','tuxedo','calico','tortoiseshell','spotted','colourpoint','bicolour']);
export const CAT_POSES=Object.freeze(['sitting','curled','stretching','walking','pouncing','alert','perched','portrait']);
export const PALETTE=Object.freeze(['#111925','#304557','#D3DDE4','#D5B36A','#9C7047','#F2F3EE','#AE3241','#295EA8','#247858','#7947B2','#43AEC2','#162C53','#B0E7EF','#C27B31','#C982A5','#61412F']);
const watcher=Object.freeze({kind:'watcher',eyeType:'eldritch',irisColor:'#43AEC2',scleraColor:'#F2F3EE',pupil:'vertical-slit',resinColor:'#7947B2',transparency:'translucent',glow:'subtle',motion:'subtle',blink:'normal',cursorTracking:false});
const familiar=Object.freeze({kind:'familiar',coatColor:'#111925',coatPattern:'solid',eyeColor:'#D5B36A',pose:'sitting',pawColor:'#111925',resinColor:'#F2F3EE',transparency:'clear',animation:false});
const rows=[
['dice-obsidian','Obsidian','obsidian','#111925','#304557','#B0E7EF'],
['dice-forged-steel','Forged Steel','steel','#304557','#385A76','#E7F3FB'],
['dice-sapphire','Sapphire','gemstone','#295EA8','#162C53','#D3DDE4'],
['dice-emerald','Emerald','gemstone','#247858','#111925','#D5B36A'],
['dice-ruby','Ruby','gemstone','#AE3241','#111925','#D5B36A'],
['dice-celestial','Celestial','marble','#F2F3EE','#D5B36A','#9C7047'],
['dice-infernal','Infernal','obsidian','#111925','#AE3241','#D5B36A'],
['dice-ancient-bronze','Ancient Bronze','bronze','#9C7047','#61412F','#F3E5C7'],
['dice-marble','Marble','marble','#F2F3EE','#304557','#304557'],
['dice-frost-crystal','Frost Crystal','crystal','#B0E7EF','#295EA8','#162C53'],
['dice-nature','Nature','wood','#61412F','#247858','#D5B36A'],
['dice-arcane','Arcane','crystal','#7947B2','#162C53','#F2F3EE'],
['dice-watcher','Watcher Dice','resin','#7947B2','#43AEC2','#E7F3FB'],
['dice-familiar','Familiar Dice','resin','#F2F3EE','#D5B36A','#D5B36A']
];
export const DICE_FAMILIES=Object.freeze(rows.map(([id,name,materialId,primaryColor,secondaryColor,numberColor],index)=>Object.freeze({id,name,materialId,primaryColor,secondaryColor,numberColor,tier:index<12?'core':'special'})));
const families=new Map(DICE_FAMILIES.map(x=>[x.id,x]));
export const TRAY_SLOTS=Object.freeze(Array.from({length:6},(_,i)=>Object.freeze({id:'tray-slot-'+(i+1),status:'reserved',design:null})));
export const TOWER_SLOTS=Object.freeze(Array.from({length:6},(_,i)=>Object.freeze({id:'tower-slot-'+(i+1),status:'reserved',design:null})));
export const getDiceFamily=id=>families.get(id)||null;
export function defaultDiceAppearance(id='dice-forged-steel'){
  const p=getDiceFamily(id);
  if(!p)throw Error('Unknown dice family.');
  return {version:APPEARANCE_VERSION,familyId:id,materialId:p.materialId,
    primaryColor:p.primaryColor,secondaryColor:p.secondaryColor,numberColor:p.numberColor,
    trim:'silver',finish:p.materialId==='wood'?'satin':'polished',
    numberStyle:'engraved',pattern:'none',specialSymbol:'none',
    glow:'off',wear:'pristine',perDie:{},
    special:id==='dice-watcher'?{...watcher}:id==='dice-familiar'?{...familiar}:null};
}
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
function object(x,label){if(!plain(x))throw Error(label+' must be a plain object.');}
function keys(x,allowed,label){if(Object.keys(x).some(k=>!allowed.includes(k)))throw Error('Unsupported '+label+' field.');}
const choose=(x,choices,label)=>{if(!choices.includes(x))throw Error('Invalid '+label+'.');return x;};
const hex=(x,label)=>{if(typeof x!=='string'||!/^#[0-9a-f]{6}$/i.test(x))throw Error('Invalid '+label+' HEX.');return x.toUpperCase();};
const specialFields={
 watcher:['kind','eyeType','irisColor','scleraColor','pupil','resinColor','transparency','glow','motion','blink','cursorTracking'],
 familiar:['kind','coatColor','coatPattern','eyeColor','pose','pawColor','resinColor','transparency','animation']
};
function validateSpecial(value,familyId){
  const kind=familyId==='dice-watcher'?'watcher':familyId==='dice-familiar'?'familiar':null;
  if(!kind){if(value!==null)throw Error('Core dice cannot have special settings.');return null;}
  object(value,'Special appearance');
  keys(value,specialFields[kind],'special appearance');
  if(specialFields[kind].some(k=>!(k in value))||value.kind!==kind)throw Error('Special appearance does not match family.');
  const v={...value};
  if(kind==='watcher'){
    choose(v.eyeType,EYE_TYPES,'eye type');choose(v.pupil,EYE_PUPILS,'pupil');choose(v.transparency,TRANSPARENCY,'transparency');
    choose(v.glow,GLOW,'eye glow');choose(v.motion,EYE_MOTION,'eye motion');choose(v.blink,BLINK,'blink');
    v.irisColor=hex(v.irisColor,'iris');v.scleraColor=hex(v.scleraColor,'sclera');v.resinColor=hex(v.resinColor,'resin');
    if(typeof v.cursorTracking!=='boolean')throw Error('Invalid cursor tracking.');
  }else{
    choose(v.coatPattern,CAT_PATTERNS,'cat coat');choose(v.pose,CAT_POSES,'cat pose');choose(v.transparency,TRANSPARENCY,'transparency');
    for(const k of ['coatColor','eyeColor','pawColor','resinColor'])v[k]=hex(v[k],k);
    if(typeof v.animation!=='boolean')throw Error('Invalid cat animation.');
  }
  return v;
}
export function validateDiceAppearance(value){
  object(value,'Dice appearance');
  if(JSON.stringify(value).length>16384)throw Error('Appearance too large.');
  const fields=['version','familyId','materialId','primaryColor','secondaryColor','numberColor',
    'trim','finish','numberStyle','pattern','specialSymbol','glow','wear','perDie','special'];
  keys(value,fields,'dice appearance');
  if(fields.some(k=>!(k in value))||value.version!==APPEARANCE_VERSION)throw Error('Unsupported or incomplete appearance version.');
  if(!getDiceFamily(value.familyId))throw Error('Unknown dice family.');
  const out={...value,materialId:choose(value.materialId,MATERIALS,'material'),
    trim:choose(value.trim,TRIMS,'trim'),finish:choose(value.finish,FINISHES,'finish'),
    numberStyle:choose(value.numberStyle,NUMBER_STYLES,'number style'),
    pattern:choose(value.pattern,PATTERNS,'pattern'),specialSymbol:choose(value.specialSymbol,SPECIAL_SYMBOLS,'symbol'),
    glow:choose(value.glow,GLOW,'glow'),wear:choose(value.wear,WEAR,'wear')};
  for(const k of ['primaryColor','secondaryColor','numberColor'])out[k]=hex(value[k],k);
  if(out.finish==='brushed'&&!['steel','bronze'].includes(out.materialId))throw Error('Brushed finish requires metal.');
  object(value.perDie,'Per-die appearance');out.perDie={};
  if(Object.keys(value.perDie).length>DICE_SIDES.length)throw Error('Too many die overrides.');
  for(const [die,v] of Object.entries(value.perDie)){
    if(!DICE_SIDES.some(n=>die==='d'+n))throw Error('Unknown die type.');
    object(v,'Die overrides');keys(v,['materialId','primaryColor','secondaryColor','numberColor'],'die override');
    if(!Object.keys(v).length)throw Error('Empty die override.');
    out.perDie[die]={};
    for(const [k,val] of Object.entries(v))
      out.perDie[die][k]=k==='materialId'?choose(val,MATERIALS,'die material'):hex(val,k);
  }
  out.special=validateSpecial(value.special,value.familyId);
  return out;
}
export function validateAppearanceCollection(value){
  object(value,'Collection');keys(value,['version','name','dice'],'collection');
  if(value.version!==APPEARANCE_VERSION||typeof value.name!=='string'||
    !value.name.trim()||value.name.trim().length>60)throw Error('Invalid collection.');
  return {version:APPEARANCE_VERSION,name:value.name.trim(),dice:validateDiceAppearance(value.dice)};
}
export function validateAppearanceCollections(values){
  if(!Array.isArray(values)||values.length>MAX_APPEARANCE_COLLECTIONS)throw Error('Too many appearance collections.');
  const list=values.map(validateAppearanceCollection);
  if(new Set(list.map(v=>v.name.toLowerCase())).size!==list.length)throw Error('Duplicate collection name.');
  return list;
}
