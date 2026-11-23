import {gmCampaignMemberSummary} from './gmCampaignRosterModel.mjs';

export const GM_PLAYER_MANAGER_VIEWS=Object.freeze([
  {id:'players',label:'Players & Party'},
  {id:'joins',label:'Join Requests'},
  {id:'characters',label:'Character Links'},
  {id:'invitations',label:'Invitations'},
  {id:'access',label:'Roles & Access'},
  {id:'activity',label:'Activity'}
]);
export const GM_PLAYER_MANAGER_DELEGATIONS=Object.freeze([
  {id:'review-join-requests',label:'Review join requests'},
  {id:'moderate-members',label:'Moderate campaign members'}
]);
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const id=value=>typeof value==='string'&&ID.test(value);
const obj=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const statuses=new Set(['active','suspended','removed','banned']);
const roles=new Set(['owner','co-gm','player']);
const limited=value=>String(value||'').trim().slice(0,120);

export function gmPlayerManagerAccess({campaign={},actorUid='',membership=null,flags={}}={}){
  const version=campaign?.membershipSchemaVersion;
  const v2=version===2;
  const supported=v2||version===1||version==null;
  const owner=supported&&id(campaign?.id)&&id(actorUid)&&campaign?.ownerUid===actorUid;
  const gmMember=v2&&!owner&&membership?.uid===actorUid&&membership?.campaignId===campaign?.id&&
    membership?.status==='active'&&membership?.role==='co-gm';
  const legacyGM=!v2&&(campaign?.membershipSchemaVersion==null||campaign?.membershipSchemaVersion===1)&&
    (owner||campaign?.roles?.[actorUid]==='gm'||(Array.isArray(campaign?.gmUids)&&campaign.gmUids.includes(actorUid)));
  const gm=Boolean(owner||gmMember||legacyGM);
  const enabled=flag=>v2&&gm&&flags?.[flag]===true;
  return {
    v2,gm,owner:!!owner,coGM:!!gmMember,
    roster:enabled('campaignPlayerRoster'),
    joinReview:enabled('campaignJoinReview')&&(owner||membership?.capabilityOverrides?.['review-join-requests']===true),
    characterApproval:enabled('campaignCharacterApproval'),
    characterLifecycle:enabled('campaignCharacterLifecycle'),
    invitationManagement:enabled('secureInvitationManager')&&owner,
    memberControls:enabled('campaignMemberControls')&&(owner||membership?.capabilityOverrides?.['moderate-members']===true),
    rolePermissions:enabled('campaignRolePermissions')&&owner,
    activity:enabled('campaignRolePermissions'),
    secureRequests:enabled('campaignJoinRequests')
  };
}

/**
 * The callable roster is authoritative when enabled, including its allowed
 * actions and linked summaries. Otherwise show only verified read-only
 * Firestore membership and character records from the existing live hook.
 */
export function gmPlayerManagerRoster({campaign={},characters={},members=null,rosterError='',serverRoster=null,
  query='',role='all',status='all',presence={}}={}){
  const local=gmCampaignMemberSummary({campaign,characters,members,rosterError});
  const canonical=campaign?.membershipSchemaVersion===2;
  const server=canonical&&serverRoster?.campaignId===campaign?.id&&serverRoster?.source==='canonical'&&
    Array.isArray(serverRoster.active)&&Array.isArray(serverRoster.inactive);
  let rows=server?[...serverRoster.active,...serverRoster.inactive]:local.members;
  const errors=[...local.issues];
  const seen=new Set();
  rows=rows.filter(member=>{
    if(!id(member?.uid)||seen.has(member.uid)||!roles.has(member.role)||!statuses.has(member.status)){
      errors.push('invalid-or-duplicate-member');return false;
    }
    seen.add(member.uid);return true;
  }).map(member=>({
    ...member,
    displayName:limited(member.displayName)||limited(campaign?.players?.[member.uid]?.displayName)||'',
    characters:(Array.isArray(member.characters)?member.characters:[]).filter(character=>
      id(character?.id)).map(character=>({
      id:character.id,name:limited(character.name)||character.id,
      level:Number.isSafeInteger(character.level)?character.level:null
    })),
    controls:server&&Array.isArray(member.controls)?member.controls.filter(x=>['suspend','restore','remove','ban'].includes(x)):[],
    roleEditable:server&&member.roleEditable===true&&member.uid!==campaign?.ownerUid,
    online:Object.values(obj(presence)).some(item=>
      item?.state==='online'&&(item.uid===member.uid ||
        (Array.isArray(member.characters)&&member.characters.some(c=>c.id===item.characterId))))
  }));
  const total=rows.length;
  const filtered=rows.filter(item=>{
    if(role!=='all'&&item.role!==role)return false;
    if(status!=='all'&&item.status!==status)return false;
    const needle=limited(query).toLocaleLowerCase();
    return !needle||[item.displayName,item.uid,item.role,...item.characters.map(c=>c.name)]
      .some(value=>String(value||'').toLocaleLowerCase().includes(needle));
  });
  const order={owner:0,'co-gm':1,player:2};
  filtered.sort((a,b)=>order[a.role]-order[b.role]||
    (a.displayName||a.uid).localeCompare(b.displayName||b.uid));
  const summary=server?{
    activePlayers:rows.filter(row=>row.role==='player'&&row.status==='active').length,
    activeGMs:rows.filter(row=>row.role!=='player'&&row.status==='active').length,
    inactive:rows.filter(row=>row.status!=='active').length,
    linkedCharacters:rows.reduce((n,row)=>n+row.characters.length,0),
    unverifiedCharacters:local.summary?.unverifiedCharacters||0,
    pending:Number(serverRoster?.summary?.pending)||0
  }:local.summary;
  return {
    source:server?'server':local.source,state:server?'ready':local.state,
    message:server?'':local.message,rows:filtered,total,summary,
    issues:errors,server:!!server
  };
}

export function gmPlayerManagerCapacity(campaign={},joinList=null){
  const server=Number(joinList?.capacity),filled=Number(joinList?.activePlayers);
  if(Number.isSafeInteger(server)&&server>=1&&server<=50&&Number.isSafeInteger(filled)&&filled>=0)
    return {limit:server,filled,remaining:Math.max(0,server-filled),verified:true};
  for(const candidate of [campaign?.playerLimit,campaign?.partySize,campaign?.settings?.partySize]){
    if(candidate==null||candidate==='')continue;
    const limit=Number(candidate);
    if(Number.isSafeInteger(limit)&&limit>=1&&limit<=50)
      return {limit,filled:null,remaining:null,verified:false};
    return {limit:null,filled:null,remaining:null,verified:false};
  }
  return {limit:12,filled:null,remaining:null,verified:false};
}

export function gmPlayerManagerApprovalAllowed(item,action,capacity){
  if(!item||item.status!=='pending'||!id(item.uid)||
    !Number.isSafeInteger(item.revision)||item.revision<1||
    !['approve','decline'].includes(action))return false;
  return action==='decline'||Boolean(capacity?.verified&&capacity.remaining>0);
}

export function gmPlayerManagerLifecycleAllowed(link,action){
  if(!link||!id(link.linkId)||!Number.isSafeInteger(link.revision)||link.revision<1)return false;
  return (link.status==='approved'&&['deactivate','unlink'].includes(action))||
    (link.status==='inactive'&&['restore','unlink'].includes(action));
}
