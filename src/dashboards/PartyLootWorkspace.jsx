import React,{useMemo,useState} from 'react';
import {EmptyState,Modal,Panel,StatusPill} from '../components/WorkspaceUI.jsx';
import {ManualNumberInput} from '../components/ManualNumberInput.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {inventoryItems} from './characterWorkspaceData.js';
import {normalizeCharacterStorages} from '../state/liveWorkspaceModel.mjs';
import {splitPartyCopper} from '../state/partyLootModel.mjs';
import {playerStashItems,playerAvailableLoot,gmVisibleStashes,gmLootReviewRows} from '../state/partyLootViewModel.mjs';
import {lootDestinationOptions,lootEquipmentComparison} from '../state/lootCollectionModel.mjs';

const arr=value=>Array.isArray(value)?value:[];
const validQty=value=>Number.isSafeInteger(Number(value))&&Number(value)>0&&Number(value)<=1000000;
const labels={item:'Item',currency:'Currency'};
const named=row=>row?.identified===false?'Unidentified Item':row?.name||row?.title||'Item';
function StashInventoryList({stash,query=''}){
  return <div className="react-party-stash-items">
    {playerStashItems(stash,query).map(item=><div key={item.id}><b>{item.name}</b><small>×{item.qty}</small></div>)}
    {!arr(stash.items).length?<p>No shared items in this container.</p>:
      !playerStashItems(stash,query).length?<p>No shared items match this search.</p>:null}
  </div>;
}

export function PartyLootPlayerPanel({campaignId,character,partyLoot={},editable=false}){
  const stashes=arr(partyLoot.stashes).filter(row=>row.status!=='deleted');
  const [lootSearch,setLootSearch]=useState('');
  const [lootKind,setLootKind]=useState('all');
  const [stashSearch,setStashSearch]=useState('');
  const drops=useMemo(()=>playerAvailableLoot(partyLoot,{search:lootSearch,kind:lootKind}),
    [partyLoot,lootSearch,lootKind]);
  const stored=useMemo(()=>inventoryItems(character).filter(item=>
    !item.equipped&&!item.bound&&!item.locked&&!item.questItem&&item.identified!==false&&Number(item.qty)>0),[character]);
  const storages=normalizeCharacterStorages(character);
  const [selectedStash,setSelectedStash]=useState('');
  const [itemId,setItemId]=useState('');
  const [sharedItemId,setSharedItemId]=useState('');
  const [quantity,setQuantity]=useState('1');
  const [destination,setDestination]=useState('');
  const [selectedLootId,setSelectedLootId]=useState('');
  const [lootDestination,setLootDestination]=useState('');
  const [lootBusy,setLootBusy]=useState(false);
  const [lootMessage,setLootMessage]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const stash=stashes.find(row=>row.id===selectedStash)||stashes[0];
  const item=stored.find(row=>row.id===itemId)||stored[0];
  const visibleSharedItems=playerStashItems(stash,stashSearch);
  const shared=arr(stash?.items).find(row=>
    row.id===(visibleSharedItems.some(item=>item.id===sharedItemId)?sharedItemId:visibleSharedItems[0]?.id));
  const storage=storages.find(row=>row.id===destination)||storages[0];
  const playerItems=useMemo(()=>inventoryItems(character),[character]);
  const lootDestinations=useMemo(()=>lootDestinationOptions(storages,playerItems),[storages,playerItems]);
  const selectedLoot=drops.find(row=>row.id===selectedLootId)||null;
  const selectedLootStorage=lootDestinations.find(row=>row.id===lootDestination)||lootDestinations[0];
  const lootComparison=useMemo(()=>
    selectedLoot?.kind==='item'
      ?lootEquipmentComparison(selectedLoot.item,character,playerItems)
      :null,[selectedLoot,character,playerItems]);
  const openLoot=drop=>{
    if(drop?.kind!=='item')return;
    setLootDestination(storage?.id||lootDestinations[0]?.id||'');
    setLootMessage('');
    setSelectedLootId(drop.id);
  };
  const closeLoot=()=>{
    if(lootBusy)return;
    setSelectedLootId('');
    setLootMessage('');
  };
  const collectLoot=async()=>{
    if(lootBusy||!editable||!selectedLoot||!selectedLootStorage||!character?.id)return;
    const lootId=selectedLoot.id,storageId=selectedLootStorage.id;
    setLootBusy(true);
    setLootMessage('Checking this treasure and destination with the server...');
    try{
      const response=await firebaseService.claimPartyLoot(campaignId,character.id,{lootId,storageId});
      if(response?.ok){
        setLootMessage('');
        setSelectedLootId('');
        setMessage('Treasure collected. Inventory changes will synchronize shortly.');
      }else{
        setLootMessage(response?.error||'Claim could not be confirmed. Refresh party treasure before retrying.');
      }
    }catch(error){
      setLootMessage((error?.message||'Claim could not be confirmed.')+
        ' Check your inventory and the shared treasure before retrying.');
    }finally{setLootBusy(false);}
  };
  const send=async executor=>{
    if(busy||!editable)return;
    setBusy(true);setMessage('Processing shared inventory action...');
    try{
      const response=await executor();
      setMessage(response?.ok?'Party inventory updated. Changes will synchronize for all players.':
        response?.error||'The server could not confirm this action. Review the shared inventory before retrying.');
    }catch(error){
      setMessage((error?.message||'The transaction was interrupted.')+
        ' Review the inventory before repeating this action.');
    }finally{setBusy(false);}
  };
  const move=type=>{
    if(!stash||!validQty(quantity)||(type==='deposit'&&!item)||(type==='withdraw'&&!shared))return;
    send(()=>firebaseService.movePartyStashItem(campaignId,character.id,{
      type,stashId:stash.id,itemId:type==='deposit'?item.id:shared.id,quantity:Number(quantity),
      ...(type==='withdraw'?{storageId:storage?.id}:{})
    }));
  };
  return <section className="react-party-loot-workspace">
    {selectedLoot?.kind==='item'?<Modal
      title={selectedLoot.item.name}
      eyebrow="Inspect & Collect Revealed Treasure"
      busy={lootBusy}
      onClose={closeLoot}
      footer={<div className="react-modal-actions">
        <button type="button" disabled={lootBusy} onClick={closeLoot}>Close</button>
        <button type="button" className="primary"
          disabled={!editable||lootBusy||!selectedLootStorage}
          onClick={collectLoot}>Claim to {selectedLootStorage?.name||'Storage'}</button>
      </div>}
    >
      <div className="react-party-loot-inspection">
        <p className="react-party-loot-inspection-subtitle">{selectedLoot.title} · {selectedLoot.source}</p>
        <div className="react-party-loot-inspection-item">
          <div className="react-party-loot-inspection-emblem" aria-hidden="true">
            {String(selectedLoot.item.name||'?').charAt(0)}
          </div>
          <div>
            <strong>{selectedLoot.item.name} ×{selectedLoot.item.qty}</strong>
            <span>{selectedLoot.item.identified===false?'Unidentified treasure':[
              selectedLoot.item.type||'Item',selectedLoot.item.rarity||''
            ].filter(Boolean).join(' · ')}</span>
            {selectedLoot.item.identified!==false&&selectedLoot.item.description?
              <p>{selectedLoot.item.description}</p>:null}
          </div>
        </div>
        {selectedLoot.item.identified===false?
          <p className="react-help">Its true identity and properties have not been discovered.</p>:null}
        {lootComparison?.available?<section className="react-party-loot-comparison" aria-label="Equipment comparison">
          <h3>Equipment Comparison</h3>
          <p><b>{lootComparison.slot}</b> · Currently: {lootComparison.currentName}</p>
          {lootComparison.acEstimate?<p>Armour Class: <b>{lootComparison.acEstimate.current}</b>
            {' → '}<b>{lootComparison.acEstimate.projected}</b>
            {' ('}{lootComparison.acEstimate.delta>=0?'+':''}{lootComparison.acEstimate.delta}{')'}</p>:null}
          <small>{lootComparison.notice}</small>
        </section>:null}
        <section className="react-party-loot-collection" aria-label="Treasure storage destination">
          <h3>Collect into Storage</h3>
          <p>Choose where this item should go. Capacity is a preview; the server verifies the final transaction.</p>
          {lootDestinations.length?<label>Destination
            <select value={selectedLootStorage?.id||''} disabled={lootBusy}
              onChange={event=>setLootDestination(event.target.value)}>
              {lootDestinations.map(option=><option value={option.id} key={option.id}>
                {option.name} · {option.used}/{option.capacity} slots
              </option>)}
            </select>
          </label>:<p className="react-storage-warning">No character inventory containers available.</p>}
          {selectedLootStorage?<p>
            <b>{selectedLootStorage.free}</b> visible free slots out of {selectedLootStorage.capacity}
            {selectedLootStorage.overflow?' · '+selectedLootStorage.overflow+' overflow stacks':''}
            {selectedLootStorage.full?' · Full; matching stack merge may still be possible.':''}
          </p>:null}
        </section>
        {!editable?<p className="react-storage-warning">Collecting treasure requires an active, editable campaign session.</p>:null}
        {lootMessage?<p role="status" aria-live="polite">{lootMessage}</p>:null}
      </div>
    </Modal>:null}
    <Panel title="Party Stash & Treasure" eyebrow="Shared Campaign Inventory" action={<StatusPill>{stashes.length} containers · {drops.length} drops</StatusPill>}>
      <p className="react-help">Shared containers are synchronized across your party. Select items and use buttons to deposit or withdraw; dragging is not required.</p>
      {stashes.length?<><div className="react-form-grid"><label>Party container<select value={stash?.id||''} onChange={event=>{setSelectedStash(event.target.value);setSharedItemId('');}}>{stashes.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Your storage destination<select value={storage?.id||''} onChange={event=>setDestination(event.target.value)}>{storages.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>
        {stash?<div className="react-party-stash-card">
          <header><b>{stash.name}</b><StatusPill tone={stash.status==='open'?'success':'warning'}>{stash.status}</StatusPill></header>
          {stash.description?<p>{stash.description}</p>:null}
          <label className="react-party-loot-search">Search shared items
            <input type="search" aria-label="Search shared items" value={stashSearch}
              onChange={event=>{setStashSearch(event.target.value);setSharedItemId('');}}
              placeholder="Find an item in this container"/>
          </label>
          <StashInventoryList stash={stash} query={stashSearch}/>
          <div className="react-form-grid">
            <label>Item to deposit<select value={item?.id||''} onChange={event=>setItemId(event.target.value)}>{stored.length?stored.map(row=><option key={row.id} value={row.id}>{row.name} ×{row.qty}</option>):<option value="">No depositable items</option>}</select></label>
            <label>Item to withdraw<select value={shared?.id||''} onChange={event=>setSharedItemId(event.target.value)}>{visibleSharedItems.length?visibleSharedItems.map(row=><option key={row.id} value={row.id}>{row.name} ×{row.qty}</option>):<option value="">No matching items</option>}</select></label>
            <label>Quantity<ManualNumberInput min="1" max="1000000" value={quantity} onChange={setQuantity}/></label>
          </div>
          <div className="react-action-row">
            <button type="button" disabled={!editable||busy||stash.status!=='open'||stash.allowDeposits===false||!item||!validQty(quantity)||Number(quantity)>Number(item?.qty)} onClick={()=>move('deposit')}>Deposit Item</button>
            <button type="button" disabled={!editable||busy||stash.status!=='open'||stash.allowWithdrawals===false||!shared||!storage||!validQty(quantity)||Number(quantity)>Number(shared?.qty)} onClick={()=>move('withdraw')}>Withdraw Item</button>
          </div>
        </div>:null}</>:<EmptyState title="No party containers">The GM can add a shared stash or treasure chest.</EmptyState>}
      <h3>Available Party Loot</h3>
      <div className="react-party-loot-filters" aria-label="Available treasure filters">
        <label>Search treasure<input type="search" value={lootSearch}
          onChange={event=>setLootSearch(event.target.value)} placeholder="Name or source"/></label>
        <label>Type<select value={lootKind} onChange={event=>setLootKind(event.target.value)}>
          <option value="all">All treasure</option><option value="item">Items</option>
          <option value="currency">Currency</option>
        </select></label>
      </div>
      <div className="react-party-loot-list">
        {drops.map(drop=><article key={drop.id} className="react-party-loot-collect-card">
          <div className="react-party-loot-collect-heading">
            <span className="react-party-loot-collect-emblem" aria-hidden="true">
              {drop.kind==='currency'?'C':String(drop.item?.name||'?').charAt(0)}
            </span>
            <div><b>{drop.title}</b><small>{drop.source} · {labels[drop.kind]||'Loot'}</small>
              {drop.note?<p>{drop.note}</p>:null}
            </div>
          </div>
          <strong>{drop.kind==='currency'?Number(drop.currencyCopper).toLocaleString()+' Copper':named(drop.item)+' ×'+(drop.item?.qty||1)}</strong>
          {drop.kind==='item'?<div className="react-party-loot-collect-actions">
            <button type="button" onClick={()=>openLoot(drop)}>Inspect Item</button>
            <button type="button" className="primary" onClick={()=>openLoot(drop)}
              disabled={!editable||lootBusy||!lootDestinations.length}>Collect Item</button>
          </div>:<small>Awaiting GM currency distribution</small>}
        </article>)}
        {!drops.length?<EmptyState title="No matching available treasure">
          {lootSearch||lootKind!=='all'?'Clear the filters to see other revealed treasure.':'New treasure appears here when the GM reveals it.'}
        </EmptyState>:null}
      </div>
      <p role="status" className="react-action-message" aria-live="polite">{message}</p>
    </Panel>
  </section>;
}

export function GMPartyLootPanel({campaignId,characters={},partyLoot={},customItems=[],editable=false}){
  const stashes=arr(partyLoot.stashes);
  const revealed=arr(partyLoot.loot);

  const [stashName,setStashName]=useState(''),[stashKind,setStashKind]=useState('stash');
  const [newTitle,setNewTitle]=useState(''),[newSource,setNewSource]=useState('');
  const [newNote,setNewNote]=useState(''),[dropKind,setDropKind]=useState('item');
  const [currency,setCurrency]=useState(''),[quantity,setQuantity]=useState('1');
  const [selectedItem,setSelectedItem]=useState(null),[catalogQuery,setCatalogQuery]=useState('');
  const [revealNow,setRevealNow]=useState(false);
  const [recipientIds,setRecipientIds]=useState([]);
  const [previewId,setPreviewId]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [gmStashSearch,setGMStashSearch]=useState('');
  const [gmStashStatus,setGMStashStatus]=useState('all');
  const [gmLootSearch,setGMLootSearch]=useState('');
  const [gmLootKind,setGMLootKind]=useState('all');
  const [gmLootStatus,setGMLootStatus]=useState('all');
  const filteredStashes=gmVisibleStashes(partyLoot,{search:gmStashSearch,status:gmStashStatus});
  const filteredLoot=gmLootReviewRows(partyLoot,{search:gmLootSearch,kind:gmLootKind,status:gmLootStatus});
  const catalog=useMemo(()=>window.AsteriaInventory?.catalogEntries?.(customItems)||[],[customItems]);
  const matches=useMemo(()=>catalogQuery?catalog.filter(row=>String(row.name||row.title||'').toLowerCase().includes(catalogQuery.toLowerCase())).slice(0,12):[],[catalog,catalogQuery]);
  const gmScope=Object.keys(characters)[0]||'gm-scope';
  const roster=Object.values(characters).filter(row=>row?.id&&row?.ownerUid);
  const run=async execute=>{
    if(busy)return;
    setBusy(true);setMessage('Saving shared party changes...');
    try{
      const response=await execute();
      setMessage(response?.ok?'Shared party inventory synchronized.':response?.error||'The server could not confirm this action. Review the current records before retrying.');
      if(response?.ok){setPreviewId('');return true;}
    }catch(error){
      setMessage((error?.message||'Could not confirm the action.')+' Check the campaign before retrying.');
    }finally{setBusy(false);}
    return false;
  };
  const snapshot=selectedItem?(window.AsteriaInventory?.itemSnapshot?.(selectedItem,Number(quantity))||
    {...selectedItem,name:selectedItem.name||selectedItem.title,qty:Number(quantity)}):null;
  const createDrop=async()=>{
    if(!newTitle.trim()||!newSource.trim())return setMessage('Enter a title and source for the treasure.');
    if(dropKind==='item'&&(!snapshot||!validQty(quantity)))return setMessage('Select a compendium item and valid quantity.');
    if(dropKind==='currency'&&(!Number.isSafeInteger(Number(currency))||Number(currency)<1))
      return setMessage('Enter a whole copper amount.');
    const success=await run(()=>firebaseService.managePartyLootDrop(campaignId,gmScope,{
      type:'create',revealNow,drop:{
        title:newTitle,source:newSource,note:newNote,kind:dropKind,
        ...(dropKind==='item'?{item:snapshot}:{currencyCopper:Number(currency)})
      }
    }));
    if(success){setNewTitle('');setNewSource('');setNewNote('');setCurrency('');setSelectedItem(null);setCatalogQuery('');}
  };
  const splitDrop=drop=>{
    try{
      const splits=splitPartyCopper(drop.currencyCopper,recipientIds);
      if(!splits.length)return setMessage('Select at least one player.');
      setPreviewId(drop.id);setMessage('');
    }catch(error){setMessage(error?.message||String(error));}
  };
  const previewDrop=revealed.find(row=>row.id===previewId&&row.kind==='currency');
  const preview=previewDrop?splitPartyCopper(previewDrop.currencyCopper,recipientIds):[];
  return <div className="react-party-loot-workspace">
    <Panel title="Party Stashes & Treasure" eyebrow="GM Shared Inventory Controls">
      <p className="react-help">Prepare containers and loot for the whole party. Hidden treasure remains GM-only until revealed. Changes to character inventories require a live session.</p>
      <h3>Create Shared Container</h3>
      <div className="react-form-grid"><label>Container name<input value={stashName} maxLength="160" onChange={event=>setStashName(event.target.value)} placeholder="The Party Chest"/></label>
        <label>Container type<select value={stashKind} onChange={event=>setStashKind(event.target.value)}><option value="stash">Party Stash</option><option value="chest">Treasure Chest</option></select></label></div>
      <button type="button" className="primary" disabled={busy||!stashName.trim()} onClick={async()=>{
        const success=await run(()=>firebaseService.managePartyStash(campaignId,gmScope,{type:'create',stash:{name:stashName,kind:stashKind}}));
        if(success)setStashName('');
      }}>Create Party Container</button>
      <div className="react-party-loot-filters" aria-label="GM shared container filters">
        <label>Find container<input type="search" value={gmStashSearch}
          onChange={event=>setGMStashSearch(event.target.value)} placeholder="Container name"/></label>
        <label>Container status<select value={gmStashStatus} onChange={event=>setGMStashStatus(event.target.value)}>
          <option value="all">All statuses</option><option value="open">Open</option>
          <option value="closed">Closed</option>
        </select></label>
      </div>
      <div className="react-party-stash-manager">{filteredStashes.map(stash=><article key={stash.id}>
        <div><b>{stash.name}</b><small>{stash.kind} · {stash.status} · {stash.items?.length||0} stacks</small></div>
        <StashInventoryList stash={stash}/>
        <div className="react-action-row">
          <button disabled={busy} onClick={()=>run(()=>firebaseService.managePartyStash(campaignId,gmScope,{type:'update',stashId:stash.id,stash:{status:stash.status==='open'?'closed':'open'}}))}>{stash.status==='open'?'Close':'Open'}</button>
          <button disabled={busy} onClick={()=>run(()=>firebaseService.managePartyStash(campaignId,gmScope,{type:'update',stashId:stash.id,stash:{allowDeposits:stash.allowDeposits===false}}))}>{stash.allowDeposits===false?'Enable':'Disable'} Deposits</button>
          <button disabled={busy} onClick={()=>run(()=>firebaseService.managePartyStash(campaignId,gmScope,{type:'update',stashId:stash.id,stash:{allowWithdrawals:stash.allowWithdrawals===false}}))}>{stash.allowWithdrawals===false?'Enable':'Disable'} Withdrawals</button>
          <button disabled={busy||Boolean(stash.items?.length)} onClick={()=>run(()=>firebaseService.managePartyStash(campaignId,gmScope,{type:'delete',stashId:stash.id}))}>Delete Empty</button>
          {snapshot&&validQty(quantity)?<button disabled={busy||stash.items?.length>=80} onClick={()=>run(()=>firebaseService.managePartyStash(campaignId,gmScope,{type:'add-item',stashId:stash.id,item:snapshot,quantity:Number(quantity)}))}>Stock Selected Item</button>:null}
        </div>
      </article>)}</div>
      {!filteredStashes.length?<EmptyState title={stashes.length?'No matching containers':'No shared containers'}/>:null}
      <h3>Create Treasure Drop</h3>
      <div className="react-form-grid">
        <label>Treasure title<input value={newTitle} maxLength="160" onChange={event=>setNewTitle(event.target.value)} placeholder="Ancient Ruins Cache"/></label>
        <label>Source<input value={newSource} maxLength="160" onChange={event=>setNewSource(event.target.value)} placeholder="A hidden chamber"/></label>
        <label>Drop type<select value={dropKind} onChange={event=>setDropKind(event.target.value)}><option value="item">Item</option><option value="currency">Currency (Copper)</option></select></label>
        {dropKind==='currency'?<label>Total Copper<ManualNumberInput min="1" max="1000000000000" value={currency} onChange={setCurrency}/></label>:
          <><label>Find compendium item<input type="search" value={catalogQuery} onChange={event=>setCatalogQuery(event.target.value)} placeholder="Search items"/></label>
          <label>Quantity<ManualNumberInput min="1" max="1000000" value={quantity} onChange={setQuantity}/></label></>}
        <label>Discovery note<input maxLength="600" value={newNote} onChange={event=>setNewNote(event.target.value)}/></label>
      </div>
      {dropKind==='item'&&catalogQuery?<div className="react-search-results">{matches.map(row=><button type="button" key={row.id||row.slug||row.name} onClick={()=>{setSelectedItem(row);setCatalogQuery('');}}>{row.name||row.title}</button>)}</div>:null}
      {dropKind==='item'&&selectedItem?<p>Selected item: <b>{selectedItem.name||selectedItem.title}</b> ×{quantity}</p>:null}
      <label className="react-check-row"><input type="checkbox" checked={revealNow} onChange={event=>setRevealNow(event.target.checked)}/>Reveal immediately to players</label>
      <button className="primary" disabled={busy} onClick={createDrop}>{revealNow?'Create & Reveal Drop':'Save Hidden Drop'}</button>
      <div className="react-party-loot-filters" aria-label="GM treasure review filters">
        <label>Find treasure<input type="search" value={gmLootSearch}
          onChange={event=>setGMLootSearch(event.target.value)} placeholder="Treasure name or source"/></label>
        <label>Treasure type<select value={gmLootKind} onChange={event=>setGMLootKind(event.target.value)}>
          <option value="all">All kinds</option><option value="item">Items</option>
          <option value="currency">Currency</option>
        </select></label>
        <label>Revealed status<select value={gmLootStatus} onChange={event=>setGMLootStatus(event.target.value)}>
          <option value="all">All statuses</option><option value="available">Available</option>
          <option value="claimed">Claimed</option><option value="distributed">Distributed</option>
          <option value="cancelled">Cancelled</option>
        </select></label>
      </div>
      {filteredLoot.hidden.length?<><h3>Hidden Treasure (GM Only)</h3><div className="react-party-loot-list">{filteredLoot.hidden.map(row=><article key={row.id}><div><b>{row.title}</b><small>{row.source}</small>
        {row.generatedFrom?<small>Loot-table batch · Roll {row.generatedFrom.rollNumber||1}</small>:null}
        <strong>{row.kind==='currency'?Number(row.currencyCopper).toLocaleString()+' Copper':
          named(row.secretItem||row.item)+' ×'+Number((row.secretItem||row.item)?.qty||1)}</strong>
      </div><button disabled={busy} onClick={()=>run(()=>firebaseService.managePartyLootDrop(campaignId,gmScope,{type:'reveal',lootId:row.id}))}>Reveal to Party</button><button disabled={busy} onClick={()=>run(()=>firebaseService.managePartyLootDrop(campaignId,gmScope,{type:'cancel',lootId:row.id}))}>Cancel Drop</button></article>)}</div></>:null}
      <h3>Revealed Treasure</h3>
      <div className="react-party-loot-list">{filteredLoot.revealed.map(row=><article key={row.id}><div><b>{row.title}</b><small>{row.source} · {row.status}</small><strong>{row.kind==='currency'?Number(row.currencyCopper).toLocaleString()+' Copper':named(row.item)+' ×'+row.item?.qty}</strong></div>
        {row.status==='available'&&row.kind==='currency'?<button disabled={busy} onClick={()=>splitDrop(row)}>Review Currency Split</button>:null}
        {row.status==='available'?<button disabled={busy} onClick={()=>run(()=>firebaseService.managePartyLootDrop(campaignId,gmScope,{type:'cancel',lootId:row.id}))}>Cancel</button>:null}
      </article>)}{!filteredLoot.revealed.length?<EmptyState title={revealed.length?'No matching revealed loot':'No revealed loot yet'}/>:null}</div>
      {previewDrop?<section className="react-party-currency-preview">
        <h3>Confirm Currency Split — {previewDrop.title}</h3>
        <p>Choose the characters who share this loot. Copper remainders go to character IDs in alphabetical order.</p>
        <div className="react-recipient-grid">{roster.map(row=><label key={row.id}><input type="checkbox" checked={recipientIds.includes(row.id)} onChange={event=>{setRecipientIds(old=>event.target.checked?[...old,row.id]:old.filter(id=>id!==row.id));setPreviewId('');}}/>{row.name||row.id}</label>)}</div>
        <p>To review a different split, select players below and choose Review Currency Split again.</p>
        {preview.map(row=><p key={row.characterId}><b>{characters[row.characterId]?.name||row.characterId}</b>: {row.copper} copper</p>)}
        <div className="react-action-row"><button disabled={busy||!preview.length||!editable} onClick={()=>run(()=>firebaseService.splitPartyLootCurrency(campaignId,gmScope,{lootId:previewId,recipientIds}))}>Confirm & Distribute</button><button onClick={()=>setPreviewId('')}>Cancel Review</button></div>
      </section>:null}
      {!previewDrop&&roster.length?<div className="react-party-split-recipients"><h4>Currency Split Recipients</h4><div className="react-recipient-grid">{roster.map(row=><label key={row.id}><input type="checkbox" checked={recipientIds.includes(row.id)} onChange={event=>{setRecipientIds(old=>event.target.checked?[...old,row.id]:old.filter(id=>id!==row.id));setPreviewId('');}}/>{row.name||row.id}</label>)}</div></div>:null}
      <p role="status" className="react-action-message" aria-live="polite">{message}</p>
    </Panel>
  </div>;
}
