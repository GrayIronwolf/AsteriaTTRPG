/**
 * Phase 8.4: shared Functions facade. The Cloud Function remains authoritative;
 * this wrapper rejects stale responses and refuses new calls while offline.
 * It does not queue or replay mutating commands.
 */
import {captureAccountSession} from './sessionIntegrity.mjs';

export function createGuardedFunctionsSdk({auth,functionsSdk,connection}={}){
  if(!auth||typeof functionsSdk?.httpsCallable!=='function'||
     typeof connection?.canAttempt!=='function')
    throw TypeError('Existing Firebase Functions, Auth and connection are required.');
  return Object.freeze({
    ...functionsSdk,
    httpsCallable(...args){
      const invoke=functionsSdk.httpsCallable(...args);
      if(typeof invoke!=='function')throw TypeError('The Firebase callable must be a function.');
      return async (...payload)=>{
        const session=captureAccountSession({auth,connection});
        if(!connection.canAttempt())
          throw Error('Connection unavailable. Retry the action after reconnecting.');
        // No automatic retry: a failed mutation may already have committed.
        const result=await invoke(...payload);
        session.assertCurrent();
        return result;
      };
    }
  });
}
