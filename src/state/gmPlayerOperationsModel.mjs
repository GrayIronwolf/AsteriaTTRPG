/**
 * GM Player Manager — individual play and activity projections.
 * All rows are derived from existing scoped campaign records. No writes or
 * additional backend collection; server permissions remain authoritative.
 */
import {resourcePair} from './resourceValues.mjs';
import {activeConditions} from './conditionModel.mjs';
import {gmInventoryAuditRows} from './gmInventoryAuditModel.mjs';
import {filterGMRewardEvents,rewardEventLabel,rewardEventStatus} from './gmRewardModel.mjs';
import {eventTime} from './liveEventReducer.mjs';

const ID=/^[A-Za-z0-9_-]{1,160}$/;
const validId=value=>typeof value==='string'&&ID.test(value);
const map=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const rows=value=>Array.isArray(value)?value:[];
const short=(value,length=180)=>String(value??'').trim().slice(0,length);
const limitedNumber=value=>Number.isFinite(Number(value))?Number(value):null;
const statusValues=new Set(['active','suspended','removed','banned']);

export const GM_PLAYER_ACTIVITY_KINDS=Object.freeze([
  {id:'all',label:'All activity'},
  {id:'checks',label:'Checks & dice'},
  {id:'rewards',label:'Rewards & XP'},
  {id:'inventory',label:'Inventory & trade'},
  {id:'membership',label:'Member decisions'}
]);

/** Character access is a membership + campaign ownership intersection,
 * never a trust in legacy GM UID arrays or session presence.
 */
export function gmVerifiedPlayerCharacters({campaign={},characters={},report={}}={}){
  if(report.state!=='ready'||!validId(campaign?.id))return [];
  const known=map(characters),seen=new Set(),items=[];
  for(const account of rows(report.rows)){
    if(!validId(account.uid)||!statusValues.has(account.status)||!Array.isArray(account.characters))continue;
    for(const link of account.characters){
      const id=link?.id;
      if(!validId(id)||seen.has(id))continue;
      const character=known[id];
      if(!character||character.id!==id||character.ownerUid!==account.uid||
        (character.sharedCampaignId&&character.sharedCampaignId!==campaign.id))continue;
      const rootOwner=campaign.playerCharacterLinks?.[id];
      const summaryOwner=campaign.characters?.[id]?.ownerUid;
      const memberLinks=campaign.players?.[account.uid]?.characterIds;
      if((rootOwner&&rootOwner!==account.uid)||
        (summaryOwner&&summaryOwner!==account.uid))continue;
      if(rootOwner!==account.uid&&summaryOwner!==account.uid&&
        !(Array.isArray(memberLinks)&&memberLinks.includes(id)))continue;
      seen.add(id);
      items.push({
        id,uid:account.uid,accountName:short(account.displayName,100)||account.uid,
        characterName:short(character.name,100)||id,role:account.role,
        status:account.status,online:account.online===true,
        character
      });
    }
  }
  return items.sort((a,b)=>a.accountName.localeCompare(b.accountName)||
    a.characterName.localeCompare(b.characterName)||a.id.localeCompare(b.id));
}

export function gmPlayerSnapshot(character={},clock={}){
  const characterName=short(character.name,100)||'Unnamed character';
  const resources=Object.fromEntries(['hp','sp','mp'].map(id=>{
    const [current,maximum]=resourcePair(character[id]);
    return [id,{current,maximum}];
  }));
  const active=activeConditions(character,clock).slice(0,30);
  const skills=character.skills;
  const skillList=Array.isArray(skills)?skills.filter(Boolean).map(v=>typeof v==='string'?v:v?.name||v?.label||''):
    Object.keys(map(skills));
  const items=rows(character.inventory);
  const xp=limitedNumber(character.xp);
  const xpMax=limitedNumber(character.xpMax);
  return {
    id:String(character.id||''),name:characterName,
    characterClass:short(character.klass||character.class||'Class not set',100),
    level:Number.isSafeInteger(character.level)&&character.level>=0?character.level:null,
    xp,xpMax,resources,
    conditions:active.map(row=>({id:String(row.id||''),name:short(row.name||'Condition',100)})),
    skillCount:skillList.length,
    skillNames:skillList.map(value=>short(value,80)).filter(Boolean).slice(0,8),
    inventoryTypes:items.length,
    inventoryUnits:items.reduce((sum,item)=>sum+Math.max(0,Math.min(1000000,
      Number.isSafeInteger(Number(item?.qty??item?.quantity??1))?Number(item?.qty??item?.quantity??1):0)),0)
  };
}

export function gmPlayerOperationsEnabled({access={},session={},selected=null}={}){
  return access.gm===true&&selected?.status==='active'&&session?.editable===true;
}
export function gmPlayerResourceAdjustmentValid({resource='',delta,character={},editable=false}={}){
  const number=Number(delta);
  return editable===true&&['hp','sp','mp'].includes(resource)&&
    String(delta??'').trim()!==''&&Number.isSafeInteger(number)&&
    number!==0&&Math.abs(number)<=100000&&character?.id&&
    Number.isSafeInteger(Number(character.coreRevision||0));
}

const checkedAt=value=>{
  if(typeof value?.toMillis==='function')return value.toMillis();
  if(typeof value?.seconds==='number')return value.seconds*1000;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  const t=Date.parse(value||'');
  return Number.isFinite(t)?t:0;
};
const readable=value=>short(value,120).replace(/[-_]/g,' ');

/**
 * Merge user-visible GM check, reward, inventory and restricted membership
 * history. Existing inventory/reward selectors already enforce targeting and
 * suppress private item details; duplicates in source streams are not repeated.
 */
export function gmPlayerActivityRows({
  events=[],checks=[],characters={},membershipEvents=[],selectedCharacterId='all',
  selectedUid='',kind='all',query='',limit=150
}={}){
  const safeCharacters=map(characters),valid=new Set(Object.keys(safeCharacters));
  const collected=[],seen=new Set();
  const add=row=>{
    if(!row?.id||seen.has(row.id))return;
    if(row.characterId&&(!valid.has(row.characterId)||
      (selectedCharacterId!=='all'&&row.characterId!==selectedCharacterId)))return;
    if(row.accountUid&&selectedUid&&row.accountUid!==selectedUid)return;
    if(selectedCharacterId!=='all'&&!row.characterId&&row.accountUid!==selectedUid)return;
    seen.add(row.id);collected.push(row);
  };
  for(const check of rows(checks).slice(0,300)){
    if(!validId(check?.id)||!validId(check?.characterId)||!valid.has(check.characterId))continue;
    const character=safeCharacters[check.characterId];
    const at=checkedAt(check.createdAt||check.updatedAt);
    const label=readable(check.skill||check.characteristic||check.type||'Check');
    add({id:'check:'+check.id,source:'universal-check',category:'checks',type:short(check.type,70),
      characterId:check.characterId,accountUid:character.ownerUid||'',
      title:label+' check',detail:'Status: '+readable(check.status||'pending')+
        (check.result?.total!=null?' · Total '+String(check.result.total):'')+
        (check.mode?' · '+readable(check.mode)+' dice':''),
      status:short(check.status,40),at});
  }
  for(const event of filterGMRewardEvents(events,{},safeCharacters).slice(0,300)){
    const charId=event.targetCharacterId;
    if(!validId(charId)||!valid.has(charId))continue;
    const character=safeCharacters[charId];
    add({id:'reward:'+event.id,source:'campaign-event',category:'rewards',type:short(event.type,70),
      characterId:charId,accountUid:character.ownerUid||'',
      title:readable(event.type),detail:short(rewardEventLabel(event),200),
      status:rewardEventStatus(event),at:eventTime(event)});
  }
  for(const item of gmInventoryAuditRows(safeCharacters,events)){
    if(['loot-reward','currency-reward'].includes(item.type))continue;
    const character=safeCharacters[item.characterId];
    add({id:'inventory:'+item.id,source:item.source||'inventory-audit',category:'inventory',
      type:short(item.type,70),characterId:item.characterId,accountUid:character?.ownerUid||'',
      title:short(item.title,220),detail:readable(item.category),
      status:item.pending?'Pending':'Recorded',at:checkedAt(item.at)});
  }
  for(const member of rows(membershipEvents).slice(0,100)){
    if(!validId(member?.uid)||!['role','permission','moderation','join'].includes(member.type))continue;
    add({id:'membership:'+String(member.type)+':'+member.uid+':'+String(member.at||'')+':'+String(member.detail||''),
      source:'membership-audit',category:'membership',type:short(member.type,60),
      characterId:'',accountUid:member.uid,title:readable(member.type)+' · '+member.uid,
      detail:short(member.detail,240)+(member.reason?' · Reason: '+short(member.reason,240):''),
      status:'Recorded',at:checkedAt(member.at)});
  }
  const allowed=new Set(GM_PLAYER_ACTIVITY_KINDS.map(v=>v.id));
  if(!allowed.has(kind))return [];
  const term=short(query,100).toLocaleLowerCase();
  return collected.filter(row=>(kind==='all'||row.category===kind)&&
    (!term||[row.title,row.detail,row.type,row.characterId,row.accountUid]
      .some(v=>String(v||'').toLocaleLowerCase().includes(term))))
    .sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id))
    .slice(0,Math.max(0,Math.min(200,Number.isSafeInteger(limit)?limit:150)));
}

export function gmPlayerCheckActionAllowed(row={},action=''){
  if(!validId(row.id))return false;
  return row.status==='pending'&&['resend','cancel'].includes(action)||
    row.status==='submitted'&&['acknowledge','reroll'].includes(action)||
    row.status==='acknowledged'&&action==='reroll';
}
