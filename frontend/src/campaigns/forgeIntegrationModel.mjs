/**
 * Phase 5.4: safe projections for Character Forge <-> Campaign Forge.
 * Firebase Functions, never the browser, authorize membership, review,
 * gameplay imports, unlink archives, and character activation.
 */
export const FORGE_ID=/^[A-Za-z0-9_-]{1,160}$/;
export const LINK_ID=/^[a-f0-9]{64}$/;
const LINK_STATUSES=['none','pending','approved','declined','inactive','unlinked'];
const GAMEPLAY_ACTIONS=['deactivate','restore','unlink'];
const integer=value=>Number.isSafeInteger(value)&&value>=1;
const valid=value=>value&&typeof value==='object'&&!Array.isArray(value);

export function activeCampaignMember(status){
 return status==='approved'||status==='member';
}
export function safeOwnedChoices(rows,uid){
 if(!Array.isArray(rows)||!FORGE_ID.test(uid))throw Error('Verified character list required.');
 return rows.filter(row=>valid(row)&&row.ownerUid===uid&&FORGE_ID.test(row.id))
  .map(row=>Object.freeze({
   id:row.id,name:typeof row.name==='string'?row.name.slice(0,120):row.id,
   linked:row.linked===true
  }));
}
export function safeCharacterLinkStatus(value,campaignId,sourceCharacterId){
 if(!valid(value)||value.campaignId!==campaignId||
    value.sourceCharacterId!==sourceCharacterId||
    !LINK_STATUSES.includes(value.status)||
    !(value.revision==null||integer(value.revision))||
    !(value.campaignCharacterId==null||FORGE_ID.test(value.campaignCharacterId)))
   throw Error('Campaign character link status could not be verified.');
 return Object.freeze({
  campaignId,sourceCharacterId,status:value.status,
  revision:value.revision??null,
  campaignCharacterId:value.campaignCharacterId||null,
  alreadyExists:value.alreadyExists===true
 });
}
export function safePendingCharacterLinks(value,campaignId){
 if(!valid(value)||value.campaignId!==campaignId||
    !Array.isArray(value.requests)||value.requests.length>100)
   throw Error('GM character request list is invalid.');
 const requests=value.requests.map(row=>{
  if(!valid(row)||!LINK_ID.test(row.linkId)||!FORGE_ID.test(row.ownerUid)||
     !FORGE_ID.test(row.sourceCharacterId)||row.status!=='pending'||
     !integer(row.revision))throw Error('GM character request needs reconciliation.');
  return Object.freeze({
   linkId:row.linkId,ownerUid:row.ownerUid,
   sourceCharacterId:row.sourceCharacterId,revision:row.revision,
   requestedAt:typeof row.requestedAt==='string'?row.requestedAt:''
  });
 });
 return Object.freeze({campaignId,requests,truncated:value.truncated===true});
}
export function safeCampaignCharacterLifecycle(value,campaignId){
 if(!valid(value)||value.campaignId!==campaignId||
    !Array.isArray(value.links)||value.links.length>100)
   throw Error('GM character lifecycle list is invalid.');
 const links=value.links.map(row=>{
  if(!valid(row)||!LINK_ID.test(row.linkId)||!FORGE_ID.test(row.ownerUid)||
     !FORGE_ID.test(row.sourceCharacterId)||!FORGE_ID.test(row.campaignCharacterId)||
     !['approved','inactive'].includes(row.status)||!integer(row.revision))
   throw Error('GM character lifecycle entry needs reconciliation.');
  return Object.freeze({
   linkId:row.linkId,ownerUid:row.ownerUid,
   sourceCharacterId:row.sourceCharacterId,
   campaignCharacterId:row.campaignCharacterId,
   revision:row.revision,status:row.status,
   updatedAt:typeof row.updatedAt==='string'?row.updatedAt:''
  });
 });
 return Object.freeze({campaignId,links});
}
export function gmCharacterReviewPayload(row,decision){
 if(!valid(row)||!LINK_ID.test(row.linkId)||!integer(row.revision)||
    !['approve','decline'].includes(decision)||row.status!=='pending')
   throw Error('Refresh the GM character request before reviewing it.');
 return {linkId:row.linkId,decision,expectedRevision:row.revision};
}
export function gmCharacterLifecyclePayload(row,action){
 if(!valid(row)||!LINK_ID.test(row.linkId)||!integer(row.revision)||
    !GAMEPLAY_ACTIONS.includes(action)||(
      action==='deactivate'&&row.status!=='approved'||
      action==='restore'&&row.status!=='inactive'||
      action==='unlink'&&!['approved','inactive'].includes(row.status)
    ))throw Error('Refresh the campaign character before changing its status.');
 return {linkId:row.linkId,lifecycleAction:action,expectedRevision:row.revision};
}
export function playerCharacterLifecyclePayload(status,action){
 if(!valid(status)||!FORGE_ID.test(status.sourceCharacterId)||
    !integer(status.revision)||
    !(action==='cancel'&&status.status==='pending'||
      action==='unlink'&&['approved','inactive'].includes(status.status)))
   throw Error('Refresh this saved character before changing its campaign link.');
 return {sourceCharacterId:status.sourceCharacterId,lifecycleAction:action,
  expectedRevision:status.revision};
}
