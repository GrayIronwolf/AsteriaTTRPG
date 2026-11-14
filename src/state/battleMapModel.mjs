import {validFogCells,resizeFogCells,distanceMetersPerCell} from './battleMapFogModel.mjs';
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
  const previousCols=Number(input.previousGridColumns??gridColumns);
  const previousRows=Number(input.previousGridRows??gridRows);
  const fogCells=(previousCols!==gridColumns||previousRows!==gridRows)
    ?resizeFogCells(input.fogCells,previousCols,previousRows,gridColumns,gridRows)
    :validFogCells(input.fogCells,gridColumns,gridRows);
  return {name,description,visibility,gridColumns,gridRows,gridOpacity,gridVisible,
    tokens,fogEnabled,fogCells,metresPerCell};
}
export function battleMapDimensions(width,height){
  return {width:safeNumber(width,1,8192,'map width'),height:safeNumber(height,1,8192,'map height')};
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
    return {id,label,kind,refId,x:Math.round(x*100)/100,y:Math.round(y*100)/100};
  });
}
export function battleMapPoint(x,y,{columns=20,rows=15,snap=false}={}){
  const a=Math.max(0,Math.min(100,Number(x))),b=Math.max(0,Math.min(100,Number(y)));
  if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Invalid map coordinates.');
  if(!snap)return {x:Math.round(a*100)/100,y:Math.round(b*100)/100};
  const cols=safeNumber(columns,1,80,'grid columns'),count=safeNumber(rows,1,80,'grid rows');
  return {
    x:Math.round(((Math.min(cols-1,Math.floor(a/100*cols))+.5)/cols)*10000)/100,
    y:Math.round(((Math.min(count-1,Math.floor(b/100*count))+.5)/count)*10000)/100
  };
}
export function battleMapIsPublished(record){
  return record?.visibility==='players';
}
export function battleMapCanPreview(record,campaignId){
  if(!record||typeof record!=='object'||!validId(record.id)||!validId(campaignId))return false;
  try{return record.storagePath===battleMapAssetPath(campaignId,record.id,record.contentType)&&
    record.kind===battleMapFileKind(record.contentType);}catch{return false;}
}
