import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import styles from './GMScreenCaptureControls.module.css';

/**
 * Phase 7.6. Local browser preview only: never upload, persist, broadcast,
 * signal, or attach a captured MediaStream to a remote display.
 * The existing approved-scene presentation remains the sole remote channel.
 */
export function GMScreenCaptureControls({api,campaignId,controlRevision=0}){
  const session=useCampaignStream(api,'watchGMHybridSession',[campaignId]);
  const [capturing,setCapturing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const video=useRef(null);
  const stream=useRef(null);
  const generation=useRef(0);
  const mounted=useRef(true);
  const stop=useCallback(()=>{
    generation.current+=1;
    const current=stream.current;
    stream.current=null;
    if(current)current.getTracks().forEach(track=>track.stop());
    if(video.current){video.current.pause();video.current.srcObject=null;}
    if(mounted.current)setCapturing(false);
  },[]);
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;stop();};
  },[stop,campaignId]);
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
    if(busy||session.loading||session.error)return;
    stop();setBusy(true);setNotice('');setError('');
    const failures=[];
    // An existing presentation blackout removes staged player media and scenes.
    try{
      await api.managePresentation(campaignId,{
        type:'blackout',expectedRevision:controlRevision
      });
    }catch(failure){failures.push('Blackout: '+(failure?.message||'failed'));}
    // Session closure revokes every restricted viewer grant, independent of
    // the browser capture stream (which has never left this GM device).
    const current=session.data?.session;
    if(current?.status==='open'){
      try{
        await api.manageHybridSession(campaignId,{
          type:'close',expectedRevision:current.revision||0
        });
      }catch(failure){failures.push('Viewer revocation: '+(failure?.message||'failed'));}
    }
    if(mounted.current){
      setBusy(false);
      if(failures.length)setError('Some remote controls were not confirmed. '+failures.join('; ')+
        '. Check session state and use the existing GM Blackout/Close controls.');
      else setNotice('Local preview stopped; player display blacked out and restricted session closed.');
    }
  };
  return <section className={styles.panel} data-testid="site-gm-screen-capture">
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
      <button type="button" disabled={busy||session.loading||Boolean(session.error)}
        onClick={stopAndBlackout} data-testid="site-screen-capture-emergency">
        Stop, Blackout &amp; Revoke Viewers
      </button>
    </div>
    {capturing?<video ref={video} className={styles.video} autoPlay playsInline muted
      aria-label="Private GM screen preview"/>:
      <div className={styles.placeholder}>Screen preview is off.</div>}
    {capturing?<p role="status">Screen preview active on this GM device only.</p>:null}
    {busy?<p role="status">Processing screen permission or safety controls…</p>:null}
    {session.error?<p role="alert">GM viewer controls unavailable: {session.error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
    <p className={styles.note}>For a room display, use your computer's
      connected TV/projector or the authorised Player Display. Remote
      live desktop video requires a separately approved transport and
      security design; a local capture preview cannot be remotely streamed
      using Firebase scene updates alone.</p>
  </section>;
}
