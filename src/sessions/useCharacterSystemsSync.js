import { useEffect, useRef, useState } from 'react';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { resourceDefinitions } from '../state/resourceEngine.mjs';
import { resourcePair } from '../state/resourceValues.mjs';

// Refresh only at initialization or meaningful encounter changes. Pure render
// calculations can tick without installing another listener or writing each tick.
export function useCharacterSystemsSync(campaignId,characters,encounter,editable) {
  const attempts=useRef(new Set()),[error,setError]=useState('');
  useEffect(()=>{attempts.current.clear();setError('');},[campaignId]);
  useEffect(()=>{
    if(!editable || !campaignId) return;
    let active=true;
    const combat=encounter?.status==='active'?(encounter.combatId || 'legacy-combat'):'';
    for(const character of Object.values(characters || {})) {
      if(!character?.id) continue;
      const reset=resourceDefinitions(character).some(row=>row.reset && (character.resourceState?.[row.id]?.combatId!==combat || row.reset.unconscious!==undefined && resourcePair(character.hp)[0]<=0 && resourcePair(character[row.id] || character.resources?.[row.id])[0]!==row.reset.unconscious));
      const roundExpiry=(character.conditions || []).some?.(row=>row.encounterId && !row.expired && (row.encounterId!==combat || row.untilRound && Number(encounter?.round)>=row.untilRound));
      if(character.coreStateVersion===1 && !reset && !roundExpiry) continue;
      const key=`${character.id}:${character.coreStateVersion || 0}:${combat}:${encounter?.round || 0}:${resourcePair(character.hp)[0]<=0}`;
      if(attempts.current.has(key)) continue;
      attempts.current.add(key);
      firebaseService.refreshSystems(campaignId,character.id).then(result=>{if(active && result?.ok===false)setError(result.error);}).catch(reason=>{if(active)setError(reason.message);});
    }
    return()=>{active=false;};
  },[campaignId,characters,encounter,editable]);
  return error;
}
