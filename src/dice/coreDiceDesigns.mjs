/**
 * Phase 3.2: Asteria's 12 core 3D designs, using Open Dice 1.13's public
 * registerDiceSet API. The engine paints 256px albedo, metallic/roughness,
 * normal-relief and optional emissive maps; all existing die meshes/physics
 * and server-result ordering remain unchanged.
 *
 * Watcher/Familiar are intentionally deferred to phases 3.3/3.4.
 */
import {DICE_FAMILIES,defaultDiceAppearance,validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {PBR_MATERIALS} from './diceMaterialEngine.mjs';

export const CORE_DICE_FAMILIES=Object.freeze(
  DICE_FAMILIES.filter(family=>family.tier==='core'));

export const CORE_DESIGN_RECIPES=Object.freeze({
  'dice-obsidian':Object.freeze({
    texture:'veins',scale:6,contrast:.22,detail:'frame',
    description:'Polished volcanic glass with cool mineral striations and silver edging.'
  }),
  'dice-forged-steel':Object.freeze({
    texture:'noise',scale:10,contrast:.18,detail:'frame',
    description:'Brushed gunmetal with fine machining texture and engraved numerals.'
  }),
  'dice-sapphire':Object.freeze({
    texture:'marble',scale:5,contrast:.2,detail:'corners',
    description:'Deep sapphire-like gemstone with glossy optical depth and silver trim.'
  }),
  'dice-emerald':Object.freeze({
    texture:'veins',scale:5,contrast:.24,detail:'filigree',
    description:'Verdant gem-style body with mineral veining and gold filigree.'
  }),
  'dice-ruby':Object.freeze({
    texture:'marble',scale:6,contrast:.24,detail:'filigree',
    description:'Crimson jewel-style die with warm bronze ornamentation.'
  }),
  'dice-celestial':Object.freeze({
    texture:'marble',scale:5,contrast:.15,detail:'filigree',
    description:'White veined stone, luminous gold details and celestial-style borders.'
  }),
  'dice-infernal':Object.freeze({
    texture:'veins',scale:8,contrast:.55,detail:'frame',
    description:'Dark volcanic glass with ember-coloured veins and dark iron edging.'
  }),
  'dice-ancient-bronze':Object.freeze({
    texture:'noise',scale:9,contrast:.4,detail:'knotwork',
    description:'Aged patinated bronze with raised carved details and worn edges.'
  }),
  'dice-marble':Object.freeze({
    texture:'marble',scale:7,contrast:.43,detail:'frame',
    description:'Polished marble, flowing veins and restrained silver detailing.'
  }),
  'dice-frost-crystal':Object.freeze({
    texture:'veins',scale:8,contrast:.23,detail:'corners',
    description:'Frosted crystal style with pale icy fissures and cool highlights.'
  }),
  'dice-nature':Object.freeze({
    texture:'marble',scale:11,contrast:.38,detail:'vines',
    description:'Carved dark wood grain, branching vines and bronze trim.'
  }),
  'dice-arcane':Object.freeze({
    texture:'circuit',scale:6,contrast:.48,detail:'knotwork',
    description:'Violet glass-like material with faint luminous etched traces.'
  })
});

export const CORE_DICE_TYPES=Object.freeze(['d4','d6','d8','d10','d12','d20','d100']);
const ENGINE_METAL=Object.freeze({
  none:'none',iron:'iron',steel:'iron',bronze:'bronze',silver:'silver',gold:'gold'
});
const FINISH_ROUGHNESS=Object.freeze({
  matte:.75,satin:.45,polished:.14,brushed:.38,weathered:.66
});
const GLOW_INTENSITY=Object.freeze({off:0,subtle:.16,medium:.38,strong:.7});
const FONT=Object.freeze({
  classic:'OpenDiceNumerals',
  engraved:'OpenDiceNumerals',
  runic:'Georgia',
  modern:'OpenDiceMono',
  serif:'Georgia',
  gothic:'Impact',
  geometric:'Trebuchet MS',
  celestial:'OpenDiceNumerals'
});
const DETAIL=Object.freeze({
  none:null,runes:'knotwork',filigree:'filigree',knotwork:'knotwork',
  vines:'vines',stars:'corners',constellations:'corners',cracks:'frame',
  grain:'frame',waves:'frame',geometric:'frame',scales:'corners'
});

function contrast(hex){
  const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  return channels.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
    .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
}
export function coreNumeralContrast(appearance){
  const chosen=validateDiceAppearance(appearance);
  const a=contrast(chosen.primaryColor),b=contrast(chosen.numberColor);
  return Math.round(((Math.max(a,b)+.05)/(Math.min(a,b)+.05))*100)/100;
}
function colorsFor(appearance,dieType){
  const chosen=validateDiceAppearance(appearance);
  const override=dieType?chosen.perDie[dieType]||{}:{};
  return {...chosen,...override};
}
function textureFor(chosen,recipe){
  if(recipe.texture==='circuit')return {
    kind:'circuit',color2:chosen.secondaryColor,density:32,grid:12,
    contrast:recipe.contrast,scale:recipe.scale,perFace:false
  };
  return {
    kind:recipe.texture,color2:chosen.secondaryColor,scale:recipe.scale,
    contrast:recipe.contrast,perFace:recipe.texture==='marble'
  };
}
function detailFor(chosen,recipe){
  const art=chosen.pattern==='none'?recipe.detail:DETAIL[chosen.pattern];
  if(!art)return undefined;
  return [{art,metal:ENGINE_METAL[chosen.trim]!=='none'?ENGINE_METAL[chosen.trim]:'silver',
    relief:chosen.wear==='ancient'?.35:.56,scale:.86}];
}
function normalOutline(chosen){
  // Support numerals on mottled/light textures without replacing a player's
  // chosen numeral colour. Outlines do not change any die face values.
  return {color:contrast(chosen.primaryColor)>.46?'#111925':'#F4F5F2',width:.055};
}

/**
 * Produce a library-validated PBR dice set definition.
 * \`id\` is controlled by the host; runtime registration is in the 3D viewer.
 * The returned object is independent of Firebase and no rolls are generated.
 */
export function buildAsteriaCoreDiceSet(appearance,options={}){
  const checked=validateDiceAppearance(appearance);
  const family=CORE_DICE_FAMILIES.find(row=>row.id===checked.familyId);
  if(!family)throw Error('This dice design is not a Phase 3.2 core family.');
  const dieType=options.dieType||null;
  if(dieType!==null&&!CORE_DICE_TYPES.includes(dieType))
    throw Error('Invalid dice type in core design.');
  const setId=options.id||checked.familyId.replace(/^dice-/,'asteria-');
  if(!/^asteria-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(setId))
    throw Error('Invalid Asteria dice set identifier.');
  const chosen=colorsFor(checked,dieType);
  const pbr=PBR_MATERIALS[chosen.materialId];
  const recipe=CORE_DESIGN_RECIPES[checked.familyId];
  const physicalFamily=['steel','bronze'].includes(chosen.materialId)?'metal':
    chosen.materialId==='wood'||chosen.materialId==='marble'?'textured':
      chosen.materialId==='gemstone'?'gem':'glass';
  const finish=FINISH_ROUGHNESS[chosen.finish];
  const roughness=chosen.finish==='polished'?Math.min(pbr.roughness,finish):
    chosen.finish==='satin'?Math.max(pbr.roughness,.31):
    chosen.finish==='brushed'?Math.max(pbr.roughness,finish):
    chosen.finish==='weathered'?Math.max(pbr.roughness,finish):Math.max(pbr.roughness,finish);
  const edgeMetal=ENGINE_METAL[chosen.trim];
  const glow=GLOW_INTENSITY[chosen.glow];
  // The body gets procedural albedo, normal relief and metal/roughness maps
  // from the Open Dice PBR painter. These are not merely flat CSS colours.
  const body={
    color:chosen.primaryColor,
    depthColor:chosen.secondaryColor,
    roughness,
    metalness:pbr.metalness,
    clearcoat:pbr.clearcoat,
    clearcoatRoughness:Math.min(.6,pbr.roughness),
    envMapIntensity:['metal','gem'].includes(physicalFamily)?1.35:1.05,
    vignette:physicalFamily==='glass'||physicalFamily==='gem'?.76:.16,
    texture:textureFor(chosen,recipe),
    normalStrength:.28
  };
  if(glow>0)body.emissive={color:chosen.secondaryColor,intensity:glow};
  const style=chosen.numberStyle==='modern'||chosen.numberStyle==='geometric'?'flat':
    chosen.numberStyle==='celestial'?'glow':'engraved';
  const numeral={
    font:FONT[chosen.numberStyle],color:chosen.numberColor,
    style,weight:chosen.numberStyle==='gothic'?900:700,
    scale:chosen.numberStyle==='geometric'?.9:.96,
    outline:normalOutline(chosen)
  };
  if(style==='glow')numeral.glow={color:chosen.numberColor,intensity:Math.max(.28,glow)};
  const decor=detailFor(chosen,recipe);
  const set={
    id:setId,name:family.name,family:physicalFamily,
    body,edge:{metal:edgeMetal},numeral,
    ...(decor?{decor}:{}),
    // All natural-1/20 symbols are deferred to a future opt-in, because
    // replacing critical numerals would make the official values hard to read.
    swatch:[chosen.primaryColor,chosen.secondaryColor,chosen.numberColor]
  };
  return set;
}

export function coreDefaultSetDefinitions(){
  return CORE_DICE_FAMILIES.map(family=>
    buildAsteriaCoreDiceSet(defaultDiceAppearance(family.id)));
}
