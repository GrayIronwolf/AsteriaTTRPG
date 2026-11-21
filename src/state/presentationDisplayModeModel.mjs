/**
 * Improvement 6: presentation display *preferences*, never publication settings.
 * The renderer and authorization service remain the sole source of visible data.
 */
export const DISPLAY_MODE_PRESETS=Object.freeze({
  'tabletop-tv':Object.freeze({label:'Tabletop TV',scale:115,
    showOverlay:false,cleanFullscreen:true}),
  projector:Object.freeze({label:'Projector',scale:135,
    showOverlay:false,cleanFullscreen:true}),
  'remote-desktop':Object.freeze({label:'Remote Desktop',scale:100,
    showOverlay:true,cleanFullscreen:false}),
  mobile:Object.freeze({label:'Mobile Player',scale:100,
    showOverlay:true,cleanFullscreen:false})
});
export const DISPLAY_MODE_IDS=Object.freeze(Object.keys(DISPLAY_MODE_PRESETS));
export const DISPLAY_SCALE_MIN=75;
export const DISPLAY_SCALE_MAX=150;
const validScope=value=>value==='member'||value==='restricted';
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
export const validDisplayPreset=value=>DISPLAY_MODE_IDS.includes(value);

export function defaultDisplayPreferences(preset='tabletop-tv'){
  const id=validDisplayPreset(preset)?preset:'tabletop-tv';
  const {scale,showOverlay,cleanFullscreen}=DISPLAY_MODE_PRESETS[id];
  return {version:1,preset:id,scale,showOverlay,cleanFullscreen};
}
export function validateDisplayPreferences(value,fallback='tabletop-tv'){
  if(!record(value)||value.version!==1||
    Object.keys(value).some(key=>![
      'version','preset','scale','showOverlay','cleanFullscreen'
    ].includes(key))||!validDisplayPreset(value.preset)||
    !Number.isInteger(value.scale)||value.scale<DISPLAY_SCALE_MIN||
    value.scale>DISPLAY_SCALE_MAX||value.scale%5!==0||
    typeof value.showOverlay!=='boolean'||typeof value.cleanFullscreen!=='boolean')
    return defaultDisplayPreferences(fallback);
  return {version:1,preset:value.preset,scale:value.scale,
    showOverlay:value.showOverlay,cleanFullscreen:value.cleanFullscreen};
}
export function applyDisplayPreference(state,field,value){
  const previous=validateDisplayPreferences(state);
  if(field==='preset')return validDisplayPreset(value)
    ?defaultDisplayPreferences(value):previous;
  if(field==='scale'&&Number.isInteger(value)&&value>=DISPLAY_SCALE_MIN&&
    value<=DISPLAY_SCALE_MAX&&value%5===0)
    return {...previous,scale:value};
  if(['showOverlay','cleanFullscreen'].includes(field)&&typeof value==='boolean')
    return {...previous,[field]:value};
  return previous;
}
export function displayPreferencesKey(uid,campaignId,scope){
  if(!validId(uid)||!validId(campaignId)||!validScope(scope))return '';
  return 'asteria-presentation-display-v1:'+encodeURIComponent(scope)+':'+
    encodeURIComponent(uid)+':'+encodeURIComponent(campaignId);
}
/** Fixed labels only; do not feed GM-authored, unpublished or unknown fields. */
const SAFE_SCENE_LABELS=Object.freeze({
  blank:'Blackout',title:'Title',announcement:'Announcement',
  'battle-map':'Battle Map','world-map':'World Map',combat:'Combat',
  party:'Party',image:'Image',cinematic:'Video',handout:'Handout'
});
export function approvedSceneLabel(scene){
  return typeof scene==='string'&&Object.hasOwn(SAFE_SCENE_LABELS,scene)
    ?SAFE_SCENE_LABELS[scene]:'Presentation';
}
