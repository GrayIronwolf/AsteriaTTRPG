/**
 * Phase 8.3: one in-memory connection state for the isolated React client.
 * Browser online status is only a hint: it never proves Firestore access.
 * An unverified/offline connection must not expose stale private workspaces.
 * No localStorage, IndexedDB, service worker, or data-payload persistence.
 */
export const isTransientConnectionError=error=>{
  const code=String(error?.code||'').split('/').pop();
  return code==='unavailable'||code==='deadline-exceeded'||
    code==='network-request-failed';
};

export function createConnectionMonitor({environment=typeof window==='undefined'?null:window}={}){
  const listeners=new Set();
  const online=()=>environment?.navigator?.onLine!==false;
  let state=online()?'online':'offline';
  let epoch=0,authEpoch=0,disposed=false,lastUid=null;
  const snapshot=()=>Object.freeze({state,epoch});
  const publish=()=>{
    const next=snapshot();
    for(const listener of [...listeners]){
      try{listener(next);}catch{/* A subscriber cannot stop another. */}
    }
  };
  const set=(value,restart=false)=>{
    if(disposed||(!restart&&value===state))return;
    state=value;
    if(restart)epoch++;
    publish();
  };
  const onOffline=()=>set('offline',true);
  const onOnline=()=>set('reconnecting',true);
  environment?.addEventListener?.('offline',onOffline);
  environment?.addEventListener?.('online',onOnline);
  return Object.freeze({
    snapshot,
    subscribe(listener){
      if(typeof listener!=='function')throw TypeError('Connection observer required.');
      if(disposed)return()=>{};
      listeners.add(listener);
      listener(snapshot());
      return()=>listeners.delete(listener);
    },
    canAttempt(){return !disposed&&online()&&
      (state==='online'||state==='reconnecting');},
    reportSuccess(){
      if(online())set('online');
    },
    reportFailure(error){
      if(!isTransientConnectionError(error))return;
      set(online()?'unavailable':'offline');
    },
    authGeneration(){return authEpoch;},
    identityChanged(uid){
      authEpoch++;
      if(uid===lastUid)return;
      lastUid=uid||null;
      // The identity boundary is owned by the existing Auth observer.
      // Recover from a previous account's outage without reusing its data.
      if(!online())set('offline',true);
      else if(state==='unavailable'||state==='offline')set('reconnecting',true);
    },
    retry(){
      if(!online()){set('offline');return false;}
      set('reconnecting',true);
      return true;
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      environment?.removeEventListener?.('offline',onOffline);
      environment?.removeEventListener?.('online',onOnline);
      listeners.clear();
    }
  });
}
