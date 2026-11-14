/** Phase 9.2: campaign-scoped soundboard and opt-in live ambience.
 * All player-facing audio is explicitly published by a campaign GM.
 */
export const AUDIO_TRACK_LIMIT=40;
export const AUDIO_MAX_BYTES=20*1024*1024;
export const AUDIO_CATEGORIES=Object.freeze(['ambient','music','effect']);
export const AUDIO_FORMATS=Object.freeze({
 'audio/mpeg':{extension:'mp3',label:'MP3'},
 'audio/ogg':{extension:'ogg',label:'Ogg'},
 'audio/wav':{extension:'wav',label:'WAV'},
 'audio/webm':{extension:'webm',label:'WebM'}
});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const audioId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value);
function shape(value,allowed,name){
 if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))
  throw Error('Invalid '+name+' fields.');
}
function bounded(value,max,name,required=true){
 if(typeof value!=='string'||value.length>max||(required&&!value.trim()))
  throw Error('Enter a valid '+name+' (maximum '+max+' characters).');
 return value.trim();
}
function integer(value,min,max,name){
 if(!Number.isSafeInteger(value)||value<min||value>max)
  throw Error('Invalid '+name+'.');
 return value;
}
const extensionFor=fileName=>String(fileName||'').split('.').pop().toLowerCase();
export function audioFileError(file){
 if(!file||typeof file!=='object')return 'Choose an audio file.';
 const fmt=AUDIO_FORMATS[file.type];
 if(!fmt)return 'Supported formats: MP3, Ogg, WAV and WebM audio.';
 if(!Number.isSafeInteger(file.size)||file.size<1||file.size>AUDIO_MAX_BYTES)
  return 'Audio file must be between 1 byte and 20 MB.';
 if(extensionFor(file.name)!==fmt.extension)
  return 'Audio extension must match the selected file format.';
 return '';
}
export function audioMagicMatches(contentType,bytes){
 if(!(bytes instanceof Uint8Array))return false;
 const ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
 switch(contentType){
  case 'audio/mpeg':return ascii(0,3)==='ID3'||(bytes.length>=2&&bytes[0]===255&&(bytes[1]&224)===224);
  case 'audio/ogg':return ascii(0,4)==='OggS';
  case 'audio/wav':return ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE';
  case 'audio/webm':return bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163;
  default:return false;
 }
}
export function audioTrackPath(campaignId,trackId,contentType){
 if(!audioId(campaignId)||!audioId(trackId)||!AUDIO_FORMATS[contentType])
  throw Error('Invalid campaign audio path.');
 return 'campaigns/'+campaignId+'/audioTracks/'+trackId+'/audio.'+AUDIO_FORMATS[contentType].extension;
}
export function audioSettings(input={}){
 shape(input,['name','description','category','volume','loop'],'audio settings');
 if(!AUDIO_CATEGORIES.includes(input.category))throw Error('Choose ambient, music or sound effect.');
 if(typeof input.loop!=='boolean')throw Error('Choose a valid loop option.');
 return {name:bounded(input.name,120,'audio title'),
  description:bounded(input.description||'',500,'description',false),
  category:input.category,volume:integer(input.volume,0,100,'audio volume'),loop:input.loop};
}
export function audioUploadDetails(input={}){
 shape(input,['name','description','category','volume','loop','fileName','size','contentType'],'audio upload');
 const fmt=AUDIO_FORMATS[input.contentType];
 if(!fmt)throw Error('Choose a supported audio format.');
 const fileName=bounded(input.fileName,160,'filename');
 if(fileName.includes('/')||fileName.includes('\\')||/[<>:"|?*]/.test(fileName)||
   [...fileName].some(char=>char.charCodeAt(0)<32)||extensionFor(fileName)!==fmt.extension)
  throw Error('Invalid audio filename.');
 return {...audioSettings({name:input.name,description:input.description||'',
  category:input.category,volume:input.volume,loop:input.loop}),
  fileName,size:integer(input.size,1,AUDIO_MAX_BYTES,'audio size'),
  contentType:input.contentType};
}
export function audioPublicTrack(track){
 if(!object(track)||track.status!=='ready'||track.visibility!=='players')
  throw Error('Only approved ready audio tracks may be published.');
 return {id:track.id,name:track.name,description:track.description,category:track.category,
  loop:track.loop,volume:track.volume,contentType:track.contentType,
  storagePath:track.storagePath,size:track.size,status:'ready',visibility:'players',
  revision:track.revision};
}
export function audioLibraryRows(rows=[]){
 return (Array.isArray(rows)?rows:[]).filter(track=>track&&track.status!=='archived')
  .sort((a,b)=>String(a.category||'').localeCompare(String(b.category||''))||
    String(a.name||'').localeCompare(String(b.name||'')));
}
export function audioRevision(value){
 return integer(value,1,1000000,'audio revision');
}
export function audioLiveRevision(value){
 return integer(value,0,1000000,'live cue revision');
}
export function validateAudioAction(action={}){
 if(!object(action))throw Error('Invalid soundboard request.');
 const fields={
  'reserve-track':['type','id','details'],
  'finish-track':['type','id','expectedRevision'],
  'update-track':['type','id','expectedRevision','settings'],
  'publish-track':['type','id','expectedRevision'],
  'unpublish-track':['type','id','expectedRevision'],
  'archive-track':['type','id','expectedRevision'],
  'play-ambient':['type','trackId','expectedLiveRevision'],
  'pause-ambient':['type','expectedLiveRevision'],
  'resume-ambient':['type','expectedLiveRevision'],
  'stop-ambient':['type','expectedLiveRevision'],
  'play-effect':['type','trackId','expectedLiveRevision'],
  'stop-effect':['type','expectedLiveRevision']
 };
 if(!Object.hasOwn(fields,action.type))throw Error('Unsupported soundboard action.');
 shape(action,fields[action.type],'soundboard action');
 if(action.type==='reserve-track'||action.type.includes('-track')){
  if(!audioId(action.id))throw Error('Invalid track ID.');
  if(action.type!=='reserve-track')audioRevision(action.expectedRevision);
 }
 if(action.type==='reserve-track')audioUploadDetails(action.details);
 if(action.type==='update-track')audioSettings(action.settings);
 if(Object.hasOwn(action,'expectedLiveRevision'))audioLiveRevision(action.expectedLiveRevision);
 if(Object.hasOwn(action,'trackId')&&!audioId(action.trackId))throw Error('Invalid audio cue.');
 return action.type;
}
/** Approximate current position for a resumed ambient stream, independent of transport delay. */
export function ambientOffsetSeconds(cue={},now=Date.now()){
 if(!object(cue))return 0;
 const position=Number(cue.positionMs||0);
 const elapsed=cue.status==='playing'?Math.max(0,now-Number(cue.startedAt||now)):0;
 return Math.max(0,Math.min(86400000,position+elapsed))/1000;
}
