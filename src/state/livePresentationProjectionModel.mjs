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
export function publicCombatSnapshot(raw={},publishedMap=null){
  const list=Array.isArray(raw.combatants)?raw.combatants.slice(0,160):[];
  const active=raw.status==='active'&&raw.combat?.version===1;
  const linked=active&&publishedMap?.id===raw.battleMapId&&publishedMap?.combatId===raw.combatId;
  const visibleCombatants=new Set(linked?publishedMap.visibleCombatants:[]);
  const markers=linked?publishedMap.markers:{};
  const privateMap=active&&id(raw.battleMapId);
  const currentId=list[int(raw.turnIndex)]?.id;
  const roster=list.filter(row=>id(row?.id)&&
    (!privateMap||id(row.characterId)||visibleCombatants.has(row.id))).map(row=>{
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
  const index=active?roster.findIndex(row=>row.id===currentId):0;
  const participants={};
  for(const row of roster){
    const entry=raw.combat?.participants?.[row.id]||{};
    // AP is only exported for player actors. Their own sheets supply HP/SP/MP.
    if(row.kind==='player')participants[row.id]={
      ap:clamp(entry.ap,0,3,0),
      bonus:entry.bonus===true,
      pendingDeathSave:entry.pendingDeathSave===true,
      turnComplete:entry.turnComplete===true,
      ...(Object.hasOwn(markers||{},row.id)?{mapTokenId:markers[row.id]}:{}),
      ...(entry.movement&&Number.isFinite(entry.movement.remaining)?{
        mapMovement:{remaining:Math.max(0,entry.movement.remaining),kind:name(entry.movement.kind,40),
          ...(['ground','jump','teleport'].includes(entry.movement.routeKind)?{routeKind:entry.movement.routeKind}:{}),
          diagonalParity:entry.movement.diagonalParity===1?1:0}
      }:{}),
      ...(entry.outOfTurn?.round===raw.round?{opportunityUsed:true}:{})
    };
    else participants[row.id]={turnComplete:entry.turnComplete===true,
      ...(typeof entry.movementDelegateUid==='string'&&entry.movementDelegateUid?
        {movementDelegated:true,
          ...(Object.hasOwn(markers||{},row.id)?{mapTokenId:markers[row.id]}:{})}:{}),
      ...(typeof entry.movementDelegateUid==='string'&&entry.movementDelegateUid&&
        entry.movement&&Number.isFinite(entry.movement.remaining)?{
          mapMovement:{remaining:Math.max(0,entry.movement.remaining),
            kind:name(entry.movement.kind,40),
            ...(['ground','jump','teleport'].includes(entry.movement.routeKind)?
              {routeKind:entry.movement.routeKind}:{}),
            diagonalParity:entry.movement.diagonalParity===1?1:0}
        }:{}),
      ...(entry.outOfTurn?.round===raw.round?{opportunityUsed:true}:{})};
  }
  const timer=raw.turnTimer||raw.timer||{};
  const pending=raw.combat?.pending;
  const allowedIds=new Set(roster.map(row=>row.id));
  const safePending=pending&&id(pending.id)&&allowedIds.has(pending.actorId)?{
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
    ...(linked?{battleMapId:publishedMap.id}:{}),
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
export function publicCombatPresentation(raw={},publishedMap=null){
  const combat=publicCombatSnapshot(raw,publishedMap);
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
export function publicPresentationBattleMap(raw={},campaignId='',mapId='',encounter={}){
  const source={...raw,id:mapId};
  if(raw.visibility!=='players'||!battleMapCanPreview(source,campaignId))
    throw Error('Only an existing published map may be presented.');
  const columns=clamp(raw.gridColumns,1,80,20),rows=clamp(raw.gridRows,1,80,15);
  if(!Number.isSafeInteger(columns)||!Number.isSafeInteger(rows))
    throw Error('Invalid map grid.');
  const fogEnabled=raw.fogEnabled===true;
  const fogCells=validFogCells(raw.fogCells,columns,rows);
  const linked=encounter.status==='active'&&encounter.combat?.version===1&&
    id(encounter.combatId)&&encounter.battleMapId===mapId&&raw.combatId===encounter.combatId;
  const actors=new Map(linked?(encounter.combatants||[]).map(row=>[row.id,row]):[]);
  const visibleTokens=battleMapTokens(raw.tokens||[]).filter(row=>
    row.visibility!=='gm'&&(!row.combatantId||actors.has(row.combatantId))&&
    (!fogEnabled||tokenIsRevealed(row,fogCells,columns,rows)));
  const current=linked?encounter.combatants?.[encounter.turnIndex]?.id:'';
  const focus=current?visibleTokens.find(row=>row.combatantId===current):null;
  const tokens=visibleTokens.map(row=>({id:row.id,label:row.label.slice(0,48),
    kind:row.kind,x:row.x,y:row.y,...(row.portrait?{portrait:row.portrait}:{}),
    ...(row.faction?{faction:row.faction}:{}),...(row.cells?{cells:row.cells}:{}),
    ...(actors.get(row.combatantId)?.defeated===true?{defeated:true}:{})}));
  return Object.freeze({
    version:1,id:mapId,
    name:name(raw.name,100)||'Published battle map',
    kind:raw.kind,contentType:raw.contentType,
    width:clamp(raw.width,1,8192,1920),
    height:clamp(raw.height,1,8192,1080),
    gridColumns:columns,gridRows:rows,
    gridVisible:raw.gridVisible===true,
    gridOpacity:clamp(raw.gridOpacity,0,100,40),
    fogEnabled,fogCells,metresPerCell:clamp(raw.metresPerCell,0.1,1000,1),
    ...(linked?{combatId:encounter.combatId,activeTokenId:focus?.id||''}:{}),
    tokens,description:name(raw.description,300),
    visibility:'players'
  });
}
// Actor identifiers are used on the server to filter initiative, never in map documents.
export function combatMapVisibility(map,projection){
  if(!projection?.combatId)return null;
  const ids=new Set(projection.tokens.map(row=>row.id));
  return {id:projection.id,combatId:projection.combatId,
    visibleCombatants:(map.tokens||[]).filter(row=>ids.has(row.id)).map(row=>row.combatantId),
    markers:Object.fromEntries((map.tokens||[]).filter(row=>row.kind==='character'&&
      ids.has(row.id)&&id(row.combatantId)).map(row=>[row.combatantId,row.id]))};
}
export function mapForRestrictedViewer(raw={},campaignId=''){
  if(!id(raw.id)||raw.visibility!=='players')return null;
  return publicPresentationBattleMap(raw,campaignId,raw.id);
}
