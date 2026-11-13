// Phase 9.2: deterministic, read-only rules and bounded state for GM-reviewed
// Need / Greed / Pass choices. Only authenticated callable transactions save data.
export const PARTY_LOOT_VOTE_LIMIT=20;
export const PARTY_LOOT_CHOICES=Object.freeze(['need','greed','pass']);
const choiceSet=new Set(PARTY_LOOT_CHOICES);
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value)&&
  !['__proto__','prototype','constructor'].includes(value);

export function validatedLootChoices(distribution={}){
  const votes=distribution?.choices??{};
  if(!votes||typeof votes!=='object'||Array.isArray(votes))
    throw Error('Party loot choices are invalid.');
  const entries=Object.entries(votes);
  if(entries.length>PARTY_LOOT_VOTE_LIMIT)throw Error('The party loot choice limit has been reached.');
  if(entries.some(([characterId,choice])=>!validId(characterId)||!choiceSet.has(choice)))
    throw Error('The party loot choices contain an invalid entry.');
  return Object.fromEntries(entries);
}

export function startLootDistribution(drop={}){
  if(drop?.kind!=='item'||drop?.status!=='available'||drop?.visibility!=='revealed')
    throw Error('Only available revealed items may enter party distribution.');
  if(drop?.distribution?.status==='open')
    throw Error('This treasure is already open for party choices.');
  if(drop?.distribution?.status==='awarded')
    throw Error('This treasure has already been awarded.');
  return {status:'open',choices:{}};
}

export function castLootChoice(distribution={},characterId='',choice=''){
  if(distribution?.status!=='open')throw Error('Party loot voting is not open.');
  if(!validId(characterId))throw Error('Choose a valid linked character.');
  if(!choiceSet.has(choice))throw Error('Choose Need, Greed or Pass.');
  const previous=validatedLootChoices(distribution);
  if(!Object.hasOwn(previous,characterId)&&Object.keys(previous).length>=PARTY_LOOT_VOTE_LIMIT)
    throw Error('The party loot choice limit has been reached.');
  return {status:'open',choices:{...previous,[characterId]:choice}};
}

export function eligibleLootWinners(distribution={}){
  return Object.entries(validatedLootChoices(distribution))
    .filter(([,choice])=>choice==='need'||choice==='greed')
    .map(([characterId,choice])=>({characterId,choice}))
    .sort((a,b)=>a.choice===b.choice?
      a.characterId.localeCompare(b.characterId):a.choice==='need'?-1:1);
}

export function awardLootDistribution(distribution={},characterId=''){
  if(distribution?.status!=='open')throw Error('Party loot distribution is not open.');
  const candidate=eligibleLootWinners(distribution).find(row=>row.characterId===characterId);
  if(!candidate)throw Error('Select a linked character who chose Need or Greed.');
  return {...distribution,status:'awarded',
    choices:validatedLootChoices(distribution),
    winnerCharacterId:characterId,winnerChoice:candidate.choice};
}

export function lootVoteTally(distribution={}){
  const tally={need:0,greed:0,pass:0};
  for(const value of Object.values(validatedLootChoices(distribution)))tally[value]+=1;
  return tally;
}

// The campaign-readable loot record holds only aggregate counts.
// A player's own vote is reconstructed from their owner-scoped action history.
export function publicLootVoteSummary(drop={},character={}){
  if(drop?.kind!=='item'||drop?.status!=='available'||
    drop?.visibility!=='revealed'||drop?.distribution?.status!=='open')return null;
  const tally=drop.distribution?.tally||{};
  const safeTally=Object.fromEntries(PARTY_LOOT_CHOICES.map(choice=>[
    choice,Number.isSafeInteger(tally[choice])&&tally[choice]>=0&&tally[choice]<=PARTY_LOOT_VOTE_LIMIT?tally[choice]:0
  ]));
  const ownLog=(Array.isArray(character?.actionLog)?character.actionLog:[])
    .find(entry=>entry?.type==='party-loot-vote'&&
      entry.lootId===drop.id&&entry.roundId===drop.distribution.roundId&&
      choiceSet.has(entry.choice));
  return {status:'open',tally:safeTally,ownChoice:ownLog?.choice||''};
}
