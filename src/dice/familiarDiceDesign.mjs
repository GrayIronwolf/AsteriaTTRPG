/**
 * Phase 3.3 Familiar Dice: a real PBR glass/resin die with original cat-themed
 * artwork painted into Open Dice's face albedo. Keeps standard die geometry,
 * face values, collision and server-authoritative results unchanged.
 */
import {validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {familiarArtworkDataUrl} from './familiarDiceArt.mjs';
import {CORE_DICE_TYPES} from './coreDiceDesigns.mjs';

export const FAMILIAR_RESIN_OPACITY=Object.freeze({
  solid:1,subtle:.9,translucent:.7,clear:.52
});
const ROUGHNESS=Object.freeze({solid:.27,subtle:.2,translucent:.14,clear:.095});
/**
 * Transparent-looking PBR painted resin. Open Dice classic dice set renderer
 * does not offer physically refractive transmission for this texture pipeline.
 * Keep cat artwork and numbers legible instead of claiming a real gel volume.
 */
export function buildFamiliarDiceSet(appearance,options={}){
  const config=validateDiceAppearance(appearance);
  if(config.familyId!=='dice-familiar'||config.special?.kind!=='familiar')
    throw Error('Only Familiar Dice appearances are accepted.');
  const dieType=options.dieType||null;
  if(dieType!==null&&!CORE_DICE_TYPES.includes(dieType))
    throw Error('Unsupported Familiar die type.');
  const id=options.id||'asteria-familiar';
  if(!/^asteria-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw Error('Invalid Familiar dice set id.');
  const override=dieType?config.perDie[dieType]||{}:{};
  const color=override.numberColor||config.numberColor;
  const cat=config.special;
  const resin=cat.resinColor;
  const opacity=FAMILIAR_RESIN_OPACITY[cat.transparency];
  const image=familiarArtworkDataUrl(cat,color);
  return {
    id,name:'Familiar Dice',family:'glass',
    body:{
      color:resin,depthColor:config.secondaryColor,
      // The artwork is precomposed and used as an albedo image in the
      // existing Open Dice painter. Vignette, normals and reflections remain.
      image:{src:image,fit:'cover',scale:1},
      roughness:ROUGHNESS[cat.transparency],
      metalness:0,clearcoat:.96,clearcoatRoughness:.08,
      envMapIntensity:1.2,vignette:.43*opacity,
      // A subtle resin texture underneath the image acts as a safe fallback.
      texture:{kind:'marble',color2:config.secondaryColor,scale:4,
        contrast:.11,perFace:false},
      normalStrength:.12
    },
    edge:{metal:config.trim==='gold'?'gold':
      config.trim==='silver'?'silver':
      config.trim==='bronze'?'bronze':
      config.trim==='iron'||config.trim==='steel'?'iron':'none'},
    numeral:{
      color,style:'engraved',font:'OpenDiceNumerals',weight:800,
      scale:.94,
      // A contrasting outline ensures readable numbers on light coats.
      outline:{color:color.toUpperCase()==='#111925'?'#F2F3EE':'#111925',width:.075}
    },
    swatch:[resin,cat.coatColor,color]
  };
}
export function familiarVisualAnimationAllowed(appearance,reducedMotion=false){
  const config=validateDiceAppearance(appearance);
  return config.familyId==='dice-familiar'&&Boolean(config.special?.animation)&&!reducedMotion;
}
