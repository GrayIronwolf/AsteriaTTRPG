import {campaignMembershipRole,isGameMasterRole} from '../../state/campaignMembershipAccess.mjs';
/** Single-session campaign role checks for the existing Firebase bridge.
 * Security rules and callable functions remain authoritative.
 */
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function assertGMCampaignId(campaignId){
  if(!id(campaignId))throw Error('Invalid campaign identifier.');
  return campaignId;
}
export function gmCampaignAccess(campaign,member,uid,campaignId){
  const role=!id(uid) || !id(campaignId) || campaign?.id!==campaignId
    ? '' : campaignMembershipRole(campaign,uid,member,campaignId);
  return Object.freeze({allowed:isGameMasterRole(role),role:isGameMasterRole(role)?role:''});
}
export function playerCampaignAccess(campaign,member,uid,campaignId){
  const role=!id(uid) || !id(campaignId) || campaign?.id!==campaignId
    ? '' : campaignMembershipRole(campaign,uid,member,campaignId);
  return Object.freeze({allowed:Boolean(role),isGM:isGameMasterRole(role)});
}
const pair=v=>Array.isArray(v)?v.slice(0,2).map(n=>Number(n)||0):[0,0];
export function gmPartySummary(rows=[]){
  return (Array.isArray(rows)?rows:[]).filter(row=>id(row?.id)).slice(0,128).map(row=>({
    id:row.id,name:String(row.name||'Character').slice(0,100),
    image:typeof row.image==='string'?row.image:'',
    level:Math.max(0,Math.floor(Number(row.level)||0)),
    className:String(row.className||row.class?.name||row.class||'').slice(0,80),
    hp:pair(row.hp),sp:pair(row.sp),mp:pair(row.mp)
  }));
}
