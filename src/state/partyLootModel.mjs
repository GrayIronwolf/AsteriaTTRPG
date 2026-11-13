import {validateGMRewardPayload} from './gmRewardModel.mjs';

export const PARTY_STASH_MAX_ITEMS=80;
export const PARTY_LOOT_MAX_RECIPIENTS=20;
export const PARTY_LOOT_MAX_COPPER=1000000000000;
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value);
const text=(value,max=160)=>String(value??'').trim().slice(0,max);
const clone=value=>JSON.parse(JSON.stringify(value));
const safeQuantity=(value,max=1000000)=>{
  if(!Number.isSafeInteger(value)||value<1||value>max)throw Error('Choose a whole item quantity within the allowed limit.');
  return value;
};

export function safePublicPartyItem(source={}){
  const reward=validateGMRewardPayload({items:[source],currency:{key:'copper',amount:0}});
  const item={...reward.items[0]};
  const unknown=item.identified===false;
  if(unknown){
    item.name=text(item.basicName||'Unidentified Item');
    delete item.trueName;
    delete item.description;
    delete item.effects;
    delete item.effect;
    delete item.spell;
    delete item.metadata;
    delete item.rarity;
    for(const key of ['title','definitionId','catalogId','slug','category','subcategory','type','image','icon','art','marketPrice','marketValue','marketValueCopper','marketPriceCopper'])delete item[key];
  }
  delete item.storageId;delete item.storageSlot;
  delete item.equipped;delete item.equippedSlot;delete item.location;
  delete item.ownerUid;delete item.owner;
  return item;
}

export function validatePartyStash(input={},existing={},stashId){
  if(!id(stashId))throw Error('Invalid party storage identifier.');
  const name=text(input.name??existing.name??'Party Stash');
  if(!name)throw Error('Enter a shared storage name.');
  const kind=input.kind??existing.kind??'stash';
  if(!['stash','chest'].includes(kind))throw Error('Choose a party stash or treasure chest.');
  const items=Array.isArray(existing.items)?clone(existing.items):[];
  if(items.length>PARTY_STASH_MAX_ITEMS)throw Error('This party container has exceeded its slot limit.');
  return {
    id:stashId,name,kind,
    description:text(input.description??existing.description??'',600),
    status:['open','closed'].includes(input.status)?input.status:existing.status||'open',
    allowDeposits:input.allowDeposits===undefined?existing.allowDeposits!==false:input.allowDeposits===true,
    allowWithdrawals:input.allowWithdrawals===undefined?existing.allowWithdrawals!==false:input.allowWithdrawals===true,
    items
  };
}

export function validatePartyLootDrop(input={},lootId=''){
  if(!id(lootId))throw Error('Invalid loot drop identifier.');
  const title=text(input.title||input.source||'Found Treasure',160);
  const source=text(input.source||'Campaign Loot',160);
  const note=text(input.note||'',600);
  if(!title||!source)throw Error('Enter a treasure title and source.');
  const kind=input.kind==='currency'?'currency':'item';
  if(kind==='currency'){
    const currencyCopper=input.currencyCopper;
    if(!Number.isSafeInteger(currencyCopper)||currencyCopper<1||currencyCopper>PARTY_LOOT_MAX_COPPER)
      throw Error('Enter a whole currency total between 1 and 1,000,000,000,000 copper.');
    return {id:lootId,title,source,note,kind,currencyCopper,status:'available'};
  }
  return {id:lootId,title,source,note,kind,item:safePublicPartyItem(input.item),status:'available'};
}

export function splitPartyCopper(total,recipientIds=[]){
  if(!Number.isSafeInteger(total)||total<1||total>PARTY_LOOT_MAX_COPPER)
    throw Error('Invalid party currency value.');
  if(!Array.isArray(recipientIds)||recipientIds.length<1||recipientIds.length>PARTY_LOOT_MAX_RECIPIENTS)
    throw Error('Select between 1 and 20 linked characters for the currency split.');
  const unique=[...new Set(recipientIds)];
  if(unique.length!==recipientIds.length||unique.some(value=>!id(value)))
    throw Error('Choose distinct valid party characters.');
  const ids=[...unique].sort();
  const share=Math.floor(total/ids.length),remainder=total%ids.length;
  return ids.map((characterId,index)=>({characterId,copper:share+(index<remainder?1:0)}));
}

export function validatePartyContainerSize(container={}){
  const serialized=JSON.stringify(container);
  if(serialized.length>600000)throw Error('This party container is too large.');
  if(!Array.isArray(container.items)||container.items.length>PARTY_STASH_MAX_ITEMS)
    throw Error('This shared container is full.');
  return container;
}

export function safePartyStashEntry(item,entryId,quantity){
  if(!id(entryId))throw Error('Invalid shared item identifier.');
  if(item?.identified===false)throw Error('Identify this item before placing it in a publicly visible party stash.');
  const clean=safePublicPartyItem({...clone(item),qty:safeQuantity(quantity)});
  return {...clean,id:entryId,instanceId:entryId};
}
