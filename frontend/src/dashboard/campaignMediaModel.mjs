import {
  battleMapAssetPath,battleMapCanPreview,battleMapEditableSettings,
  battleMapDimensions,battleMapFileError,battleMapFileKind,battleMapTokens,
  BATTLE_MAP_MAX_RECORDS
} from '../../../src/state/battleMapModel.mjs';
import {validFogCells} from '../../../src/state/battleMapFogModel.mjs';
import {atlasMapCanPreview,atlasPublicProjection} from '../../../src/state/worldAtlasModel.mjs';
import {PRESENTATION_DEFAULT,presentationDraft,presentationId,safePartyPresentation} from '../../../src/state/playerPresentationModel.mjs';

export {battleMapAssetPath,battleMapEditableSettings,battleMapDimensions,
  battleMapFileError,battleMapFileKind,BATTLE_MAP_MAX_RECORDS,atlasMapCanPreview,presentationDraft};
export const mapId=presentationId;
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

/** No arbitrary Firestore properties from a GM document reach a viewer.
 * GM-only pins live in a different, GM-readable document and are not copied. */
export function mapForViewer(raw,campaignId,mode='player'){
  if(!raw||!mapId(raw.id)||!battleMapCanPreview(raw,campaignId)||
    (mode!=='gm'&&raw.visibility!=='players'))return null;
  try{
    const cols=number(raw.gridColumns,20),rows=number(raw.gridRows,15);
    const settings=battleMapEditableSettings({...raw,
      name:String(raw.name||'').slice(0,100),
      gridColumns:cols,gridRows:rows,
      fogCells:validFogCells(raw.fogCells,cols,rows)});
    const dimensions=battleMapDimensions(raw.width,raw.height);
    return Object.freeze({
      id:raw.id,name:settings.name,description:settings.description,
      kind:raw.kind,contentType:raw.contentType,storagePath:raw.storagePath,
      visibility:settings.visibility,...dimensions,
      gridColumns:settings.gridColumns,gridRows:settings.gridRows,
      gridOpacity:settings.gridOpacity,gridVisible:settings.gridVisible,
      fogEnabled:settings.fogEnabled,fogCells:settings.fogCells,
      metresPerCell:settings.metresPerCell,
      tokens:battleMapTokens(settings.tokens),
      ...(mode==='gm'?{combatId:typeof raw.combatId==='string'?raw.combatId:'',
        updatedAt:raw.updatedAt||null}: {})
    });
  }catch{return null;}
}
export function publishedAtlas(raw,campaignId){
  if(!raw||!atlasMapCanPreview(raw,campaignId))return null;
  try{return Object.freeze(atlasPublicProjection(raw));}
  catch{return null;}
}
/** Adapt the canonical safe summary to the established projector contract.
 * It carries className and hp:[current,max], while the projector expects
 * klass and resources.hp. Never pass through private character fields. */
export function partyForPresentation(rows,selectedIds=[],showHP=false){
  const characters=Object.fromEntries((Array.isArray(rows)?rows:[])
    .filter(row=>row&&mapId(row.id))
    .map(row=>[row.id,{
      id:row.id,name:row.name,klass:row.className,level:row.level,
      resources:{hp:row.hp}
    }]));
  return safePartyPresentation(characters,selectedIds,showHP);
}

export function presentationForViewer(raw){
  if(!raw)return {...PRESENTATION_DEFAULT};
  const draft=presentationDraft({
    scene:raw.scene,title:raw.title,subtitle:raw.subtitle,mapId:raw.mapId,
    characterIds:raw.characterIds,showRound:raw.showRound,
    showPartyHP:raw.showPartyHP,theme:raw.theme
  });
  const revision=Number(raw.revision);
  if(!Number.isSafeInteger(revision)||revision<0||revision>1000000)
    throw Error('Invalid published presentation revision.');
  return Object.freeze({version:1,revision,...draft});
}
export function timestampRevision(value){
  if(!value)return 0;
  if(typeof value.toMillis==='function')return value.toMillis();
  if(Number.isFinite(value.seconds))return value.seconds*1000+Math.floor((value.nanoseconds||0)/1e6);
  if(Number.isFinite(value._seconds))return value._seconds*1000+Math.floor((value._nanoseconds||0)/1e6);
  if(value instanceof Date)return value.getTime();
  return 0;
}
