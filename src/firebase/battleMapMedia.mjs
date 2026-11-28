export function battleMapMediaError(code,message){
  return Object.assign(new Error(message),{code});
}

export function assertBattleMapMediaSession(auth,user,{uid,signal}={}){
  if(signal?.aborted)throw signal.reason;
  if(!user?.uid)throw battleMapMediaError('storage/unauthenticated','Sign in to view this map.');
  if(auth.currentUser!==user||(uid&&user.uid!==uid))
    throw battleMapMediaError('auth/user-changed','The signed-in account changed. Retry with the current account.');
}

export function battleMapMediaErrorMessage(error){
  const code=error?.code||error?.cause?.code;
  switch(code){
    case 'storage/unauthenticated':
    case 'auth/user-token-expired':
    case 'auth/invalid-user-token':
    case 'unauthenticated':
      return 'Your Firebase session is unavailable. Sign in again to view this map.';
    case 'storage/unauthorized':
    case 'permission-denied':
      return 'You do not have permission to view this map media. Check your campaign access.';
    case 'storage/unauthorized-app':
      return 'Firebase Storage blocked this app. Ask the site administrator to check App Check.';
    case 'storage/object-not-found':
      return 'The map media file was not found in Firebase Storage.';
    case 'storage/bucket-not-found':
    case 'storage/project-not-found':
    case 'storage/no-default-bucket':
      return 'The map media Storage bucket is unavailable. Contact the site administrator.';
    case 'storage/invalid-url':
    case 'storage/invalid-argument':
    case 'storage/invalid-root-operation':
      return 'This map has an invalid media reference.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Firebase could not be reached. Check your connection and retry.';
    case 'storage/quota-exceeded':
      return 'Firebase Storage has reached its request quota. Retry later.';
    case 'storage/network':
    case 'storage/retry-limit-exceeded':
    case 'storage/unknown':
      return 'Firebase Storage could not deliver the map. Check your connection and ask the site administrator to check Storage CORS if the problem persists.';
    default:
      if((!code&&globalThis.navigator?.onLine===false)||error instanceof TypeError)
        return 'Map media could not be reached. Check your connection and retry.';
      return error?.message||'Map media could not be loaded.';
  }
}

// Storage's getBlob retries internally and exposes neither cancellation nor download
// progress. Use the same authenticated media endpoint so the canvas can cancel
// transfers and distinguish a stalled request from one still receiving bytes.
export function createBattleMapDownloader(auth,{emulator=false}={}){
  const byUser=new WeakMap();
  const origin=emulator?'http://127.0.0.1:9199':'https://firebasestorage.googleapis.com';
  return function download(reference,options={}){
    const user=auth.currentUser;
    assertBattleMapMediaSession(auth,user,options);
    const {signal,onStage}=options;
    const url=origin+'/v0/b/'+encodeURIComponent(reference.bucket)+'/o/'+
      encodeURIComponent(reference.fullPath)+'?alt=media';
    if(!byUser.has(user))byUser.set(user,new Map());
    const pending=byUser.get(user);
    let entry=pending.get(url);
    if(!entry){
      const controller=new AbortController();
      entry={controller,listeners:new Set(),stage:'Firebase authentication token'};
      const report=stage=>{
        entry.stage=stage;
        for(const listener of entry.listeners)listener(stage);
      };
      entry.promise=Promise.resolve().then(async()=>{
        const token=await user.getIdToken();
        assertBattleMapMediaSession(auth,user,{signal:controller.signal});
        report('Firebase Storage download');
        const blob=await new Promise((resolve,reject)=>{
          const xhr=new XMLHttpRequest();
          const abort=()=>xhr.abort();
          xhr.open('GET',url);
          xhr.responseType='blob';
          xhr.setRequestHeader('Authorization','Firebase '+token);
          xhr.onprogress=()=>report('Firebase Storage download');
          xhr.onabort=()=>reject(controller.signal.reason);
          xhr.onerror=()=>reject(battleMapMediaError('storage/network','Storage network or CORS error.'));
          xhr.onload=()=>{
            if(xhr.status===200){resolve(xhr.response);return;}
            const code={401:'storage/unauthenticated',403:'storage/unauthorized',
              404:'storage/object-not-found',429:'storage/quota-exceeded'}[xhr.status];
            reject(battleMapMediaError(code||'map-media/http','Firebase Storage returned HTTP '+xhr.status+'. Retry the map download.'));
          };
          xhr.onloadend=()=>controller.signal.removeEventListener('abort',abort);
          controller.signal.addEventListener('abort',abort,{once:true});
          xhr.send();
        });
        assertBattleMapMediaSession(auth,user,{signal:controller.signal});
        return blob;
      }).finally(()=>{if(pending.get(url)===entry)pending.delete(url);});
      pending.set(url,entry);
    }
    return new Promise((resolve,reject)=>{
      const listener=stage=>onStage?.(stage);
      const cleanup=()=>{
        entry.listeners.delete(listener);
        signal?.removeEventListener('abort',cancel);
      };
      const cancel=()=>{
        cleanup();
        if(!entry.listeners.size){
          if(pending.get(url)===entry)pending.delete(url);
          entry.controller.abort();
        }
        reject(signal.reason);
      };
      entry.listeners.add(listener);
      signal?.addEventListener('abort',cancel,{once:true});
      entry.promise.then(resolve,reject).finally(cleanup);
      listener(entry.stage);
    });
  };
}
