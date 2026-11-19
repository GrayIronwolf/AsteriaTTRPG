/**
 * Phase 8.4: guard private Storage transfers and their completion receipts
 * with the same Auth generation as Firestore reads and Functions calls.
 * Existing Firebase Storage rules, file validation and owners remain authoritative.
 */
import {captureAccountSession} from './sessionIntegrity.mjs';

export function createGuardedStorageSdk({auth,storageSdk,connection}={}){
  if(!auth||!storageSdk||typeof connection?.canAttempt!=='function')
    throw TypeError('Existing Firebase Storage, Auth and connection are required.');
  const secured={};
  for(const method of ['getBlob','getBytes','getDownloadURL','uploadBytes','deleteObject']){
    if(typeof storageSdk[method]!=='function')continue;
    secured[method]=async (...args)=>{
      const session=captureAccountSession({auth,connection});
      if(!connection.canAttempt())
        throw Error('Connection unavailable. Retry the Storage action after reconnecting.');
      const result=await storageSdk[method](...args);
      session.assertCurrent();
      return result;
    };
  }
  return Object.freeze({...storageSdk,...secured});
}
