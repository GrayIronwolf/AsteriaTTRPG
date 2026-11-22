/** Single-session campaign role checks for the existing Firebase bridge.
 * Security rules and callable functions remain authoritative.
 */
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function assertGMCampaignId(campaignId){
  if(!id(campaignId))throw Error('Invalid campaign identifier.');
  return campaignId;
}
export function gmCampaignAccess(campaign,member,uid,campaignId){
  if(!id(uid)||!id(campaignId)||!object(campaign)||campaign.id!==campaignId)return {allowed:false,role:''};
  const version=campaign.membershipSchemaVersion??1;
  if(![1,2].includes(version))return {allowed:false,role:''};
  if(campaign.ownerUid===uid)return {allowed:true,role:'owner'};
  if(version===2){
    const allowed=object(member)&&member.uid===uid&&member.campaignId===campaignId&&member.status==='active'&&member.role==='co-gm';
    return {allowed,role:allowed?'co-gm':''};
  }
  const allowed=(Array.isArray(campaign.gmUids)&&campaign.gmUids.includes(uid))||campaign.roles?.[uid]==='gm';
  return {allowed:Boolean(allowed),role:allowed?'gm':''};
}
export function playerCampaignAccess(campaign,member,uid,campaignId){
  if(!id(uid)||!id(campaignId)||!object(campaign)||campaign.id!==campaignId)return {allowed:false,isGM:false};
  const version=campaign.membershipSchemaVersion??1;
  if(![1,2].includes(version))return {allowed:false,isGM:false};
  if(campaign.ownerUid===uid)return {allowed:true,isGM:true};
  if(version===2){
    const allowed=object(member)&&member.uid===uid&&member.campaignId===campaignId&&member.status==='active'&&['player','co-gm'].includes(member.role);
    return {allowed,isGM:allowed&&member.role==='co-gm'};
  }
  const gm=(Array.isArray(campaign.gmUids)&&campaign.gmUids.includes(uid))||campaign.roles?.[uid]==='gm';
  const player=(Array.isArray(campaign.playerUids)&&campaign.playerUids.includes(uid))||campaign.roles?.[uid]==='player';
  return {allowed:Boolean(gm||player),isGM:Boolean(gm)};
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
