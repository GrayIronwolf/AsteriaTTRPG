// Phase 6.3: encounter-backed map markers and GM-adjudicated movement.
// The encounter document remains authoritative for initiative, turns and AP.
import {battleMapTokens,battleMapPoint,BATTLE_MAP_MAX_TOKENS} from './battleMapModel.mjs';
import {measureGridDistance} from './battleMapFogModel.mjs';

const idPattern=/^[A-Za-z0-9_-]{1,160}$/;
const n2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
export const MAP_COMBAT_ACTIONS=Object.freeze(['walk','swim','fly','climb','dash','climb-dash','mount-move']);
export function activeMapEncounter(encounter){
  return Boolean(encounter?.status==='active'&&encounter?.combat?.version===1&&
    typeof encounter.combatId==='string'&&idPattern.test(encounter.combatId)&&
    Array.isArray(encounter.combatants)&&encounter.combatants.length>0);
}
export function combatMapLinked(map,encounter){
  return activeMapEncounter(encounter)&&map?.combatId===encounter.combatId;
}
function validateCombatantId(value){
  if(typeof value!=='string'||!idPattern.test(value))throw Error('Invalid combat participant ID.');
  return value;
}
export function combatMapRoster(encounter){
  if(!activeMapEncounter(encounter))return [];
  const current=Math.max(0,Math.min(encounter.combatants.length-1,Number(encounter.turnIndex)||0));
  return encounter.combatants.map((row,index)=>({
    id:validateCombatantId(row.id),
    name:String(row.name||'Combatant').slice(0,80),
    characterId:String(row.characterId||''),
    initiative:Number.isFinite(Number(row.initiative))?Number(row.initiative):null,
    defeated:row.defeated===true,
    isCurrent:index===current,
    turnComplete:Boolean(encounter.combat?.participants?.[row.id]?.turnComplete),
    movement:encounter.combat?.participants?.[row.id]?.movement||null
  }));
}
function suggestedPoint(index,isPlayer){
  // Keep spawn positions inside the encounter grid; movement is explicitly GM-controlled.
  const y=12+((index%8)*10);
  const x=isPlayer?18+Math.floor(index/8)*7:82-Math.floor(index/8)*7;
  return {x:Math.max(5,Math.min(95,x)),y:Math.max(5,Math.min(95,y))};
}
export function synchronizeCombatMapTokens(map,encounter,idFactory=()=>crypto.randomUUID()){
  if(!activeMapEncounter(encounter))throw Error('Start a campaign combat encounter before linking its battle map.');
  const roster=combatMapRoster(encounter);
  if(roster.length>BATTLE_MAP_MAX_TOKENS)throw Error('Only 60 combat participants can be mapped at once.');
  const existing=battleMapTokens(map?.tokens||[]);
  const byActor=new Map(existing.filter(t=>t.combatantId).map(t=>[t.combatantId,t]));
  const manual=existing.filter(t=>!t.combatantId);
  const usedManual=new Set();
  let playerIndex=0,enemyIndex=0;
  const mapped=roster.map(row=>{
    const isPlayer=Boolean(row.characterId);
    const already=byActor.get(row.id);
    const linked=already||manual.find(t=>!usedManual.has(t.id)&&
      isPlayer&&t.kind==='character'&&t.refId===row.characterId);
    if(linked&&!already)usedManual.add(linked.id);
    const point=suggestedPoint(isPlayer?playerIndex++:enemyIndex++,isPlayer);
    return {...(linked||{id:idFactory(),...point}),combatantId:row.id,
      kind:isPlayer?'character':'creature',label:row.name.slice(0,48),
      refId:isPlayer?row.characterId:''};
  });
  const final=[...manual.filter(t=>!usedManual.has(t.id)),...mapped];
  if(final.length>BATTLE_MAP_MAX_TOKENS)
    throw Error('The map holds at most 60 tokens. Remove unused manual markers first.');
  return battleMapTokens(final);
}
export function derivedCombatMapTokens(map,encounter){
  if(!combatMapLinked(map,encounter))return map?.tokens||[];
  return synchronizeCombatMapTokens(map,encounter,
    (()=>{let number=0;return()=>'virtual-combat-'+(number++);})());
}
export function mergeCombatMapTokens(draftTokens,storedTokens){
  const draft=battleMapTokens(draftTokens||[]),stored=battleMapTokens(storedTokens||[]);
  const manual=draft.filter(t=>!t.combatantId);
  const authoritative=stored.filter(t=>t.combatantId);
  return battleMapTokens([...manual,...authoritative]);
}
export function combatMapMovePlan(map,encounter,actorId,point,{mode='movement',reason=''}={}){
  if(!combatMapLinked(map,encounter))throw Error('This map is not linked to the current combat encounter.');
  validateCombatantId(actorId);
  const roster=combatMapRoster(encounter),row=roster.find(r=>r.id===actorId);
  if(!row)throw Error('The combat participant is no longer in this encounter.');
  if(row.defeated&&mode!=='reposition')throw Error('Defeated participants cannot use movement.');
  const tokens=battleMapTokens(map.tokens||[]),token=tokens.find(t=>t.combatantId===actorId);
  if(!token)throw Error('Synchronize combatants before moving their map token.');
  const to=battleMapPoint(point?.x,point?.y,{
    columns:map.gridColumns,rows:map.gridRows,snap:true
  });
  const distance=measureGridDistance(token,to,map.gridColumns,map.gridRows,map.metresPerCell??1);
  if(distance.metres<=0)throw Error('Choose a different map square to move.');
  if(!['movement','reposition'].includes(mode))throw Error('Unknown map movement mode.');
  let remaining=null;
  if(mode==='movement'){
    if(!row.isCurrent||row.turnComplete)
      throw Error('Only the current combatant may use approved movement during their turn.');
    const movement=row.movement;
    if(!movement||!MAP_COMBAT_ACTIONS.includes(movement.kind)||
       !Number.isFinite(Number(movement.remaining))||Number(movement.remaining)<=0)
      throw Error('The GM must approve and resolve a movement action with a distance allowance first.');
    if(distance.metres>Number(movement.remaining)+1e-7)
      throw Error('Movement exceeds the approved remaining distance.');
    remaining=n2(Math.max(0,Number(movement.remaining)-distance.metres));
  }else{
    const explanation=String(reason||'').trim();
    if(explanation.length<5||explanation.length>160)
      throw Error('GM repositioning requires a reason of 5–160 characters.');
  }
  return {actorId,tokenId:token.id,from:{x:token.x,y:token.y},to,distance,
    mode,remaining,reason:mode==='reposition'?String(reason).trim():''};
}
export function combatMapMovementAllowance(encounter,id){
  const row=combatMapRoster(encounter).find(value=>value.id===id);
  if(!row||!row.isCurrent||row.turnComplete)return null;
  const movement=row.movement;
  return movement&&MAP_COMBAT_ACTIONS.includes(movement.kind)&&
    Number.isFinite(Number(movement.remaining))?Math.max(0,n2(movement.remaining)):null;
}
