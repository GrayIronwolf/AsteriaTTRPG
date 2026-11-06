/**
 * Presentation-only selectors shared by Player and GM dashboard views.
 * These read existing Firebase snapshots; never mutate rewards, inventory,
 * spell costs, combat state, or quest records.
 */
const array=value=>Array.isArray(value)?value:[];

export const OPEN_DASHBOARD_QUEST_STATUSES=Object.freeze([
  'Pending','Accepted','Active','On Hold','Awaiting Review'
]);
const openStatuses=new Set(OPEN_DASHBOARD_QUEST_STATUSES.map(value=>value.toLowerCase()));
export function openDashboardQuests(rows=[]){
  return array(rows).filter(quest=>{
    if(!quest||typeof quest!=='object')return false;
    const status=String(quest.status||'Active').toLowerCase();
    return openStatuses.has(status);
  }).sort((a,b)=>Number(b.tracked===true)-Number(a.tracked===true));
}

/** Encounter combat controls and the actual roster are stored separately.
 * Entries may appear in both combatants and enemies; count each identity once.
 */
export function encounterRosterCount(encounter={}){
  const source=encounter&&typeof encounter==='object'?encounter:{};
  const combat=source.combat&&typeof source.combat==='object'?source.combat:{};
  const top=[...array(source.combatants),...array(source.enemies)];
  const entries=top.length?top:[...array(combat.combatants),...array(combat.enemies)];
  const seen=new Set();
  let unkeyed=0;
  for(const entry of entries){
    if(!entry||typeof entry!=='object')continue;
    const key=entry.id||entry.combatantId||entry.characterId;
    if(key!==undefined&&key!==null&&key!=='')seen.add(String(key));
    else unkeyed++;
  }
  return seen.size+unkeyed;
}

/** A rejected or unsuccessful acknowledgement must not be treated as saved.
 * Caller may hide a notice only after the server confirms the change.
 */
export async function acknowledgeGameplayNotice(event,acknowledge){
  if(!event?.id)throw new Error('This notification could not be identified.');
  if(typeof acknowledge!=='function')throw new Error('Notification service is unavailable.');
  const result=await acknowledge(event.id);
  if(result===false||result?.ok===false)
    throw new Error(result?.error||'Notification acknowledgement could not be saved.');
  return result;
}
