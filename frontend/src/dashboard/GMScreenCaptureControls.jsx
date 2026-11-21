import React,{useCallback,useEffect,useRef,useState} from 'react';
import styles from './GMScreenCaptureControls.module.css';

/**
 * Phase 7.6. Local browser preview only: never upload, persist, broadcast,
 * signal, or attach a captured MediaStream to a remote display.
 * The existing approved-scene presentation remains the sole remote channel.
 */
export function GMScreenCaptureControls({api,campaignId}){
  const [capturing,setCapturing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const video=useRef(null);
  const stream=useRef(null);
  const generation=useRef(0);
  const emergencyInFlight=useRef(false);
  const [emergencyBusy,setEmergencyBusy]=useState(false);
  const mounted=useRef(true);
  const stop=useCallback(()=>{
    generation.current+=1;
    const current=stream.current;
    stream.current=null;
    if(current)current.getTracks().forEach(track=>track.stop());
    if(video.current){video.current.pause();video.current.srcObject=null;}
    if(mounted.current){setCapturing(false);setNotice('');}
  },[]);
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;stop();};
  },[stop,campaignId]);
  useEffect(()=>{
    stop();setCapturing(false);setNotice('');setError('');
  },[campaignId,stop]);
  useEffect(()=>{
    // Stop as soon as the GM leaves the page, changes account or goes offline.
    const leave=()=>stop();
    const hidden=()=>{if(document.hidden)stop();};
    document.addEventListener('visibilitychange',hidden);
    window.addEventListener('offline',leave);
    window.addEventListener('pagehide',leave);
    return ()=>{
      document.removeEventListener('visibilitychange',hidden);
      window.removeEventListener('offline',leave);
      window.removeEventListener('pagehide',leave);
    };
  },[stop]);
  useEffect(()=>{
    if(!capturing||!stream.current||!video.current)return;
    video.current.srcObject=stream.current;
    void video.current.play().catch(()=>{});
  },[capturing]);
  const start=async()=>{
    if(busy||stream.current)return;
    setError('');setNotice('');
    if(!navigator.mediaDevices?.getDisplayMedia){
      setError('This browser does not support screen capture.');
      return;
    }
    const attempt=++generation.current;
    setBusy(true);
    let captured=null;
    try{
      // This user gesture is the only place where browser capture can start.
      // Capture audio and system audio are explicitly disabled.
      captured=await navigator.mediaDevices.getDisplayMedia({
        video:true,audio:false
      });
      if(attempt!==generation.current||!mounted.current){
        captured.getTracks().forEach(track=>track.stop());
        return;
      }
      const track=captured.getVideoTracks()[0];
      if(!track||track.readyState!=='live')throw Error('No active screen selected.');
      stream.current=captured;
      track.addEventListener('ended',stop,{once:true});
      if(attempt===generation.current){
        setCapturing(true);
        setNotice('Local preview active. Nothing is being sent to viewers.');
      }
    }catch(failure){
      captured?.getTracks().forEach(track=>track.stop());
      if(attempt===generation.current){
        stop();
        setError(failure?.name==='NotAllowedError'
          ?'Screen capture was cancelled or denied.':
            failure?.message||'Unable to start screen preview.');
      }
    }finally{
      if(mounted.current)setBusy(false);
    }
  };
  const stopAndBlackout=async()=>{
    // Local capture stops synchronously even if an earlier browser permission
    // dialog or a server request is still in progress.
    stop();setError('');setNotice('');
    if(emergencyInFlight.current)return;
    emergencyInFlight.current=true;
    setEmergencyBusy(true);
    try{
      const response=await api.emergencyStopPresentation(campaignId);
      if(response?.ok!==true)throw Error(response?.error||
        'The server did not confirm the emergency stop.');
      if(mounted.current)setNotice('Server confirmed: presentation blacked out and all restricted access closed.');
    }catch(failure){
      if(mounted.current)setError(
        'Local capture stopped, but remote blackout/revocation is NOT confirmed: '+
        (failure?.message||'Connection failed')+
        '. Reconnect and retry the emergency stop.');
    }finally{
      emergencyInFlight.current=false;
      if(mounted.current)setEmergencyBusy(false);
    }
  };
  return <section className={styles.panel} data-testid="site-gm-screen-capture">
    <div className={styles.emergencyBar}>
      <div><strong>Emergency presentation stop</strong>
        <p>Immediately stops this device's capture and requests a single
          server-authorised blackout and viewer revocation.</p></div>
      <button type="button" onClick={stopAndBlackout}
        aria-label="Emergency: Stop, Blackout and Revoke Viewers"
        data-testid="site-screen-capture-emergency">
        Stop, Blackout &amp; Revoke Viewers
      </button>
    </div>
    <h3>Screen Capture &amp; Display Safety</h3>
    <p>This is a <strong>local preview</strong> of a screen, window or tab chosen
      through your browser permission prompt. It is <strong>not</strong> an
      online video broadcast. Approved Asteria scenes remain the only
      content delivered to invited remote viewers.</p>
    <div className={styles.actions}>
      <button type="button" disabled={busy||capturing} onClick={start}
        data-testid="site-screen-capture-start">Choose Screen to Preview</button>
      <button type="button" disabled={!capturing&& !busy} onClick={()=>{
        stop();setNotice('Local screen preview stopped.');setError('');
      }} data-testid="site-screen-capture-stop">Stop Local Preview</button>
    </div>
    {capturing?<video ref={video} className={styles.video} autoPlay playsInline muted
      aria-label="Private GM screen preview"/>:
      <div className={styles.placeholder}>Screen preview is off.</div>}
    {capturing?<p role="status">Screen preview active on this GM device only.</p>:null}
    {busy?<p role="status">Processing screen permission or safety controls…</p>:null}
    {emergencyBusy?<p role="status">Requesting server blackout and viewer revocation…</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
    <p className={styles.note}>For a room display, use your computer's
      connected TV/projector or the authorised Player Display. Remote
      live desktop video requires a separately approved transport and
      security design; a local capture preview cannot be remotely streamed
      using Firebase scene updates alone.</p>
  </section>;
}
