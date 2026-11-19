import React,{useEffect,useState} from 'react';
import {TRADE_MODES,LOOT_CHOICES} from './economyModel.mjs';
import styles from './EconomyWorkspace.module.css';

const list=x=>Array.isArray(x)?x:[];
const positive=n=>Number.isSafeInteger(Number(n))&&Number(n)>0;
const menu=(value,change,options,label='Select')=><label>{label}
  <select value={value} onChange={event=>change(event.target.value)}>
    <option value="">Select…</option>{options.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
  </select></label>;
function useEconomy(api,role,cid,charId){
  const [state,setState]=useState({loading:true,error:'',data:null});
  useEffect(()=>{
    let alive=true,stop=()=>{};
    setState({loading:true,error:'',data:null});
    try{
      stop=role==='gm'?
        api.watchGM(cid,data=>alive&&setState({loading:false,error:'',data}),
          err=>alive&&setState({loading:false,error:err.message||'Access denied.',data:null})):
        api.watchPlayer(cid,charId,data=>alive&&setState({loading:false,error:'',data}),
          err=>alive&&setState({loading:false,error:err.message||'Access denied.',data:null}));
    }catch(err){setState({loading:false,error:err.message,data:null});}
    return()=>{alive=false;stop?.();};
  },[api,role,cid,charId]);
  return state;
}
function useActions(api,cid,role,charId){
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  async function perform(kind,args,success='Saved.'){
    if(busy)return null;
    setBusy(true);setNotice('');setError('');
    try{const res=role==='gm'?await api.gm(cid,charId,kind,...args):
      await api.player(cid,charId,kind,...args);
      setNotice(success);return res;
    }catch(err){setError(err?.message||'Request was rejected.');return null;}
    finally{setBusy(false);}
  }
  return {busy,notice,error,perform};
}
function Feedback({action}){return <>{action.error?<p role="alert">{action.error}</p>:null}
  {action.notice?<p role="status">{action.notice}</p>:null}</>;}
function Amount({value,set,min=1,max=1000000,title='Quantity'}){
  return <label>{title}<input aria-label={title} type="number" min={min} max={max}
    value={value} onChange={event=>set(event.target.value)}/></label>;
}
function Inventory({data,action,editable,role='player',selectedCharacter=null}){
  const ch=selectedCharacter||data.character;
  const [itemId,setItemId]=useState(''),[storage,setStorage]=useState(''),
    [slot,setSlot]=useState(''),[quantity,setQuantity]=useState('1'),
    [name,setName]=useState(''),[rows,setRows]=useState('4'),[cols,setCols]=useState('4'),
    [type,setType]=useState('move-storage'),[equipSlot,setEquipSlot]=useState(''),
    [newQuantity,setNewQuantity]=useState('1');
  if(!ch)return <p>Choose a linked character to manage inventory.</p>;
  const items=ch.items||[],containers=ch.storages||[],item=items.find(x=>x.id===itemId);
  const write=op=>action.perform('inventory',[op],'Inventory updated.');
  return <section className={styles.section} data-testid="site-economy-inventory">
    <h3>{ch.name} — Inventory &amp; Containers</h3>
    <p>{items.length} item stacks · {containers.length} containers · {ch.currencyCopper.toLocaleString()} copper equivalent</p>
    <div className={styles.cards}>{containers.map(s=><article className={styles.card} key={s.id}>
      <strong>{s.name}</strong><span>{s.rows}×{s.cols} slots · {s.itemCount}/{s.maxSlots} occupied</span>
      <ul>{items.filter(i=>i.storageId===s.id).map(i=><li key={i.id}>
        {i.name} ×{i.quantity}{i.equipped?' — Equipped':''}</li>)}</ul>
      {role==='player'?<button disabled={!editable||action.busy} onClick={()=>{
        const next=window.prompt('Rename this storage',s.name);
        if(next?.trim())write({type:'rename-storage',storageId:s.id,name:next.trim()});
      }}>Rename Container</button>:null}
    </article>)}</div>
    {ch.hasOverflow?<p role="alert">Some items have no assigned container. Move them into storage.</p>:null}
    {items.length?<div className={styles.fields}>
      {menu(itemId,setItemId,items.map(i=>({id:i.id,name:i.name+' ×'+i.quantity})),'Item')}
      {menu(storage,setStorage,containers,'Destination container')}
      <Amount value={quantity} set={setQuantity}/>
    </div>:<p>There are no inventory items.</p>}
    {item?<div className={styles.panel}>
      <p><strong>{item.name}</strong> · {item.type} · {item.quantity} units</p>
      <p>{item.equipped?'Equipped in '+item.equippedSlot:'Not equipped'}{item.locked?' · Locked':''}</p>
      <label>Action<select value={type} onChange={e=>setType(e.target.value)}>
        {(role==='gm'?['set-quantity','equip','unequip','move-storage']:
        ['move-storage','split-stack','equip','unequip','quick','use','identify','read-spellbook']).map(k=><option key={k} value={k}>{k.replaceAll('-',' ')}</option>)}
      </select></label>
      {['move-storage','split-stack'].includes(type)?<label>Storage slot (blank = first free)
        <input type="number" min="0" max="399" value={slot} onChange={e=>setSlot(e.target.value)}/></label>:null}
      {type==='equip'?<label>Equipment slot<input value={equipSlot} onChange={e=>setEquipSlot(e.target.value)}
        placeholder="e.g. Main Hand"/></label>:null}
      {type==='set-quantity'?<Amount title="New total quantity" value={newQuantity} set={setNewQuantity} min={0}/>:null}
      <button disabled={!editable||action.busy||
        ['move-storage','split-stack'].includes(type)&&!storage||
        type==='split-stack'&&(!positive(quantity)||Number(quantity)>=item.quantity)||
        type==='set-quantity'&&(!Number.isSafeInteger(Number(newQuantity))||Number(newQuantity)<0)}
        onClick={()=>{
          const op={type,itemId:item.id,expectedCoreRevision:ch.coreRevision};
          if(type==='move-storage')Object.assign(op,{storageId:storage,
            expectedStorageId:item.storageId,expectedStorageSlot:item.storageSlot,
            ...(slot!==''?{storageSlot:Number(slot)}:{})});
          if(type==='split-stack')Object.assign(op,{quantity:Number(quantity),expectedQuantity:item.quantity,
            storageId:storage,...(slot!==''?{storageSlot:Number(slot)}:{})});
          if(type==='equip')op.slot=equipSlot;
          if(type==='set-quantity')Object.assign(op,{quantity:Number(newQuantity),expectedQuantity:item.quantity});
          if(type==='quick')op.index=0;
          write(op);
        }}>Apply Item Action</button>
    </div>:null}
    {role==='player'?<fieldset className={styles.panel}><legend>Create character storage</legend>
      <div className={styles.fields}><label>Container name<input value={name} onChange={e=>setName(e.target.value)}/></label>
        <Amount title="Rows" min={1} max={20} value={rows} set={setRows}/>
        <Amount title="Columns" min={1} max={20} value={cols} set={setCols}/></div>
      <button disabled={!editable||action.busy||!name.trim()||ch.storages.length>=ch.storageLimit}
        onClick={()=>write({type:'create-storage',name,rows:Number(rows),cols:Number(cols)})}>Create Storage</button>
    </fieldset>:null}
  </section>;
}
function Trades({data,action,editable}){
  const [recipient,setRecipient]=useState(''),[itemId,setItemId]=useState(''),
    [mode,setMode]=useState('give'),[qty,setQty]=useState('1'),
    [price,setPrice]=useState('0'),[note,setNote]=useState(''),
    [exchange,setExchange]=useState(''),[exchangeQty,setExchangeQty]=useState('1'),
    [storage,setStorage]=useState('');
  const me=data.character,available=me.items.filter(x=>x.transferable||!x.identified);
  const people=data.party.filter(x=>x.id!==me.id);
  const selected=me.items.find(i=>i.id===itemId);
  const incoming=data.trades.filter(x=>x.direction==='received'&&x.status==='pending');
  const outgoing=data.trades.filter(x=>x.direction==='sent');
  const storageId=storage||me.storages[0]?.id||'';
  return <section className={styles.section} data-testid="site-economy-trades">
    <h3>Player Trading &amp; Escrow</h3>
    <p>Give, sell and exchange requests are settled only by the existing trusted transaction. Two-sided trades require final sender confirmation.</p>
    <div className={styles.fields}>
      {menu(recipient,setRecipient,people,'Recipient')}
      {menu(itemId,setItemId,available,'Inventory item')}
      <label>Trade mode<select value={mode} onChange={e=>setMode(e.target.value)}>{TRADE_MODES.map(m=><option key={m}>{m}</option>)}</select></label>
      <Amount value={qty} set={setQty} max={selected?.quantity||1}/>
      {mode==='sell'?<Amount title="Price (copper)" min={0} max={1000000000} value={price} set={setPrice}/>:null}
      {mode==='trade'?<label>Requested item description<input value={note} onChange={e=>setNote(e.target.value)}/></label>:null}
    </div>
    <button disabled={!editable||action.busy||!recipient||!selected||
      !positive(qty)||Number(qty)>selected.quantity||
      mode!=='identify'&&!selected.transferable||
      mode==='identify'&&selected.identified}
      onClick={()=>action.perform('tradeCreate',[recipient,itemId,mode,{
        quantity:Number(qty),priceCopper:Number(price)||0,requestedItem:mode==='trade'?note:'',
        note:mode==='trade'?'':note
      }],'Trade request created.')}>Send Request</button>
    <h4>Incoming Requests ({incoming.length})</h4>
    {incoming.map(t=><article className={styles.card} key={t.id}>
      <strong>{t.fromName}: {t.mode}</strong>
      <p>{t.item?.name} ×{t.quantity}{t.mode==='sell'?' · '+t.priceCopper+' copper':''}</p>
      {t.mode==='trade'?menu(exchange,setExchange,me.items.filter(x=>x.transferable),'Offer in exchange'):null}
      {t.mode==='trade'?<Amount value={exchangeQty} set={setExchangeQty}/>:null}
      {menu(storage,setStorage,me.storages,'Receive into container')}
      <div className={styles.actions}>
        <button disabled={action.busy} onClick={()=>action.perform('tradeRespond',
          [t.id,false,{}],'Declined; escrow returned.')}>Decline &amp; Return</button>
        <button disabled={!editable||action.busy||!storageId||t.mode==='trade'&&!exchange}
          onClick={()=>action.perform('tradeRespond',[t.id,true,{
            storageId,exchangeItemId:exchange,exchangeQuantity:Number(exchangeQty)
          }],t.mode==='trade'?'Trade counteroffer submitted.':'Accepted.')}>
          {t.mode==='trade'?'Confirm Counteroffer':'Accept'}
        </button>
      </div>
    </article>)}
    <h4>Sent Requests ({outgoing.length})</h4>
    {outgoing.map(t=><article className={styles.card} key={t.id}>
      <strong>{t.toName} · {t.mode} · {t.status}</strong><p>{t.item?.name} ×{t.quantity}</p>
      {t.status==='awaiting-sender'?<div className={styles.actions}>
        <button disabled={action.busy} onClick={()=>action.perform('tradeFinalize',[t.id,false],
          'Trade declined; escrow returned.')}>Reject Exchange</button>
        <button disabled={!editable||action.busy} onClick={()=>action.perform('tradeFinalize',[t.id,true],
          'Trade completed.')}>Confirm Final Trade</button>
      </div>:null}
      {t.status==='pending'?<button disabled={action.busy}
        onClick={()=>action.perform('tradeCancel',[t.id],'Withdrawn and escrow returned.')}>
        Withdraw &amp; Return Escrow</button>:null}
      {['accepted','declined','cancelled'].includes(t.status)&&t.senderNotice!=='acknowledged'?
        <button disabled={action.busy} onClick={()=>action.perform('tradeAckSender',[t.id],
          'Result acknowledged.')}>Acknowledge Result</button>:null}
    </article>)}
    {data.trades.filter(t=>t.direction==='received'&&
      ['accepted','declined','cancelled'].includes(t.status)&&t.recipientNotice!=='acknowledged')
      .map(t=><article className={styles.card} key={t.id}>
        <strong>Received update · {t.status}</strong><p>{t.item?.name}</p>
        <button disabled={action.busy} onClick={()=>action.perform('tradeAckRecipient',[t.id],
          'Update acknowledged.')}>Acknowledge</button>
      </article>)}
  </section>;
}
function PartyLoot({data,action,editable,gm=false}){
  const [title,setTitle]=useState(''),[kind,setKind]=useState('currency'),
    [copper,setCopper]=useState('100'),[itemName,setItemName]=useState(''),
    [hidden,setHidden]=useState(true),[stashName,setStashName]=useState(''),
    [stashKind,setStashKind]=useState('stash'),[stashId,setStashId]=useState(''),
    [itemId,setItemId]=useState(''),[qty,setQty]=useState('1'),
    [storage,setStorage]=useState(''),[winner,setWinner]=useState(''),
    [recipients,setRecipients]=useState([]);
  const inventory=gm?[]:data.character.items;
  const storages=gm?[]:data.character.storages;
  const openStash=data.stashes.find(x=>x.id===stashId);
  const targetStorage=storage||storages[0]?.id||'';
  const roster=data.party||[];
  return <section className={styles.section} data-testid="site-economy-loot">
    <h3>Party Loot &amp; Shared Containers</h3>
    <div className={styles.cards}>{data.stashes.map(s=><article className={styles.card} key={s.id}>
      <strong>{s.name} · {s.kind}</strong><p>{s.status} · {s.items.length}/80 stacks</p>
      <ul>{s.items.map(i=><li key={i.id}>{i.name} ×{i.quantity}</li>)}</ul>
      {gm?<div className={styles.actions}>
        <button disabled={action.busy} onClick={()=>action.perform('stash',[{type:'update',stashId:s.id,stash:{status:s.status==='open'?'closed':'open'}}],'Container updated.')}>{s.status==='open'?'Close':'Open'}</button>
        <button disabled={action.busy} onClick={()=>action.perform('stash',[{type:'update',stashId:s.id,stash:{allowDeposits:!s.allowDeposits}}],'Deposit policy updated.')}>Toggle Deposits</button>
        <button disabled={action.busy} onClick={()=>action.perform('stash',[{type:'update',stashId:s.id,stash:{allowWithdrawals:!s.allowWithdrawals}}],'Withdrawal policy updated.')}>Toggle Withdrawals</button>
      </div>:null}
    </article>)}</div>
    {gm?<fieldset className={styles.panel}><legend>Create Party Stash / Chest</legend>
      <label>Name<input value={stashName} onChange={e=>setStashName(e.target.value)}/></label>
      <label>Type<select value={stashKind} onChange={e=>setStashKind(e.target.value)}>
        <option value="stash">Stash</option><option value="chest">Chest</option></select></label>
      <button disabled={action.busy||!stashName.trim()} onClick={()=>action.perform('stash',[
        {type:'create',stash:{name:stashName,kind:stashKind}}],'Shared container created.')}>Create Container</button>
    </fieldset>:<fieldset className={styles.panel}><legend>Move Between Inventory &amp; Party Stash</legend>
      <div className={styles.fields}>{menu(stashId,setStashId,data.stashes,'Shared container')}
        {menu(itemId,setItemId,inventory,'Your item (deposit)')}
        <Amount value={qty} set={setQty}/>
        {menu(storage,setStorage,storages,'Receive into storage')}</div>
      <div className={styles.actions}>
        <button disabled={!editable||action.busy||!openStash||!itemId||!positive(qty)||!openStash.allowDeposits}
          onClick={()=>action.perform('stashMove',[{type:'deposit',stashId,itemId,quantity:Number(qty)}],
            'Item deposited.')}>Deposit</button>
        {openStash?.items.map(i=><button key={i.id} disabled={!editable||action.busy||
          !openStash.allowWithdrawals||!targetStorage}
          onClick={()=>action.perform('stashMove',[{type:'withdraw',stashId,itemId:i.id,
            storageId:targetStorage,quantity:1}],'Item withdrawn.')}>
          Withdraw 1 × {i.name}</button>)}
      </div>
    </fieldset>}
    {gm?<fieldset className={styles.panel}><legend>Create Loot Drop</legend>
      <div className={styles.fields}>
        <label>Title<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label>Type<select value={kind} onChange={e=>setKind(e.target.value)}>
          <option value="currency">Currency</option><option value="item">Item</option></select></label>
        {kind==='currency'?<Amount title="Total copper" max={1000000000000} value={copper} set={setCopper}/>:
          <label>Item name<input value={itemName} onChange={e=>setItemName(e.target.value)}/></label>}
        <label className={styles.check}><input type="checkbox" checked={hidden} onChange={e=>setHidden(e.target.checked)}/>
          Keep hidden until GM reveals</label>
      </div>
      <button disabled={action.busy||!title.trim()||kind==='item'&&!itemName.trim()}
        onClick={()=>action.perform('loot',[{type:'create',revealNow:!hidden,
          drop:{title,source:'GM Treasure',kind,
            ...(kind==='currency'?{currencyCopper:Number(copper)}:
              {item:{name:itemName,qty:1,identified:true}})}}],'Loot drop created.')}>
        Create Drop</button>
    </fieldset>:null}
    {gm&&data.drafts.some(d=>d.visibility==='hidden'&&d.status==='available')?
      <div className={styles.panel}><h4>Unrevealed Loot (GM only)</h4>
        {data.drafts.filter(d=>d.visibility==='hidden'&&d.status==='available').map(row=>
          <article className={styles.card} key={row.id}>
            <strong>{row.title}</strong>
            <button disabled={action.busy} onClick={()=>action.perform('loot',[
              {type:'reveal',lootId:row.id}],'Loot revealed.')}>Reveal to Party</button>
          </article>)}
      </div>:null}
    <h4>Revealed Party Treasure</h4>
    {data.loot.map(row=><article className={styles.card} key={row.id}>
      <strong>{row.title}</strong><span>{row.status} · {row.kind==='currency'?
        row.currencyCopper.toLocaleString()+' copper':row.item?.name||'Item'}</span>
      {row.distribution.status==='open'?<p>Need: {row.distribution.tally?.need||0}
        {' · '}Greed: {row.distribution.tally?.greed||0}{' · '}Pass: {row.distribution.tally?.pass||0}</p>:null}
      {gm&&row.status==='available'?<div className={styles.actions}>
        {row.kind==='item'&&row.distribution.status!=='open'?
          <button disabled={!editable||action.busy} onClick={()=>action.perform('loot',[
            {type:'start-distribution',lootId:row.id}],'Party vote opened.')}>Start Need / Greed</button>:null}
        {row.distribution.status==='open'?<>
          {menu(winner,setWinner,roster,'Winning character')}
          <label>Winner storage ID<input value={storage} onChange={e=>setStorage(e.target.value)}
            placeholder="Storage ID from character"/></label>
          <button disabled={!editable||action.busy||!winner||!storage} onClick={()=>action.perform('loot',[
            {type:'award-distribution',lootId:row.id,winnerCharacterId:winner,
              storageId:storage}],'Loot awarded.')}>Award Reviewed Loot</button>
          <button disabled={action.busy} onClick={()=>action.perform('loot',[
            {type:'cancel-distribution',lootId:row.id}],'Voting cancelled.')}>Cancel Vote</button>
        </>:null}
        {row.kind==='currency'?<>
          <fieldset className={styles.people}><legend>Currency split recipients</legend>
            {roster.map(x=><label key={x.id}><input type="checkbox"
              checked={recipients.includes(x.id)}
              onChange={e=>setRecipients(old=>e.target.checked?[...old,x.id]:
                old.filter(id=>id!==x.id))}/>{x.name}</label>)}
          </fieldset>
          <button disabled={!editable||action.busy||!recipients.length}
            onClick={()=>action.perform('lootSplit',[{lootId:row.id,recipientIds:recipients}],
              'Currency distributed.')}>Split Currency</button>
        </>:null}
        <button disabled={action.busy} onClick={()=>action.perform('loot',[
          {type:'cancel',lootId:row.id}],'Loot cancelled.')}>Cancel</button>
      </div>:null}
      {!gm&&editable&&row.kind==='item'&&row.status==='available'?<>
        {row.distribution.status==='open'?<div className={styles.actions}>
          {LOOT_CHOICES.map(choice=><button key={choice} disabled={action.busy}
            onClick={()=>action.perform('lootVote',[{lootId:row.id,choice}],
              choice+' vote submitted.')}>{choice}</button>)}
          <span>My vote: {row.distribution.ownChoice||'No vote yet'}</span>
        </div>:<div className={styles.actions}>
          {menu(storage,setStorage,storages,'Destination')}
          <button disabled={!targetStorage||action.busy} onClick={()=>action.perform('lootClaim',[
            {lootId:row.id,storageId:targetStorage}],'Treasure claimed.')}>Claim Loot</button>
        </div>}
      </>:null}
    </article>)}
  </section>;
}
function Shops({data,action,editable,gm=false}){
  const [selected,setSelected]=useState(''),[qty,setQty]=useState('1'),
    [itemId,setItemId]=useState(''),[name,setName]=useState(''),
    [status,setStatus]=useState('closed'),[stockName,setStockName]=useState(''),
    [stockQty,setStockQty]=useState('1'),[offer,setOffer]=useState(''),
    [index,setIndex]=useState('0'),[saleQty,setSaleQty]=useState('1'),
    [restock,setRestock]=useState('20'),[low,setLow]=useState('4'),
    [priceMarks,setPriceMarks]=useState('1'),[valueMarks,setValueMarks]=useState('0.5');
  const shop=data.shops.find(x=>x.id===selected);
  const inventory=data.character?.items||[];
  const source=inventory.find(i=>i.id===itemId);
  const quoteRow=shop?.stock[Number(index)];
  const item=source;
  return <section className={styles.section} data-testid="site-economy-shops">
    <h3>Merchants &amp; Shops</h3>
    <div className={styles.cards}>{data.shops.map(s=><article className={styles.card} key={s.id}>
      <strong>{s.name}</strong><span>{s.status} · {s.type} · {s.stock.length} stock types</span>
      <button onClick={()=>setSelected(s.id)}>Open Merchant</button>
    </article>)}</div>
    {gm?<fieldset className={styles.panel}><legend>Manage Campaign Shop</legend>
      <div className={styles.fields}><label>Shop name<input value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="closed">Closed</option><option value="open">Open</option></select></label></div>
      <button disabled={action.busy||!name.trim()} onClick={()=>action.perform('shop',[
        {type:'save',shop:{name,status,type:'General Goods'}}],'Merchant saved.')}>Create Merchant</button>
      {shop?<div className={styles.panel}>
        <button disabled={action.busy} onClick={()=>action.perform('shop',[
          {type:'save',shopId:shop.id,shop:{name:shop.name,status:shop.status==='open'?'closed':'open'}}],
          'Merchant status updated.')}>Toggle Merchant Open/Closed</button>
        <div className={styles.fields}><label>Stock item name<input value={stockName}
          onChange={e=>setStockName(e.target.value)}/></label>
          <Amount title="Stock quantity" value={stockQty} set={setStockQty}/></div>
        <div className={styles.fields}><label>Market Price (silver marks)<input type="number" min="0" step="0.01"
          value={priceMarks} onChange={e=>setPriceMarks(e.target.value)}/></label>
          <label>Market Value (silver marks)<input type="number" min="0" step="0.01"
            value={valueMarks} onChange={e=>setValueMarks(e.target.value)}/></label></div>
        <button disabled={action.busy||!stockName.trim()||!positive(stockQty)||
          !Number.isFinite(Number(priceMarks))||Number(priceMarks)<0||
          !Number.isFinite(Number(valueMarks))||Number(valueMarks)<0}
          onClick={()=>action.perform('shop',[
          {type:'stock',shopId:shop.id,quantity:Number(stockQty),
            item:{name:stockName,qty:1,identified:true,marketPrice:Number(priceMarks),
              marketValue:Number(valueMarks)}}],'Stock added.')}>Stock Item</button>
        <label>Stock row<select value={index} onChange={e=>setIndex(e.target.value)}>
          {shop.stock.map(i=><option key={i.index} value={i.index}>{i.item?.name} ×{i.quantity}</option>)}
        </select></label>
        <div className={styles.fields}><Amount title="Target restock" value={restock} set={setRestock}/>
          <Amount title="Low-stock alert" min={0} value={low} set={setLow}/></div>
        <button disabled={action.busy||!quoteRow} onClick={()=>action.perform('shop',[
          {type:'configure-restock',shopId:shop.id,stockIndex:Number(index),
            stockIdentity:quoteRow.stockIdentity,restockTarget:Number(restock),
              lowStockAt:Number(low)}],'Restock policy saved.')}>Configure Restock</button>
        <button disabled={action.busy} onClick={()=>action.perform('shop',[
          {type:'restock-all',shopId:shop.id}],'Stock replenished.')}>Restock All Configured</button>
      </div>:null}
      <h4>Merchant Bargains for GM Review</h4>
      {data.merchantDeals.map(deal=><article className={styles.card} key={deal.id}>
        <strong>{deal.characterName} · {deal.stockItemName}</strong>
        <p>{deal.offeredCopper} copper · {deal.status}</p>
        {deal.status==='pending'?<div className={styles.actions}>
          {['approve','reject'].map(d=><button key={d} disabled={action.busy}
            onClick={()=>action.perform('bargainReview',[deal.id,d],
              'Merchant proposal '+d+'d.')}>{d}</button>)}
        </div>:null}
      </article>)}
    </fieldset>:null}
    {!gm&&shop?<section className={styles.panel}>
      <h4>{shop.name}</h4><p>{shop.status}{shop.canVisit?' · Visiting allowed':' · Access restricted'}</p>
      <p>Wallet: {data.character.currencyCopper.toLocaleString()} copper equivalent</p>
      <label>Stock item<select value={index} onChange={e=>setIndex(e.target.value)}>
        {shop.stock.map(row=><option key={row.index} value={row.index}>
          {row.item?.name} ×{row.quantity} · {row.priceCopper??'No price'} copper</option>)}
      </select></label>
      <Amount value={qty} set={setQty} max={quoteRow?.quantity||1}/>
      <p>Listed cost: {quoteRow?.priceCopper??'Not priced'} copper per item</p>
      <div className={styles.actions}>
        <button disabled={!editable||action.busy||!shop.canVisit||!quoteRow||
          quoteRow.priceCopper===null||!positive(qty)||Number(qty)>quoteRow.quantity||
          quoteRow.priceCopper*Number(qty)>data.character.currencyCopper}
          onClick={()=>{if(window.confirm('Confirm purchase at current merchant price?'))
            action.perform('shopBuy',[shop.id,Number(index),Number(qty),
              {unitPriceCopper:quoteRow.priceCopper}], 'Purchase completed.');}}>Buy at Listed Price</button>
        <label>Counteroffer copper<input type="number" min="0" value={offer}
          onChange={e=>setOffer(e.target.value)}/></label>
        <button disabled={!editable||action.busy||!shop.canVisit||!quoteRow||!positive(qty)||
          !Number.isSafeInteger(Number(offer))||Number(offer)<=0}
          onClick={()=>action.perform('bargain',[shop.id,Number(index),
            {quantity:Number(qty),offeredCopper:Number(offer)}],'Bargain sent for GM review.')}>
          Propose Bargain</button>
      </div>
      <h4>Sell from Inventory</h4>
      {menu(itemId,setItemId,inventory.filter(x=>x.sellable),'Item to sell')}
      <Amount title="Sell quantity" value={saleQty} set={setSaleQty}/>
      <button disabled={!editable||action.busy||!item||!shop.canVisit||!positive(saleQty)||
        Number(saleQty)>item.quantity}
        onClick={()=>{if(window.confirm('Confirm sale at the current calculated merchant value?'))
          action.perform('shopSell',[shop.id,item.id,Number(saleQty),{}],
            'Sale completed.');}}>Sell Item</button>
    </section>:null}
    {!gm?<div className={styles.panel}><h4>My Merchant Offers</h4>
      {data.merchantDeals.map(row=><article className={styles.card} key={row.id}>
        <p>{row.shopName} · {row.stockItemName} · {row.offeredCopper} copper · {row.status}</p>
        {row.status==='pending'?<button disabled={action.busy}
          onClick={()=>action.perform('bargainCancel',[row.id],'Offer withdrawn.')}>Withdraw Offer</button>:null}
      </article>)}
    </div>:null}
  </section>;
}
function Crafting({data,action,editable,gm=false}){
  const [name,setName]=useState(''),[desc,setDesc]=useState(''),[status,setStatus]=useState('draft'),
    [material,setMaterial]=useState(''),[count,setCount]=useState('1'),
    [itemCode,setCode]=useState(''),[output,setOutput]=useState(''),[outputCode,setOutputCode]=useState(''),
    [stationId,setStationId]=useState(''),[provider,setProvider]=useState(''),
    [type,setType]=useState('Forge'),[repair,setRepair]=useState('90'),
    [fee,setFee]=useState('0'),[itemId,setItemId]=useState('');
  const inventory=data.character?.items||[];
  return <section className={styles.section} data-testid="site-economy-crafting">
    <h3>Crafting Recipes, Stations &amp; NPC Services</h3>
    <div className={styles.cards}>{data.recipes.map(recipe=><article className={styles.card} key={recipe.id}>
      <strong>{recipe.name}</strong><span>{recipe.status} · Output: {recipe.output?.name||'Item'}</span>
      <ul>{recipe.materials.map((m,i)=><li key={i}>{m.name} ×{m.quantity}</li>)}</ul>
      {!gm?<p>Materials: {recipe.ready?'Ready':'Missing ingredients'}</p>:null}
      {!gm?<button disabled={!editable||action.busy||!recipe.ready||
        recipe.status!=='published'} onClick={()=>action.perform('craftRequest',[recipe.id],
          'Crafting request sent for approval.')}>Request Crafting</button>:null}
    </article>)}</div>
    {!gm?<div className={styles.panel}><h4>NPC Repairs</h4>
      {data.services.filter(s=>s.type==='repair').map(service=><article className={styles.card} key={service.id}>
        <strong>{service.name} · {service.provider}</strong><p>{service.feeCopper} copper · Restores to {service.restoreTo}%</p>
        {menu(itemId,setItemId,inventory.filter(x=>x.identified&&!x.equipped),'Damaged item')}
        <button disabled={!editable||action.busy||!itemId} onClick={()=>action.perform('repairRequest',[
          {serviceId:service.id,itemId}],'Repair request sent.')}>Request Repair</button>
      </article>)}
      <h4>My Requests</h4>
      {[...data.craftingRequests,...data.repairRequests].map(x=><p key={x.id}>
        {x.recipeName||x.serviceName} · {x.status}</p>)}
    </div>:null}
    {gm?<div className={styles.panel}>
      <h4>Author Recipe / Blueprint</h4>
      <div className={styles.fields}>
        <label>Recipe name<input value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Publication<select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="draft">Draft (GM only)</option><option value="published">Published</option></select></label>
        <label>Description<input value={desc} onChange={e=>setDesc(e.target.value)}/></label>
        <label>Required material<input value={material} onChange={e=>setMaterial(e.target.value)}/></label>
        <label>Material definition code<input value={itemCode} onChange={e=>setCode(e.target.value)}/></label>
        <Amount title="Material count" value={count} set={setCount}/>
        <label>Crafted item<input value={output} onChange={e=>setOutput(e.target.value)}/></label>
        <label>Output definition code<input value={outputCode} onChange={e=>setOutputCode(e.target.value)}/></label>
        {menu(stationId,setStationId,data.stations,'Station (optional)')}
      </div>
      <button disabled={action.busy||!name.trim()||!material.trim()||!output.trim()}
        onClick={()=>action.perform('recipe',[{type:'save',recipe:{
          name,description:desc,status,stationId,
          materials:[{name:material,itemCode,quantity:Number(count)}],
          output:{name:output,itemCode:outputCode,type:'Item',quantity:1}
        }}],'Recipe saved.')}>Save Recipe</button>
      <h4>Create Crafting Station</h4>
      <div className={styles.fields}>
        <label>Name<input value={stationId} onChange={e=>setStationId(e.target.value)}/></label>
        <label>Type<select value={type} onChange={e=>setType(e.target.value)}>
          {['Forge','Enchanting Table','Alchemy Table','Workshop','Other'].map(x=><option key={x}>{x}</option>)}
        </select></label>
      </div>
      <button disabled={action.busy||!stationId.trim()} onClick={()=>action.perform('station',[
        {type:'save',station:{name:stationId,type,status:'open',location:'Campaign'}}],
        'Crafting station saved.')}>Create Station</button>
      <h4>NPC Repair Service</h4>
      <div className={styles.fields}><label>NPC provider<input value={provider}
        onChange={e=>setProvider(e.target.value)}/></label>
        <label>Service name<input value={name} onChange={e=>setName(e.target.value)}/></label>
        <Amount title="Repair percent" min={1} max={100} value={repair} set={setRepair}/>
        <Amount title="Fee in copper" min={0} max={100000000} value={fee} set={setFee}/>
      </div>
      <button disabled={action.busy||!name.trim()||!provider.trim()} onClick={()=>action.perform('service',[
        {type:'save',service:{name,provider,type:'repair',status:'published',feeCopper:Number(fee),
          restoreTo:Number(repair),materials:[],stationId:''}}],'NPC service saved.')}>
        Publish Repair Service</button>
      <h4>GM Crafting Requests</h4>
      {data.craftingRequests.map(row=><article className={styles.card} key={row.id}>
        <strong>{row.characterName} · {row.recipeName}</strong><span>{row.status}</span>
        {row.status==='pending'?<div className={styles.actions}>
          {['approve','reject'].map(x=><button key={x} disabled={action.busy}
            onClick={()=>action.perform('craftReview',[row.id,x],
              'Crafting request '+x+'d.')}>{x}</button>)}
        </div>:null}
      </article>)}
      <h4>GM Repair Requests</h4>
      {data.repairRequests.map(row=><article className={styles.card} key={row.id}>
        <strong>{row.characterName} · {row.itemName}</strong><span>{row.status}</span>
        {row.status==='pending'?<div className={styles.actions}>
          {['approve','reject'].map(x=><button key={x} disabled={action.busy}
            onClick={()=>action.perform('repairReview',[row.id,x],
              'Repair request '+x+'d.')}>{x}</button>)}
        </div>:null}
      </article>)}
    </div>:null}
  </section>;
}
export function PlayerEconomyWorkspace({api,campaignId,characterId}){
  const stream=useEconomy(api,'player',campaignId,characterId);
  const action=useActions(api,campaignId,'player',characterId);
  const [tab,setTab]=useState('Inventory');
  return <section className={styles.workspace} data-testid="site-player-economy">
    <h2>Inventory &amp; Trading</h2>
    {stream.loading?<p>Verifying character ownership and loading inventory…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {stream.data?<><nav className={styles.tabs} aria-label="Player economy sections">
      {['Inventory','Trades','Party Loot','Shops','Crafting'].map(x=><button key={x}
        aria-current={tab===x?'page':undefined} onClick={()=>setTab(x)}>{x}</button>)}
    </nav>
      {tab==='Inventory'?<Inventory data={stream.data} action={action}
        editable={stream.data.session.editable}/>:null}
      {tab==='Trades'?<Trades data={stream.data} action={action}
        editable={stream.data.session.editable}/>:null}
      {tab==='Party Loot'?<PartyLoot data={stream.data} action={action}
        editable={stream.data.session.editable}/>:null}
      {tab==='Shops'?<Shops data={stream.data} action={action}
        editable={stream.data.session.editable}/>:null}
      {tab==='Crafting'?<Crafting data={stream.data} action={action}
        editable={stream.data.session.editable}/>:null}
      <Feedback action={action}/>
    </>:null}
  </section>;
}
export function GMEconomyWorkspace({api,campaignId}){
  const stream=useEconomy(api,'gm',campaignId,'');
  const [tab,setTab]=useState('Party Loot'),[target,setTarget]=useState('');
  const action=useActions(api,campaignId,'gm',target);
  const selected=stream.data?.party.find(x=>x.id===target)||null;
  return <section className={styles.workspace} data-testid="site-gm-economy">
    <h2>GM Inventory, Loot &amp; Crafting</h2>
    {stream.loading?<p>Verifying GM role and campaign economy…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {stream.data?<><nav className={styles.tabs} aria-label="GM economy sections">
      {['Party Loot','Shops','Crafting','Inventory','Trades'].map(x=><button key={x}
        aria-current={tab===x?'page':undefined} onClick={()=>setTab(x)}>{x}</button>)}
    </nav>
      {tab==='Inventory'?<>
        {menu(target,setTarget,stream.data.party,'Player character')}
        <Inventory data={stream.data} action={action} role="gm"
          selectedCharacter={selected} editable={stream.data.session.editable}/>
      </>:null}
      {tab==='Party Loot'?<PartyLoot gm data={stream.data} action={action}
        editable={stream.data.session.editable}/>:null}
      {tab==='Shops'?<Shops gm data={stream.data} action={action}
        editable={stream.data.session.editable}/>:null}
      {tab==='Crafting'?<Crafting gm data={stream.data} action={action}
        editable={stream.data.session.editable}/>:null}
      {tab==='Trades'?<section className={styles.section}><h3>Trade Audit</h3>
        {stream.data.trades.map(row=><article className={styles.card} key={row.id}>
          <strong>{row.fromName} → {row.toName}</strong>
          <p>{row.mode} · {row.item?.name||'Item'} ×{row.quantity} · {row.status}</p>
        </article>)}</section>:null}
      <Feedback action={action}/>
    </>:null}
  </section>;
}