import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ManualNumberInput } from '../components/ManualNumberInput.jsx';
import { isManualNumber, manualNumber } from '../state/manualNumber.mjs';
import { EmptyState, Modal, Panel, StatusPill } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { inventoryItems } from './characterWorkspaceData.js';
import { characterCurrencyCopper, merchantPriceCopper, shopVariantKey, shopVariantLabel } from '../state/shopTransactionModel.mjs';
import { merchantTransactionPreview } from '../state/tradeExperienceModel.mjs';

const arr=value=>Array.isArray(value)?value:[];
const copper=value=>Number(value||0).toLocaleString()+' Copper';
const tradeable=item=>item&&!item.equipped&&!item.locked&&!item.bound&&!item.questItem&&Number(item.qty||0)>0;

export function ShopWorkspace({campaignId,character,ecosystem={},editable=false,requestedSale=null}) {
  const shops=arr(ecosystem.shops);
  const [selectedId,setSelectedId]=useState('');
  const [search,setSearch]=useState('');
  const [quote,setQuote]=useState(null);
  const [quantity,setQuantity]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [deals,setDeals]=useState([]);
  const [offerCopper,setOfferCopper]=useState('');
  const [barterId,setBarterId]=useState('');
  const [barterQuantity,setBarterQuantity]=useState('1');
  const [offerNote,setOfferNote]=useState('');
  const handledSaleToken=useRef(null);
  useEffect(()=>{
    if(!campaignId||!editable)return;
    let unsubscribe=()=>{};
    try{unsubscribe=firebaseService.subscribeMerchantDeals(campaignId,setDeals,false);}
    catch(error){setMessage(error.message||'Merchant offers are unavailable.');}
    return ()=>unsubscribe();
  },[campaignId,editable]);
  const selected=shops.find(shop=>shop.id===selectedId)||shops[0]||null;
  const visiting=Boolean(selected&&selected.status==='open'&&
    (!arr(selected.visitorCharacterIds).length||selected.visitorCharacterIds.includes(character?.id)));
  const balance=characterCurrencyCopper(character);
  const inventory=useMemo(()=>inventoryItems(character).filter(tradeable),[character]);
  const stock=arr(selected?.stock);
  const searchText=search.trim().toLowerCase();
  const filteredStock=stock.map((row,index)=>({...row,index})).filter(row=>String(row.item?.name||row.item?.title||'').toLowerCase().includes(searchText));
  const filteredInventory=inventory.filter(item=>String(item.name||'').toLowerCase().includes(searchText));
  useEffect(()=>{
    if(!requestedSale?.itemId||handledSaleToken.current===requestedSale.token)return;
    const merchant=shops.find(shop=>shop.status==='open'&&
      (!arr(shop.visitorCharacterIds).length||shop.visitorCharacterIds.includes(character.id)));
    const requested=inventory.find(item=>item.id===requestedSale.itemId);
    if(!merchant||!requested||!tradeable(requested)){
      handledSaleToken.current=requestedSale.token;
      setMessage('This item cannot currently be sold to a merchant. Choose an available merchant and item.');
      return;
    }
    if(selected?.id!==merchant.id){setSelectedId(merchant.id);return;}
    const price=merchantPriceCopper(merchant,requested,'sell');
    handledSaleToken.current=requestedSale.token;
    if(!Number.isSafeInteger(price)||price<=0){
      setMessage('This item has no merchant resale value. Choose a different item.');
      return;
    }
    setQuote({kind:'sell',itemId:requested.id,index:0,variantKey:shopVariantKey(requested),unitPriceCopper:price});
    setSearch('');setQuantity('1');setMessage('');
  },[requestedSale,shops,selected?.id,inventory,character.id]);

  const source=quote?.kind==='buy'?stock[quote.index]?.item:inventory.find(item=>item.id===quote?.itemId);
  const available=quote?.kind==='buy'?Number(stock[quote.index]?.qty||0):Number(source?.qty||0);
  const unit=source&&selected?merchantPriceCopper(selected,source,quote?.kind==='sell'?'sell':'buy'):null;
  const validQuantity=isManualNumber(quantity,{min:1,max:available});
  const number=validQuantity?manualNumber(quantity):0;
  const total=Number.isSafeInteger(unit*number)?unit*number:null;
  const selectedBarter=inventory.find(item=>item.id===barterId);
  const preview=quote&&source?merchantTransactionPreview({
    kind:quote.kind,item:source,quantity:number,unitCopper:unit,
    offeredCopper:quote.kind==='buy'?Number(offerCopper||0):null,
    barterItem:selectedBarter,barterQuantity:barterId?Number(barterQuantity||0):0,
    shop:selected
  }):null;
  const stale=Boolean(quote&&source&&quote.variantKey!==shopVariantKey(source));
  const changed=Boolean(quote&&source&&quote.unitPriceCopper!==unit);
  const canConfirm=Boolean(editable&&visiting&&!busy&&source&&validQuantity&&
    total!==null&&unit!==null&&unit>0&&!stale&&!changed&&
    (quote?.kind==='sell'?Number(selected?.currencyCopper??Infinity)>=total:balance>=total));
  const open=(kind,item,index)=>{
    const previewPrice=merchantPriceCopper(selected,item,kind==='sell'?'sell':'buy');
    const max=kind==='buy'?Number(stock[index]?.qty||0):Number(item.qty||0);
    setQuote({kind,index,itemId:item.id,variantKey:shopVariantKey(item),unitPriceCopper:previewPrice});
    setQuantity(max>0?'1':'');
    setOfferCopper(String(Math.max(1,previewPrice||0)));
    setBarterId('');setBarterQuantity('1');setOfferNote('');
    setMessage('');
  };
  const perform=async()=>{
    if(!canConfirm||busy)return;
    setBusy(true);setMessage('Verifying merchant transaction...');
    try{
      const result=quote.kind==='buy'
        ?await firebaseService.buyShopItem(campaignId,character.id,selected.id,quote.index,number,{
          variantKey:quote.variantKey,unitPriceCopper:quote.unitPriceCopper
        })
        :await firebaseService.sellShopItem(campaignId,character.id,selected.id,quote.itemId,number,{
          variantKey:quote.variantKey,unitPriceCopper:quote.unitPriceCopper
        });
      setMessage(result?.ok
        ?(quote.kind==='buy'?'Purchase confirmed: ':'Sale confirmed: ')+copper(result.cost??result.value)
        :result?.error||'The merchant could not complete that transaction. Check the inventory before trying again.');
      if(result?.ok){setQuote(null);setQuantity('');}
    }catch(error){
      setMessage((error?.message||'The merchant confirmation was interrupted.')+
        ' Check inventory and merchant history before retrying this transaction.');
    }finally{setBusy(false);}
  };
  const propose=async()=>{
    if(!quote||quote.kind!=='buy'||!validQuantity||busy||!visiting||!editable||stale||changed)return;
    if(!isManualNumber(offerCopper,{min:0,max:1000000000})||
      (barterId&&!isManualNumber(barterQuantity,{min:1,max:1000000}))){
      setMessage('Enter a valid whole copper offer and barter quantity.');return;
    }
    setBusy(true);
    try{
      const offer=await firebaseService.createMerchantDeal(campaignId,character.id,selected.id,quote.index,{
        quantity:number,offeredCopper:manualNumber(offerCopper),barterItemId:barterId,
        barterQuantity:barterId?manualNumber(barterQuantity):0,note:offerNote
      });
      setMessage(offer?.ok?'Your bargain was sent to the GM for approval.':offer?.error||'Bargain could not be submitted.');
      if(offer?.ok){setQuote(null);setQuantity('');}
    }catch(error){setMessage(error.message||'Could not submit the bargain.');}
    finally{setBusy(false);}
  };
  const withdraw=async dealId=>{
    if(busy)return;setBusy(true);
    try{
      const result=await firebaseService.cancelMerchantDeal(campaignId,character.id,dealId);
      setMessage(result?.ok?'Bargain withdrawn.':result?.error||'Could not withdraw this bargain.');
    }catch(error){setMessage(error.message||'Could not withdraw this bargain.');}
    finally{setBusy(false);}
  };
  const noQuote=()=>{if(!busy){setQuote(null);setQuantity('');}};
  const renderRow=(kind,row,index)=>{
    const item=kind==='buy'?row.item:row;
    const price=merchantPriceCopper(selected,item,kind==='buy'?'buy':'sell');
    const remaining=kind==='buy'?Number(row.qty||0):Number(item.qty||0);
    const notTradeable=price===null||price===0;
    const affordable=kind==='buy'?balance>=price:Number(selected?.currencyCopper??Infinity)>=price;
    return <article key={kind==='buy'?row.index:item.id} className="react-merchant-stock-row">
      <div className="react-merchant-stock-image">{item?.image?<img src={item.image} alt="" />:<b>{String(item?.name||'?')[0]}</b>}</div>
      <div className="react-merchant-stock-info">
        <b>{item?.identified===false?'Unidentified Item':item?.name||item?.title||'Item'}</b>
        <small>{shopVariantLabel(item)}</small>
        <small>{remaining} available</small>
      </div>
      <div className="react-merchant-stock-action">
        <strong>{price===null?'Price unavailable':copper(price)}</strong>
        <button type="button" disabled={!editable||!visiting||notTradeable||!affordable||remaining<1}
          onClick={()=>open(kind,item,kind==='buy'?row.index:index)}>{kind==='buy'?'Buy':'Sell'}</button>
      </div>
    </article>;
  };
  return <Panel title="Merchants & Shops" className="react-merchant-workspace">
    <div className="react-merchant-toolbar">
      <label>Merchant<select value={selected?.id||''} onChange={event=>{setSelectedId(event.target.value);setQuote(null);setMessage('');}}>
        {shops.map(shop=><option key={shop.id} value={shop.id}>{shop.name}</option>)}
      </select></label>
      <div><small>Your funds</small><strong>{copper(balance)}</strong></div>
      <label>Find item<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search shop and inventory"/></label>
    </div>
    {selected?<><div className="react-merchant-heading">
      <div>{selected.image?<img src={selected.image} alt={selected.name+' portrait'} loading="lazy" style={{maxWidth:100,maxHeight:100,objectFit:'cover',borderRadius:8}}/>:null}<h3>{selected.name}</h3><small>{selected.type||'Merchant'} · {selected.region||'Local trader'}</small>
        {selected.description?<p>{selected.description}</p>:null}
        {selected.personality?<p><b>Personality:</b> {selected.personality}</p>:null}
        {selected.greeting?<p><b>Merchant:</b> “{selected.greeting}”</p>:null}
        {selected.specialOffer?<p><b>Special offer:</b> {selected.specialOffer}</p>:null}</div>
      <StatusPill tone={visiting?'success':'warning'}>{selected.status!=='open'?'Closed':visiting?'Available':'Not visiting'}</StatusPill>
    </div>
    {!visiting?<p className="react-storage-warning" role="status">{selected.status!=='open'?'This merchant is closed.':'The GM must mark this character as visiting before trading.'}</p>:null}
    <div className="react-merchant-columns">
      <section><h4>Buy from merchant</h4>
        {filteredStock.filter(row=>Number(row.qty||0)>0).map(row=>renderRow('buy',row,row.index))}
        {!filteredStock.some(row=>Number(row.qty||0)>0)?<EmptyState title="No matching shop stock" />:null}
      </section>
      <section><h4>Sell from inventory</h4>
        {filteredInventory.map((item,index)=>renderRow('sell',item,index))}
        {!filteredInventory.length?<EmptyState title="No matching sale items" />:null}
      </section>
    </div>
    <section className="react-merchant-deals"><h4>My merchant bargains</h4>
      {deals.filter(deal=>deal.shopId===selected.id).slice().sort((a,b)=>Number(b.expiresAt||0)-Number(a.expiresAt||0)).slice(0,15).map(deal=>
        <article key={deal.id} className="react-merchant-stock-row">
          <div className="react-merchant-stock-info"><b>{deal.quantity} × {deal.stockItemName}</b>
            <small>{Number(deal.offeredCopper||0).toLocaleString()} copper{deal.barterItemId?' + '+deal.barterQuantity+' × '+deal.barterItemName:''}</small>
            <small>{deal.status==='pending'&&Date.now()>Number(deal.expiresAt||0)?'Expired':deal.status}</small>
          </div>
          {deal.status==='pending'?<button type="button" disabled={busy} onClick={()=>withdraw(deal.id)}>Withdraw</button>:null}
        </article>)}
      {!deals.some(deal=>deal.shopId===selected.id)?<small>No bargains requested yet.</small>:null}
    </section></>:<EmptyState title="No campaign merchants">The GM can create shops and assign visiting characters in the Economy panel.</EmptyState>}
    {message?<p className="react-action-message" role="status" aria-live="polite">{message}</p>:null}
    {quote&&selected?<Modal title={quote.kind==='buy'?'Confirm Purchase':'Confirm Sale'} eyebrow={selected.name} busy={busy}
      onClose={noQuote} footer={<div className="react-modal-actions">
        <button type="button" disabled={busy} onClick={noQuote}>Cancel</button>
        {quote.kind==='buy'?<button type="button" disabled={busy||!validQuantity||stale||changed||!visiting} onClick={propose}>Offer to Bargain</button>:null}
        <button type="button" className="primary" disabled={!canConfirm} onClick={perform}>{quote.kind==='buy'?'Confirm Buy':'Confirm Sell'}</button>
      </div>}>
      {source?<><div className="react-merchant-quote">
        <b>{source.name||source.title}</b><small>{shopVariantLabel(source)}</small>
        <span>Unit {quote.kind==='buy'?'price':'payout'}: {unit===null?'Unavailable':copper(unit)}</span>
        <span>Available quantity: {available}</span>
        <label>Quantity<ManualNumberInput min="1" max={available} value={quantity} onChange={setQuantity}/></label>
        <strong>Total {quote.kind==='buy'?'cost':'payout'}: {total===null?'Invalid quantity':copper(total)}</strong>
        <small>{quote.kind==='buy'?'Your funds':'Merchant funds'}: {copper(quote.kind==='buy'?balance:Number(selected.currencyCopper??0))}</small>
        <section className="react-phase9-trade-summary" aria-label="Merchant transaction preview">
          <h3>Review {quote.kind==='buy'?'Purchase':'Sale'}</h3>
          <div className="react-phase9-trade-sides">
            <div><small>{quote.kind==='buy'?'You receive':'You hand over'}</small>
              <strong>{preview?.item.name} ×{preview?.item.quantity||'—'}</strong></div>
            <div><small>{quote.kind==='buy'?'You pay':'You receive'}</small>
              <strong>{total===null?'Invalid quantity':copper(total)}</strong></div>
          </div>
          <small>{preview?.notice}</small>
        </section>
        {quote.kind==='buy'?<fieldset><legend>Optional GM-approved bargain</legend>
          <p>Offer copper, an inventory item, or both. Your assets remain yours until the GM approves.</p>
          <label>Total copper offered<ManualNumberInput min="0" max="1000000000" value={offerCopper} onChange={setOfferCopper}/></label>
          <label>Item to barter<select value={barterId} onChange={event=>setBarterId(event.target.value)}>
            <option value="">None</option>{inventory.filter(item=>item.identified!==false).map(item=>
              <option key={item.id} value={item.id}>{item.name} ({item.qty} available)</option>)}
          </select></label>
          {barterId?<label>Barter quantity<ManualNumberInput min="1" max={inventory.find(item=>item.id===barterId)?.qty||1} value={barterQuantity} onChange={setBarterQuantity}/></label>:null}
          <label>Roleplay message<input maxLength={500} value={offerNote} onChange={event=>setOfferNote(event.target.value)} placeholder="What does your character say?"/></label>
          <section className="react-phase9-trade-summary" aria-label="Review bargain">
            <h3>Review Bargain Proposal</h3>
            <div className="react-phase9-trade-sides">
              <div><small>You receive</small><strong>{preview?.item.name} ×{preview?.item.quantity||'—'}</strong>
                <span>Listed price: {preview?.listedCopper===null?'Unavailable':copper(preview.listedCopper)}</span>
              </div>
              <div><small>You offer</small><strong>{preview?.offeredCopper===null?'Invalid amount':copper(preview.offeredCopper)}</strong>
                {preview?.barter?<span>Plus {preview.barter.name} ×{preview.barter.quantity}</span>:null}
              </div>
            </div>
            {preview?.changeCopper!==null?<p>Difference from listed copper price: {copper(Math.abs(preview.changeCopper))}
              {preview.changeCopper>0?' below listed price':preview.changeCopper<0?' above listed price':' — matches listed price'}
              {preview.barter?' (excluding barter item value)':''}</p>:null}
            {offerNote.trim()?<p><b>Your character says:</b> “{offerNote.trim()}”</p>:null}
            <small>{preview?.notice}</small>
          </section>
        </fieldset>:null}
        {quote.kind==='buy'&&total!==null&&balance<total?<p className="react-storage-warning">You cannot afford this purchase.</p>:null}
        {quote.kind==='sell'&&total!==null&&Number(selected.currencyCopper??Infinity)<total?<p className="react-storage-warning">The merchant cannot afford this sale.</p>:null}
        {stale||changed?<p className="react-storage-warning">The item or price has changed. Close and review it again.</p>:null}
      </div></>:<p className="react-storage-warning">This item is no longer available. Close and review the shop.</p>}
    </Modal>:null}
  </Panel>;
}
