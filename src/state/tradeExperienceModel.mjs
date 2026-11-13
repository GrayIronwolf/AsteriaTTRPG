// Phase 9.3: read-only transaction previews for the existing trusted
// player exchange and merchant bargain operations. Never calculate an
// authoritative settlement or mutate escrow/inventory from the browser.
const safeText=(value,max=240)=>typeof value==='string'?value.trim().slice(0,max):'';
const count=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):0;
const coins=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
export const safeTradeItem=item=>({
  name:item?.identified===false?'Unidentified Item':safeText(item?.name||item?.title,160)||'Item',
  quantity:count(item?.qty||item?.quantity||1),
  identified:item?.identified!==false,
  type:item?.identified===false?'':safeText(item?.type,80)
});
export function playerExchangePreview({mode='trade',item={},quantity=1,
  exchangeItem=null,exchangeQuantity=1,priceCopper=0,requestedItem='',note=''}={}){
  const sent=safeTradeItem(item);
  const qty=count(quantity);
  const given={...sent,quantity:qty};
  const received=mode==='trade'?(exchangeItem?
    {...safeTradeItem(exchangeItem),quantity:count(exchangeQuantity)}:null):null;
  const cost=mode==='sell'?coins(priceCopper):0;
  return {
    mode,offering:given,receiving:received,
    requestedTerms:mode==='trade'?safeText(requestedItem,200):'',
    copper:cost,message:safeText(note,1000),
    valid:qty>0&&(!item?.qty||qty<=count(item.qty))&&
      (mode!=='sell'||cost!==null)&&
      (mode!=='trade'||!exchangeItem||received.quantity>0&&received.quantity<=count(exchangeItem.qty)),
    pending:mode==='trade'&&!exchangeItem,
    warning:mode==='trade'?'Both characters confirm before the exchange completes.':
      mode==='sell'?'The buyer must approve and have enough funds.':
      mode==='identify'?'Only the authorised spellcaster can identify the item.':
      'The recipient must accept the gift before it is transferred.'
  };
}
export function merchantTransactionPreview({kind='buy',item={},quantity=1,
  unitCopper=null,offeredCopper=null,barterItem=null,barterQuantity=0,shop={}}={}){
  const qty=count(quantity);
  const price=coins(unitCopper);
  const listed=price!==null&&Number.isSafeInteger(price*qty)?price*qty:null;
  const offer=offeredCopper===null?null:coins(offeredCopper);
  const barter=barterItem&&count(barterQuantity)>0?
    {...safeTradeItem(barterItem),quantity:count(barterQuantity)}:null;
  return {
    kind,merchant:safeText(shop?.name,160)||'Merchant',
    item:{...safeTradeItem(item),quantity:qty},listedCopper:listed,
    offeredCopper:offer,barter,
    changeCopper:listed!==null&&offer!==null?listed-offer:null,
    roleplay:safeText(shop?.greeting,500),
    personality:safeText(shop?.personality,500),
    specialOffer:safeText(shop?.specialOffer,500),
    valid:qty>0&&price!==null&&listed!==null&&
      (offeredCopper===null||offer!==null),
    notice:'A preview, not a reservation. The server rechecks stock, price, available funds and inventory when confirming.'
  };
}
