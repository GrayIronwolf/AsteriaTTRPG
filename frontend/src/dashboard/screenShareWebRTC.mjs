/**
 * WebRTC video-only negotiation. Full ICE gathering is used because Firebase
 * writes are callable-only; trickle candidates would require extra writable
 * signaling paths. A peer connection is never created outside user action.
 */
export const SCREEN_SHARE_ICE_SERVERS=Object.freeze([
  Object.freeze({urls:'stun:stun.l.google.com:19302'})
]);
export async function awaitScreenShareIce(peer,{timeoutMs=9000}={}){
  if(peer.iceGatheringState==='complete')return;
  await new Promise((resolve,reject)=>{
    let timer=null,done=false;
    const finish=error=>{
      if(done)return;done=true;
      peer.removeEventListener('icegatheringstatechange',changed);
      if(timer!==null)clearTimeout(timer);
      if(error)reject(error);else resolve();
    };
    const changed=()=>{if(peer.iceGatheringState==='complete')finish();};
    peer.addEventListener('icegatheringstatechange',changed);
    timer=setTimeout(()=>finish(Error('Timed out gathering WebRTC network candidates.')),timeoutMs);
    changed();
  });
}
export function screenSharePeerConfig(usePublicStun=false){
  return {iceServers:usePublicStun?[...SCREEN_SHARE_ICE_SERVERS]:[],
    iceTransportPolicy:'all',bundlePolicy:'max-bundle'};
}
export function stopScreenSharePeer(peer,stream){
  try{peer?.close();}catch{/* already closed */}
  try{stream?.getTracks?.().forEach(track=>track.stop());}catch{/* already stopped */}
}
