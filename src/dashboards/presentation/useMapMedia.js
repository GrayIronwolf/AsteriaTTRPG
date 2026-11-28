import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {firebaseService} from '../../firebase/asteriaFirebaseService.js';
import {battleMapMediaError,battleMapMediaErrorMessage} from '../../firebase/battleMapMedia.mjs';
import {battleMapCanPreview,battleMapFileKind} from '../../state/battleMapModel.mjs';

const sessionEvents=['asteria:firebase-session-changed','asteria:firebase-ready','asteria:firebase-signed-out'];
function subscribeSession(update){
  sessionEvents.forEach(event=>window.addEventListener(event,update));
  return ()=>sessionEvents.forEach(event=>window.removeEventListener(event,update));
}
export function useBattleMapSession(){
  return useSyncExternalStore(subscribeSession,firebaseService.battleMapSession,()=>null);
}

export function useMapMedia(campaignId,map,session,load,{atlas=false}={}){
  const [attempt,setAttempt]=useState(0);
  const [result,setResult]=useState(null);
  const videoRef=useRef(null);
  const [playingUrl,setPlayingUrl]=useState('');
  // Grid, fog and token updates can replace the map record without changing its media.
  const scope=JSON.stringify([campaignId,map?.id,map?.storagePath,map?.contentType,map?.kind,attempt,atlas]);
  const request=useMemo(()=>({}),[scope,session,load]);

  useEffect(()=>{
    if(!map||!session)return undefined;
    const controller=new AbortController();
    const {signal}=controller;
    let url='',timer,stage='initialising';
    const releaseUrl=()=>{
      if(url)URL.revokeObjectURL(url);
      url='';
    };
    const fail=error=>{
      if(signal.aborted)return;
      controller.abort();
      clearTimeout(timer);
      releaseUrl();
      console.warn('Battle map media failed.',{campaignId,mapId:map.id,stage,code:error?.code||error?.cause?.code||'unknown'});
      setResult({request,url:'',loading:false,error:battleMapMediaErrorMessage(error)});
    };
    const ready=()=>{
      if(signal.aborted)return;
      clearTimeout(timer);
      setResult(previous=>previous?.request===request&&previous.loading?{...previous,loading:false}:previous);
    };
    const verifySession=()=>{
      if(firebaseService.battleMapSession()!==session)
        throw battleMapMediaError('auth/user-changed','The signed-in account changed. Retry with the current account.');
    };
    const decodeFailed=event=>{
      const unsupported=event.currentTarget.error?.code===4;
      fail(battleMapMediaError('map-media/decode',map.kind==='video'?
        (unsupported?'This browser does not support the map video format or codec.':
          'This browser could not decode the map video. Check its format or codec.'):
        'This browser could not decode the map image. The file may be damaged or unsupported.'));
    };

    // A video can be up to 48 MB. Give its download more time than an image.
    timer=setTimeout(()=>fail(battleMapMediaError('map-media/timeout',
      `Map media timed out during ${stage}. Check your connection and retry.`)),map.kind==='video'?60000:20000);
    Promise.resolve().then(()=>{
      if(signal.aborted)return;
      verifySession();
      if(!atlas&&!battleMapFileKind(map.contentType))
        throw battleMapMediaError('map-media/unsupported','This map uses an unsupported media format.');
      if(!atlas&&!battleMapCanPreview(map,campaignId))
        throw battleMapMediaError('map-media/reference','This map has an invalid media reference.');
      stage='request preparation';
      return load(campaignId,map,{uid:session.uid,signal,onStage:next=>{if(!signal.aborted)stage=next;}});
    }).then(blob=>{
      if(signal.aborted)return;
      verifySession();
      if(!(blob instanceof Blob)||!blob.size)
        throw battleMapMediaError('map-media/empty','The map media file is empty or invalid.');
      stage='browser decoding';
      clearTimeout(timer);
      // Older objects may omit their MIME type. The validated map record has it.
      const media=map.contentType&&(!blob.type||blob.type==='application/octet-stream')?
        blob.slice(0,blob.size,map.contentType):blob;
      url=URL.createObjectURL(media);
      // Downloads can finish even if the browser never reports a usable image or video.
      timer=setTimeout(()=>fail(battleMapMediaError('map-media/decode-timeout',
        'The browser did not finish opening the map media. Check the file format and retry.')),12000);
      setResult({request,url,loading:true,error:'',ready,decodeFailed});
    }).catch(fail);

    return ()=>{
      // getBlob has no cancellation API. Stop accepting its result and release local resources.
      controller.abort();
      clearTimeout(timer);
      releaseUrl();
    };
  },[request]);

  const current=result?.request===request?result:{url:'',loading:Boolean(map&&session),
    error:map&&!session?'Sign in to view this map.':''};
  function updatePlayback(event){
    const element=event.currentTarget;
    if(videoRef.current===element)setPlayingUrl(element.paused?'':current.url);
  }
  function togglePlayback(){
    const element=videoRef.current;
    if(!element)return;
    if(element.paused)element.play().catch(()=>{});
    else element.pause();
  }
  return {...current,retry:()=>setAttempt(value=>value+1),videoRef,updatePlayback,togglePlayback,
    playing:Boolean(current.url&&playingUrl===current.url)};
}
