import React,{useEffect,useRef,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {
 recordingSupportedMime,recordingBaseMime,recordingArchiveRows,
 recordingNoticeActive,recordingFileError,
 RECORDING_MAX_SECONDS,RECORDING_MAX_BYTES,RECORDING_FORMATS
} from '../state/sessionRecordingModel.mjs';
import '../styles/session-recording.css';

const idle=()=>({status:'idle',revision:0,requestId:'',sessionId:'',participants:[]});
function useRecordingData(campaignId,gm=false){
 const [control,setControl]=useState(idle);
 const [notice,setNotice]=useState(idle);
 const [consents,setConsents]=useState([]);
 const [ownConsent,setOwnConsent]=useState(null);
 const [archives,setArchives]=useState([]);
 useEffect(()=>{
  setControl(idle());setNotice(idle());setConsents([]);setArchives([]);setOwnConsent(null);
  if(!campaignId)return;
  const unsubs=[
   firebaseService.subscribeRecordingNotice(campaignId,setNotice),
   firebaseService.subscribeRecordingArchives(campaignId,setArchives,gm?'gm':'player')
  ];
  if(gm)unsubs.push(
   firebaseService.subscribeRecordingControl(campaignId,setControl),
   firebaseService.subscribeRecordingConsents(campaignId,setConsents)
  );
  else unsubs.push(firebaseService.subscribeOwnRecordingConsent(campaignId,setOwnConsent));
  return()=>unsubs.forEach(stop=>stop?.());
 },[campaignId,gm]);
 return {control,notice,consents,ownConsent,archives:recordingArchiveRows(archives)};
}
async function archiveBlob(campaignId,archive){
 const result=await firebaseService.fetchRecordingArchive(campaignId,archive);
 if(!result?.ok)throw Error(result?.error||'Recording unavailable.');
 return result.blob;
}
function RecordingAudio({campaignId,archive,onError}){
 const [url,setUrl]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{setUrl('');},[archive.id,campaignId,archive.revision]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 const load=async()=>{
  setBusy(true);
  try{const blob=await archiveBlob(campaignId,archive);setUrl(URL.createObjectURL(blob));}
  catch(error){onError(error.message||String(error));}
  finally{setBusy(false);}
 };
 return <div className="asteria-recording-audio">
  {url?<audio controls preload="metadata" src={url}/>:<button disabled={busy} onClick={load}>{busy?'Loading...':'Load Recording'}</button>}
  {url?<button onClick={async()=>{try{
   const blob=await archiveBlob(campaignId,archive);
   const download=URL.createObjectURL(blob);
   const a=document.createElement('a');
   a.href=download;a.download='asteria-session-'+archive.id+'.'+(RECORDING_FORMATS[archive.contentType]?.extension||'webm');
   a.click();window.setTimeout(()=>URL.revokeObjectURL(download),60000);
  }catch(error){onError(error.message||String(error));}}}>Download</button>:null}
 </div>;
}
function ArchiveList({campaignId,archives,onAction,busy,gm=false,onError}){
 return <div className="asteria-recording-list">{archives.map(item=><article key={item.id}>
  <header><strong>{item.title}</strong>
   <small>{Math.ceil(item.durationSeconds/60)} min · {(item.size/1048576).toFixed(1)} MB · {gm?(item.visibility==='players'?'Shared':'GM private'):'Shared by GM'}</small></header>
  {item.summary?<p>{item.summary}</p>:null}
  {item.status==='ready'?<RecordingAudio campaignId={campaignId} archive={item} onError={onError}/>:<p>Upload pending. Archive unfinished entries before retrying.</p>}
  {gm?<div className="asteria-recording-actions">
   {item.status==='ready'?<button disabled={busy} onClick={()=>onAction({
    type:item.visibility==='players'?'unpublish-archive':'publish-archive',
    id:item.id,expectedRevision:item.revision
   })}>{item.visibility==='players'?'Unshare Recording':'Share With Players'}</button>:null}
   <button className="danger" disabled={busy} onClick={()=>onAction({
    type:'archive-archive',id:item.id,expectedRevision:item.revision
   },item)}>Delete Archive</button>
  </div>:null}
 </article>)}{!archives.length?<p>No session recordings in this archive.</p>:null}</div>;
}
export function GMSessionRecordingWorkspace({campaignId,session}){
 const {control,consents,archives}=useRecordingData(campaignId,true);
 const [mode,setMode]=useState('microphone'),[ack,setAck]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [recording,setRecording]=useState(null),[blob,setBlob]=useState(null);
 const [details,setDetails]=useState({title:'',summary:''});
 const recorderRef=useRef(null),streamRef=useRef(null),timerRef=useRef(null);
 const [localAudioUrl,setLocalAudioUrl]=useState('');
 const recordedRequest=useRef(''),[recordInfo,setRecordInfo]=useState(null);
 const localStop=()=>{
  if(timerRef.current){window.clearTimeout(timerRef.current);timerRef.current=null;}
  if(recorderRef.current&&recorderRef.current.state!=='inactive')recorderRef.current.stop();
  for(const track of streamRef.current?.getTracks?.()||[])track.stop();
  streamRef.current=null;
  recorderRef.current=null;
  setRecording(null);
 };
 useEffect(()=>()=>localStop(),[]);
 useEffect(()=>{
  if(!blob){setLocalAudioUrl('');return undefined;}
  const url=URL.createObjectURL(blob);
  setLocalAudioUrl(url);
  return()=>URL.revokeObjectURL(url);
 },[blob]);
 // A GM browser must stop capture if the authoritative recording state changes.
 useEffect(()=>{
  if(recording&&(control.requestId!==recording.requestId || (control.status!=='recording'&&control.status!=='consent'))){
   localStop();setMessage('Recording stopped after campaign recording state changed.');
  }
 },[control.status,control.requestId,recording?.requestId]);
 const command=async action=>{
  if(busy)return null;
  setBusy(true);setMessage('');
  try{
   const result=await firebaseService.manageSessionRecording(campaignId,'gm-scope',action);
   if(!result?.ok)throw Error(result?.error||'Recording action failed.');
   return result;
  }catch(error){setMessage(error.message||String(error));return null;}
  finally{setBusy(false);}
 };
 const request=async()=>{
  if(!ack){setMessage('Confirm that you have permission to record and consent to your own capture.');return;}
  if(session?.status!=='active'||!session?.id){setMessage('Start a campaign session first.');return;}
  const id=crypto.randomUUID();
  const result=await command({type:'request-consent',requestId:id,sessionId:session.id,
   mode,expectedRevision:control.revision||0});
  if(result)setMessage('Consent request sent. Recording will only start after every active participant agrees.');
 };
 const resultConsents=control.participants||[];
 const agreed=resultConsents.filter(uid=>consents.some(row=>row.uid===uid&&row.requestId===control.requestId&&row.decision==='agree'));
 const declined=resultConsents.filter(uid=>consents.some(row=>row.uid===uid&&row.requestId===control.requestId&&row.decision==='decline'));
 const allAgree=control.status==='consent'&&agreed.length===resultConsents.length&&!declined.length;
 const start=async()=>{
  if(!ack||!allAgree){setMessage('All participants must agree first.');return;}
  if(!window.MediaRecorder){setMessage('Recording is not supported by this browser.');return;}
  const mime=recordingSupportedMime(window.MediaRecorder);
  if(!mime){setMessage('No supported audio recording format is available on this device.');return;}
  let stream=null;
  try{
   if(control.mode==='microphone'){
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone recording is unsupported in this browser.');
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
   }else{
    if(!navigator.mediaDevices?.getDisplayMedia)throw Error('Tab audio capture is unsupported in this browser.');
    stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
    if(!stream.getAudioTracks().length)throw Error('The selected tab did not share audio. Select a tab and enable Share tab audio.');
   }
   const result=await command({type:'start-recording',requestId:control.requestId,
    expectedRevision:control.revision});
   if(!result){stream.getTracks().forEach(track=>track.stop());return;}
   setBlob(null);
   const parts=[],recorder=new window.MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:96000});
   recorderRef.current=recorder;streamRef.current=stream;
   const requestId=control.requestId;
   recordedRequest.current=requestId;
   const startedAt=Date.now();
   setRecording({requestId,startedAt});
   const stop=()=>{if(recorder.state!=='inactive')recorder.stop();};
   for(const track of stream.getTracks())track.addEventListener('ended',stop,{once:true});
   recorder.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
   recorder.onerror=()=>{setMessage('Recorder failed. Check your local download before leaving the page.');stop();};
   recorder.onstop=()=>{
    stream.getTracks().forEach(track=>track.stop());
    if(timerRef.current){window.clearTimeout(timerRef.current);timerRef.current=null;}
    if(recorderRef.current===recorder)recorderRef.current=null;
    const actualMime=recordingBaseMime(recorder.mimeType||mime);
    const output=new Blob(parts,{type:actualMime});
    const durationSeconds=Math.max(1,Math.min(RECORDING_MAX_SECONDS,
     Math.ceil((Date.now()-startedAt)/1000)));
    if(output.size>0)setBlob(output);
    setRecordInfo({requestId,sessionId:session.id,durationSeconds,contentType:actualMime});
    setRecording(null);
    if(output.size>RECORDING_MAX_BYTES)
     setMessage('Recording exceeds 40 MB and cannot be uploaded. Download or discard the local copy.');
   };
   recorder.start(1000);
   timerRef.current=window.setTimeout(stop,RECORDING_MAX_SECONDS*1000);
   setMessage('Recording started. A visible recording notice is shown to all campaign participants.');
  }catch(error){
   stream?.getTracks?.().forEach(track=>track.stop());
   setMessage(error.message||String(error));
  }
 };
 const stop=async()=>{
  if(!recording)return;
  const requestId=recording.requestId;
  localStop();
  const result=await command({type:'stop-recording',
   requestId,expectedRevision:control.revision});
  if(!result)setMessage('Local recording stopped; server update failed. Use the Stop Recording control again after refreshing.');
 };
 const cancel=async()=>{const result=await command({type:'cancel-consent',
  requestId:control.requestId,expectedRevision:control.revision});
  if(result){setAck(false);setMessage('Consent request cancelled.');}};
 const download=()=>{
  if(!blob||!recordInfo)return;
  const extension=RECORDING_FORMATS[recordInfo.contentType]?.extension||'webm';
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='asteria-session-'+recordInfo.requestId+'.'+extension;
  a.click();window.setTimeout(()=>URL.revokeObjectURL(url),60000);
 };
 const upload=async()=>{
  if(!blob||!recordInfo){setMessage('No finished recording to save.');return;}
  if(blob.size>RECORDING_MAX_BYTES){setMessage('Recording exceeds the 40 MB cloud archive limit.');return;}
  const extension=RECORDING_FORMATS[recordInfo.contentType]?.extension||'webm';
  const file=new File([blob],'session.'+extension,{type:recordInfo.contentType});
  const error=recordingFileError(file);
  if(error){setMessage(error);return;}
  setBusy(true);setMessage('');
  try{
   const result=await firebaseService.uploadRecordingArchive(campaignId,file,{
    title:details.title||'Session Recording',summary:details.summary,
    requestId:recordInfo.requestId,sessionId:recordInfo.sessionId,
    durationSeconds:recordInfo.durationSeconds
   });
   if(!result?.ok)throw Error(result?.error||'Upload failed.');
   setMessage('Private recording saved. Share it explicitly if players should have access.');
   setBlob(null);setRecordInfo(null);setDetails({title:'',summary:''});
  }catch(error){setMessage(error.message||String(error));}
  finally{setBusy(false);}
 };
 const archiveAction=async(action,record)=>{
  if(record&&!window.confirm('Permanently remove this recording from the campaign library and revoke player access?'))return;
  const result=await command(action);
  if(result&&record){
   const removed=await firebaseService.removeRecordingArchiveBytes(campaignId,record);
   if(!removed?.ok)setMessage('Archive hidden, but Storage cleanup failed: '+(removed.error||'retry required'));
   else setMessage('Recording archived and Storage file deleted.');
  }
 };
 return <section className="asteria-recording" aria-label="GM session recording and archives">
  <header><h2>Session Recording & Archives</h2>
   <p>Record microphone audio or audio from a browser tab, with explicit campaign participant consent. This does not capture other players' microphones automatically.</p>
  </header>
  <p role="status" aria-live="polite">{message}</p>
  <div className="asteria-recording-grid">
   <Panel title="Recording Consent" eyebrow="Permission is required before capture">
    <p>Session: {session?.id||'None'} · Status: {session?.status||'idle'}</p>
    <label>Capture source<select value={mode} disabled={control.status==='recording'||control.status==='consent'} onChange={e=>setMode(e.target.value)}>
     <option value="microphone">My microphone only</option>
     <option value="tab-audio">Audio from a browser tab</option>
    </select></label>
    <label className="asteria-recording-confirm"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
     I consent to this recording and confirm I have permission to capture the chosen audio.</label>
    {control.status==='consent'?<>
     <p><strong>Awaiting consent:</strong> {agreed.length} of {resultConsents.length} participants agreed.
      {declined.length?' '+declined.length+' declined.':''}</p>
     <ul>{resultConsents.map(uid=><li key={uid}>{uid} — {consents.find(row=>row.uid===uid&&row.requestId===control.requestId)?.decision||'pending'}</li>)}</ul>
     <div className="asteria-recording-actions">
      <button disabled={busy||!allAgree||!ack} onClick={start}>Start Recording</button>
      <button disabled={busy} onClick={cancel}>Cancel Request</button>
     </div>
    </>:control.status==='recording'?<>
     <p role="alert">Recording active. All participants should see the live recording notice.</p>
     <button className="danger" disabled={busy||!recording} onClick={stop}>Stop Recording</button>
    </>:<button className="primary" disabled={busy||!ack||session?.status!=='active'} onClick={request}>Request Recording Consent</button>}
    <small>Maximum 30 minutes per clip. Recording is processed on this browser; the cloud archive is optional.</small>
   </Panel>
   <Panel title="Local Recording" eyebrow="Save or export after stopping">
    {blob&&recordInfo?<div className="asteria-recording-form">
     <p>Clip: {(blob.size/1048576).toFixed(1)} MB · {Math.ceil(recordInfo.durationSeconds/60)} min</p>
     {localAudioUrl?<audio controls src={localAudioUrl}/>:null}
     <label>Archive title<input maxLength={140} value={details.title} onChange={e=>setDetails({...details,title:e.target.value})} placeholder="Session recap"/></label>
     <label>Session summary<textarea rows={4} maxLength={2000} value={details.summary} onChange={e=>setDetails({...details,summary:e.target.value})}/></label>
     <div className="asteria-recording-actions">
      <button onClick={download}>Download Local Recording</button>
      <button className="primary" disabled={busy} onClick={upload}>Save Private Archive</button>
      <button disabled={busy} onClick={()=>{if(window.confirm('Discard the local recording?')){setBlob(null);setRecordInfo(null);}}}>Discard Local Recording</button>
     </div>
    </div>:<p>Finish a recording to download it locally or store it in your campaign archive. Saving is never automatic.</p>}
   </Panel>
  </div>
  <Panel title="Session Archives" eyebrow="GM-private until explicitly shared">
   <p>Maximum 25 active files per campaign, 250 MB total reserved storage, 40 MB per recording.</p>
   <ArchiveList campaignId={campaignId} archives={archives} gm onAction={archiveAction} busy={busy} onError={setMessage}/>
  </Panel>
 </section>;
}
export function PlayerRecordingNotice({campaignId}){
 const {notice,ownConsent}=useRecordingData(campaignId,false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lastRequest=useRef('');
 useEffect(()=>{if(lastRequest.current!==notice.requestId){setMessage('');lastRequest.current=notice.requestId;}},[notice.requestId]);
 const respond=async decision=>{
  setBusy(true);setMessage('');
  try{
   const result=await firebaseService.respondRecordingConsent(campaignId,'member-scope',
    {requestId:notice.requestId,decision});
   if(!result?.ok)throw Error(result?.error||'Consent response failed.');
   setMessage(decision==='agree'?'You agreed to this recording.':'You declined this recording.');
  }catch(error){setMessage(error.message||String(error));}
  finally{setBusy(false);}
 };
 if(notice.status!=='consent'&&!recordingNoticeActive(notice))return null;
 return <section className="asteria-recording-notice" role="region" aria-label="Session recording notice">
  {notice.status==='consent'?<>
   <strong>Recording permission requested</strong>
   <p>The GM wants to capture {notice.mode==='microphone'?'their microphone':'browser-tab audio'}.
    You may decline. Recording cannot start until all listed participants explicitly agree.</p>
   {ownConsent?.requestId===notice.requestId?<p>Your response: {ownConsent.decision}</p>:null}
   <div className="asteria-recording-actions">
    <button disabled={busy} onClick={()=>respond('agree')}>I Agree</button>
    <button disabled={busy} onClick={()=>respond('decline')}>Decline</button>
   </div>
  </>:<>
   <strong>Recording in progress</strong>
   <p>The GM has started a recording of {notice.mode==='microphone'?'their microphone':'browser-tab audio'}.</p>
  </>}
  {message?<p role="status">{message}</p>:null}
 </section>;
}
export function PlayerSessionRecordingWorkspace({campaignId}){
 const {notice,archives}=useRecordingData(campaignId,false);
 const [message,setMessage]=useState('');
 return <section className="asteria-recording" aria-label="Campaign recording library">
  <header><h2>Recordings & Archives</h2><p>Only GM-approved recordings are available to campaign members.</p></header>
  <p>{recordingNoticeActive(notice)?'A recording is currently in progress.':'No active recording is in progress.'}</p>
  {message?<p role="alert">{message}</p>:null}
  <Panel title="Shared Session Recordings">
   <ArchiveList campaignId={campaignId} archives={archives} onError={setMessage}/>
  </Panel>
 </section>;
}
