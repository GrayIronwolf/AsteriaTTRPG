import {presentationDraft,presentationId} from './playerPresentationModel.mjs';

/** Improvement 3. GM-only saved scenes. Nothing in this model grants player access. */
export const PRESENTATION_PLAYLIST_LIMIT=8;
export const PRESENTATION_PLAYLIST_STEP_LIMIT=12;
export const PRESENTATION_PLAYLIST_DEFAULT=Object.freeze({
  version:1,revision:0,playlists:[]
});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed,label)=>{
  if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))
    throw Error('Invalid '+label+' fields.');
};
const id=value=>presentationId(value)&&value.length<=80;
const label=(value,max,field)=>{
  if(typeof value!=='string'||value.length>max||!value.trim())
    throw Error('Enter a '+field+' of 1–'+max+' characters.');
  return value.trim();
};
const revision=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000;

export function presentationPlaylistStep(value){
  keys(value,['id','label','draft'],'playlist step');
  if(!id(value.id))throw Error('Invalid playlist step ID.');
  return {id:value.id,label:label(value.label,80,'scene label'),
    draft:presentationDraft(value.draft)};
}
export function presentationPlaylist(value){
  keys(value,['id','name','steps'],'playlist');
  if(!id(value.id))throw Error('Invalid playlist ID.');
  if(!Array.isArray(value.steps)||value.steps.length>PRESENTATION_PLAYLIST_STEP_LIMIT)
    throw Error('A playlist can contain up to '+PRESENTATION_PLAYLIST_STEP_LIMIT+' scenes.');
  const steps=value.steps.map(presentationPlaylistStep);
  if(new Set(steps.map(step=>step.id)).size!==steps.length)
    throw Error('Playlist scene IDs must be unique.');
  return {id:value.id,name:label(value.name,80,'playlist name'),steps};
}
export function presentationPlaylistLibrary(raw){
  if(raw===null||raw===undefined)return {version:1,revision:0,playlists:[]};
  if(!object(raw)||raw.version!==1||!revision(raw.revision)||
    !Array.isArray(raw.playlists)||raw.playlists.length>PRESENTATION_PLAYLIST_LIMIT)
    throw Error('Saved presentation playlists are unavailable.');
  const playlists=raw.playlists.map(presentationPlaylist);
  if(new Set(playlists.map(item=>item.id)).size!==playlists.length)
    throw Error('Duplicate presentation playlist ID.');
  return {version:1,revision:raw.revision,playlists};
}
export function validatePresentationPlaylistAction(action={}){
  if(!object(action)||!['save','delete'].includes(action.type))
    throw Error('Unsupported playlist action.');
  keys(action,action.type==='save'?['type','expectedRevision','playlist']:
    ['type','expectedRevision','id'],'playlist action');
  if(!revision(action.expectedRevision))throw Error('Invalid playlist library revision.');
  return action.type==='save'
    ?{type:'save',expectedRevision:action.expectedRevision,playlist:presentationPlaylist(action.playlist)}
    :id(action.id)?{type:'delete',expectedRevision:action.expectedRevision,id:action.id}:
      (()=>{throw Error('Invalid playlist ID.');})();
}
/** Used in the authorised server transaction. Rejects stale and unbounded writes. */
export function applyPresentationPlaylistAction(library,rawAction){
  const action=validatePresentationPlaylistAction(rawAction);
  const current=presentationPlaylistLibrary(library);
  if(current.revision!==action.expectedRevision)
    throw Error('Playlists changed in another window. Refresh before saving.');
  let playlists=[...current.playlists];
  if(action.type==='save'){
    const i=playlists.findIndex(item=>item.id===action.playlist.id);
    if(i<0){
      if(playlists.length>=PRESENTATION_PLAYLIST_LIMIT)
        throw Error('Only '+PRESENTATION_PLAYLIST_LIMIT+' saved playlists are allowed.');
      playlists.push(action.playlist);
    }else playlists[i]=action.playlist;
  }else{
    if(!playlists.some(item=>item.id===action.id))
      throw Error('This playlist no longer exists.');
    playlists=playlists.filter(item=>item.id!==action.id);
  }
  return {version:1,revision:current.revision+1,playlists};
}
/** One-click navigation uses the selected entry, never a clock or a timer. */
export function playlistStepIndex(steps,index,direction){
  if(!Array.isArray(steps)||!steps.length||!Number.isInteger(index)||
    ![-1,0,1].includes(direction))return -1;
  const target=index+direction;
  return target>=0&&target<steps.length?target:-1;
}
