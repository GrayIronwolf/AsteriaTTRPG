import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {
 AUDIO_CATEGORIES,audioLibraryRows,audioFileError,ambientOffsetSeconds
} from '../state/campaignAudioModel.mjs';
import '../styles/campaign-audio.css';

const defaultSettings=()=>({name:'',description:'',category:'ambient',volume:70,loop:true});
const pretty=value=>String(value||'').replace(/^./,char=>char.toUpperCase());
const emptyLive=()=>({version:1,revision:0,ambient:null,effect:null});

function useCampaignSound(campaignId,mode){
 const [tracks,setTracks]=useState([]),[live,setLive]=useState(emptyLive);
 useEffect(()=>{
  setTracks([]);setLive(emptyLive());
  if(!campaignId)return;
  return [
   firebaseService.subscribeCampaignAudio(campaignId,setTracks,mode),
   firebaseService.subscribeCampaignAudioLive(campaignId,setLive)
  ].reduce((stop,unsubscribe)=>{stop.push(unsubscribe);return stop;},[])
   .reduce((cleanup,unsubscribe)=>(cleanup.push(unsubscribe),cleanup),[]);
 },[campaignId,mode]);
 // Dedicated cleanup so listeners remain independent of presentation state.
 return {tracks:audioLibraryRows(tracks),live};
}

/** Blob URLs are never persisted. URL revocation stops stale/revoked audio on all browsers. */
function useAudioTransport(campaignId,tracks,live,{enabled=false,localVolume=70,onError=()=>{}}={}){
 const ambient=useRef(null),effect=useRef(null);
 const blobUrls=useRef(new Map());
 const requestEpoch=useRef(0);
 const errorCallback=useRef(onError);
 errorCallback.current=onError;
 const [status,setStatus]=useState('Audio stopped.');
 const [refresh,setRefresh]=useState(0);
 const trackMap=useMemo(()=>new Map(tracks.map(track=>[track.id,track])),[tracks]);
 const activeAmbient=live?.ambient?.trackId&&trackMap.has(live.ambient.trackId)?live.ambient:null;
 const activeEffect=live?.effect?.trackId&&trackMap.has(live.effect.trackId)?live.effect:null;
 const playKey=activeAmbient?.status==='playing'?activeAmbient.trackId+
  ':'+activeAmbient.startedAt+':'+activeAmbient.positionMs:'';
 const effectKey=activeEffect?.cueId?activeEffect.trackId+':'+activeEffect.cueId:'';
 useEffect(()=>{
  let disposed=false;
  const pending=++requestEpoch.current;
  const tracked=new Map();
  const stop=()=>{
   for(const audio of [ambient.current,effect.current])if(audio){audio.pause();audio.removeAttribute('src');audio.load();}
   ambient.current=null;effect.current=null;
   for(const url of blobUrls.current.values())URL.revokeObjectURL(url);
   blobUrls.current.clear();
  };
  stop();
  if(!enabled){
   setStatus('Audio muted on this device.');
   return()=>{disposed=true;requestEpoch.current++;stop();};
  }
  const ensure=async track=>{
   if(!track||!track.storagePath)throw Error('Track is no longer published.');
   if(blobUrls.current.has(track.id))return blobUrls.current.get(track.id);
   if(tracked.has(track.id))return tracked.get(track.id);
   const task=firebaseService.fetchCampaignAudio(campaignId,track).then(result=>{
    if(!result?.ok)throw Error(result?.error||'Audio unavailable.');
    if(disposed||pending!==requestEpoch.current)return '';
    const url=URL.createObjectURL(result.blob);
    blobUrls.current.set(track.id,url);
    return url;
   });
   tracked.set(track.id,task);
   return task;
  };
  const start=async()=>{
   try{
    if(activeAmbient){
     const track=trackMap.get(activeAmbient.trackId);
     const src=await ensure(track);
     if(!src||disposed)return;
     const audio=new Audio(src);
     ambient.current=audio;
     audio.loop=Boolean(activeAmbient.loop);
     audio.volume=Math.max(0,Math.min(1,Number(activeAmbient.volume||0)*localVolume/10000));
     audio.onended=()=>setStatus('Ambient audio finished.');
     audio.onerror=()=>errorCallback.current('Ambient audio could not be decoded.');
     const seek=()=>{try{const offset=ambientOffsetSeconds(activeAmbient);
      audio.currentTime=audio.loop&&Number.isFinite(audio.duration)&&audio.duration>0?
       offset%audio.duration:offset;}catch{/* Some browsers do not permit early seeks. */}};
     audio.addEventListener('loadedmetadata',seek,{once:true});
     if(activeAmbient.status==='playing'){
      await audio.play();
      if(!disposed)setStatus('Playing: '+track.name);
     }else{
      seek();setStatus('Ambient playback paused by GM.');
     }
    }else setStatus('No shared ambience playing.');
    if(activeEffect?.cueId){
     const track=trackMap.get(activeEffect.trackId);
     const src=await ensure(track);
     if(!src||disposed)return;
     const audio=new Audio(src);
     effect.current=audio;
     audio.volume=Math.max(0,Math.min(1,Number(activeEffect.volume||0)*localVolume/10000));
     audio.loop=false;
     await audio.play();
    }
   }catch(error){
    if(!disposed){setStatus(error.message||String(error));errorCallback.current(error.message||String(error));}
   }
  };
  start();
  return()=>{disposed=true;requestEpoch.current++;stop();};
 },[campaignId,enabled,playKey,effectKey,activeAmbient?.status,localVolume,refresh]);
 return {status,retry:()=>setRefresh(n=>n+1)};
}

function SoundPlayer({campaignId,tracks,live,gm=false}){
 const [enabled,setEnabled]=useState(false),[volume,setVolume]=useState(70),[message,setMessage]=useState('');
 const player=useAudioTransport(campaignId,tracks,live,{enabled,localVolume:volume,onError:setMessage});
 const active=tracks.find(track=>track.id===live?.ambient?.trackId);
 return <Panel title={gm?'GM Audio Monitor':'Live Campaign Ambience'}
   eyebrow={gm?'Listen to published audio on this device':'Opt in to hear GM-controlled audio'}>
   <div className="asteria-audio-controls">
     <button type="button" className={enabled?'':'primary'} onClick={()=>setEnabled(value=>!value)}>
       {enabled?'Mute This Device':'Enable Audio On This Device'}</button>
     <label>Local volume: {volume}%<input type="range" min="0" max="100" value={volume}
       onChange={event=>setVolume(Number(event.target.value))}/></label>
     {enabled?<button type="button" onClick={player.retry}>Reconnect audio</button>:null}
   </div>
   <p role="status">{enabled?player.status:'Audio is off until you enable it.'}</p>
   {active?<p>Current ambience: <strong>{active.name}</strong> ({live.ambient.status})</p>:<p>No ambient track is active.</p>}
   {message?<p role="alert">{message}</p>:null}
   <small>Browsers require a user action before playback. Audio plays only on this device; this feature does not record microphones or transmit voice.</small>
 </Panel>;
}
export function GMCampaignSoundboard({campaignId}){
 const {tracks,live}=useCampaignSound(campaignId,'gm');
 const [file,setFile]=useState(null),[settings,setSettings]=useState(defaultSettings);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [search,setSearch]=useState('');
 const [preview,setPreview]=useState(null);
 const localAudio=useRef(null),localUrl=useRef('');
 useEffect(()=>()=>{localAudio.current?.pause();if(localUrl.current)URL.revokeObjectURL(localUrl.current);},[]);
 const list=tracks.filter(track=>(track.name+' '+track.description+' '+track.category).toLowerCase().includes(search.toLowerCase()));
 const run=async action=>{
  if(busy)return null;
  setBusy(true);setMessage('');
  try{
   const result=await firebaseService.manageCampaignAudio(campaignId,'gm-scope',action);
   if(!result?.ok)throw Error(result?.error||'Audio action failed.');
   setMessage('Soundboard synchronized.');
   return result;
  }catch(error){setMessage(error.message||String(error));return null;}
  finally{setBusy(false);}
 };
 const upload=async event=>{
  event.preventDefault();
  const invalid=audioFileError(file);
  if(invalid){setMessage(invalid);return;}
  setBusy(true);setMessage('');
  try{
   const result=await firebaseService.uploadCampaignAudio(campaignId,file,settings);
   if(!result?.ok)throw Error(result?.error||'Audio upload failed.');
   setSettings(defaultSettings());setFile(null);
   setMessage('Private audio uploaded. Publish before broadcasting to players.');
  }catch(error){setMessage(error.message||String(error));}
  finally{setBusy(false);}
 };
 const stopPreview=()=>{
  localAudio.current?.pause();
  localAudio.current=null;
  if(localUrl.current){URL.revokeObjectURL(localUrl.current);localUrl.current='';}
  setPreview(null);
 };
 const previewTrack=async track=>{
  stopPreview();
  try{
   const result=await firebaseService.fetchCampaignAudio(campaignId,track);
   if(!result?.ok)throw Error(result?.error||'Private audio preview failed.');
   const url=URL.createObjectURL(result.blob);
   localUrl.current=url;
   const audio=new Audio(url);
   audio.volume=track.volume/100;audio.loop=track.loop;
   localAudio.current=audio;setPreview(track.id);
   audio.onended=stopPreview;
   await audio.play();
  }catch(error){stopPreview();setMessage(error.message||String(error));}
 };
 const dispatch=(type,trackId)=>run({type,...(trackId?{trackId}:{}),
  expectedLiveRevision:Number(live?.revision||0)});
 const archive=async track=>{
  if(!window.confirm('Archive this sound and revoke any player access?'))return;
  if(preview===track.id)stopPreview();
  const result=await run({type:'archive-track',id:track.id,expectedRevision:track.revision});
  if(result){
   const cleanup=await firebaseService.removeCampaignAudioBytes(campaignId,track);
   if(!cleanup?.ok)setMessage('Archived, but Storage cleanup requires a GM retry: '+(cleanup.error||'Unknown error'));
  }
 };
 return <section className="asteria-audio-workspace" aria-label="GM Soundboard">
   <header><h2>Soundboard & Ambient Audio</h2>
     <p>Upload your own sound files, preview privately, publish to the campaign and trigger live audio. Players must enable listening on their own devices.</p>
   </header>
   <p role="status" aria-live="polite">{message}</p>
   <div className="asteria-audio-grid">
    <Panel title="Upload Audio" eyebrow="Private campaign audio library">
     <form onSubmit={upload} className="asteria-audio-form">
      <label>Title<input required maxLength="120" value={settings.name}
        onChange={e=>setSettings({...settings,name:e.target.value})}/></label>
      <label>Description<input maxLength="500" value={settings.description}
        onChange={e=>setSettings({...settings,description:e.target.value})}/></label>
      <label>Category<select value={settings.category}
        onChange={e=>setSettings({...settings,category:e.target.value,loop:e.target.value!=='effect'})}>
        {AUDIO_CATEGORIES.map(cat=><option key={cat} value={cat}>{pretty(cat)}</option>)}
      </select></label>
      <label>Default volume: {settings.volume}%<input type="range" min="0" max="100"
        value={settings.volume} onChange={e=>setSettings({...settings,volume:Number(e.target.value)})}/></label>
      <label className="asteria-audio-check"><input type="checkbox" checked={settings.loop}
        onChange={e=>setSettings({...settings,loop:e.target.checked})}/> Loop audio</label>
      <label>Audio file (MP3 / Ogg / WAV / WebM, maximum 20 MB)
       <input type="file" accept=".mp3,.ogg,.wav,.webm,audio/mpeg,audio/ogg,audio/wav,audio/webm"
        onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <button className="primary" type="submit" disabled={busy||!file}>Upload Private Audio</button>
     </form>
    </Panel>
    <div className="asteria-audio-column">
     <SoundPlayer campaignId={campaignId} tracks={tracks.filter(track=>track.visibility==='players')} live={live} gm/>
     <Panel title="Live Broadcast Controls" eyebrow="Synchronized with players">
      <p>Revision {live?.revision||0}. Publish a track to enable broadcast controls.</p>
      <div className="asteria-audio-controls">
       <button disabled={busy||live?.ambient?.status!=='playing'}
        onClick={()=>dispatch('pause-ambient')}>Pause Ambience</button>
       <button disabled={busy||live?.ambient?.status!=='paused'}
        onClick={()=>dispatch('resume-ambient')}>Resume Ambience</button>
       <button disabled={busy||!live?.ambient}
        onClick={()=>dispatch('stop-ambient')}>Stop Ambience</button>
       <button disabled={busy||!live?.effect}
        onClick={()=>dispatch('stop-effect')}>Clear Effect</button>
      </div>
      <small>Ambient playback is approximate across devices; this is not frame-synchronized streaming.</small>
     </Panel>
    </div>
   </div>
   <Panel title="Sound Library" eyebrow="Campaign tracks and sound effects">
    <label>Find a sound<input type="search" value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="Search ambient, music, sound effects"/></label>
    <div className="asteria-audio-library">{list.map(track=><article key={track.id}>
     <header><strong>{track.name}</strong><small>{pretty(track.category)} · {track.visibility==='players'?'Published':'GM private'} · {track.status}</small></header>
     <p>{track.description||track.fileName} ({Math.round(track.size/1024)} KB)</p>
     <div className="asteria-audio-controls">
      <button disabled={busy||track.status!=='ready'} onClick={()=>preview===track.id?stopPreview():previewTrack(track)}>
       {preview===track.id?'Stop Preview':'Preview'}</button>
      {track.status==='ready'?<>
       <button disabled={busy} onClick={()=>run({type:track.visibility==='players'?'unpublish-track':'publish-track',
        id:track.id,expectedRevision:track.revision})}>{track.visibility==='players'?'Unpublish':'Publish'}</button>
       {track.visibility==='players'?<button disabled={busy}
        onClick={()=>dispatch(track.category==='effect'?'play-effect':'play-ambient',track.id)}>
         {track.category==='effect'?'Trigger Effect':'Play Ambience'}</button>:null}
      </>:null}
      <button className="danger" disabled={busy} onClick={()=>archive(track)}>Archive</button>
     </div>
    </article>)}{!list.length?<p>No sounds match this search.</p>:null}</div>
   </Panel>
 </section>;
}
export function PlayerCampaignAmbience({campaignId}){
 const {tracks,live}=useCampaignSound(campaignId,'player');
 return <section className="asteria-audio-workspace" aria-label="Campaign audio">
  <SoundPlayer campaignId={campaignId} tracks={tracks} live={live}/>
  <Panel title="Published Sounds" eyebrow="GM-approved campaign audio">
   <div className="asteria-audio-library">{tracks.map(track=><article key={track.id}>
    <header><strong>{track.name}</strong><small>{pretty(track.category)}</small></header>
    <p>{track.description||'Shared by your GM.'}</p>
   </article>)}{!tracks.length?<p>Your GM has not published any audio yet.</p>:null}</div>
  </Panel>
 </section>;
}
