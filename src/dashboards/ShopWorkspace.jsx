import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ManualNumberInput } from '../components/ManualNumberInput.jsx';
import { isManualNumber, manualNumber } from '../state/manualNumber.mjs';
import { EmptyState, Modal, Panel, StatusPill } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { inventoryItems } from './characterWorkspaceData.js';
import { characterCurrencyCopper, merchantPriceCopper, shopVariantKey, shopVariantLabel } from '../state/shopTransactionModel.mjs';

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
  const handledSaleToken=useRef(null);
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
    setMessage('');
  };
  const perform=async()=>{
    if(!canConfirm)return;
    setBusy(true);
    const result=quote.kind==='buy'
      ?await firebaseService.buyShopItem(campaignId,character.id,selected.id,quote.index,number,{
        variantKey:quote.variantKey,unitPriceCopper:quote.unitPriceCopper
      })
      :await firebaseService.sellShopItem(campaignId,character.id,selected.id,quote.itemId,number,{
        variantKey:quote.variantKey,unitPriceCopper:quote.unitPriceCopper
      });
    setBusy(false);
    setMessage(result?.ok
      ?(quote.kind==='buy'?'Purchase confirmed: ':'Sale confirmed: ')+copper(result.cost??result.value)
      :result?.error||'The merchant could not complete that transaction.');
    if(result?.ok){setQuote(null);setQuantity('');}
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
      <div><h3>{selected.name}</h3><small>{selected.type||'Merchant'} · {selected.region||'Local trader'}</small>
        {selected.description?<p>{selected.description}</p>:null}</div>
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
    </div></>:<EmptyState title="No campaign merchants">The GM can create shops and assign visiting characters in the Economy panel.</EmptyState>}
    {message?<p className="react-action-message" role="status">{message}</p>:null}
    {quote&&selected?<Modal title={quote.kind==='buy'?'Confirm Purchase':'Confirm Sale'} eyebrow={selected.name} busy={busy}
      onClose={noQuote} footer={<div className="react-modal-actions">
        <button type="button" disabled={busy} onClick={noQuote}>Cancel</button>
        <button type="button" className="primary" disabled={!canConfirm} onClick={perform}>{quote.kind==='buy'?'Confirm Buy':'Confirm Sell'}</button>
      </div>}>
      {source?<><div className="react-merchant-quote">
        <b>{source.name||source.title}</b><small>{shopVariantLabel(source)}</small>
        <span>Unit {quote.kind==='buy'?'price':'payout'}: {unit===null?'Unavailable':copper(unit)}</span>
        <span>Available quantity: {available}</span>
        <label>Quantity<ManualNumberInput min="1" max={available} value={quantity} onChange={setQuantity}/></label>
        <strong>Total {quote.kind==='buy'?'cost':'payout'}: {total===null?'Invalid quantity':copper(total)}</strong>
        <small>{quote.kind==='buy'?'Your funds':'Merchant funds'}: {copper(quote.kind==='buy'?balance:Number(selected.currencyCopper??0))}</small>
        {quote.kind==='buy'&&total!==null&&balance<total?<p className="react-storage-warning">You cannot afford this purchase.</p>:null}
        {quote.kind==='sell'&&total!==null&&Number(selected.currencyCopper??Infinity)<total?<p className="react-storage-warning">The merchant cannot afford this sale.</p>:null}
        {stale||changed?<p className="react-storage-warning">The item or price has changed. Close and review it again.</p>:null}
      </div></>:<p className="react-storage-warning">This item is no longer available. Close and review the shop.</p>}
    </Modal>:null}
  </Panel>;
}
