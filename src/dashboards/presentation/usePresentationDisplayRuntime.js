import {useEffect,useRef,useState} from 'react';

/**
 * Phase 7.5: one lifecycle for a local projector or an invited viewer.
 * No data or media stays mounted while offline or in a background tab.
 * Returning to the tab, restoring a page or reconnecting forces fresh
 * Firebase authorisation through the existing display subscriptions.
 */
export function usePresentationDisplayRuntime(){
  const root=useRef(null);
  const [online,setOnline]=useState(()=>typeof navigator==='undefined'||
    navigator.onLine!==false);
  const [visible,setVisible]=useState(()=>typeof document==='undefined'||
    !document.hidden);
  const [generation,setGeneration]=useState(0);
  const [fullscreen,setFullscreen]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const onOnline=()=>{setOnline(true);setGeneration(value=>value+1);};
    const onOffline=()=>setOnline(false);
    const onVisibility=()=>{
      const active=!document.hidden;
      setVisible(active);
      if(active)setGeneration(value=>value+1);
    };
    const onPageShow=event=>{
      if(event.persisted)setGeneration(value=>value+1);
    };
    const onFullscreen=()=>setFullscreen(document.fullscreenElement===root.current);
    window.addEventListener('online',onOnline);
    window.addEventListener('offline',onOffline);
    window.addEventListener('pageshow',onPageShow);
    document.addEventListener('visibilitychange',onVisibility);
    document.addEventListener('fullscreenchange',onFullscreen);
    return ()=>{
      window.removeEventListener('online',onOnline);
      window.removeEventListener('offline',onOffline);
      window.removeEventListener('pageshow',onPageShow);
      document.removeEventListener('visibilitychange',onVisibility);
      document.removeEventListener('fullscreenchange',onFullscreen);
    };
  },[]);
  const reconnect=()=>{
    if(!online||!visible)return;
    setError('');
    setGeneration(value=>value+1);
  };
  const toggleFullscreen=async()=>{
    setError('');
    try{
      if(document.fullscreenElement===root.current)
        await document.exitFullscreen();
      else if(root.current?.requestFullscreen)
        await root.current.requestFullscreen();
      else
        throw Error('Fullscreen is unavailable in this browser.');
    }catch(failure){
      setError(failure?.message||'Unable to change fullscreen mode.');
    }
  };
  return {root,ready:online&&visible,online,visible,generation,fullscreen,
    error,reconnect,toggleFullscreen};
}
