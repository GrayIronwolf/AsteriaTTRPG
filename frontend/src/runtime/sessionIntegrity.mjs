/**
 * Phase 8.4: a uid alone does not identify an authenticated session.
 * The single Auth observer updates the generation on every sign-out/switch.
 * A response started under an earlier session must not be published even if
 * that same UID signs in again before the network promise settles.
 */
export function captureAccountSession({auth,connection}={}){
  if(!auth||typeof connection?.authGeneration!=='function')
    throw TypeError('An authenticated account and the shared session monitor are required.');
  const uid=auth.currentUser?.uid;
  if(typeof uid!=='string'||!uid)
    throw Error('Sign in before accessing private campaign data.');
  const generation=connection.authGeneration();
  const assertCurrent=()=>{
    if(auth.currentUser?.uid!==uid||connection.authGeneration()!==generation){
      const error=Error('The authenticated session changed. Reopen this workspace and verify the result.');
      error.code='asteria/session-changed';
      throw error;
    }
  };
  assertCurrent();
  return Object.freeze({uid,generation,assertCurrent});
}
export const isConfirmedServerSnapshot=snapshot=>
  snapshot?.metadata?.fromCache===false&&snapshot?.metadata?.hasPendingWrites===false;
