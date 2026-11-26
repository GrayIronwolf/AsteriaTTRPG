/**
 * Phase 7.4: authoritative, allowlisted player-facing combat and
 * presentation map documents. Never publish raw encounter state or GM pins.
 * The raw systems/encounter document becomes GM-only in Firestore rules.
 */
import {battleMapCanPreview,battleMapTokens} from './battleMapModel.mjs';
import {validFogCells} from './battleMapFogModel.mjs';
import {safeCombatPresentation} from './playerPresentationModel.mjs';

const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const name=(value,max=90)=>typeof value==='string'?value.trim().slice(0,max):'';
const int=(value,def=0)=>Number.isSafeInteger(value)?value:def;
const number=(value,def=0)=>Number.isFinite(Number(value))?Number(value):def;
const clamp=(value,min,max,def)=>Math.max(min,Math.min(max,number(value,def)));

/** Preserve turn order, player-owned AP and already-visible effects, but
 * never leak enemies' equipment/HP/MP/SP/traits, hidden names, abilities,
 * private conditions, GM rolls, schedule or reward data.
 */
export function publicCombatSnapshot(raw={}){
  const list=Array.isArray(raw.combatants)?raw.combatants.slice(0,160):[];
  const roster=list.filter(row=>id(row?.id)).map(row=>{
    const player=id(row.characterId),shown=player||row.revealed===true;
    return {
      id:row.id,
      characterId:player?row.characterId:'',
      kind:player?'player':'enemy',
      name:shown?name(row.name,120)||'Participant':'Creature',
      initiative:Number.isFinite(Number(row.initiative))?Number(row.initiative):null,
      initiativeSet:row.initiativeSet===true,
      defeated:row.defeated===true
    };
  });
  const active=raw.status==='active'&&raw.combat?.version===1;
  const index=active?Math.max(0,Math.min(roster.length-1,int(raw.turnIndex))):0;
  const participants={};
  for(const row of roster){
    const entry=raw.combat?.participants?.[row.id]||{};
    // AP is only exported for player actors. Their own sheets supply HP/SP/MP.
    if(row.kind==='player')participants[row.id]={
      ap:clamp(entry.ap,0,3,0),
      bonus:entry.bonus===true,
      pendingDeathSave:entry.pendingDeathSave===true,
      turnComplete:entry.turnComplete===true
    };
    else participants[row.id]={turnComplete:entry.turnComplete===true};
  }
  const timer=raw.turnTimer||raw.timer||{};
  const pending=raw.combat?.pending;
  const allowedIds=new Set(roster.map(row=>row.id));
  const safePending=pending&&id(pending.id)?{
    id:pending.id,
    status:name(pending.status,60),
    actorId:allowedIds.has(pending.actorId)?pending.actorId:'',
    actorName:roster.find(row=>row.id===pending.actorId)?.name||'Creature',
    name:roster.find(row=>row.id===pending.actorId)?.kind==='player'?
      name(pending.name,100):'Creature action',
    ap:clamp(pending.ap,0,3,0),
    targetIds:(Array.isArray(pending.targetIds)?pending.targetIds:[])
      .filter(target=>allowedIds.has(target)).slice(0,40)
  }:null;
  const publicEvent=raw.publicEvent&&typeof raw.publicEvent.name==='string'?{
    name:name(raw.publicEvent.name,100),
    type:['narrative','environment','objective'].includes(raw.publicEvent.type)?
      raw.publicEvent.type:'narrative',
    round:Math.max(1,int(raw.publicEvent.round,1))
  }:null;
  return Object.freeze({
    version:1,status:['ready','active','ended'].includes(raw.status)?raw.status:'ready',
    paused:active&&raw.paused===true,
    combatId:active&&id(raw.combatId)?raw.combatId:'',
    round:Math.max(1,int(raw.round,1)),turnIndex:index,
    combatants:roster,
    combat:{version:active?1:0,revision:Math.max(0,int(raw.combat?.revision)),
      participants,pending:safePending},
    turnTimer:{
      enabled:active&&timer.enabled===true,
      durationSeconds:Math.max(0,int(timer.durationSeconds)),
      endsAt:Math.max(0,int(timer.endsAt))
    },
    ...(publicEvent?{publicEvent}:{})
  });
}
export function publicCombatPresentation(raw={}){
  const combat=publicCombatSnapshot(raw);
  const party=Object.fromEntries(combat.combatants
    .filter(row=>row.kind==='player'&&id(row.characterId))
    .map(row=>[row.characterId,{name:row.name}]));
  const minimal=safeCombatPresentation(combat,party);
  return Object.freeze({
    ...minimal,
    endsAt:combat.turnTimer.enabled?combat.turnTimer.endsAt:0,
    ...(combat.publicEvent?{event:combat.publicEvent}:{})
  });
}
function tokenIsRevealed(token,cells,columns,rows){
  const x=Math.min(columns-1,Math.floor(clamp(token.x,0,99.999,0)*columns/100));
  const y=Math.min(rows-1,Math.floor(clamp(token.y,0,99.999,0)*rows/100));
  return cells[y*columns+x]==='1';
}
/** Render map media stays an already-published original map. Visual fog cannot
 * conceal hidden details baked into the original image or looping video.
 */
export function publicPresentationBattleMap(raw={},campaignId='',mapId=''){
  const source={...raw,id:mapId};
  if(raw.visibility!=='players'||!battleMapCanPreview(source,campaignId))
    throw Error('Only an existing published map may be presented.');
  const columns=clamp(raw.gridColumns,1,80,20),rows=clamp(raw.gridRows,1,80,15);
  if(!Number.isSafeInteger(columns)||!Number.isSafeInteger(rows))
    throw Error('Invalid map grid.');
  const fogEnabled=raw.fogEnabled===true;
  const fogCells=validFogCells(raw.fogCells,columns,rows);
  const tokens=battleMapTokens(raw.tokens||[])
    .filter(row=>!fogEnabled||tokenIsRevealed(row,fogCells,columns,rows))
    .map(row=>({id:row.id,label:row.label.slice(0,48),
      kind:row.kind,x:row.x,y:row.y}));
  return Object.freeze({
    version:1,id:mapId,
    name:name(raw.name,100)||'Published battle map',
    kind:raw.kind,contentType:raw.contentType,
    width:clamp(raw.width,1,8192,1920),
    height:clamp(raw.height,1,8192,1080),
    gridColumns:columns,gridRows:rows,
    gridVisible:raw.gridVisible===true,
    gridOpacity:clamp(raw.gridOpacity,0,100,40),
    fogEnabled,fogCells,
    tokens,description:name(raw.description,300),
    visibility:'players'
  });
}
export function mapForRestrictedViewer(raw={},campaignId=''){
  if(!id(raw.id)||raw.visibility!=='players')return null;
  return publicPresentationBattleMap(raw,campaignId,raw.id);
}
