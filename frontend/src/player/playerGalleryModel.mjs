import {safeDashboardArtwork} from '../../../src/state/playerHudMedia.mjs';
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const list=value=>Array.isArray(value)?value:[];
const text=(value,max=160)=>typeof value==='string'?value.slice(0,max):'';
const GALLERY_ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
export const GALLERY_TYPES=Object.freeze({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'});
export const MAX_GALLERY_IMAGES=200;
export function validateGalleryUpload(file){
  if(!file||typeof file!=='object')throw Error('Choose a gallery image.');
  const type=text(file.type,64).toLowerCase(),size=Number(file.size);
  if(!Object.hasOwn(GALLERY_TYPES,type))throw Error('Choose a PNG, JPG, WEBP or GIF image.');
  if(!Number.isSafeInteger(size)||size<1||size>8*1024*1024)
    throw Error('Gallery images must be between 1 byte and 8 MB.');
  return Object.freeze({type,extension:GALLERY_TYPES[type],name:text(file.name,160)||'Character Image'});
}
function imageUrl(value){
  const source=typeof value==='string'?value:plain(value)?
    value.url||value.downloadURL||value.src||value.image:'';
  return safeDashboardArtwork(source);
}
export function mergedGalleryRows(primary=[],source=[]){
  const unique=new Set(),result=[];
  for(const row of [...list(primary),...list(source)]){
    const item=typeof row==='string'?{url:row}:plain(row)?row:null;
    if(!item)continue;
    const url=imageUrl(item),path=text(item.path,500),id=text(item.id,160);
    if(!url&&!path)continue;
    const key=path?'path:'+path:url?'url:'+url:id?'id:'+id:'';
    if(!key||unique.has(key))continue;
    unique.add(key);result.push(row);
    if(result.length>MAX_GALLERY_IMAGES)throw Error('Gallery image limit reached.');
  }
  return result;
}
export function projectGallery(character={},source={},owned=false){
  if(!owned)return Object.freeze([]);
  const rows=mergedGalleryRows(character.gallery,source.gallery);
  const entries=rows.map((row,index)=>{
    const item=typeof row==='string'?{url:row}:row;
    const rawId=GALLERY_ID.test(String(item.id||''))?item.id:'';
    return Object.freeze({id:rawId||'legacy-gallery-'+index,rawId,
      url:imageUrl(item),path:text(item.path,500),
      name:text(item.name,160)||'Character Image '+(index+1),managed:Boolean(rawId)});
  });
  const portrait=imageUrl(character.image||character.portrait||
    character.characterImage||source.image||source.portrait||source.characterImage);
  if(portrait&&!entries.some(row=>row.url===portrait))
    entries.unshift(Object.freeze({id:'current-portrait',rawId:'',url:portrait,
      name:'Current Portrait',path:'',managed:false}));
  return Object.freeze(entries);
}
export function galleryStoragePath(uid,sourceId,id,extension){
  if(!GALLERY_ID.test(String(uid))||!GALLERY_ID.test(String(sourceId))||
    !/^gallery-[A-Za-z0-9-]{8,150}$/.test(String(id))||
    !Object.values(GALLERY_TYPES).includes(extension))
    throw Error('Invalid gallery storage location.');
  return 'users/'+uid+'/characters/'+sourceId+'/gallery/'+id+'.'+extension;
}
export function assertOwnedGalleryPath(path,uid,sourceId){
  const prefix='users/'+uid+'/characters/'+sourceId+'/gallery/';
  if(typeof path!=='string'||!path.startsWith(prefix)||
    !/^gallery-[A-Za-z0-9-]{8,150}\.(png|jpg|webp|gif)$/.test(path.slice(prefix.length)))
    throw Error('This image does not belong to the selected gallery.');
  return path;
}
