import {visionSettings} from './battleMapVision.mjs';
import {gridSettings} from './battleMapGrid.mjs';
import {validFogCells,resizeFogCells,distanceMetersPerCell} from './battleMapFogModel.mjs';
import {mapGridType,validateTerrainCells,resizeTerrainCells} from './battleMapTerrainModel.mjs';
import {mapCell,mapCellCenter} from './battleMapRoutes.mjs';
// Digital GM phase 6.1: campaign battle maps, including looping MP4/WebM backgrounds.
export const BATTLE_MAP_IMAGE_MAX_BYTES=8*1024*1024;
export const BATTLE_MAP_VIDEO_MAX_BYTES=48*1024*1024;
export const BATTLE_MAP_MAX_TOKENS=60;
export const BATTLE_MAP_MAX_RECORDS=40;
export const BATTLE_MAP_FORMATS=Object.freeze({
  'image/png':{kind:'image',extension:'png'},
  'image/jpeg':{kind:'image',extension:'jpg'},
  'image/webp':{kind:'image',extension:'webp'},
  'image/gif':{kind:'image',extension:'gif'},
  'video/mp4':{kind:'video',extension:'mp4'},
  'video/webm':{kind:'video',extension:'webm'}
});
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value);
const safeNumber=(value,min,max,label)=>{
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max||!Number.isInteger(n))throw Error('Invalid '+label+'.');
  return n;
};
export function battleMapFileError(file){
  if(!file||typeof file!=='object')return 'Select a map image or video.';
  const format=BATTLE_MAP_FORMATS[String(file.type||'').toLowerCase()];
  if(!format)return 'Choose PNG, JPG, WEBP, GIF, MP4 or WEBM.';
  const size=Number(file.size);
  if(!Number.isSafeInteger(size)||size<=0)return 'The map file is empty or invalid.';
  const maximum=format.kind==='video'?BATTLE_MAP_VIDEO_MAX_BYTES:BATTLE_MAP_IMAGE_MAX_BYTES;
  if(size>maximum)return (format.kind==='video'?'Video maps are limited to 48 MB.':'Image maps are limited to 8 MB.');
  return '';
}
export function battleMapAssetPath(campaignId,mapId,mime){
  if(!validId(campaignId)||!validId(mapId))throw Error('Invalid campaign or map identifier.');
  const format=BATTLE_MAP_FORMATS[String(mime||'').toLowerCase()];
  if(!format)throw Error('Unsupported map format.');
  return 'campaigns/'+campaignId+'/battleMaps/'+mapId+'/scene.'+format.extension;
}
export function battleMapFileKind(mime){
  return BATTLE_MAP_FORMATS[String(mime||'').toLowerCase()]?.kind||'';
}
export function battleMapEditableSettings(input={}){
  const name=String(input.name??'').trim(),description=String(input.description??'').trim();
  if(!name||name.length>100)throw Error('Map name must contain 1–100 characters.');
  if(description.length>300)throw Error('Map description must be 300 characters or fewer.');
  const visibility=String(input.visibility||'gm');
  if(!['gm','players'].includes(visibility))throw Error('Invalid map visibility.');
  const gridColumns=safeNumber(input.gridColumns??20,1,80,'grid columns');
  const gridRows=safeNumber(input.gridRows??15,1,80,'grid rows');
  const gridOpacity=safeNumber(input.gridOpacity??40,0,100,'grid opacity');
  const gridVisible=input.gridVisible!==false;
  const tokens=battleMapTokens(input.tokens||[]);
  const fogEnabled=input.fogEnabled===true;
  const metresPerCell=distanceMetersPerCell(input.metresPerCell??1);
  const gridType=mapGridType(input.gridType);
  const previousCols=Number(input.previousGridColumns??gridColumns);
  const previousRows=Number(input.previousGridRows??gridRows);
  const terrainCells=(previousCols!==gridColumns||previousRows!==gridRows)
    ?resizeTerrainCells(input.terrainCells,previousCols,previousRows,gridColumns,gridRows)
    :validateTerrainCells(input.terrainCells,gridColumns,gridRows);
  const fogCells=(previousCols!==gridColumns||previousRows!==gridRows)
    ?resizeFogCells(input.fogCells,previousCols,previousRows,gridColumns,gridRows)
    :validFogCells(input.fogCells,gridColumns,gridRows);
  return {name,description,visibility,gridColumns,gridRows,gridOpacity,gridVisible,
    tokens,fogEnabled,fogCells,metresPerCell,...gridSettings({...input,gridType}),terrainCells,
    ...(input.vision?{vision:visionSettings(input.vision,gridColumns*gridRows)}:{})};
}
export function battleMapDimensions(width,height){
  return {width:safeNumber(width,1,8192,'map width'),height:safeNumber(height,1,8192,'map height')};
}
export function battleMapTokenAppearance(row={}){
  const portrait=typeof row.portrait==='string'?row.portrait.trim():'';
  const siteRelative=portrait.startsWith('/')&&!portrait.startsWith('//');
  let absolute=null;
  try{if(portrait.toLowerCase().startsWith('https://'))absolute=new URL(portrait);}
  catch{ /* Invalid URLs are rejected below. */ }
  if(portrait&&(portrait.length>600||/[\s\\]/.test(portrait)||
    [...portrait].some(letter=>letter.charCodeAt(0)<32||letter.charCodeAt(0)===127)||
    !(siteRelative||absolute?.hostname&&!absolute.username&&!absolute.password)))
    throw Error('Use an HTTPS or site-relative token portrait URL.');
  const faction=String(row.faction||'');
  if(faction&&!['party','ally','neutral','hostile'].includes(faction))throw Error('Invalid token faction.');
  const cells=safeNumber(row.cells??1,1,80,'token footprint');
  const visibility=String(row.visibility||'players');
  if(!['gm','players'].includes(visibility))throw Error('Invalid token visibility.');
  return {...(portrait?{portrait}:{}),...(faction?{faction}:{}),
    ...(cells>1?{cells}:{}),...(visibility==='gm'?{visibility}:{})};
}
export function battleMapTokens(items){
  if(!Array.isArray(items)||items.length>BATTLE_MAP_MAX_TOKENS)throw Error('Map supports up to 60 tokens.');
  const ids=new Set();
  return items.map(row=>{
    const id=String(row?.id||''),label=String(row?.label||'').trim();
    if(!validId(id)||ids.has(id)||!label||label.length>48)
      throw Error('Token needs a unique ID and a label of at most 48 characters.');
    ids.add(id);
    const kind=String(row?.kind||'marker');
    if(!['character','creature','marker'].includes(kind))throw Error('Invalid token category.');
    const x=Number(row?.x),y=Number(row?.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>100||y<0||y>100)
      throw Error('Token position must be within the map.');
    const refId=String(row?.refId||'');
    if(refId&&!validId(refId))throw Error('Invalid linked character identifier.');
    const combatantId=String(row?.combatantId||'');
    if(combatantId&&!/^[A-Za-z0-9_-]{1,160}$/.test(combatantId))
      throw Error('Invalid combat participant binding.');
    return {id,label,kind,refId,...(combatantId?{combatantId}:{}),
      x:Math.round(x*100)/100,y:Math.round(y*100)/100,...battleMapTokenAppearance(row)};
  });
}
export function battleMapPoint(x,y,{columns=20,rows=15,snap=false,...grid}={}){
  const a=Math.max(0,Math.min(100,Number(x))),b=Math.max(0,Math.min(100,Number(y)));
  if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Invalid map coordinates.');
  if(!snap)return {x:Math.round(a*100)/100,y:Math.round(b*100)/100};
  const cols=safeNumber(columns,1,80,'grid columns'),count=safeNumber(rows,1,80,'grid rows');
  const centre=mapCellCenter(mapCell({x:a,y:b},cols,count,grid),cols,count,grid);
  return {x:Math.round(centre.x*100)/100,y:Math.round(centre.y*100)/100};
}
export function battleMapIsPublished(record){
  return record?.visibility==='players';
}
export function battleMapCanPreview(record,campaignId){
  if(!record||typeof record!=='object'||!validId(record.id)||!validId(campaignId))return false;
  try{return record.storagePath===battleMapAssetPath(campaignId,record.id,record.contentType)&&
    record.kind===battleMapFileKind(record.contentType);}catch{return false;}
}
