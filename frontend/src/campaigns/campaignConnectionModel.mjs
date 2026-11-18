/**
 * Phase 5.3: invitation transport and permission-safe display projections.
 * No extra Firebase project, browser role bypass or persistent bearer tokens.
 */
export const CAMPAIGN_ID=/^[A-Za-z0-9_-]{1,160}$/;
export const SECURE_ID=/^[a-f0-9]{64}$/;
export const SECURE_TOKEN=/^[A-Za-z0-9_-]{43}$/;
export const CAMPAIGN_UCN=/^\d{12}$/;
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const STATUS=['pending','approved','declined','cancelled','expired','member','blocked','closed','none'];
export const MEMBERSHIP_ACTIONS=['suspend','restore','remove','ban'];
export const ROLES=['player','co-gm'];
export const DELEGATED_PERMISSIONS=['review-join-requests','moderate-members'];

let invitationInMemory=null;

/** Strip bearer token from URL synchronously before React mounts or any API call.
 * Secrets live in this module ONLY until acceptance/rejection, never in route
 * params, query, browser history, logs or storage. Invalid raw fragments are
 * scrubbed too, while preserving a safe invite page as the destination.
 */
export function captureIncomingSecureInvite({hash,replace}={}){
  if(typeof hash!=='string'||!/^#secure-campaign-invite=/i.test(hash))return false;
  invitationInMemory=parseSecureInvitationHash(hash);
  if(typeof replace==='function')replace('#/campaign-invitation');
  return true;
}
export function parseSecureInvitationHash(hash){
  if(typeof hash!=='string'||hash.length>380)return null;
  const match=hash.match(/^#secure-campaign-invite=([A-Za-z0-9_-]{1,160})\.([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/);
  if(!match)return null;
  return Object.freeze({campaignId:match[1],inviteId:match[2],token:match[3]});
}
export function getPendingSecureInvite(){return invitationInMemory;}
export function clearPendingSecureInvite(){invitationInMemory=null;}
/** Preserve leading zeros, never auto-redeem a permanent UCN. */
export function normalizeUCN(code){
  const value=typeof code==='string'?code.replace(/[ -]/g,''):'';
  return CAMPAIGN_UCN.test(value)?value:null;
}
export function invitationRouteCode(route){
  if(CAMPAIGN_UCN.test(route?.params?.code))return route.params.code;
  const found=typeof route?.hash==='string'?route.hash.match(/^#campaign-invite=(\d{12})$/):null;
  return found?.[1]||null;
}
export function safeInvitationPreview(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     !CAMPAIGN_ID.test(value.campaignId)||typeof value.campaignName!=='string'||
     !ROLES.includes(value.roleOffered)||value.requiresGMApproval!==true||
     !['available','pending','approved'].includes(value.status))
    throw new Error('Invalid protected invitation response.');
  return {campaignId:value.campaignId,
    name:value.campaignName.slice(0,120),
    role:value.roleOffered,status:value.status,
    expiresAt:typeof value.expiresAt==='string'?value.expiresAt:'',
    requiresGMApproval:true};
}
export function safeJoinPreview(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     !CAMPAIGN_ID.test(value.id)||!CAMPAIGN_UCN.test(value.ucn)||
     !['request','legacy','unavailable'].includes(value.joinMode)||
     typeof value.name!=='string')
    throw new Error('Invalid campaign lookup result.');
  return {id:value.id,ucn:value.ucn,name:value.name.slice(0,120),joinMode:value.joinMode};
}
export function safeRequestState(value,campaignId){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     value.campaignId!==campaignId||!STATUS.includes(value.status))
    throw new Error('Invalid server request status.');
  return {campaignId,status:value.status,
    alreadyExists:value.alreadyExists===true,
    requestedCharacterId:typeof value.requestedCharacterId==='string'&&ID.test(value.requestedCharacterId)?
      value.requestedCharacterId:null};
}
/** All GM permission actions require fresh server-reported role, status and
 * revision. No frontend value grants a permission by itself.
 */
export function validateMemberAction(row,action,reason=''){
  if(!row||!ID.test(row.uid)||!MEMBERSHIP_ACTIONS.includes(action)||
     !Array.isArray(row.controls)||!row.controls.includes(action)||
     !Number.isSafeInteger(row.revision)||row.revision<1||
     !['active','suspended','removed','banned'].includes(row.status))
    throw new Error('Member action is not authorised by the current roster.');
  const note=String(reason).trim();
  if(note.length>240||(['remove','ban'].includes(action)&&note.length<4))
    throw new Error('Enter a reason of 4–240 characters for removal or ban.');
  return {memberUid:row.uid,memberAction:action,
    expectedRevision:row.revision,expectedStatus:row.status,reason:note};
}
export function validateRoleAction(row,role){
  if(!row?.roleEditable||!ID.test(row.uid)||!ROLES.includes(role)||
     row.role===role||!ROLES.includes(row.role)||row.status!=='active'||
     !Number.isSafeInteger(row.revision)||row.revision<1)
    throw new Error('Role change is not available for this member.');
  return {memberUid:row.uid,newRole:role,expectedRevision:row.revision,
    expectedRole:row.role,expectedStatus:row.status};
}
export function validateDelegation(row,capability,enabled){
  if(!row?.roleEditable||row.role!=='co-gm'||row.status!=='active'||
     !DELEGATED_PERMISSIONS.includes(capability)||typeof enabled!=='boolean'||
     !Number.isSafeInteger(row.revision)||row.revision<1)
    throw new Error('Co-GM permission change is not available.');
  return {memberUid:row.uid,capability,enabled,expectedRevision:row.revision,
    expectedRole:'co-gm',expectedStatus:'active'};
}
export function safeSecureLink({campaignId,inviteId,token},base){
  if(!CAMPAIGN_ID.test(campaignId)||!SECURE_ID.test(inviteId)||!SECURE_TOKEN.test(token)||
     typeof base!=='string')throw new Error('Invalid one-time invitation data.');
  const url=new URL(base);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)
    throw new Error('Invalid invitation website origin.');
  url.search='';url.hash='#secure-campaign-invite='+campaignId+'.'+inviteId+'.'+token;
  return url.href;
}
