import {informationScopes,normalizeInformation,publicInformation} from '../../../src/state/campaignInformation.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const rows=value=>Array.isArray(value)?value:[];
export const GM_STORY_ENTRY_LIMIT=150;
export const GM_SESSION_LOG_LIMIT=100;
const DOC_ID=/^[A-Za-z0-9_-]{1,100}$/;

export function gmNotesProjection(workspace={}){
  const notes=object(workspace.notes)?workspace.notes:{};
  return {privateNotes:typeof notes.privateNotes==='string'?notes.privateNotes:'',
    sessionLogs:rows(notes.sessionLogs)};
}

export function savePrivateGMNotes(current,content,expected){
  if(typeof content!=='string'||content.length>20000)
    throw Error('Private GM notes must contain at most 20,000 characters.');
  const old=gmNotesProjection({notes:current});
  if(String(old.privateNotes)!==String(expected))
    throw Error('Private GM notes changed in another tab. Reload before saving.');
  return {...(object(current)?current:{}),privateNotes:content};
}

export function appendGMSessionLog(current,input,{id,at}={}){
  const notes=gmNotesProjection({notes:current});
  if(!object(input))throw Error('Invalid session log.');
  const title=String(input.title||'').trim(),body=String(input.body||'').trim();
  if(!title||title.length>120||!body||body.length>16000)
    throw Error('Enter a session title (120 characters max) and summary (16,000 max).');
  if(!DOC_ID.test(String(id||'')))throw Error('Invalid session log identifier.');
  if(notes.sessionLogs.length>=GM_SESSION_LOG_LIMIT)
    throw Error('The session log is full. Export or remove older entries first.');
  const status=String(input.sessionStatus||'idle');
  const entry={id,title,body,createdAt:at||new Date().toISOString(),
    sessionId:String(input.sessionId||'').slice(0,160),
    sessionStatus:['idle','active','paused','ended','expired'].includes(status)?status:'idle'};
  return {...(object(current)?current:{}),sessionLogs:[entry,...notes.sessionLogs]};
}

export function deleteGMSessionLog(current,id,expectedCreatedAt){
  if(!DOC_ID.test(String(id||'')))throw Error('Invalid session log identifier.');
  const notes=gmNotesProjection({notes:current});
  const row=notes.sessionLogs.find(item=>item?.id===id);
  if(!row)throw Error('Session log was removed in another tab.');
  if(String(row.createdAt||'')!==String(expectedCreatedAt||''))
    throw Error('Session log changed. Reload before deleting.');
  return {...(object(current)?current:{}),
    sessionLogs:notes.sessionLogs.filter(item=>item?.id!==id)};
}

export function blankGMInformation(kind,campaign={},id=''){
  if(!['news','events'].includes(kind))throw Error('Choose news or events.');
  const scopes=informationScopes(campaign),initial=scopes[0]||{scope:'World',location:'Asteria'};
  return {id,title:'',description:'',scope:initial.scope,location:initial.location,
    source:'',start:'',end:'',status:'Upcoming',published:false,revision:0,kind};
}

export function saveGMInformation({kind,input,campaign,world,sharedInformation,uid,at}){
  if(!object(input)||!['news','events'].includes(kind))
    throw Error('Choose a valid news or event entry.');
  const currentWorld=object(world)?world:{};
  const existingRows=rows(currentWorld[kind]);
  const row=normalizeInformation(input,kind,campaign);
  if(!DOC_ID.test(row.id))throw Error('Invalid news/event identifier.');
  const existing=existingRows.find(entry=>entry?.id===row.id);
  if(!existing&&existingRows.length>=GM_STORY_ENTRY_LIMIT)
    throw Error('Campaign news/event limit reached.');
  if(existing&&Number(existing.revision||0)!==Number(input.revision||0))
    throw Error('News/event entry changed in another tab. Reload before saving.');
  if(!existing&&Number(input.revision||0)!==0)
    throw Error('News/event entry was removed. Reload the list.');
  const saved={...existing,...row,revision:Number(existing?.revision||0)+1,
    updatedAt:at||new Date().toISOString(),updatedBy:uid||''};
  const newRows=existing?existingRows.map(entry=>entry?.id===row.id?saved:entry):
    [saved,...existingRows];
  const nextWorld={...currentWorld,[kind]:newRows};
  if(JSON.stringify(nextWorld).length>850000)
    throw Error('Campaign world data is too large for a safe update.');
  const information={...(object(sharedInformation)?sharedInformation:{})};
  const key=kind+'-'+row.id;
  if(saved.published)information[key]=publicInformation(saved);
  else delete information[key];
  if(JSON.stringify(information).length>850000)
    throw Error('Published campaign information is too large.');
  return {world:nextWorld,information,saved};
}
export function validateGMAnnouncement({title,message,recipients}={}){
  const heading=String(title||'').trim(),body=String(message||'').trim();
  if(!heading||heading.length>160||!body||body.length>4000)
    throw Error('Enter an announcement title (160 max) and message (4,000 max).');
  if(!Array.isArray(recipients)||!recipients.length||recipients.length>50)
    throw Error('Select 1 to 50 linked characters.');
  const ids=[...new Set(recipients)];
  if(ids.length!==recipients.length||!ids.every(id=>
    typeof id==='string'&&DOC_ID.test(id)))
    throw Error('Select valid, non-duplicate linked characters.');
  return {title:heading,message:body,recipients:ids};
}
