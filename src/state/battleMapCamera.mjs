const exactKeys=['mode','x','y','zoom'];
export const DEFAULT_BATTLE_MAP_CAMERA=Object.freeze({mode:'manual',x:50,y:50,zoom:1});

export function validateBattleMapCamera(value){
  if(!value||Array.isArray(value)||typeof value!=='object'||
    Object.keys(value).some(key=>!exactKeys.includes(key))||
    !['manual','follow'].includes(value.mode)||
    !Number.isFinite(value.x)||value.x<0||value.x>100||
    !Number.isFinite(value.y)||value.y<0||value.y>100||
    !Number.isFinite(value.zoom)||value.zoom<1||value.zoom>4)
    throw Error('Choose a valid battle map camera.');
  return {mode:value.mode,x:value.x,y:value.y,zoom:value.zoom};
}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function battleMapCameraView(camera=DEFAULT_BATTLE_MAP_CAMERA,map={}){
  const {mode,x,y,zoom}=camera;
  const target=mode==='follow'?(map.tokens||[]).find(token=>token.id===map.activeTokenId):null;
  const margin=50/zoom;
  return {zoom,x:clamp(target?.x??x,margin,100-margin),
    y:clamp(target?.y??y,margin,100-margin)};
}
export function encounterMapLink(encounter,map){
  return Boolean(encounter?.status==='active'&&encounter.combat?.version===1&&
    encounter.combatId&&encounter.battleMapId===map?.id&&map?.combatId===encounter.combatId);
}
