/**
 * Phase 8.2 — one lifecycle owner for React's verified Firestore streams.
 *
 * A hub belongs to ONE existing Firebase Auth/Firestore pair. Equivalent
 * document/collection references are reference-counted across workspaces.
 * Firestore queries with distinct filters are intentionally NOT pooled.
 *
 * No cache/offline fallback: only server-confirmed snapshots are replayed.
 * Domain services still enforce role and character ownership independently.
 */
export function createRealtimeSubscriptionHub({auth,firestoreSdk}={}){
  if(!auth||typeof firestoreSdk?.onSnapshot!=='function')
    throw TypeError('Existing Firebase Auth and Firestore SDK are required.');
  const streams=new Map();
  const liveScopes=new Set();
  let confirmedUid=null;
  let generation=0;

  function same(uid){return Boolean(uid)&&auth.currentUser?.uid===uid;}
  function referenceKey(reference){
    // Public Firestore DocumentReference/CollectionReference expose .path.
    // Query instances do not. Never pool filtered queries using private SDK
    // internals, their collection path or a guessed filter signature.
    const path=typeof reference==='string'?reference:
      reference?.type==='document'||reference?.type==='collection'
        ?reference.path:null;
    return typeof path==='string'&&path.length>0?path:null;
  }
  function publishFault(stream,err){
    if(stream.closed)return;
    stream.closed=true;
    if(stream.key)streams.delete(stream.key);
    try{stream.unsubscribe?.();}catch{}
    for(const item of [...stream.listeners]){
      stream.listeners.delete(item);
      try{item.error(err instanceof Error?err:Error('Firebase subscription unavailable.'));}
      catch{}
    }
  }
  function makeStream(uid,reference){
    const path=referenceKey(reference);
    const key=path?uid+'\u0000'+path:null;
    const old=key?streams.get(key):null;
    if(old&&!old.closed)return old;
    const stream={
      key,uid,reference,closed:false,listeners:new Set(),unsubscribe:null,
      last:null,hasLast:false,started:false,epoch:generation
    };
    if(key)streams.set(key,stream);
    return stream;
  }
  function ensureStarted(stream){
    if(stream.started||stream.closed)return;
    stream.started=true;
    try{
      const unsubscribe=firestoreSdk.onSnapshot(stream.reference,
        {includeMetadataChanges:true},snapshot=>{
          if(stream.closed)return;
          if(!same(stream.uid)||stream.epoch!==generation){
            publishFault(stream,Error('Signed-in account changed. Subscription closed.'));
            return;
          }
          if(snapshot?.metadata?.fromCache||snapshot?.metadata?.hasPendingWrites)
            return;
          stream.last=snapshot;stream.hasLast=true;
          for(const listener of [...stream.listeners]){
            if(stream.closed)break;
            try{listener.value(snapshot);}
            catch(e){try{listener.error(e);}catch{}}
          }
        },err=>publishFault(stream,err));
      if(stream.closed){
        try{unsubscribe?.();}catch{}
      }else stream.unsubscribe=unsubscribe;
    }catch(err){publishFault(stream,err);}
  }
  function subscribe(uid,reference,value,error){
    if(!same(uid))throw Error('The current Firebase account is not the verified subscriber.');
    if(typeof value!=='function'||typeof error!=='function')
      throw TypeError('Realtime listeners require update and failure handlers.');
    const stream=makeStream(uid,reference);
    let alive=true;
    const item={
      value:snapshot=>{if(alive)value(snapshot);},
      error:err=>{if(alive)error(err);}
    };
    stream.listeners.add(item);
    ensureStarted(stream);
    // New viewers joining an existing pooled stream need the last
    // server-confirmed state; cache-only data was never recorded.
    if(stream.started&&stream.hasLast&&!stream.closed){
      queueMicrotask(()=>{
        if(alive&&!stream.closed&&same(uid)&&stream.epoch===generation)
          item.value(stream.last);
      });
    }
    return ()=>{
      if(!alive)return;
      alive=false;
      stream.listeners.delete(item);
      if(stream.listeners.size===0&&!stream.closed){
        stream.closed=true;
        if(stream.key)streams.delete(stream.key);
        try{stream.unsubscribe?.();}catch{}
      }
    };
  }
  function scope(uid,onError=()=>{}){
    if(!same(uid))throw Error('Cannot open a subscription for another account.');
    if(typeof onError!=='function')throw TypeError('Error callback required.');
    let active=true,failed=false;
    const stops=new Set();
    function close(){
      if(!active)return;
      active=false;
      liveScopes.delete(entry);
      for(const stop of [...stops].reverse()){
        stops.delete(stop);
        try{stop();}catch{}
      }
    }
    function fail(err){
      if(!active||failed)return;
      failed=true;
      close();
      onError(err instanceof Error?err:Error('Realtime access was revoked.'));
    }
    function watch(reference,onValue){
      if(!active)return()=>{};
      let stop=()=>{};
      try{
        stop=subscribe(uid,reference,
          snap=>{if(!active)return;try{onValue(snap);}catch(err){fail(err);}},
          fail);
      }catch(err){fail(err);return()=>{};}
      if(!active){stop();return()=>{};}
      stops.add(stop);
      return()=>{
        if(!stops.delete(stop))return;
        stop();
      };
    }
    const entry=Object.freeze({
      get active(){return active;},
      watch,fail,close,
      assertActive(){
        if(!active||!same(uid))throw Error('Realtime view is no longer authorized.');
        return true;
      }
    });
    liveScopes.add(entry);
    return entry;
  }
  function identityChanged(uid){
    // Called from the SINGLE Auth observer, not an extra Firebase listener.
    if(uid===confirmedUid)return;
    confirmedUid=uid||null;
    generation++;
    for(const active of [...liveScopes])
      active.fail(Error('Authenticated account changed. Reopen this workspace.'));
    for(const stream of [...streams.values()]){
      publishFault(stream,Error('Authenticated account changed.'));
    }
    streams.clear();
  }
  function dispose(){
    identityChanged(null);
  }
  return Object.freeze({
    scope,identityChanged,dispose,
    stats:()=>Object.freeze({
      streams:streams.size,scopes:liveScopes.size,
      subscribers:[...streams.values()].reduce((n,x)=>n+x.listeners.size,0)
    })
  });
}


/**
 * Provide the original Firestore SDK API with exactly one managed onSnapshot
 * entry point. Domain services continue to verify membership and ownership;
 * this wrapper merely consolidates transport subscriptions and lifecycle.
 *
 * Query references remain separate because different filters can carry
 * different privacy and authorization requirements.
 */
export function createSharedFirestoreSdk({auth,firestoreSdk,hub}={}){
  if(!auth||!firestoreSdk||!hub||typeof hub.scope!=='function')
    throw TypeError('The verified Firestore runtime and realtime hub are required.');
  return Object.freeze({
    ...firestoreSdk,
    onSnapshot(reference,options,callback,onError){
      if(typeof options==='function'){
        onError=callback;
        callback=options;
        options={};
      }
      if(typeof callback!=='function')
        throw TypeError('A realtime snapshot callback is required.');
      const uid=auth.currentUser?.uid;
      if(!uid)throw Error('Sign in before opening a Firestore listener.');
      // Existing callers always request metadata so that cache-only and
      // optimistic local writes are not treated as server authorization.
      if(options?.includeMetadataChanges!==true)
        throw Error('Realtime subscriptions must request metadata changes.');
      const scope=hub.scope(uid,typeof onError==='function'?onError:()=>{});
      scope.watch(reference,callback);
      return ()=>scope.close();
    }
  });
}
