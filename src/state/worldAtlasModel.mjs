/**
 * Digital GM 8.3 - private, image-backed world atlas.
 * Percent positions avoid assuming a geographic projection or map scale.
 * Published map bytes must not contain hidden geography: fog is presentation,
 * never a substitute for separate GM-only records.
 */
export const ATLAS_MAX_MAPS=24;
export const ATLAS_MAX_PINS=100;
export const ATLAS_MAX_ROUTES=50;
export const ATLAS_MAX_IMAGE_BYTES=8*1024*1024;
export const ATLAS_PIN_TYPES=Object.freeze(['settlement','landmark','region','quest','event','hazard','discovery','other']);
export const ATLAS_IMAGE_FORMATS=Object.freeze({
 'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'
});
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const atlasId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x);
const bounded=(x,max,field,{optional=false}={})=>{
 if(typeof x!=='string'||x.trim().length>max||(!optional&&!x.trim()))
  throw Error('Enter a valid '+field+' (maximum '+max+' characters).');
 return x.trim();
};
const keys=(x,allowed,field)=>{
 if(!obj(x)||Object.keys(x).some(k=>!allowed.includes(k)))
  throw Error('Invalid '+field+' fields.');
};
const integer=(x,min,max,field)=>{
 if(!Number.isSafeInteger(x)||x<min||x>max)
  throw Error(field+' must be between '+min+' and '+max+'.');
 return x;
};
const coordinate=(x,field)=>{
 if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>100)
  throw Error(field+' must be within the map.');
 return Math.round(x*1000)/1000;
};
export function atlasFileError(file){
 if(!file||typeof file!=='object')return 'Choose a world map image.';
 const type=String(file.type||'').toLowerCase();
 if(!ATLAS_IMAGE_FORMATS[type])return 'World maps support PNG, JPG, WEBP or GIF images.';
 if(!Number.isSafeInteger(file.size)||file.size<1||file.size>ATLAS_MAX_IMAGE_BYTES)
  return 'World map image must be between 1 byte and 8 MB.';
 return '';
}
export function atlasImagePath(campaignId,mapId,mime){
 if(!atlasId(campaignId)||!atlasId(mapId)||!ATLAS_IMAGE_FORMATS[mime])
  throw Error('Invalid world atlas image reference.');
 return 'campaigns/'+campaignId+'/worldAtlas/'+mapId+'/atlas.'+ATLAS_IMAGE_FORMATS[mime];
}
export function atlasImageDimensions(width,height){
 return {width:integer(width,1,8192,'Image width'),height:integer(height,1,8192,'Image height')};
}
export function atlasMapSettings(input={}){
 keys(input,['name','description','region','visibility'],'world map');
 const visibility=input.visibility;
 if(!['gm','players'].includes(visibility))throw Error('Choose a valid visibility setting.');
 return {name:bounded(input.name,100,'map name'),
  description:bounded(input.description||'',500,'map description',{optional:true}),
  region:bounded(input.region||'',100,'region',{optional:true}),visibility};
}
export function atlasPin(input={}){
 keys(input,['id','name','description','kind','x','y','visibility','linkedType','linkedId'],'atlas pin');
 if(!atlasId(input.id))throw Error('Choose a valid map pin identifier.');
 if(!ATLAS_PIN_TYPES.includes(input.kind))throw Error('Choose a valid location type.');
 if(!['gm','players'].includes(input.visibility))throw Error('Choose GM-only or player visibility.');
 const linkedType=input.linkedType||'';
 const linkedId=input.linkedId||'';
 if(linkedType&&!['quest','event','timeline','route','location','weather'].includes(linkedType))
  throw Error('Unsupported linked record type.');
 if((linkedType&&!atlasId(linkedId))||(!linkedType&&linkedId))
  throw Error('Choose a valid linked record.');
 return {id:input.id,name:bounded(input.name,90,'pin name'),
  description:bounded(input.description||'',450,'pin description',{optional:true}),
  kind:input.kind,x:coordinate(input.x,'Pin X'),y:coordinate(input.y,'Pin Y'),
  visibility:input.visibility,linkedType,linkedId};
}
export function atlasPins(rows=[]){
 if(!Array.isArray(rows)||rows.length>ATLAS_MAX_PINS)throw Error('An atlas supports up to 100 pins.');
 const result=rows.map(atlasPin);
 if(new Set(result.map(p=>p.id)).size!==result.length)throw Error('Location IDs must be unique.');
 return result;
}
export function atlasRoute(input={},pins=[]){
 keys(input,['id','name','description','fromId','toId','visibility','travelDays'],'atlas route');
 if(!atlasId(input.id))throw Error('Choose a valid route identifier.');
 if(!['gm','players'].includes(input.visibility))throw Error('Choose a valid route visibility.');
 if(!atlasId(input.fromId)||!atlasId(input.toId)||input.fromId===input.toId)
  throw Error('Choose two different route endpoints.');
 if(!pins.some(p=>p.id===input.fromId)||!pins.some(p=>p.id===input.toId))
  throw Error('Route endpoints must exist on this map.');
 return {id:input.id,name:bounded(input.name,100,'route name'),
  description:bounded(input.description||'',450,'route description',{optional:true}),
  fromId:input.fromId,toId:input.toId,visibility:input.visibility,
  // Advisory GM-defined travel duration; no automatic time progression.
  travelDays:integer(input.travelDays,0,365,'Travel days')};
}
export function atlasRoutes(rows=[],pins=[]){
 if(!Array.isArray(rows)||rows.length>ATLAS_MAX_ROUTES)throw Error('An atlas supports at most 50 routes.');
 const result=rows.map(row=>atlasRoute(row,pins));
 if(new Set(result.map(x=>x.id)).size!==result.length)throw Error('Route IDs must be unique.');
 return result;
}
export function atlasPublicProjection(map){
 if(!obj(map)||map.status!=='published'||map.visibility!=='players')
  throw Error('Only approved player-visible atlases can be shared.');
 const pins=atlasPins(map.pins||[]).filter(pin=>pin.visibility==='players');
 const publicIds=new Set(pins.map(pin=>pin.id));
 const routes=atlasRoutes(map.routes||[],map.pins||[])
  .filter(route=>route.visibility==='players'&&publicIds.has(route.fromId)&&publicIds.has(route.toId));
 return {id:map.id,name:map.name,description:map.description,region:map.region,
  width:map.width,height:map.height,storagePath:map.storagePath,
  contentType:map.contentType,visibility:'players',status:'published',
  revision:map.revision,pins:pins.map(({linkedType,linkedId,...pin})=>pin),
  routes:routes.map(route=>({...route}))};
}
export function atlasMapCanPreview(map,campaignId){
 try{return map?.storagePath===atlasImagePath(campaignId,map.id,map.contentType);}catch{return false;}
}
export function atlasPointFromEvent(event,element){
 const rect=element.getBoundingClientRect();
 if(!rect.width||!rect.height)throw Error('Map is not ready to place a pin.');
 return {x:coordinate((event.clientX-rect.left)*100/rect.width,'Map X'),
  y:coordinate((event.clientY-rect.top)*100/rect.height,'Map Y')};
}
export function atlasCoordinatesForMapPin(pin,scale=1){
 const z=Number(scale);
 if(!Number.isFinite(z)||z<.5||z>4)throw Error('Zoom must be between 50% and 400%.');
 return {left:pin.x+'%',top:pin.y+'%',transform:'translate(-50%, -50%)'};
}
export function validateAtlasAction(action={}){
 if(!obj(action)||!['create','update','publish','unpublish','archive'].includes(action.type))
  throw Error('Unsupported world atlas action.');
 const allowed={
  create:['type','mapId','settings','contentType','width','height'],
  update:['type','mapId','expectedRevision','settings','pins','routes'],
  publish:['type','mapId','expectedRevision'],
  unpublish:['type','mapId','expectedRevision'],
  archive:['type','mapId','expectedRevision']
 }[action.type];
 keys(action,allowed,'atlas action');
 if(!atlasId(action.mapId))throw Error('Choose a valid world atlas map.');
 if(action.type!=='create')integer(action.expectedRevision,1,1000000,'Map revision');
 if(action.type==='create'){
  if(!ATLAS_IMAGE_FORMATS[action.contentType])throw Error('Choose a supported map image format.');
  atlasImageDimensions(action.width,action.height);
  atlasMapSettings(action.settings);
 }
 if(action.type==='update'){
  atlasMapSettings(action.settings);
  const pins=atlasPins(action.pins);
  atlasRoutes(action.routes,pins);
 }
 return action.type;
}
export function atlasRows(rows=[]){
 return (Array.isArray(rows)?rows:[]).filter(x=>x&&x.status!=='archived')
  .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}
