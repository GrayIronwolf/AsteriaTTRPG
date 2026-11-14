/** Phase 9.3: explicit participant consent, browser recording and private session archives.
 * Recording is never automatic. Cloud saving is opt-in and quota-bound.
 */
export const RECORDING_MAX_SECONDS=30*60;
export const RECORDING_MAX_BYTES=40*1024*1024;
export const RECORDING_CAMPAIGN_BUDGET_BYTES=250*1024*1024;
export const RECORDING_ARCHIVE_LIMIT=25;
export const RECORDING_PARTICIPANT_LIMIT=32;
export const RECORDING_MODES=Object.freeze(['microphone','tab-audio']);
export const RECORDING_FORMATS=Object.freeze({
 'audio/webm':{extension:'webm',label:'WebM audio'},
 'audio/ogg':{extension:'ogg',label:'Ogg audio'},
 'audio/mp4':{extension:'m4a',label:'M4A audio'}
});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const recordingId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value);
function fields(value,allowed,kind){
 if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))
  throw Error('Invalid '+kind+' fields.');
}
function str(value,max,name,required=false){
 if(typeof value!=='string'||value.length>max||(required&&!value.trim()))
  throw Error('Enter a valid '+name+' (maximum '+max+' characters).');
 return value.trim();
}
function integer(value,min,max,name){
 if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('Invalid '+name+'.');
 return value;
}
export function recordingRevision(value){return integer(value,0,1000000,'recording revision');}
export function recordingArchiveRevision(value){return integer(value,1,1000000,'archive revision');}
export function recordingMode(value){
 if(!RECORDING_MODES.includes(value))throw Error('Choose microphone or browser-tab audio.');
 return value;
}
export function recordingSupportedMime(recorderClass){
 if(!recorderClass||typeof recorderClass.isTypeSupported!=='function')return '';
 for(const type of ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm','audio/ogg']){
  if(recorderClass.isTypeSupported(type))return type;
 }
 return '';
}
export function recordingBaseMime(mime){
 const type=String(mime||'').split(';')[0].trim().toLowerCase();
 if(!Object.hasOwn(RECORDING_FORMATS,type))throw Error('Unsupported recording audio format.');
 return type;
}
export function recordingFileError(file){
 if(!file||typeof file!=='object')return 'Choose a recorded audio file.';
 let type;
 try{type=recordingBaseMime(file.type);}catch(error){return error.message;}
 if(!Number.isSafeInteger(file.size)||file.size<1||file.size>RECORDING_MAX_BYTES)
  return 'Each audio clip must be between 1 byte and 40 MB.';
 const expected=RECORDING_FORMATS[type].extension;
 if(!String(file.name||'').toLowerCase().endsWith('.'+expected))
  return 'File extension must match recorded audio format.';
 return '';
}
export function recordingMagicMatches(type,bytes){
 if(!(bytes instanceof Uint8Array))return false;
 const head=(s,e)=>String.fromCharCode(...bytes.slice(s,e));
 switch(recordingBaseMime(type)){
  case 'audio/webm':return bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163;
  case 'audio/ogg':return head(0,4)==='OggS';
  case 'audio/mp4':return head(4,8)==='ftyp';
  default:return false;
 }
}
export function recordingPath(campaignId,archiveId,mime){
 const type=recordingBaseMime(mime);
 if(!recordingId(campaignId)||!recordingId(archiveId))throw Error('Invalid recording storage path.');
 return 'campaigns/'+campaignId+'/sessionRecordings/'+archiveId+'/recording.'+RECORDING_FORMATS[type].extension;
}
export function recordingMetadata(input={}){
 fields(input,['title','summary','sessionId','requestId','durationSeconds','size','contentType'],'archive details');
 if(!recordingId(input.sessionId)||!recordingId(input.requestId))
  throw Error('Session and consent reference are required.');
 return {
  title:str(input.title,140,'recording title',true),
  summary:str(input.summary||'',2000,'recording summary'),
  sessionId:input.sessionId,requestId:input.requestId,
  durationSeconds:integer(input.durationSeconds,1,RECORDING_MAX_SECONDS,'recorded duration'),
  size:integer(input.size,1,RECORDING_MAX_BYTES,'recording size'),
  contentType:recordingBaseMime(input.contentType)
 };
}
export function recordingSummary(input={}){
 fields(input,['title','summary'],'archive edit');
 return {title:str(input.title,140,'recording title',true),summary:str(input.summary||'',2000,'recording summary')};
}
export function publicRecordingArchive(record){
 if(!object(record)||record.status!=='ready'||record.visibility!=='players')
  throw Error('Only approved ready recordings can be shared.');
 return {
  id:record.id,title:record.title,summary:record.summary,sessionId:record.sessionId,
  durationSeconds:record.durationSeconds,size:record.size,contentType:record.contentType,
  storagePath:record.storagePath,status:'ready',visibility:'players',revision:record.revision
 };
}
export function recordingNoticeActive(notice={},now=Date.now()){
 return notice.status==='recording'&&Number.isFinite(notice.expiresAt)&&notice.expiresAt>now;
}
export function recordingArchiveRows(rows=[]){
 return (Array.isArray(rows)?rows:[]).filter(x=>x&&x.status!=='archived').sort((a,b)=>{
  const left=Number(a.createdAt?.seconds||0),right=Number(b.createdAt?.seconds||0);
  return right-left||String(a.title||'').localeCompare(String(b.title||''));
 });
}
export function recordingStorageEstimate(bytes){
 const amount=Number(bytes)||0;
 return {newMiB:Math.ceil(amount/1048576*10)/10,
  budgetMiB:250,percentage:Math.min(100,Math.round(100*amount/RECORDING_CAMPAIGN_BUDGET_BYTES))};
}
export function validateRecordingAction(action={}){
 if(!object(action))throw Error('Invalid recording operation.');
 const types={
  'request-consent':['type','requestId','sessionId','mode','expectedRevision'],
  'start-recording':['type','requestId','expectedRevision'],
  'stop-recording':['type','requestId','expectedRevision'],
  'cancel-consent':['type','requestId','expectedRevision'],
  'reserve-archive':['type','id','details'],
  'finish-archive':['type','id','expectedRevision'],
  'update-archive':['type','id','expectedRevision','details'],
  'publish-archive':['type','id','expectedRevision'],
  'unpublish-archive':['type','id','expectedRevision'],
  'archive-archive':['type','id','expectedRevision']
 };
 if(!Object.hasOwn(types,action.type))throw Error('Unsupported recording operation.');
 fields(action,types[action.type],'recording action');
 if(action.type==='request-consent'){
  if(!recordingId(action.requestId)||!recordingId(action.sessionId))
   throw Error('Choose a valid session and recording request.');
  recordingMode(action.mode);recordingRevision(action.expectedRevision);
 }else if(['start-recording','stop-recording','cancel-consent'].includes(action.type)){
  if(!recordingId(action.requestId))throw Error('Invalid consent request.');
  recordingRevision(action.expectedRevision);
 }else{
  if(!recordingId(action.id))throw Error('Invalid archive ID.');
  if(action.type==='reserve-archive')recordingMetadata(action.details);
  else recordingArchiveRevision(action.expectedRevision);
  if(action.type==='update-archive')recordingSummary(action.details);
 }
 return action.type;
}
export function validateRecordingConsent(action={}){
 fields(action,['requestId','decision'],'recording consent');
 if(!recordingId(action.requestId)||!['agree','decline'].includes(action.decision))
  throw Error('Choose an active request and agree or decline.');
 return action;
}
