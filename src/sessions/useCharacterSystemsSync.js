import {useEffect,useRef,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {characterSystemsRefreshDecision,nextCharacterSystemsDeadline} from '../state/characterSystemsSyncModel.mjs';

// Persist canonical transitions only when due, never on every UI clock tick.
export function useCharacterSystemsSync(campaignId,characters,encounter,editable,online=true) {
  const attempted=useRef(new Set()),inflight=useRef(new Set()),retryTimer=useRef(null);
  const mounted=useRef(false),[retryTick,setRetryTick]=useState(0),[error,setError]=useState('');
  useEffect(()=>{
    mounted.current=true;
    return()=>{
      mounted.current=false;
      if(retryTimer.current){clearTimeout(retryTimer.current);retryTimer.current=null;}
    };
  },[]);
  useEffect(()=>{
    attempted.current.clear();inflight.current.clear();setError('');
    if(retryTimer.current){clearTimeout(retryTimer.current);retryTimer.current=null;}
  },[campaignId]);
  useEffect(()=>{
    if(!editable||!online||!campaignId)return undefined;
    const now=Date.now();
    const scheduleRetry=()=>{
      if(retryTimer.current||!mounted.current)return;
      retryTimer.current=setTimeout(()=>{
        retryTimer.current=null;
        if(mounted.current)setRetryTick(value=>value+1);
      },15000);
    };
    for(const character of Object.values(characters||{})){
      const decision=characterSystemsRefreshDecision(character,encounter,now);
      if(!decision||attempted.current.has(decision.key)||inflight.current.has(character.id))continue;
      attempted.current.add(decision.key);
      inflight.current.add(character.id);
      Promise.resolve().then(()=>firebaseService.refreshSystems(campaignId,character.id))
        .then(result=>{
          if(result?.ok===false)throw new Error(result.error||'Character system synchronization failed.');
          if(mounted.current)setError('');
        }).catch(reason=>{
          attempted.current.delete(decision.key);
          if(mounted.current){setError(reason?.message||'Character system synchronization failed.');scheduleRetry();}
        }).finally(()=>{inflight.current.delete(character.id);});
    }
    const next=nextCharacterSystemsDeadline(characters,encounter,now);
    if(next===null)return undefined;
    const timeout=setTimeout(()=>setRetryTick(value=>value+1),Math.max(20,Math.min(2147483647,next-now+20)));
    return()=>clearTimeout(timeout);
  },[campaignId,characters,encounter,editable,online,retryTick]);
  return error;
}
