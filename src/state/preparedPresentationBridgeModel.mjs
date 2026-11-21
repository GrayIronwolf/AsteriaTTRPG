import {previewPreparedEncounterLoad} from './preparedEncounterLoadModel.mjs';
import {presentationDraft,PRESENTATION_THEMES} from './playerPresentationModel.mjs';

/**
 * Improvement 4: read-only bridge from existing private combat templates to
 * the already-authorized player presentation system. Never pass private enemy,
 * wave, note or map source records into a public presentation payload.
 */
export function reviewPreparedEncounterForStudio(plan,gmSnapshot){
  const combat=gmSnapshot?.combat||null;
  const maps=gmSnapshot?.maps||[];
  const review=previewPreparedEncounterLoad(plan,combat,maps,gmSnapshot?.pending);
  const eligible=review.eligible===true&&combat?.sessionEditable===true;
  return {
    ...review,eligible,
    issues:combat?.sessionEditable===false
      ?[...review.issues,'Start or resume a GM-editable campaign session first.']
      :review.issues
  };
}

/** Builds only the player-allowed scene fields; never trusts GM-only map data. */
export function preparedEncounterPublicMapScene(plan,publishedMaps=[],theme='obsidian'){
  if(!plan||typeof plan!=='object'||plan.archived===true)
    throw Error('Select an active prepared encounter.');
  if(!plan.mapId)throw Error('The prepared encounter has no battle map.');
  if(!Array.isArray(publishedMaps))throw Error('Published map verification is unavailable.');
  const map=publishedMaps.find(item=>item?.id===plan.mapId&&item.visibility==='players');
  if(!map)throw Error('This encounter map is GM-only or no longer published to players.');
  // The original bytes of fogged maps may reveal secrets even if the screen
  // has a visual fog overlay. Require a separately approved sanitized map.
  if(map.fogEnabled===true)
    throw Error('Fogged originals cannot be presented from the encounter shortcut. Use a sanitized player-safe map.');
  if(!PRESENTATION_THEMES.includes(theme))
    throw Error('Choose a supported player display theme.');
  return presentationDraft({
    scene:'battle-map',title:String(map.name||'Battle Map').slice(0,120),
    subtitle:'',mapId:map.id,characterIds:[],showRound:false,
    showPartyHP:false,theme
  });
}
