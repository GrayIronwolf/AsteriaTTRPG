import {validatePartyLootDrop} from './partyLootModel.mjs';
import {validateGMRewardPayload} from './gmRewardModel.mjs';

// A generated table roll becomes exactly one ordinary, hidden party-loot draft.
// These helpers never reveal drops or change character resources.
export function lootTableDropFromRoll(table={},roll={},lootId=''){
  if(roll.tableId!==table.id||!['nothing','item','currency'].includes(roll.kind))
    throw Error('The roll does not belong to the selected loot table.');
  if(roll.kind==='nothing'||(roll.kind==='currency'&&roll.currencyCopper===0))
    return null;
  const base={title:String(table.name||'Found Treasure').slice(0,160),
    source:String(table.location||'Loot Table').slice(0,160),
    note:'',kind:roll.kind};
  if(roll.kind==='currency'){
    return {drop:validatePartyLootDrop({...base,currencyCopper:roll.currencyCopper},lootId),secretItem:null};
  }
  if(!roll.item||!Number.isSafeInteger(roll.item.quantity)||roll.item.quantity<1)
    throw Error('Generated item quantity is invalid.');
  const item={name:roll.item.name,qty:roll.item.quantity,
    ...(roll.item.definitionId?{definitionId:roll.item.definitionId}:{})};
  const validated=validateGMRewardPayload({items:[item],currency:{key:'copper',amount:0}}).items[0];
  return {drop:validatePartyLootDrop({...base,item:validated},lootId),secretItem:validated};
}
