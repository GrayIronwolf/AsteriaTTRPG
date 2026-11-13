const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const bounded=(value,max)=>String(value??'').trim().slice(0,max);
export const ITEM_LORE_MAX_EVENTS=60;

export function itemLoreKey(characterId,itemId){
  if(!id(characterId)||!id(itemId))throw Error('Choose a valid campaign character and inventory item.');
  return characterId+'__'+itemId;
}
export function cleanSecretItemLore(input={},previous={},characterId,itemId){
  const key=itemLoreKey(characterId,itemId);
  return {
    id:key,characterId,itemId,
    hiddenProperties:bounded(input.hiddenProperties??previous.hiddenProperties,2000),
    curse:bounded(input.curse??previous.curse,1000),
    gmNotes:bounded(input.gmNotes??previous.gmNotes,3000),
    discoveryClues:bounded(input.discoveryClues??previous.discoveryClues,2000),
    originalOwner:bounded(input.originalOwner??previous.originalOwner,160),
    ownershipPublic:input.ownershipPublic===undefined?previous.ownershipPublic===true:input.ownershipPublic===true,
    ownershipHistory:Array.isArray(previous.ownershipHistory)?previous.ownershipHistory.slice(-ITEM_LORE_MAX_EVENTS):[],
    discoveryHistory:Array.isArray(previous.discoveryHistory)?previous.discoveryHistory.slice(-ITEM_LORE_MAX_EVENTS):[]
  };
}
export function recordLoreOwnership(secret,ownerLabel,actor,now){
  const label=bounded(ownerLabel,160);
  if(!label)throw Error('Enter an ownership history label.');
  const last=secret.ownershipHistory.at(-1);
  if(last?.owner===label)return {...secret};
  return {...secret,ownershipHistory:[...secret.ownershipHistory,{owner:label,actor,at:now}].slice(-ITEM_LORE_MAX_EVENTS)};
}
export function recordLoreDiscovery(secret,description,actor,now){
  const clue=bounded(description,1000);
  if(!clue)throw Error('Choose lore to reveal.');
  return {...secret,discoveryHistory:[...secret.discoveryHistory,{description:clue,actor,at:now}].slice(-ITEM_LORE_MAX_EVENTS)};
}
export function visibleLoreDiscovery(secret={},ownerUid='',discovered=[]){
  return {
    id:secret.id,characterId:secret.characterId,itemId:secret.itemId,ownerUid,
    revealedLore:discovered.map(x=>bounded(x.description,1000)).filter(Boolean).slice(-ITEM_LORE_MAX_EVENTS),
    discoveryHistory:discovered.map(({description,at})=>({description:bounded(description,1000),at})).slice(-ITEM_LORE_MAX_EVENTS),
    ownershipHistory:(secret.ownershipPublic===true?secret.ownershipHistory||[]:[]).map(({owner,at})=>({owner,at})).slice(-ITEM_LORE_MAX_EVENTS)
  };
}
