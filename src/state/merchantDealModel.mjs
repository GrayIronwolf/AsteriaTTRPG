import {shopVariantKey} from './shopTransactionModel.mjs';

const whole=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const ident=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);

export function tradeableMerchantBarterItem(item={},qty=1){
  return Boolean(item&&ident(String(item.id||item.instanceId||''))&&
    whole(qty,1,1000000)&&whole(Number(item.qty),qty,1000000)&&
    !item.equipped&&!item.locked&&!item.bound&&!item.questItem&&item.identified!==false);
}

export function validateMerchantProposal(input={},stock={},barterItem=null){
  const quantity=Number(input.quantity);
  const offeredCopper=Number(input.offeredCopper);
  const barterQuantity=input.barterItemId?Number(input.barterQuantity??1):0;
  if(!whole(quantity,1,1000000)||quantity>Number(stock.qty||0))
    throw Error('Choose an available whole stock quantity.');
  if(!shopVariantKey(stock.item||{}))
    throw Error('This merchant item is unavailable.');
  if(!whole(offeredCopper,0,1000000000))
    throw Error('Enter a whole copper offer between 0 and 1,000,000,000.');
  if(input.barterItemId&&!tradeableMerchantBarterItem(barterItem,barterQuantity))
    throw Error('Choose a valid, identified item from your inventory for bartering.');
  if(!input.barterItemId&&offeredCopper===0)
    throw Error('Offer some copper or an inventory item in exchange.');
  return {
    quantity,offeredCopper,barterQuantity,
    stockVariantKey:shopVariantKey(stock.item),
    barterItemId:input.barterItemId?String(input.barterItemId):'',
    barterVariantKey:barterItem?shopVariantKey(barterItem):'',
    barterItemName:barterItem?String(barterItem.name||'Item').slice(0,160):'',
    note:String(input.note||'').trim().slice(0,500)
  };
}

export function validateMerchantApproval(totalCopper){
  if(!whole(totalCopper,0,1000000000))
    throw Error('Approved copper must be a whole amount between 0 and 1,000,000,000.');
  return totalCopper;
}

export function assertMerchantDealMatches(deal={},stock={},barterItem=null){
  if(!whole(Number(deal.quantity),1,1000000)||Number(stock.qty||0)<Number(deal.quantity)||
     deal.stockVariantKey!==shopVariantKey(stock.item||{}))
    throw Error('Merchant stock changed. Request a new bargain.');
  if(deal.barterItemId&&(!tradeableMerchantBarterItem(barterItem,Number(deal.barterQuantity))||
    deal.barterVariantKey!==shopVariantKey(barterItem)))
    throw Error('Barter item changed or is no longer tradeable. Request a new bargain.');
  if(!deal.barterItemId&&Number(deal.approvedTotalCopper)===0)
    throw Error('A zero-copper bargain requires a barter item.');
}
