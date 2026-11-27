/**
 * Phase 3.5: the six owner-approved tray designs. Pure visual/physical
 * configuration; never submitted as a dice result or to Firebase.
 * The shape belongs to the design; finish, dimensions and detail are editable.
 */
export const TRAY_SCHEMA_VERSION=1;
export const TRAY_FAMILIES=Object.freeze([
  Object.freeze({id:'obsidian-hexagon',name:'Obsidian Hexagon',shape:'hexagon',frameMaterial:'gunmetal-steel',
    interiorMaterial:'velvet',frameColor:'#111925',interiorColor:'#242832',trimColor:'#8A9FAF',
    rim:'bevelled',engraving:'none',emblem:'asteria-star',lighting:'subtle',sound:'felt'}),
  Object.freeze({id:'walnut-octagon',name:'Walnut Octagon',shape:'octagon',frameMaterial:'walnut',
    interiorMaterial:'felt',frameColor:'#61412F',interiorColor:'#195037',trimColor:'#B07A3A',
    rim:'smooth',engraving:'knotwork',emblem:'none',lighting:'off',sound:'felt'}),
  Object.freeze({id:'knights-iron',name:"Knight's Iron Tray",shape:'rectangle',frameMaterial:'iron',
    interiorMaterial:'leather',frameColor:'#353C47',interiorColor:'#503A2C',trimColor:'#8C8D91',
    rim:'forged',engraving:'geometric',emblem:'shield',lighting:'off',sound:'leather'}),
  Object.freeze({id:'arcane-circle',name:'Arcane Circle',shape:'circle',frameMaterial:'stone',
    interiorMaterial:'velvet',frameColor:'#353248',interiorColor:'#1C2549',trimColor:'#9677C0',
    rim:'carved',engraving:'runes',emblem:'moon',lighting:'subtle',sound:'magical'}),
  Object.freeze({id:'royal-marble',name:'Royal Marble Square',shape:'square',frameMaterial:'stone',
    interiorMaterial:'velvet',frameColor:'#E8E8E2',interiorColor:'#602537',trimColor:'#D5B36A',
    rim:'bevelled',engraving:'filigree',emblem:'sun',lighting:'off',sound:'felt'}),
  Object.freeze({id:'hunters-leather',name:"Hunter's Leather Oval",shape:'oval',frameMaterial:'walnut',
    interiorMaterial:'suede',frameColor:'#553A2C',interiorColor:'#556343',trimColor:'#977D55',
    rim:'smooth',engraving:'vines',emblem:'leaf',lighting:'off',sound:'suede'})
]);
export const TRAY_SIZE_IDS=Object.freeze(['compact','standard','expanded']);
export const TRAY_WALL_HEIGHT_IDS=Object.freeze(['low','medium','high']);
export const TRAY_FRAME_MATERIALS=Object.freeze(['iron','gunmetal-steel','polished-steel',
  'bronze','silver','gold','walnut','stone']);
export const TRAY_INTERIOR_MATERIALS=Object.freeze(['velvet','felt','suede','leather',
  'wood','slate','marble','obsidian']);
export const TRAY_RIM_PROFILES=Object.freeze(['smooth','bevelled','forged','carved']);
export const TRAY_ENGRAVINGS=Object.freeze(['none','runes','filigree','knotwork','vines',
  'stars','geometric','scales']);
export const TRAY_EMBLEMS=Object.freeze(['none','asteria-star','raven','wolf','dragon','moon',
  'sun','sword','shield','leaf','crown','compass']);
export const TRAY_LIGHTING=Object.freeze(['off','subtle','medium','strong']);
export const TRAY_WEAR=Object.freeze(['pristine','lightly-worn','battle-worn','ancient']);
export const TRAY_SOUNDS=Object.freeze(['off','felt','leather','wood','stone','metal','magical']);
// Suede is an additional distinct material preset. Its impact profile is the
// same soft, muted leather/felt family and therefore maps to a supported sound.
export const TRAY_SOUND_LEVELS=Object.freeze(['low','medium','high']);
export const TRAY_COLORS=Object.freeze(['#111925','#304557','#D3DDE4','#D5B36A',
  '#9C7047','#F2F3EE','#AE3241','#295EA8','#247858','#7947B2',
  '#43AEC2','#162C53','#B0E7EF','#C27B31','#C982A5','#61412F']);
export const TRAY_MAX_SERIALIZED_BYTES=4096;
export const TRAY_OPTION_KEYS=Object.freeze(['version','designId','size','wallHeight',
  'frameMaterial','interiorMaterial','frameColor','interiorColor','trimColor','rim',
  'engraving','emblem','lighting','wear','sound','soundVolume']);
const byId=new Map(TRAY_FAMILIES.map(x=>[x.id,x]));
export const getDiceTrayFamily=id=>byId.get(id)||null;
export function defaultDiceTrayAppearance(designId='obsidian-hexagon'){
  const x=getDiceTrayFamily(designId);
  if(!x)throw Error('Unknown tray design.');
  return {version:TRAY_SCHEMA_VERSION,designId,size:'standard',wallHeight:'medium',
    frameMaterial:x.frameMaterial,interiorMaterial:x.interiorMaterial,
    frameColor:x.frameColor,interiorColor:x.interiorColor,trimColor:x.trimColor,
    rim:x.rim,engraving:x.engraving,emblem:x.emblem,lighting:x.lighting,
    wear:'pristine',sound:x.sound==='suede'?'leather':x.sound,soundVolume:'medium'};
}
function enumValue(value,options,name){
  if(typeof value!=='string'||!options.includes(value))throw Error('Invalid '+name);
  return value;
}
const color=(v,k)=>{
  if(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v))throw Error(k+' requires six-digit HEX.');
  return v.toUpperCase();
};
export function validateDiceTrayAppearance(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value)))
    throw Error('Tray appearance must be a plain object.');
  const keys=Object.keys(value);
  if(keys.some(key=>!TRAY_OPTION_KEYS.includes(key))||
    TRAY_OPTION_KEYS.some(key=>!(key in value))||
    JSON.stringify(value).length>TRAY_MAX_SERIALIZED_BYTES)
    throw Error('Tray appearance has unsupported, missing or oversized settings.');
  if(value.version!==TRAY_SCHEMA_VERSION)throw Error('Unsupported tray appearance version.');
  if(!byId.has(value.designId))throw Error('Unknown tray design.');
  return {version:TRAY_SCHEMA_VERSION,designId:value.designId,
    size:enumValue(value.size,TRAY_SIZE_IDS,'tray size'),
    wallHeight:enumValue(value.wallHeight,TRAY_WALL_HEIGHT_IDS,'wall height'),
    frameMaterial:enumValue(value.frameMaterial,TRAY_FRAME_MATERIALS,'frame material'),
    interiorMaterial:enumValue(value.interiorMaterial,TRAY_INTERIOR_MATERIALS,'interior material'),
    frameColor:color(value.frameColor,'Frame colour'),
    interiorColor:color(value.interiorColor,'Interior colour'),
    trimColor:color(value.trimColor,'Trim colour'),
    rim:enumValue(value.rim,TRAY_RIM_PROFILES,'rim'),
    engraving:enumValue(value.engraving,TRAY_ENGRAVINGS,'engraving'),
    emblem:enumValue(value.emblem,TRAY_EMBLEMS,'emblem'),
    lighting:enumValue(value.lighting,TRAY_LIGHTING,'lighting'),
    wear:enumValue(value.wear,TRAY_WEAR,'wear'),
    sound:enumValue(value.sound,TRAY_SOUNDS,'sound'),
    soundVolume:enumValue(value.soundVolume,TRAY_SOUND_LEVELS,'volume')};
}
