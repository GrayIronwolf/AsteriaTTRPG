/**
 * Phase 7.3: new, campaign-owned presentation assets; existing map/atlas/PDF
 * libraries are referenced in the GM media index, never duplicated here.
 *
 * The Storage filename is fixed: MIME metadata, not the path or filename
 * provided by a browser, determines whether bytes may be viewed.
 */
export const PRESENTATION_ASSET_LIMIT=60;
export const PRESENTATION_ASSET_MAX_NAME=120;
export const PRESENTATION_MEDIA_SCENES=Object.freeze(['image','cinematic','handout']);
export const PRESENTATION_MEDIA_FORMATS=Object.freeze({
  'image/png':{scene:'image',maxBytes:8*1024*1024},
  'image/jpeg':{scene:'image',maxBytes:8*1024*1024},
  'image/webp':{scene:'image',maxBytes:8*1024*1024},
  'image/gif':{scene:'image',maxBytes:8*1024*1024},
  'video/mp4':{scene:'cinematic',maxBytes:48*1024*1024},
  'video/webm':{scene:'cinematic',maxBytes:48*1024*1024},
  'application/pdf':{scene:'handout',maxBytes:20*1024*1024}
});
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const presentationAssetId=value=>typeof value==='string'&&
  /^[A-Za-z0-9_-]{1,120}$/.test(value);
const exactly=(value,keys)=>{
  if(!isObject(value)||Object.keys(value).some(key=>!keys.includes(key)))
    throw Error('Unsupported presentation asset fields.');
};
export const presentationAssetPath=(campaignId,id)=>{
  if(!presentationAssetId(campaignId)||!presentationAssetId(id))
    throw Error('Invalid presentation media identifier.');
  return 'campaigns/'+campaignId+'/presentationAssets/'+id+'/content';
};
export function presentationAssetFileError(file){
  const mime=String(file?.type||'').toLowerCase();
  const format=PRESENTATION_MEDIA_FORMATS[mime];
  if(!format)return 'Choose a PNG, JPEG, WEBP, GIF, MP4, WEBM or PDF file.';
  if(!Number.isSafeInteger(file?.size)||file.size<1||
    file.size>format.maxBytes)return 'The presentation file exceeds its supported size.';
  if(typeof file?.name!=='string'||!file.name.trim()||file.name.length>240)
    return 'Choose a file with a valid name.';
  return '';
}
export function presentationAssetDetails(input={}){
  exactly(input,['name','description','size','contentType']);
  const mime=String(input.contentType||'').toLowerCase();
  const format=PRESENTATION_MEDIA_FORMATS[mime];
  if(!format)throw Error('Unsupported presentation MIME type.');
  if(!Number.isSafeInteger(input.size)||input.size<1||input.size>format.maxBytes)
    throw Error('Invalid presentation media size.');
  if(typeof input.name!=='string'||!input.name.trim()||
    input.name.length>PRESENTATION_ASSET_MAX_NAME)
    throw Error('Presentation title must be 1–120 characters.');
  if(typeof input.description!=='string'||input.description.length>380)
    throw Error('Presentation caption must be 380 characters or fewer.');
  return {name:input.name.trim(),description:input.description.trim(),
    size:input.size,contentType:mime,kind:format.scene};
}
export function validatePresentationAssetAction(action={}){
  if(!isObject(action)||!['reserve','finish','publish','unpublish','archive'].includes(action.type)||
    !presentationAssetId(action.id))throw Error('Choose a valid presentation media action.');
  if(action.type==='reserve'){
    exactly(action,['type','id','details']);
    presentationAssetDetails(action.details);
  }else{
    exactly(action,['type','id','expectedRevision']);
    if(!Number.isSafeInteger(action.expectedRevision)||
      action.expectedRevision<1||action.expectedRevision>1000000)
      throw Error('Presentation media changed. Refresh before continuing.');
  }
  return action.type;
}
export function publishedPresentationAsset(record={},scene=''){
  return presentationAssetId(record.id)&&
    PRESENTATION_MEDIA_SCENES.includes(scene)&&
    record.status==='ready'&&record.visibility==='players'&&
    record.kind===scene&&
    PRESENTATION_MEDIA_FORMATS[record.contentType]?.scene===scene;
}
export function safePresentationAssetCard(record={},campaignId=''){
  if(!record||!presentationAssetId(record.id))return null;
  try{
    if(record.storagePath!==presentationAssetPath(campaignId,record.id)||
      PRESENTATION_MEDIA_FORMATS[record.contentType]?.scene!==record.kind ||
      !['uploading','ready','archived'].includes(record.status))return null;
    return Object.freeze({
      id:record.id,name:String(record.name||'').slice(0,120),
      description:String(record.description||'').slice(0,380),
      kind:record.kind,contentType:record.contentType,
      status:record.status,visibility:record.visibility==='players'?'players':'gm',
      size:Number(record.size)||0,revision:Number(record.revision)||0
    });
  }catch{return null;}
}
/** Storage manifest includes ONLY approved per-UID deadlines for current scene. */
export function presentationAssetManifest(session={},scene={},viewers={}){
  const active=session.status==='open'&&presentationAssetId(session.epoch);
  const asset=active&&PRESENTATION_MEDIA_SCENES.includes(scene.scene)&&
    presentationAssetId(scene.assetId);
  const recipients={};
  if(asset){
    for(const [uid,expiresAt] of Object.entries(viewers||{}).slice(0,24)){
      if(presentationAssetId(uid)&&expiresAt instanceof Date&&
        Number.isFinite(expiresAt.getTime()))recipients[uid]=expiresAt;
    }
  }
  return {epoch:active?session.epoch:'',assetId:asset?scene.assetId:'',
    scene:asset?scene.scene:'blank',expiresAt:active?session.expiresAt:null,
    viewerExpiries:recipients};
}
