import {CAMPAIGN_ID} from '../campaigns/campaignForgeModel.mjs';
import {gmSessionState} from '../dashboard/gmDashboardModel.mjs';

const obj=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const txt=(value,fallback='',size=150)=>typeof value==='string'?value.slice(0,size):fallback;
const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):0;
const list=value=>Array.isArray(value)?value:[];
export const DASHBOARD_ID=CAMPAIGN_ID;
export function requireDashboardId(value){
  if(typeof value!=='string'||!DASHBOARD_ID.test(value))throw Error('Invalid character or campaign identifier.');
  return value;
}
function safePair(value){
  if(!Array.isArray(value)||value.length<2)return null;
  const current=Number(value[0]),maximum=Number(value[1]);
  if(!Number.isFinite(current)||!Number.isFinite(maximum)||maximum<0)return null;
  return Object.freeze([Math.max(0,current),maximum]);
}
function rows(value,max=16){
  if(Array.isArray(value))return value.slice(0,max);
  if(obj(value))return Object.entries(value).slice(0,max).map(([name,data])=>
    obj(data)?{...data,name:data.name||name}: {name,value:data});
  return [];
}
function labels(value,max=16){
  return Object.freeze(rows(value,max).map(value=>txt(typeof value==='string'?value:
    value?.name||value?.title||value?.label||value?.id,'',100)).filter(Boolean));
}
function skills(value){
  return Object.freeze(rows(value,24).map(row=>({
    name:txt(row?.name||row?.title||row,'',100),
    rank:txt(typeof row?.rankName==='string'?row.rankName:
      typeof row?.rank==='string'?row.rank: typeof row?.value==='string'?row.value:
      row?.rank??row?.value!=null?String(row?.rank??row?.value):'','',50)
  })).filter(row=>row.name).map(Object.freeze));
}
function items(value,max=24){
  return Object.freeze(rows(value,max).map(row=>Object.freeze({
    name:txt(row?.name||row?.title||row,'',100),
    quantity:Math.min(99999,Math.max(0,Number(row?.qty??row?.quantity??1)||0))
  })).filter(row=>row.name));
}
function notes(value){
  return Object.freeze(rows(value,16).map(row=>{
    if(typeof row==='string')return Object.freeze({title:'Journal entry',content:txt(row,'',1000)});
    return Object.freeze({title:txt(row.title||row.name||'Journal entry','',120),
      content:txt(row.content||row.text||row.body||row.note,'',1000)});
  }).filter(row=>row.title||row.content));
}
function traits(character){
  return labels(character?.racialTraits||character?.raceInfo?.traits||character?.character?.race?.traits,12);
}
/** UI is intentionally a strict projection; owner-only journals never enter GM snapshots. */
export function playerCharacterProjection(value,{owned=false}={}){
  if(!obj(value)||!DASHBOARD_ID.test(String(value.id||''))||!DASHBOARD_ID.test(String(value.ownerUid||'')))
    throw Error('A verified character record is required.');
  const characteristics=obj(value.characteristics)?value.characteristics:{};
  const stats=Object.fromEntries(['strength','dexterity','agility','constitution','endurance',
    'intelligence','wisdom','charisma','luck'].map(k=>[
      k,Number.isFinite(Number(characteristics[k]))?Number(characteristics[k]):null
    ]));
  const classes=typeof value.class==='string'?value.class:value.class?.title||value.character?.class?.title||'';
  const spells=labels(value.spells||value.knownSpells,24);
  const talents=labels(value.classTalents||value.talents||value.character?.startingTalents,24);
  const result={
    id:value.id,name:txt(value.name,'Unnamed Character',120),
    race:txt(value.race||value.character?.race?.title,'Unknown',100),
    klass:txt(value.klass||classes,'Unknown',120),level:count(value.level),
    xp:count(value.xp),xpMax:count(value.xpMax),tp:count(value.tp),cp:count(value.cp),
    hp:safePair(value.hp),sp:safePair(value.sp),mp:safePair(value.mp),
    characteristics:Object.freeze(stats),
    naturalAC:Number.isFinite(Number(value.naturalAC))?Number(value.naturalAC):null,
    skills:skills(value.skills||value.selectedSkills),spells,talents,
    magic:labels(value.magicTypes||value.character?.magic?.types,24),
    racialTraits:traits(value),
    conditions:labels(value.conditions,16),
    inventory:items(value.inventory),
    equipment:items(value.equipment?.items||value.equipment,16),
    quests:items(value.quests||value.questAssignments,12),
    journal:owned?notes(value.journal):Object.freeze([]),
    backstory:owned?txt(value.backstory?.history||value.backstory?.backstory||
      (typeof value.backstory==='string'?value.backstory:''),'',2400):'',
    links:owned?Object.freeze([...new Set([
      ...list(value.linkedCampaignIds),value.sharedCampaignId,value.campaignId
    ].filter(id=>typeof id==='string'&&DASHBOARD_ID.test(id)))].slice(0,24)
      .map(campaignId=>Object.freeze({
        campaignId,
        characterId:DASHBOARD_ID.test(String(value.campaignCharacterIds?.[campaignId]||''))?
          value.campaignCharacterIds[campaignId]:value.id
      }))):Object.freeze([])
  };
  return Object.freeze(result);
}
export function playerCampaignAccess(campaign,member,uid,campaignId){
  if(!uid||!obj(campaign)||campaign.id!==campaignId||
    !DASHBOARD_ID.test(String(campaignId||'')))
    return Object.freeze({allowed:false,isGM:false});
  const v=campaign.membershipSchemaVersion??1;
  if(v!==1&&v!==2)return Object.freeze({allowed:false,isGM:false});
  if(campaign.ownerUid===uid)return Object.freeze({allowed:true,isGM:true});
  if(v===2){
    const active=obj(member)&&member.uid===uid&&member.campaignId===campaignId&&
      member.status==='active'&&['player','co-gm'].includes(member.role);
    return Object.freeze({allowed:Boolean(active),isGM:active&&member.role==='co-gm'});
  }
  const gm=list(campaign.gmUids).includes(uid)||campaign.roles?.[uid]==='gm';
  const player=list(campaign.playerUids).includes(uid)||campaign.roles?.[uid]==='player';
  return Object.freeze({allowed:Boolean(gm||player),isGM:Boolean(gm)});
}
export function linkedCharacterAccess(campaign,character,uid,access){
  if(!access?.allowed||!obj(character)||!DASHBOARD_ID.test(String(character.id||''))||
    !DASHBOARD_ID.test(String(character.ownerUid||''))||
    character.sharedCampaignId&&character.sharedCampaignId!==campaign?.id ||
    character.status&&character.status!=='linked')return Object.freeze({allowed:false,owned:false});
  const id=character.id,ownerUid=character.ownerUid;
  const linkedOwner=campaign?.playerCharacterLinks?.[id];
  const summaryOwner=campaign?.characters?.[id]?.ownerUid;
  if(linkedOwner&&linkedOwner!==ownerUid||summaryOwner&&summaryOwner!==ownerUid)
    return Object.freeze({allowed:false,owned:false});
  const link=linkedOwner===ownerUid||summaryOwner===ownerUid||
    list(campaign?.players?.[ownerUid]?.characterIds).includes(id);
  const v=campaign?.membershipSchemaVersion??1;
  if(v===2&&!(linkedOwner===ownerUid&&summaryOwner===ownerUid&&
    list(campaign.party).includes(id)&&character.status==='linked'))
    return Object.freeze({allowed:false,owned:false});
  if(!link)return Object.freeze({allowed:false,owned:false});
  const owned=ownerUid===uid;
  return Object.freeze({allowed:Boolean(owned||access.isGM),owned});
}
/** Source linkage must be checked for the owner, not inferred from the shared record. */
export function matchesOwnedSource(source,shared,campaignId,uid,version){
  if(!obj(source)||source.ownerUid!==uid||!obj(shared)||shared.ownerUid!==uid||
    source.id!==(shared.sourceCharacterId||shared.id))return false;
  const expected=source.campaignCharacterIds?.[campaignId];
  if(expected&&expected!==shared.id)return false;
  const linked=list(source.linkedCampaignIds).includes(campaignId)||
    source.sharedCampaignId===campaignId||source.campaignId===campaignId;
  return linked&&(version!==2||expected===shared.id);
}
export function publicPartyProjection(campaign){
  const summaries=obj(campaign?.characters)?campaign.characters:{};
  const ids=[...new Set([
    ...list(campaign?.party).filter(x=>typeof x==='string'),
    ...Object.keys(summaries)
  ])].filter(x=>DASHBOARD_ID.test(x)).slice(0,100);
  return Object.freeze(ids.map(id=>{
    const row=obj(summaries[id])?summaries[id]:{};
    return Object.freeze({id,name:txt(row.name,'Linked Character',100),
      klass:txt(row.klass||row.class,'',100),level:count(row.level)});
  }));
}
export function playerCampaignProjection(campaign,access,session){
  if(!access?.allowed)throw Error('Campaign membership could not be verified.');
  return Object.freeze({id:campaign.id,name:txt(campaign.name,'Campaign',120),
    isGM:access.isGM,session:gmSessionState(session),
    party:publicPartyProjection(campaign)});
}
