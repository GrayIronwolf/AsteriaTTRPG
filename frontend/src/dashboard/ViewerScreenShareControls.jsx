import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import {
  awaitScreenShareIce,screenSharePeerConfig,stopScreenSharePeer
} from './screenShareWebRTC.mjs';
import styles from './GMScreenShareControls.module.css';

/** The recipient actively joins; SDP is never present in the public scene. */
export function ViewerScreenShareControls({api,campaignId,viewerUid,pointer}){
  const active=Boolean(pointer?.viewerUid===viewerUid&&pointer?.connectionId);
  const signal=useCampaignStream(api,'watchViewerScreenShare',[campaignId],active);
  const [status,setStatus]=useState('idle');
  const [error,setError]=useState('');
  const [useStun,setUseStun]=useState(false);
  const peer=useRef(null),stream=useRef(null),video=useRef(null);
  const joining=useRef(false),connection=useRef(null),alive=useRef(true);
  const stopLocal=useCallback(()=>{
    joining.current=false;connection.current=null;
    if(video.current){video.current.pause();video.current.srcObject=null;}
    stopScreenSharePeer(peer.current,stream.current);
    peer.current=null;stream.current=null;
    if(alive.current)setStatus('idle');
  },[]);
  const leave=useCallback(()=>{
    const previous=connection.current;
    stopLocal();
    if(previous)void api.respondScreenShare(campaignId,{
      type:'leave',connectionId:previous
    }).catch(()=>{});
  },[api,campaignId,stopLocal]);
  useEffect(()=>{
    alive.current=true;
    return ()=>{alive.current=false;leave();};
  },[leave]);
  useEffect(()=>{
    if(!active||signal.error||(
      signal.data&&signal.data.connectionId!==pointer.connectionId)||
      signal.data?.status==='stopped'){
      if(signal.error)setError(signal.error);
      leave();
    }
  },[active,signal.data,signal.error,pointer?.connectionId,leave]);
  useEffect(()=>{
    const stop=()=>leave(),hidden=()=>{if(document.hidden)stop();};
    window.addEventListener('offline',stop);
    window.addEventListener('pagehide',stop);
    document.addEventListener('visibilitychange',hidden);
    return ()=>{
      window.removeEventListener('offline',stop);
      window.removeEventListener('pagehide',stop);
      document.removeEventListener('visibilitychange',hidden);
    };
  },[leave]);
  useEffect(()=>{
    if(stream.current&&video.current){
      video.current.srcObject=stream.current;
      void video.current.play().catch(()=>{});
    }
  },[status]);
  const join=async()=>{
    if(!active||joining.current||peer.current||!signal.data||
      signal.data.status!=='offered'||signal.data.connectionId!==pointer.connectionId)
      return;
    if(typeof RTCPeerConnection==='undefined'){
      setError('WebRTC is unavailable in this browser.');return;
    }
    joining.current=true;setStatus('joining');setError('');
    const id=pointer.connectionId;connection.current=id;
    let rtc=null;
    try{
      rtc=new RTCPeerConnection(screenSharePeerConfig(useStun));
      peer.current=rtc;
      rtc.addTransceiver('video',{direction:'recvonly'});
      rtc.addEventListener('track',event=>{
        if(!alive.current||connection.current!==id)return;
        const incoming=event.streams[0]||new MediaStream([event.track]);
        stream.current=incoming;
        if(video.current){
          video.current.srcObject=incoming;
          void video.current.play().catch(()=>{});
        }
      });
      rtc.addEventListener('connectionstatechange',()=>{
        if(['disconnected','failed','closed'].includes(rtc.connectionState))
          leave();
        else if(rtc.connectionState==='connected'&&alive.current)
          setStatus('connected');
      });
      await rtc.setRemoteDescription({type:'offer',sdp:signal.data.offerSdp});
      const answer=await rtc.createAnswer();
      await rtc.setLocalDescription(answer);
      await awaitScreenShareIce(rtc);
      if(!alive.current||connection.current!==id)return;
      await api.respondScreenShare(campaignId,{
        type:'answer',connectionId:id,sdp:rtc.localDescription.sdp
      });
      if(alive.current&&connection.current===id)setStatus('connecting');
    }catch(failure){
      if(alive.current)setError(failure?.message||'Unable to join live screen.');
      leave();
    }finally{joining.current=false;}
  };
  if(!active)return null;
  return <section className={styles.panel} data-testid="site-viewer-webrtc-screen-share">
    <h3>Live GM Screen (Optional)</h3>
    <p>This video is a separate live screen feed from the GM, not a player
      scene, and will stop if your invitation expires or is revoked.</p>
    {signal.error?<p role="alert">{signal.error}</p>:null}
    {signal.loading?<p role="status">Verifying live screen invitation…</p>:null}
    {signal.data?.status==='offered'&&!peer.current?<div className={styles.actions}>
      <button type="button" disabled={joining.current} onClick={()=>void join()}>
        Join Live Screen</button>
      <label className={styles.checkbox}><input type="checkbox"
        checked={useStun} disabled={joining.current}
        onChange={e=>setUseStun(e.target.checked)}/>
        Enable public STUN network discovery</label>
    </div>:null}
    {peer.current?<video ref={video} className={styles.video}
      muted playsInline autoPlay controls aria-label="Live shared GM screen"/>:null}
    {peer.current?<button type="button" onClick={leave}>Leave Live Screen</button>:null}
    {status!=='idle'?<p role="status">Video status: {status}</p>:null}
    {error?<p role="alert">{error}</p>:null}
    <p>No audio or recordings are included. Remote connection can fail without
      a TURN relay. Your GM controls screen capture and may stop it at any time.</p>
  </section>;
}
