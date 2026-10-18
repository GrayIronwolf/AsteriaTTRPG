// Firestore document/map keys identify campaign records. A legacy sheet's `id`
// may still be its private Forge ID; retain sourceCharacterId independently.
export function campaignCharacterRecords(records={}) {
  return Object.fromEntries(Object.entries(records).filter(([,record])=>record&&typeof record==='object').map(([id,record])=>[id,{...record,id}]));
}

export function encounterPlayerRoster(campaignId,campaign,characters,combatants,access) {
  const current=Array.isArray(combatants)?combatants:[];
  const present=new Set(current.map(row=>row.characterId).filter(Boolean));
  const added=[],skipped=[];let linkedCount=0;
  for(const [id,character] of Object.entries(campaignCharacterRecords(characters))) {
    const reason=access.linkProblem({...campaign,id:campaignId},character);
    if(reason){skipped.push({id,name:character.name||id,reason});continue;}
    linkedCount++;
    if(present.has(id))continue;
    added.push({id:`player-${id}`,characterId:id,name:character.name||'Character',kind:'player',defeated:false});
    present.add(id);
  }
  return {combatants:[...current,...added],added,skipped,linkedCount};
}
