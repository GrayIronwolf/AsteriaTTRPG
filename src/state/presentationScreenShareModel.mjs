import {hybridViewerCanRead,hybridViewerId,sessionTimestampMs}
  from './hybridPresentationSessionModel.mjs';

/**
 * Improvement 9: one-to-one, video-only WebRTC negotiated through already
 * authenticated Firebase callables. SDP never enters public scene documents.
 */
export const SCREEN_SHARE_MAX_DURATION_MS=20*60*1000;
export const SCREEN_SHARE_SDP_MAX_CHARS=16000;
export const SCREEN_SHARE_STATUSES=Object.freeze(['offered','answered']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const screenShareConnectionId=value=>typeof value==='string'&&
  /^[A-Za-z0-9_-]{16,96}$/.test(value);
const exact=(raw,keys)=>object(raw)&&
  Object.keys(raw).every(key=>keys.includes(key));
export function screenShareVideoSdp(sdp){
  if(typeof sdp!=='string'||sdp.length<160||sdp.length>SCREEN_SHARE_SDP_MAX_CHARS||
    !/^v=0\r?\n/.test(sdp)||!/(?:^|\n)m=video\s/.test(sdp)||
    (sdp.match(/(?:^|\n)m=/g)||[]).length!==1||
    /(?:^|\n)m=audio\s/.test(sdp)||/[\u0000-\u0008]/.test(sdp))
    throw Error('Only one bounded video-only WebRTC description is permitted.');
  return sdp;
}
export function validateGMScreenShareAction(raw){
  if(!object(raw)||!['offer','stop'].includes(raw.type)||
    !hybridViewerId(raw.viewerUid)||!screenShareConnectionId(raw.connectionId))
    throw Error('Invalid screen sharing recipient or connection.');
  if(raw.type==='stop'){
    if(!exact(raw,['type','viewerUid','connectionId']))
      throw Error('Unsupported screen sharing stop fields.');
    return {type:'stop',viewerUid:raw.viewerUid,connectionId:raw.connectionId};
  }
  if(!exact(raw,['type','viewerUid','connectionId','sdp']))
    throw Error('Unsupported screen sharing offer fields.');
  return {...raw,sdp:screenShareVideoSdp(raw.sdp)};
}
export function validateViewerScreenShareAction(raw){
  if(!object(raw)||!['answer','leave'].includes(raw.type)||
    !screenShareConnectionId(raw.connectionId))
    throw Error('Invalid viewer screen sharing response.');
  if(raw.type==='leave'){
    if(!exact(raw,['type','connectionId']))
      throw Error('Unsupported viewer leave fields.');
    return {type:'leave',connectionId:raw.connectionId};
  }
  if(!exact(raw,['type','connectionId','sdp']))
    throw Error('Unsupported viewer answer fields.');
  return {...raw,sdp:screenShareVideoSdp(raw.sdp)};
}
export function screenShareDeadline(session={},grant={},now=Date.now()){
  const sessionEnd=sessionTimestampMs(session.expiresAt);
  const grantEnd=sessionTimestampMs(grant.expiresAt);
  return Math.min(sessionEnd,grantEnd,now+SCREEN_SHARE_MAX_DURATION_MS);
}
export function screenShareSignalCanRead(session={},grant={},signal={},uid='',now=Date.now()){
  return hybridViewerCanRead(session,grant,uid,now)&&
    signal?.viewerUid===uid&&
    signal?.epoch===session.epoch&&
    SCREEN_SHARE_STATUSES.includes(signal?.status)&&
    screenShareConnectionId(signal?.connectionId)&&
    sessionTimestampMs(signal.expiresAt)>now;
}
/** Only a source of opaque metadata for status UI, never credentials or SDP. */
export function safeScreenShareStatus(signal={}){
  return {status:SCREEN_SHARE_STATUSES.includes(signal?.status)?signal.status:'off',
    viewerUid:hybridViewerId(signal?.viewerUid)?signal.viewerUid:'',
    expiresAt:sessionTimestampMs(signal?.expiresAt)};
}
