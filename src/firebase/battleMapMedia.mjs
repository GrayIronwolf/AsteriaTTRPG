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
    case 'storage/retry-limit-exceeded':
    case 'storage/unknown':
      return 'Firebase Storage could not deliver the map. Check your connection and ask the site administrator to check Storage CORS if the problem persists.';
    default:
      if((!code&&globalThis.navigator?.onLine===false)||error instanceof TypeError)
        return 'Map media could not be reached. Check your connection and retry.';
      return error?.message||'Map media could not be loaded.';
  }
}
