import {gmCampaignMemberSummary} from './gmCampaignRosterModel.mjs';

export const GM_PLAYER_MANAGER_VIEWS=Object.freeze([
  {id:'players',label:'Players & Party'},
  {id:'player-tools',label:'Individual Tools'},
  {id:'live-actions',label:'Live GM Actions'},
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
    attendance:enabled('campaignAttendance'),
    attendance:enabled('campaignAttendance')&&enabled('campaignPlayerRoster'),
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
  // Presence may update every few seconds. Index it once rather than scanning
  // every presence record for every member and every linked character.
  const onlineUsers=new Set(),onlineCharacters=new Set();
  for(const record of Object.values(obj(presence))){
    if(record?.state!=='online')continue;
    if(id(record.uid))onlineUsers.add(record.uid);
    if(id(record.characterId))onlineCharacters.add(record.characterId);
  }
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
    online:onlineUsers.has(member.uid)||
      (Array.isArray(member.characters)&&member.characters.some(c=>onlineCharacters.has(c.id)))
  }));
  const total=rows.length;
  const summary=server?{
    activePlayers:rows.filter(row=>row.role==='player'&&row.status==='active').length,
    activeGMs:rows.filter(row=>row.role!=='player'&&row.status==='active').length,
    inactive:rows.filter(row=>row.status!=='active').length,
    linkedCharacters:rows.reduce((n,row)=>n+row.characters.length,0),
    unverifiedCharacters:local.summary?.unverifiedCharacters||0,
    pending:Number(serverRoster?.summary?.pending)||0
  }:local.summary;
  return gmPlayerManagerFilter({
    source:server?'server':local.source,state:server?'ready':local.state,
    message:server?'':local.message,rows,total,summary,
    issues:errors,server:!!server
  },{query,role,status});
}

/** Presentation-only filters: never determine membership or permissions. */
export function gmPlayerManagerFilter(report={},{query='',role='all',status='all',onlyOnline=false}={}){
  const needle=limited(query).toLocaleLowerCase();
  const source=Array.isArray(report.rows)?report.rows:[];
  const allowedRoles=new Set(['all','owner','co-gm','player']);
  const allowedStatuses=new Set(['all','active','suspended','removed','banned']);
  const chosenRole=allowedRoles.has(role)?role:'all';
  const chosenStatus=allowedStatuses.has(status)?status:'all';
  const rows=source.filter(member=>
    (chosenRole==='all'||member.role===chosenRole)&&
    (chosenStatus==='all'||member.status===chosenStatus)&&
    (!onlyOnline||member.online===true)&&
    (!needle||[member.displayName,member.uid,member.role,
      ...(Array.isArray(member.characters)?member.characters.map(c=>c.name):[])]
      .some(value=>String(value||'').toLocaleLowerCase().includes(needle)))
  );
  const order={owner:0,'co-gm':1,player:2};
  rows.sort((a,b)=>order[a.role]-order[b.role]||
    (a.displayName||a.uid).localeCompare(b.displayName||b.uid));
  return {...report,rows,total:report.total??source.length,matchCount:rows.length};
}

/** Render only a bounded card slice; all data stays inside this view model. */
export function gmPlayerManagerPage(report={},requestedPage=1,requestedSize=12){
  const source=Array.isArray(report.rows)?report.rows:[];
  const pageSize=[8,12,24].includes(Number(requestedSize))?Number(requestedSize):12;
  const pages=Math.max(1,Math.ceil(source.length/pageSize));
  const rawPage=Number(requestedPage);
  const page=Number.isSafeInteger(rawPage)?
    Math.max(1,Math.min(pages,rawPage)):1;
  const start=(page-1)*pageSize;
  return {page,pages,pageSize,rows:source.slice(start,start+pageSize),
    matchCount:source.length,from:source.length?start+1:0,
    to:Math.min(start+pageSize,source.length)};
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
