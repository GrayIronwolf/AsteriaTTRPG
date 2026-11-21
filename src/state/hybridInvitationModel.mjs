import {
  hybridViewerId,hybridViewerCanRead,sessionTimestampMs
} from './hybridPresentationSessionModel.mjs';

/** Improvement 5: viewer-identity-bound invitations; never a bearer URL. */
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const HYBRID_INVITATION_RESPONSE_TYPES=Object.freeze(['accept','decline']);
export function validateHybridInvitationResponse(raw={}){
  if(!plain(raw)||Object.keys(raw).some(key=>!['type','expectedGrantRevision'].includes(key))||
    !HYBRID_INVITATION_RESPONSE_TYPES.includes(raw.type)||
    !Number.isSafeInteger(raw.expectedGrantRevision)||
    raw.expectedGrantRevision<1||raw.expectedGrantRevision>1000000)
    throw Error('Choose a valid invitation response and current revision.');
  return {type:raw.type,expectedGrantRevision:raw.expectedGrantRevision};
}
export function hybridInvitationStatus(session={},grant={},uid='',now=Date.now()){
  if(!hybridViewerId(uid)||grant?.uid!==uid)
    return Object.freeze({status:'unavailable',authorized:false,canRespond:false,
      expiresAt:0,revision:0});
  const expiresAt=sessionTimestampMs(grant.expiresAt);
  const sessionDeadline=sessionTimestampMs(session.expiresAt);
  const sameEpoch=Boolean(session.epoch&&grant.epoch===session.epoch);
  const current=session.status==='open'&&sameEpoch&&sessionDeadline>now;
  const valid=current&&expiresAt>now;
  let status;
  if(grant.status==='revoked')status='revoked';
  else if(grant.status==='declined')status='declined';
  else if(!current)status='closed';
  else if(!valid)status='expired';
  else if(grant.status==='pending')status='pending';
  else if(hybridViewerCanRead(session,grant,uid,now))
    status=grant.acceptedAt?'accepted':'granted';
  else status='unavailable';
  return Object.freeze({
    status,authorized:status==='accepted'||status==='granted',
    canRespond:status==='pending',expiresAt:Math.min(expiresAt,sessionDeadline),
    revision:Number.isSafeInteger(grant.revision)?grant.revision:0
  });
}
export function hybridInvitationSummary(session,grant,uid,now=Date.now()){
  const current=hybridInvitationStatus(session,grant,uid,now);
  return Object.freeze({
    ...current,mode:typeof session?.mode==='string'&&
      ['in-person','hybrid','remote'].includes(session.mode)?session.mode:'hybrid'
  });
}
