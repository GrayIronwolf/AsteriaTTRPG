import {customEncounterCreature,encounterResourcePair,encounterSourceResources} from '../../../src/state/encounterResourceModel.mjs';
import {gmSessionState} from '../dashboard/gmDashboardModel.mjs';

const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const array=value=>Array.isArray(value)?value:[];
const obj=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const title=(value,max=100)=>typeof value==='string'?value.slice(0,max):'';
const whole=(value,defaultValue=0)=>Number.isFinite(Number(value))?Math.trunc(Number(value)):defaultValue;
const revision=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
export const COMBAT_AP_ACTIONS=Object.freeze([
  {ap:1,label:'Record 1 AP action'},
  {ap:2,label:'Record 2 AP action'},
  {ap:3,label:'Record 3 AP action'},
  {ap:0,label:'Use bonus action'}
]);
export const COMBAT_PLAYER_COMMANDS=Object.freeze(['spend-ap','end-turn','death-save']);
export const COMBAT_GM_COMMANDS=Object.freeze([
  'save','load-prepared','map-link','start','next','end','clear','correct','spend-ap','end-turn','death-save'
]);

export function combatRevision(encounter){return revision(encounter?.combat?.revision);}
export function isCombatLive(encounter,session){
  return encounter?.status==='active'&&encounter?.combat?.version===1&&
    gmSessionState(session).editable===true;
}
export function projectCombat(encounter={},session=null,{role='player',characterId='',party=[]}={}){
  const raw=obj(encounter)?encounter:{};
  const gm=role==='gm',status=['ready','active','ended'].includes(raw.status)?raw.status:'ready';
  const active=status==='active'&&raw.combat?.version===1;
  const members=obj(raw.combat?.participants)?raw.combat.participants:{};
  const byId=new Map(array(party).filter(row=>validId(row?.id)).map(row=>[row.id,row]));
  const combatants=array(raw.combatants).slice(0,160).filter(row=>validId(row?.id)).map(row=>{
    const player=validId(row.characterId);
    const own=player&&row.characterId===characterId;
    const p=obj(members[row.id])?members[row.id]:{};
    const allowed=gm||own;
    const saved=player?byId.get(row.characterId):row;
    const result={
      id:row.id,characterId:player?row.characterId:'',kind:player?'player':'enemy',
      name:title(row.name||saved?.name||'Participant',120)||'Participant',
      initiative:Number.isFinite(Number(row.initiative))?Number(row.initiative):null,
      initiativeSet:row.initiativeSet===true,defeated:row.defeated===true,
      current:false,turnComplete:p.turnComplete===true,
      ...(allowed?{
        ap:Math.max(0,Math.min(3,whole(p.ap))),
        bonus:p.bonus===true,pendingDeathSave:p.pendingDeathSave===true,
        hp:encounterResourcePair(saved||{},'hp'),
        sp:encounterResourcePair(saved||{},'sp'),
        mp:encounterResourcePair(saved||{},'mp')
      }:{})
    };
    return Object.freeze(result);
  });
  const index=active?Math.max(0,Math.min(combatants.length-1,whole(raw.turnIndex))):-1;
  const roster=combatants.map((row,i)=>Object.freeze({...row,current:i===index}));
  const owned=roster.find(row=>row.characterId===characterId)||null;
  const rawTimer=obj(raw.turnTimer)?raw.turnTimer:obj(raw.timer)?raw.timer:null;
  const timerDeadline=Number(rawTimer?.endsAt);
  const turnTimer=Object.freeze({
    enabled:active&&rawTimer?.enabled===true&&Number.isFinite(timerDeadline)&&timerDeadline>0,
    endsAt:Number.isFinite(timerDeadline)&&timerDeadline>0?Math.trunc(timerDeadline):0
  });
  const pending=raw.combat?.pending;
  const safePending=obj(pending)?Object.freeze({
    id:title(pending.id,160),status:title(pending.status,60),
    actorId:title(pending.actorId,160),
    actorName:title(pending.actorName,100),
    name:title(pending.name,100),ap:whole(pending.ap),
    targetIds:array(pending.targetIds).filter(validId).slice(0,40)
  }):null;
  const result={
    status,revision:combatRevision(raw),round:Math.max(1,whole(raw.round,1)),
    turnIndex:index,combatants:Object.freeze(roster),current:index>=0?roster[index]||null:null,
    ownActor:owned,isActive:active,sessionEditable:gmSessionState(session).editable,
    turnTimer,pending:safePending,
    ...(gm?{
      battleMapId:validId(raw.battleMapId)?raw.battleMapId:'',
      log:Object.freeze(array(raw.combat?.log).slice(0,15).map(row=>({
        id:title(row.id,160),message:title(row.message,300)
      })))
    }:{})
  };
  return Object.freeze(result);
}

/** Only server-linked character roster entries may be added; never accept
 * an arbitrary player ID from URL, a public profile or the encounter itself. */
export function eligiblePlayerCombatants(campaign,characters,existing=[]){
  const cid=campaign?.id;
  const present=new Set(array(existing).map(row=>row.characterId).filter(Boolean));
  const v2=campaign?.membershipSchemaVersion===2;
  return Object.freeze(array(characters).filter(row=>{
    if(!validId(cid)||!validId(row?.id)||!validId(row.ownerUid)||
      row.sharedCampaignId&&row.sharedCampaignId!==cid||
      row.status&&row.status!=='linked'||present.has(row.id))return false;
    const id=row.id,owner=row.ownerUid;
    if(v2)return array(campaign.party).includes(id)&&
      campaign.playerCharacterLinks?.[id]===owner&&
      campaign.characters?.[id]?.ownerUid===owner&&row.status==='linked';
    return campaign.playerCharacterLinks?.[id]===owner||
      campaign.characters?.[id]?.ownerUid===owner||
      array(campaign.players?.[owner]?.characterIds).includes(id);
  }).map(row=>Object.freeze({
    id:'player-'+row.id,characterId:row.id,name:title(row.name,120)||'Character',
    kind:'player',defeated:false,initiative:0,initiativeSet:false
  })));
}

export function customEnemy(input,id){
  if(!validId(id))throw Error('Invalid encounter participant identifier.');
  const next=customEncounterCreature(input,id);
  if(next.initiative!==undefined)next.initiativeSet=true;
  return next;
}
export function libraryEnemy(source,id){
  if(!validId(id)||!validId(source?.id))throw Error('Invalid creature source.');
  const name=title(source.name,120).trim();
  if(!name)throw Error('Creature name is missing.');
  const next={id,sourceId:source.id,name,kind:'enemy',type:title(source.type,80),
    defeated:false,...encounterSourceResources(source)};
  if(source.initiative!==undefined&&source.initiative!==''&&
    Number.isFinite(Number(source.initiative))){
    next.initiative=Number(source.initiative);next.initiativeSet=true;
  }
  return next;
}
export function gmEncounterCandidates(world){
  const from=(value,prefix)=>array(value).filter(row=>validId(row?.id))
    .map(row=>({
      id:prefix+row.id,name:title(row.name||row.title,120),
      type:prefix==='npc-'?'NPC':'Creature',initiative:row.initiative,
      hp:encounterResourcePair(row,'hp'),sp:encounterResourcePair(row,'sp'),
      mp:encounterResourcePair(row,'mp'),sourceId:row.id
    })).filter(row=>row.name&&row.hp);
  return Object.freeze([...from(world?.npcs,'npc-'),...from(world?.creatures,'creature-')].slice(0,100));
}
export function validateCombatCommand(mode,actorId,input){
  if(!obj(input)||!validId(actorId)||!Number.isSafeInteger(input.revision)||
    input.revision<0||typeof input.operation!=='string')
    throw Error('Invalid combat command.');
  const allowed=mode==='gm'?COMBAT_GM_COMMANDS:COMBAT_PLAYER_COMMANDS;
  if(!allowed.includes(input.operation))throw Error('This combat operation is unavailable.');
  if(input.operation==='spend-ap'&&(!Number.isInteger(input.ap)||input.ap<0||input.ap>3))
    throw Error('Choose a whole AP cost from 0 to 3.');
  if(input.operation==='correct'&&(!title(input.reason).trim()||
    (!validId(input.targetId)&&!validId(actorId))))
    throw Error('Record a reason and target for each GM correction.');
  if(JSON.stringify(input).length>25000)throw Error('Combat action is too large.');
  return input;
}
