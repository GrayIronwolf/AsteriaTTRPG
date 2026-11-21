import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import {
  SCREEN_SHARE_MAX_DURATION_MS
} from '../../../src/state/presentationScreenShareModel.mjs';
import {hybridViewerCanRead} from '../../../src/state/hybridPresentationSessionModel.mjs';
import {
  awaitScreenShareIce,screenSharePeerConfig,stopScreenSharePeer
} from './screenShareWebRTC.mjs';
import styles from './GMScreenShareControls.module.css';

/** A separate, opt-in video-only share. Never shares existing local preview. */
export function GMScreenShareControls({api,campaignId,previewBusy=false,
  onActivity=()=>{},stopRegistration}){
  const session=useCampaignStream(api,'watchGMHybridSession',[campaignId]);
  const [selected,setSelected]=useState('');
  const [useStun,setUseStun]=useState(false);
  const [connection,setConnection]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const peer=useRef(null),stream=useRef(null),current=useRef(null);
  const expiryTimer=useRef(null);
  const attempt=useRef(0),alive=useRef(true),video=useRef(null);
  const signal=useCampaignStream(api,'watchGMScreenShare',
    [campaignId,connection?.viewerUid||''],Boolean(connection));
  const approved=(session.data?.grants||[]).filter(row=>
    hybridViewerCanRead(session.data?.session||{},row,row.uid));
  const stopLocal=useCallback((notify=true)=>{
    attempt.current+=1;
    if(expiryTimer.current!==null){clearTimeout(expiryTimer.current);expiryTimer.current=null;}
    const previous=current.current;
    current.current=null;
    stopScreenSharePeer(peer.current,stream.current);
    peer.current=null;stream.current=null;
    if(video.current){video.current.pause();video.current.srcObject=null;}
    if(alive.current){
      setConnection(null);setBusy(false);
      if(notify)setNotice('Local video sharing stopped.');
      onActivity(false);
    }
    return previous;
  },[onActivity]);
  const stop=useCallback(()=>{
    const previous=stopLocal();
    if(previous)void api.manageScreenShare(campaignId,{
      type:'stop',viewerUid:previous.viewerUid,
      connectionId:previous.connectionId
    }).catch(error=>{if(alive.current)setError(
      'Local stream stopped. Server revocation was not confirmed: '+error.message);});
  },[stopLocal,api,campaignId]);
  useEffect(()=>{
    alive.current=true;
    return ()=>{
      // A React navigation must close the remote session, not only local tracks.
      alive.current=false;
      const previous=stopLocal(false);
      if(previous)void api.manageScreenShare(campaignId,{
        type:'stop',viewerUid:previous.viewerUid,connectionId:previous.connectionId
      }).catch(()=>{});
    };
  },[campaignId,stopLocal,api]);
  useEffect(()=>{
    if(stopRegistration)stopRegistration.current=stop;
    return ()=>{if(stopRegistration?.current===stop)stopRegistration.current=null;};
  },[stopRegistration,stop]);
  useEffect(()=>{
    const terminate=()=>stop();
    const hidden=()=>{if(document.hidden)terminate();};
    window.addEventListener('offline',terminate);
    window.addEventListener('pagehide',terminate);
    document.addEventListener('visibilitychange',hidden);
    return ()=>{
      window.removeEventListener('offline',terminate);
      window.removeEventListener('pagehide',terminate);
      document.removeEventListener('visibilitychange',hidden);
    };
  },[stop]);
  useEffect(()=>{
    if(!current.current)return;
    const {viewerUid,epoch}=current.current;
    const grant=(session.data?.grants||[]).find(row=>row.uid===viewerUid);
    if(session.error||!session.data||!grant||
      session.data.session?.epoch!==epoch||
      !hybridViewerCanRead(session.data.session,grant,viewerUid)||
      (current.current.published&&
       session.data.session?.screenShare?.connectionId!==current.current.connectionId))
      stop();
  },[session.data,session.error,stop]);
  useEffect(()=>{
    if(!connection)return;
    const currentPeer=peer.current;
    if(signal.error){setError(signal.error);stop();return;}
    const value=signal.data;
    if(value&&value.connectionId===connection.connectionId){
      if(value.status==='stopped'){stop();return;}
      if(value.status==='answered'&&value.answerSdp&&
        currentPeer?.signalingState==='have-local-offer'){
        void currentPeer.setRemoteDescription({type:'answer',sdp:value.answerSdp})
          .then(()=>{if(alive.current)setNotice('Viewer accepted. Connecting video…');})
          .catch(error=>{if(alive.current)setError(error.message);stop();});
      }
    }
  },[connection,signal.data,signal.error,stop]);
  useEffect(()=>{
    if(stream.current&&video.current){
      video.current.srcObject=stream.current;
      void video.current.play().catch(()=>{});
    }
  },[connection]);
  const start=async()=>{
    if(busy||current.current||previewBusy||session.loading||session.error||
      !selected||typeof RTCPeerConnection==='undefined')return;
    // This must be called directly from the button click, before await.
    if(!navigator.mediaDevices?.getDisplayMedia){
      setError('Browser screen capture is unavailable.');return;
    }
    const chosen=approved.find(row=>row.uid===selected);
    if(!chosen||session.data?.session?.screenShare){
      setError('An active accepted invitation and an unused share slot are required.');
      return;
    }
    const id=crypto.randomUUID().replaceAll('-','');
    const generation=++attempt.current;
    let captured=null,rtc=null;
    setBusy(true);setError('');setNotice('Choose a screen in your browser. Audio is disabled.');
    try{
      captured=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      if(!alive.current||generation!==attempt.current){
        stopScreenSharePeer(null,captured);return;
      }
      const track=captured.getVideoTracks()[0];
      if(!track||track.readyState!=='live')throw Error('No active screen was selected.');
      rtc=new RTCPeerConnection(screenSharePeerConfig(useStun));
      rtc.addTrack(track,captured);
      rtc.addEventListener('connectionstatechange',()=>{
        if(['failed','closed','disconnected'].includes(rtc.connectionState))stop();
        if(rtc.connectionState==='connected'&&alive.current)
          setNotice('Video connected to the invited viewer.');
      });
      peer.current=rtc;stream.current=captured;
      const selectedEpoch=session.data.session.epoch;
      current.current={viewerUid:selected,connectionId:id,epoch:selectedEpoch,published:false};
      track.addEventListener('ended',stop,{once:true});
      onActivity(true);
      const offer=await rtc.createOffer({offerToReceiveAudio:false});
      await rtc.setLocalDescription(offer);
      await awaitScreenShareIce(rtc);
      if(!alive.current||generation!==attempt.current)return;
      const sent=await api.manageScreenShare(campaignId,{
        type:'offer',viewerUid:selected,connectionId:id,
        sdp:rtc.localDescription.sdp
      });
      if(!alive.current||generation!==attempt.current)return;
      if(sent.ok!==true)throw Error(sent.error||'Offer was not accepted.');
      if(current.current?.connectionId===id)current.current.published=true;
      if(!Number.isFinite(sent.expiresAt)||sent.expiresAt<=Date.now())
        throw Error('Screen sharing authorization expired.');
      expiryTimer.current=setTimeout(()=>stop(),
        Math.min(2147483647,Math.max(1,sent.expiresAt-Date.now())));
      setConnection({viewerUid:selected,connectionId:id});
      setNotice('Offer sent. The viewer must choose Join Live Screen.');
    }catch(failure){
      if(alive.current&&generation===attempt.current){
        setError(failure?.message||'Could not start remote screen sharing.');
        stop();
      }else stopScreenSharePeer(rtc,captured);
    }finally{if(alive.current)setBusy(false);}
  };
  return <section className={styles.panel} data-testid="site-gm-webrtc-screen-share">
    <h3>Optional Live Screen Sharing (WebRTC)</h3>
    <p>One accepted invited viewer at a time. Video only. The browser asks
      which screen or tab to share, and the viewer must explicitly join.</p>
    {session.error?<p role="alert">{session.error}</p>:null}
    <label>Share with an accepted viewer
      <select value={selected} disabled={busy||Boolean(connection)||previewBusy}
        onChange={event=>setSelected(event.target.value)}>
        <option value="">Choose accepted viewer</option>
        {approved.map(row=><option key={row.uid} value={row.uid}>{row.uid}</option>)}
      </select>
    </label>
    <label className={styles.checkbox}><input type="checkbox" checked={useStun}
      disabled={busy||Boolean(connection)} onChange={e=>setUseStun(e.target.checked)}/>
      Use public Google STUN for remote network discovery (shares network IP
      information with the STUN service)</label>
    <div className={styles.actions}>
      <button type="button" onClick={()=>void start()}
        disabled={busy||previewBusy||!selected||Boolean(connection)||
          !!session.error||session.loading||Boolean(session.data?.session?.screenShare)}>
        Share Selected Screen</button>
      <button type="button" onClick={stop}
        disabled={!current.current&&!busy}>Stop Remote Share</button>
      {session.data?.session?.screenShare&&!current.current?
        <button type="button" onClick={async()=>{
          const prior=session.data.session.screenShare;
          setError('');
          try{
            await api.manageScreenShare(campaignId,{
              type:'stop',viewerUid:prior.viewerUid,
              connectionId:prior.connectionId
            });
            setNotice('Previous screen sharing slot cleared on the server.');
          }catch(failure){setError(
            'Server screen share could not be cleared: '+failure.message);}
        }}>Clear Previous Screen Share</button>:null}
    </div>
    {current.current?<video className={styles.video} ref={video} muted playsInline
      autoPlay aria-label="Live GM screen sharing preview"/>:null}
    <p>Sharing is capped at {SCREEN_SHARE_MAX_DURATION_MS/60000} minutes;
      an expired invitation, revoked viewer, tab exit or emergency stop
      ends the session. Network NAT restrictions may prevent direct
      connections: no TURN server is configured.</p>
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
