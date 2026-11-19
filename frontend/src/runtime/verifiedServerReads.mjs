/**
 * Phase 8.3: bounded, server-only Firestore read transport.
 * No fallback to getDoc/getDocs, optimistic writes, or persisted caches.
 * Only identical document reads are coalesced while in flight; filtered
 * queries remain independent. Domain ownership checks still run per caller.
 */
import {isTransientConnectionError} from './connectionMonitor.mjs';

const DELAYS=Object.freeze([150,450]);
const defaultDelay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const unavailable=()=>{
  const error=Error('The server could not verify this data. Check your connection and retry.');
  error.code='asteria/server-unavailable';
  return error;
};
const stale=()=>{
  const error=Error('The signed-in account changed. Reopen this workspace.');
  error.code='asteria/account-changed';
  return error;
};

export function createVerifiedServerReads({auth,firestoreSdk,connection,delay=defaultDelay}={}){
  if(!auth||!firestoreSdk||
     typeof firestoreSdk.getDocFromServer!=='function'||
     typeof firestoreSdk.getDocsFromServer!=='function'||
     typeof connection?.canAttempt!=='function'||
     typeof delay!=='function')
    throw TypeError('Server reads require the existing authenticated Firebase client.');
  const inFlight=new Map();
  const owner=uid=>{
    if(!uid||auth.currentUser?.uid!==uid)throw stale();
  };
  async function request(method,reference){
    const uid=auth.currentUser?.uid;
    owner(uid);
    if(!connection.canAttempt())throw unavailable();
    const path=reference?.type==='document'&&
      typeof reference.path==='string'?reference.path:null;
    // Never deduplicate a filtered query using its collection path.
    const key=path?uid+'\u0000'+method+'\u0000'+path:null;
    if(key&&inFlight.has(key))return inFlight.get(key);
    const execute=async()=>{
      for(let attempt=0;attempt<=DELAYS.length;attempt++){
        owner(uid);
        if(!connection.canAttempt())throw unavailable();
        try{
          const snap=await firestoreSdk[method](reference);
          owner(uid);
          if(snap?.metadata?.fromCache===true||snap?.metadata?.hasPendingWrites===true)
            throw Error('A server-confirmed Firestore result is required.');
          connection.reportSuccess();
          return snap;
        }catch(error){
          owner(uid);
          if(!isTransientConnectionError(error))throw error;
          if(attempt===DELAYS.length||!connection.canAttempt()){
            connection.reportFailure(error);
            throw unavailable();
          }
          await delay(DELAYS[attempt]);
        }
      }
      throw unavailable();
    };
    const promise=execute();
    if(key)inFlight.set(key,promise);
    try{return await promise;}
    finally{if(key&&inFlight.get(key)===promise)inFlight.delete(key);}
  }
  const mutations={};
  for(const method of ['addDoc','setDoc','updateDoc','deleteDoc','runTransaction']){
    if(typeof firestoreSdk[method]==='function')
      mutations[method]=(...args)=>{
        owner(auth.currentUser?.uid);
        if(!connection.canAttempt())throw unavailable();
        // No custom offline queue, no optimistic replay by this adapter.
        return firestoreSdk[method](...args);
      };
  }
  if(typeof firestoreSdk.writeBatch==='function'){
    mutations.writeBatch=(...args)=>{
      owner(auth.currentUser?.uid);
      if(!connection.canAttempt())throw unavailable();
      const batch=firestoreSdk.writeBatch(...args);
      const proxy=new Proxy(batch,{
        get(target,key){
          if(key==='commit')return (...params)=>{
            owner(auth.currentUser?.uid);
            if(!connection.canAttempt())throw unavailable();
            return target.commit(...params);
          };
          const value=Reflect.get(target,key,target);
          if(typeof value!=='function')return value;
          return (...params)=>{
            const result=value.apply(target,params);
            return result===target?proxy:result;
          };
        }
      });
      return proxy;
    };
  }
  return Object.freeze({
    ...firestoreSdk,...mutations,
    getDocFromServer:reference=>request('getDocFromServer',reference),
    getDocsFromServer:reference=>request('getDocsFromServer',reference)
  });
}
