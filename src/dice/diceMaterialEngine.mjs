/** Data-driven physically based material settings, Phase 3.1.
 * No mesh textures are bundled yet. Actual shaders/art assets belong to 3.2+.
 */
import {MATERIALS,defaultDiceAppearance,validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
export const PBR_MATERIALS=Object.freeze({
  obsidian:Object.freeze({metalness:0.02,roughness:0.13,transmission:0,ior:1.49,clearcoat:0.78}),
  steel:Object.freeze({metalness:0.92,roughness:0.33,transmission:0,ior:1.45,clearcoat:0.06}),
  bronze:Object.freeze({metalness:0.88,roughness:0.42,transmission:0,ior:1.47,clearcoat:0.05}),
  gemstone:Object.freeze({metalness:0,roughness:0.09,transmission:0.82,ior:1.74,clearcoat:0.62}),
  crystal:Object.freeze({metalness:0,roughness:0.07,transmission:0.86,ior:1.54,clearcoat:0.62}),
  marble:Object.freeze({metalness:0.01,roughness:0.28,transmission:0,ior:1.48,clearcoat:0.18}),
  wood:Object.freeze({metalness:0,roughness:0.68,transmission:0,ior:1.48,clearcoat:0.04}),
  resin:Object.freeze({metalness:0,roughness:0.12,transmission:0.72,ior:1.51,clearcoat:0.68})
});
export const PBR_TEXTURE_CHANNELS=Object.freeze(['baseColor','normal','roughness','metalness','ambientOcclusion']);
export const PBR_ART_ASSET_STATUS='not-yet-built';
export const LEGACY_DICE_STYLE=Object.freeze({diceColor:0x23374b,textColor:'#e7f3fb',backgroundColor:'#385a76'});
const hexNumber=x=>Number.parseInt(x.slice(1),16);
function resolve(value,dieSides){
  const config=validateDiceAppearance(value);
  const overrides=dieSides===undefined?{}:config.perDie['d'+dieSides]||{};
  return {...config,...overrides};
}
export function resolvePbrMaterial(value,dieSides){
  const chosen=resolve(value,dieSides);
  if(!MATERIALS.includes(chosen.materialId))throw Error('Invalid material ID.');
  return {
    materialId:chosen.materialId,color:chosen.primaryColor,
    ...PBR_MATERIALS[chosen.materialId],
    textureChannels:Object.fromEntries(PBR_TEXTURE_CHANNELS.map(key=>[key,null])),
    textureStatus:PBR_ART_ASSET_STATUS,
    shaderIntegration:'planned'
  };
}
/** Current Open Dice supports palette colours; PBR fields need custom shader work. */
export function openDiceAppearanceOptions(value=null,dieSides){
  if(value===null)return {...LEGACY_DICE_STYLE};
  const chosen=resolve(value,dieSides);
  return {
    diceColor:hexNumber(chosen.primaryColor),
    textColor:chosen.numberColor.toLowerCase(),
    backgroundColor:chosen.secondaryColor.toLowerCase()
  };
}
export function defaultOpenDiceAppearance(dieSides){
  return openDiceAppearanceOptions(defaultDiceAppearance(),dieSides);
}
