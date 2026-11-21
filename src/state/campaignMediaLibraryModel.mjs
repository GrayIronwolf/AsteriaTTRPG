import {
  battleMapAssetPath,battleMapFileKind
} from './battleMapModel.mjs';
import {atlasImagePath} from './worldAtlasModel.mjs';
import {sessionPdfPath} from './sessionLibraryModel.mjs';
import {audioTrackPath} from './campaignAudioModel.mjs';
import {recordingPath} from './sessionRecordingModel.mjs';
import {presentationAssetPath,PRESENTATION_MEDIA_FORMATS} from './presentationAssetModel.mjs';

/**
 * Phase 7.1: virtual, read-only index of EXISTING campaign media.
 * No Firestore index documents, duplicated Storage assets or automatic publishing.
 * Records are projected only inside a GM-authorized subscription.
 */
export const CAMPAIGN_MEDIA_LIBRARY_LIMIT_PER_SOURCE=120;
export const CAMPAIGN_MEDIA_LIBRARY_SOURCES=Object.freeze([
  'battleMaps','worldAtlas','sessionPdfs','audioTracks','recordingArchives',
  'presentationAssets'
]);
export const CAMPAIGN_MEDIA_LIBRARY_TYPES=Object.freeze([
  'battle-map','atlas-map','image','video-cinematic',
  'pdf-handout','audio','recording','scene'
]);
export const CAMPAIGN_MEDIA_LIBRARY_VISIBILITIES=Object.freeze(['all','gm','players']);
export const CAMPAIGN_MEDIA_LIBRARY_TABS=Object.freeze({
  battleMaps:'battle-maps',worldAtlas:'world-atlas',sessionPdfs:'session-library',
  audioTracks:'soundboard',recordingArchives:'session-recordings',
  presentationAssets:'presentation'
});
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value);
const text=(value,size)=>typeof value==='string'?value.trim().slice(0,size):'';
const safeTimestamp=value=>{
  if(typeof value?.toMillis==='function'){
    const n=value.toMillis();return Number.isFinite(n)?Math.max(0,n):0;
  }
  if(value&&typeof value==='object'&&Number.isFinite(value.seconds))
    return Math.max(0,value.seconds*1000);
  return Number.isFinite(value)&&value>=0?value:0;
};
const MIME_KINDS=Object.freeze({
  'image/png':'image','image/jpeg':'image','image/webp':'image',
  'image/gif':'image','video/mp4':'video','video/webm':'video',
  'application/pdf':'pdf','audio/mpeg':'audio','audio/ogg':'audio',
  'audio/wav':'audio','audio/webm':'audio','audio/mp4':'audio'
});
const sourceType=Object.freeze({
  battleMaps:'battle-map',worldAtlas:'atlas-map',
  sessionPdfs:'pdf-handout',audioTracks:'audio',recordingArchives:'recording',presentationAssets:'image'
});

export function campaignMediaLibraryReference(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    !CAMPAIGN_MEDIA_LIBRARY_SOURCES.includes(value.source)||
    !validId(value.sourceId))
    throw Error('Choose a valid original campaign media item.');
  return {source:value.source,sourceId:value.sourceId};
}

export function classifyCampaignMediaRecord(campaignId,source,record){
  if(!validId(campaignId)||!CAMPAIGN_MEDIA_LIBRARY_SOURCES.includes(source)||
    !record||typeof record!=='object'||Array.isArray(record)||!validId(record.id)||
    record.status==='archived')return null;
  try{
    const mime=text(record.contentType,64).toLowerCase();
    const kind=MIME_KINDS[mime];
    if(!kind||typeof record.storagePath!=='string')return null;
    let canonical='';
    if(source==='battleMaps'){
      canonical=battleMapAssetPath(campaignId,record.id,mime);
      if(kind!==battleMapFileKind(mime)||record.kind!==kind)return null;
    }else if(source==='worldAtlas'){
      canonical=atlasImagePath(campaignId,record.id,mime);
      if(kind!=='image')return null;
    }else if(source==='sessionPdfs'){
      canonical=sessionPdfPath(campaignId,record.id);
      if(kind!=='pdf')return null;
    }else if(source==='audioTracks'){
      canonical=audioTrackPath(campaignId,record.id,mime);
      if(kind!=='audio')return null;
    }else if(source==='recordingArchives'){
      canonical=recordingPath(campaignId,record.id,mime);
      if(kind!=='audio')return null;
    }else if(source==='presentationAssets'){
      canonical=presentationAssetPath(campaignId,record.id);
      const expected=PRESENTATION_MEDIA_FORMATS[mime]?.scene;
      if(!expected||record.kind!==expected)return null;
    }
    if(record.storagePath!==canonical)return null;
    const category=source==='presentationAssets'?
      (record.kind==='cinematic'?'video-cinematic':
        record.kind==='handout'?'pdf-handout':'image'):sourceType[source];
    const status=source==='battleMaps'?'ready':
      ['ready','uploading','draft','published'].includes(record.status)?
        record.status:'unknown';
    const visibility=record.visibility==='players'?'players':'gm';
    // A published flag on an uploading/draft record never makes it shareable.
    const shared=visibility==='players'&&
      (source==='battleMaps'||status==='ready'||status==='published');
    const title=text(
      source==='sessionPdfs'||source==='recordingArchives'?record.title:record.name,140
    )||'Untitled '+category;
    const description=text(source==='recordingArchives'?record.summary:record.description,280);
    const updatedAt=safeTimestamp(record.updatedAt||record.createdAt);
    const result={
      id:source+':'+record.id,source,sourceId:record.id,category,title,description,
      status,visibility:shared?'players':'gm',shared,
      mediaKind:kind,contentType:mime,updatedAt,
      originalTab:CAMPAIGN_MEDIA_LIBRARY_TABS[source],
      previewable:status==='ready'||status==='published',
      // This is an original source identifier, not a URL, file, or new asset.
      provenance:'existing-campaign-record'
    };
    if(source==='battleMaps')result.previewable=true;
    if(source==='worldAtlas'&&status==='draft')result.previewable=true;
    if(source==='recordingArchives'&&validId(record.sessionId))
      result.sessionId=record.sessionId;
    return Object.freeze(result);
  }catch{return null;}
}

export function buildCampaignMediaLibrary(campaignId,collections={}){
  if(!validId(campaignId))throw Error('Invalid campaign for the media library.');
  const items=[],seen=new Set();
  for(const source of CAMPAIGN_MEDIA_LIBRARY_SOURCES){
    const records=Array.isArray(collections[source])?collections[source]:[];
    for(const raw of records.slice(0,CAMPAIGN_MEDIA_LIBRARY_LIMIT_PER_SOURCE)){
      const item=classifyCampaignMediaRecord(campaignId,source,raw);
      if(!item||seen.has(item.id))continue;
      seen.add(item.id);items.push(item);
    }
  }
  return Object.freeze(items.sort((a,b)=>b.updatedAt-a.updatedAt||
    a.title.localeCompare(b.title)||a.id.localeCompare(b.id)));
}

export function filterCampaignMediaLibrary(items,filters={}){
  const category=CAMPAIGN_MEDIA_LIBRARY_TYPES.includes(filters.category)?
    filters.category:'all';
  const visibility=CAMPAIGN_MEDIA_LIBRARY_VISIBILITIES.includes(filters.visibility)?
    filters.visibility:'all';
  const query=text(filters.query,120).toLocaleLowerCase();
  return (Array.isArray(items)?items:[]).filter(item=>
    (category==='all'||item.category===category)&&
    (visibility==='all'||item.visibility===visibility)&&
    (!query||(item.title+' '+item.description+' '+item.source+' '+item.category)
      .toLocaleLowerCase().includes(query))
  );
}

export function campaignMediaLibraryCounts(items=[]){
  const safe=Array.isArray(items)?items:[];
  return Object.freeze({
    total:safe.length,private:safe.filter(item=>!item.shared).length,
    shared:safe.filter(item=>item.shared).length,
    pending:safe.filter(item=>item.status==='uploading').length
  });
}
