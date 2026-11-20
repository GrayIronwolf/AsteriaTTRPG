import {CAMPAIGN_ID} from '../campaigns/campaignForgeModel.mjs';
import {gmSessionState} from '../dashboard/gmDashboardModel.mjs';
import {layoutFromPlayerPreferences} from '../../../src/state/dashboardLayoutModel.mjs';
import {safeDashboardArtwork} from '../../../src/state/playerHudMedia.mjs';
import {projectPlayerSystems} from './playerSystemsProjection.mjs';
import {projectJournal} from './playerJournalModel.mjs';
import {projectGallery} from './playerGalleryModel.mjs';
import {playerQuestProjection} from './playerQuestModel.mjs';
import {ownedActivityProjection} from './playerInformationModel.mjs';

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
function spellRecords(value){
  return Object.freeze(rows(value,24).map(row=>{
    const data=typeof row==='string'?{name:row}:obj(row)?row:{};
    const name=txt(data.name||data.title,'',100);
    if(!name)return null;
    const costSource=data.costs?.mp??data.costs?.MP??data.resourceCosts?.mp??
      data.manaCost??(typeof data.cost==='number'?data.cost:data.cost?.mp);
    const cost=costSource==null?null:Number(costSource);
    return Object.freeze({
      name,element:txt(data.element||data.magicType,'',80),
      rank:txt(data.rank,'',48),
      summary:txt(data.summary||data.description,'',640),
      mpCost:cost!==null&&Number.isFinite(cost)&&cost>=0?cost:null
    });
  }).filter(Boolean));
}
function items(value,max=24){
  return Object.freeze(rows(value,max).map(row=>Object.freeze({
    name:txt(row?.name||row?.title||row,'',100),
    quantity:Math.min(99999,Math.max(0,Number(row?.qty??row?.quantity??1)||0))
  })).filter(row=>row.name));
}
const EQUIPMENT_SLOT_KEYS=Object.freeze([
  'Head','Chest','Hands','Feet','Back','Torso','Waist','Shoulders',
  'Main Weapon','Secondary Weapon','Off Weapon','Quiver','Shield'
]);
function readEquipmentSlot(source,name){
  if(!obj(source))return null;
  const token=name.toLowerCase().replace(/[^a-z0-9]/g,'');
  const key=Object.keys(source).find(entry=>entry.toLowerCase().replace(/[^a-z0-9]/g,'')===token);
  const item=key?source[key]:null;
  if(!item||typeof item!=='string'&&!obj(item))return null;
  const value=typeof item==='string'?{name:item}:item;
  const title=txt(value.name||value.title,'',100);
  return title?Object.freeze({name:title,
    image:safeDashboardArtwork(value.image,value.icon,value.artwork),
    rarity:txt(value.itemClass||value.rarity,'',36)}):null;
}
function equipmentSlots(source){
  return Object.freeze(Object.fromEntries(EQUIPMENT_SLOT_KEYS.map(key=>
    [key,readEquipmentSlot(source,key)])));
}
function traits(character){
  return labels(character?.racialTraits||character?.raceInfo?.traits||character?.character?.race?.traits,12);
}
/** UI is intentionally a strict projection; owner-only journals never enter GM snapshots. */
export function playerCharacterProjection(value,{owned=false,ownerSource=null}={}){
  if(!obj(value)||!DASHBOARD_ID.test(String(value.id||''))||!DASHBOARD_ID.test(String(value.ownerUid||'')))
    throw Error('A verified character record is required.');
  const characteristics=obj(value.characteristics)?value.characteristics:{};
  const stats=Object.fromEntries(['strength','dexterity','agility','constitution','endurance',
    'intelligence','wisdom','charisma','luck'].map(k=>[
      k,Number.isFinite(Number(characteristics[k]))?Number(characteristics[k]):null
    ]));
  const classes=typeof value.class==='string'?value.class:value.class?.title||value.character?.class?.title||'';
  const spellSource=value.spells||value.activeSpells||value.knownSpells;
  const spells=labels(spellSource,24);
  const talents=labels(value.classTalents||value.talents||value.character?.startingTalents,24);
  const result={
    id:value.id,name:txt(value.name,'Unnamed Character',120),
    image:safeDashboardArtwork(value.image,value.portrait,value.characterImage,value.appearance?.image,value.appearance?.portrait),
    race:txt(value.race||value.character?.race?.title,'Unknown',100),
    klass:txt(value.klass||classes,'Unknown',120),level:count(value.level),
    xp:count(value.xp),xpMax:count(value.xpMax),tp:count(value.tp),cp:count(value.cp),
    coreRevision:count(value.coreRevision),
    hp:safePair(value.hp),sp:safePair(value.sp),mp:safePair(value.mp),
    characteristics:Object.freeze(stats),
    naturalAC:Number.isFinite(Number(value.naturalAC))?Number(value.naturalAC):null,
    skills:skills(value.skills||value.selectedSkills),spells,spellDetails:spellRecords(spellSource),talents,
    magic:labels(value.magicTypes||value.character?.magic?.types,24),
    racialTraits:traits(value),
    conditions:labels(value.conditions,16),
    ...projectPlayerSystems(value),
    inventory:items(value.inventory),
    equipment:items(value.equipment?.items||value.equipment,16),
    equipmentSlots:equipmentSlots(value.equipment),
    quickSlots:Object.freeze(Array.from({length:4},(_,index)=>{
      const slot=Array.isArray(value.quickSlots)?value.quickSlots[index]:null;
      const rawId=typeof slot==='string'?slot:obj(slot)?
        slot.itemId||slot.instanceId||slot.id:'';
      const id=typeof rawId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(rawId)?rawId:'';
      const saved=rows(value.inventory,500).find(item=>obj(item)&&
        (item.instanceId===id||item.id===id));
      const found=obj(saved)?saved:obj(slot)?slot:null;
      const unidentified=found?.identified===false;
      const name=id?(unidentified?'Unidentified Item':
        txt(found?.name||found?.title||id,'',100)):'';
      const quantity=Number(found?.qty??found?.quantity??0);
      const remaining=Number.isSafeInteger(quantity)&&quantity>0?quantity:0;
      return id?Object.freeze({id,name,quantity:remaining,
        usable:remaining>0&&!unidentified&&Boolean(found?.effect||found?.effects),
        image:unidentified?'':safeDashboardArtwork(found?.image,found?.icon,found?.artwork)}):null;
    })),
    quests:playerQuestProjection(value),
    noticeActivity:ownedActivityProjection(value,owned).activity,
    notificationRead:ownedActivityProjection(value,owned).read,
    dashboardLayout:owned?layoutFromPlayerPreferences(value.dashboardPreferences||{}):null,
    journal:owned?projectJournal(value.journal):Object.freeze([]),
    gallery:projectGallery(value,ownerSource||{},owned),
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
    image:safeDashboardArtwork(campaign.image,campaign.art,campaign.banner,campaign.coverImage,campaign.cover,campaign.appearance?.image),
    location:txt(campaign.currentLocation||campaign.location,'',120),
    inWorldDate:txt(campaign.inWorldDate||campaign.worldDate,'',80),
    isGM:access.isGM,session:gmSessionState(session),
    party:publicPartyProjection(campaign)});
}
