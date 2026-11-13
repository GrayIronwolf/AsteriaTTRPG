import { ManualNumberInput } from '../components/ManualNumberInput.jsx';
import { isManualNumber, manualNumber } from '../state/manualNumber.mjs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, FilterControl, IconButton, Modal, Panel, SearchField, StatusPill, Tabs, Tooltip } from '../components/WorkspaceUI.jsx';
import { AsteriaIcon } from '../components/AsteriaIcons.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { characterKnowsIdentify, normalizeCharacterStorages, storageSlotLayout } from '../state/liveWorkspaceModel.mjs';
import { calculateArmourPieceAC, previewEquipmentChange, validateEquipmentChange } from '../systems/armour/armourSystem.mjs';
import { inventoryItems } from './characterWorkspaceData.js';
import { SendPlayerItemModal } from './PlayerItemExchange.jsx';
import { ShopWorkspace } from './ShopWorkspace.jsx';
import { PartyLootPlayerPanel } from './PartyLootWorkspace.jsx';
import {PlayerItemLoreWorkspace} from './ItemLoreWorkspace.jsx';
import { createAsteriaItem, formatMarks, getInventoryResaleValue, marketPricingStatus, validateMarketPricing } from '../systems/items/marketPricing.mjs';
import { INVENTORY_CATEGORIES, matchesInventoryFilter, inventoryQuickActionAvailability, availableInventoryEquipmentSlots } from '../state/inventoryQuickActions.mjs';
import {inventoryActivityRecords,inventoryActivityDelta,filterInventoryActivityRecords,INVENTORY_ACTIVITY_CATEGORIES} from '../state/inventoryActivityModel.mjs';

const ARMOR_SLOTS = [
  ['Head', ['Head', 'Helmet']],
  ['Neck', ['Neck', 'Amulet']],
  ['Torso', ['Torso', 'Chest', 'Chest Armor']],
  ['Shoulders', ['Shoulders', 'Large Shoulder', 'Small Shoulder']],
  ['Upper Arms', ['Upper Arms', 'Upper Arm']],
  ['Elbows', ['Elbows', 'Elbow']],
  ['Forearms', ['Forearms', 'Forearm']],
  ['Hands', ['Hands', 'Gloves']],
  ['Waist / Hips', ['Waist / Hips', 'Waist', 'Hips', 'Belt']],
  ['Upper Legs', ['Upper Legs', 'Upper Leg', 'Legs', 'Leg Armor']],
  ['Rear / Hips', ['Rear / Hips', 'Rear', 'Rear Guard']],
  ['Knees', ['Knees', 'Knee']],
  ['Lower Legs', ['Lower Legs', 'Lower Leg']],
  ['Feet', ['Feet', 'Boots']],
  ['Accessories', ['Accessories', 'Accessory']]
];

const WEAPON_SLOTS = [
  ['Main Weapon', ['Main Weapon', 'Main Hand']],
  ['Secondary Weapon', ['Secondary Weapon', 'Ranged Weapon']],
  ['Off-Hand', ['Off-Hand', 'Off Hand', 'Off Weapon', 'Shield']],
  ['Quiver', ['Quiver', 'Ammunition']]
];

function resultText(result, success = 'Saved.') {
  return result?.ok ? success : result?.error || 'That action could not be completed.';
}

function itemDetails(item) {
  return item?.identified === false
    ? { description: '???', effects: ['???'], rarity: 'Unknown', marketValue: '???', marketPrice: '???' }
    : {
        description: item?.raw?.description || item?.raw?.summary || item?.raw?.desc || 'Information coming soon.',
        effects: item?.raw?.effects || item?.raw?.effect || [],
        rarity: item?.rarity,
        marketValue: item?.marketValue,
        marketPrice: item?.marketPrice
      };
}

function magicColor(item) {
  const name = item?.spell?.element || item?.raw?.element || item?.raw?.magicType || '';
  return window.ASTERIA_MAGIC_LIBRARY?.all?.find(value => String(value.name).toLowerCase().includes(String(name).toLowerCase()))?.color || '#298eea';
}

function ItemImage({ item, className = '' }) {
  const [failed, setFailed] = useState(false);
  const source = item?.image || item?.raw?.image || '';
  React.useEffect(() => setFailed(false), [source]);
  return <div className={className}>
    {source && !failed
      ? <img src={source} alt="" onError={() => setFailed(true)} />
      : <span>{item?.isSpellbook ? 'B' : String(item?.name || '?').charAt(0)}</span>}
  </div>;
}

export function ItemDetailModal({ campaignId, character, item, editable, onClose, onAction, isGM=false }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [quantity,setQuantity]=useState('');
  if (!item) return null;
  const detail = itemDetails(item);
  const pricing = item.identified === false ? null : marketPricingStatus(item);
  const effects = Array.isArray(detail.effects) ? detail.effects : detail.effects ? [detail.effects] : [];
  const armourPiece = calculateArmourPieceAC(item);
  const armourPreview = armourPiece.piece ? previewEquipmentChange(character, item, armourPiece.piece.location) : null;
  const armourValidation = armourPiece.piece ? validateEquipmentChange(character, item, armourPiece.piece.location) : null;
  const decimal = value => Number(value).toFixed(2).replace(/\.00$/,'');
  const signed = value => `${Number(value) >= 0 ? '+' : ''}${decimal(value)}`;
  const run = async (operation, success) => {
    setBusy(true);
    const result = await operation();
    setMessage(resultText(result, success));
    setBusy(false);
    if (result?.ok) onAction?.();
  };
  return <Modal
    title={item.name}
    eyebrow={item.identified === false ? 'Unidentified Item' : 'Inventory Item'}
    busy={busy}
    onClose={onClose}
    footer={<div className="react-modal-actions">
      {!isGM && item.identified === false ? <button
        className="primary"
        disabled={!editable || !characterKnowsIdentify(character)}
        title={characterKnowsIdentify(character) ? 'Cast Identify' : 'This character does not know Identify'}
        onClick={() => run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'identify', itemId: item.id }), 'Item identified.')}
      >Identify</button> : null}
      {!isGM && item.isSpellbook && item.identified !== false ? <button
        className="primary"
        disabled={!editable}
        onClick={() => run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'read-spellbook', itemId: item.id }), `Learned ${item.spell?.name || item.trueName}.`)}
      >Read &amp; Learn</button> : null}
      {item.equipped && !item.readOnlyEquipment ? <button type="button" className="primary" disabled={!editable||busy} onClick={()=>run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'unequip',itemId:item.id}),'Unequipped '+item.name+'.')}>Unequip</button> : null}
      {!item.equipped && armourPiece.piece ? <button
        className="primary"
        disabled={!editable || busy || !armourValidation?.ok}
        title={armourValidation?.ok ? `Equip in ${armourPiece.piece.location}` : armourValidation?.error}
        onClick={() => run(() => firebaseService.updateInventory(campaignId, character.id, { type:'equip', itemId:item.id, slot:armourPiece.piece.location }), `Equipped ${item.name}.`)}
      >Equip in {armourPiece.piece.location}</button> : null}
      <button onClick={onClose}>Close</button>
    </div>}
  >
    <div className="react-item-detail">
      <ItemImage item={item} className="react-item-detail-image" />
      <div><StatusPill>{detail.rarity}</StatusPill><p>{detail.description}</p><dl>
        <div><dt>Type</dt><dd>{item.identified === false ? '???' : item.type}</dd></div>
        <div><dt>Quantity</dt><dd>{item.qty}</dd></div>
      </dl></div>
    </div>
    {isGM?<section className="react-form-grid"><label>New quantity (zero removes the item)<ManualNumberInput min="0" max="1000000" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><button disabled={!editable||busy||!isManualNumber(quantity,{min:0,max:1000000})} onClick={()=>run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'set-quantity',itemId:item.id,quantity:Number(quantity),expectedQuantity:item.qty,expectedCoreRevision:Number(character.coreRevision||0)}),'Inventory updated.')}>Apply quantity</button>{item.equipped?<button disabled={!editable||busy} onClick={()=>run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'unequip',itemId:item.id}),'Item unequipped.')}>Unequip</button>:null}</section>:null}
    <section className="react-market-information">
      <header><div><p className="react-eyebrow">Market Information</p><h3>{pricing?.label || 'Market Information'}</h3></div>{pricing ? <StatusPill tone={pricing.id === 'tradeable' ? 'success' : pricing.id === 'invalid' ? 'warning' : 'pending'}>{pricing.label}</StatusPill> : null}</header>
      {pricing?.id === 'not-tradeable' ? <p>Not Normally Tradeable</p> : <dl className="react-detail-list">
        <div title="The standard amount received when selling this item."><dt>Market Value</dt><dd>{item.identified === false ? '???' : formatMarks(detail.marketValue)}</dd></div>
        <div title="The standard amount required to purchase this item."><dt>Market Price</dt><dd>{item.identified === false ? '???' : formatMarks(detail.marketPrice)}</dd></div>
      </dl>}
      {pricing?.id === 'needs-completion' ? <p className="react-storage-warning">This legacy item needs a Market Price before it can be sold by a shop.</p> : null}
      {pricing?.id === 'invalid' ? <p className="react-storage-warning">{pricing.errors.join(' ')}</p> : null}
    </section>
    {effects.length ? <><h3>Effects</h3><ul>{effects.map((effect, index) => <li key={index}>{typeof effect === 'object' ? effect.description || effect.name || JSON.stringify(effect) : effect}</li>)}</ul></> : null}
    {armourPiece.piece ? <section className="react-item-ac-details">
      <header><div><p className="react-eyebrow">Armour Calculation</p><h3>{armourPiece.piece.name}</h3></div><StatusPill tone={armourPiece.valid ? 'success' : 'warning'}>{armourPiece.valid ? `${signed(armourPiece.contribution)} AC` : 'Needs metadata'}</StatusPill></header>
      <dl className="react-detail-list">
        <div><dt>Equipment Location</dt><dd>{armourPiece.piece.location}</dd></div>
        <div><dt>Armour Type</dt><dd>{armourPiece.armourType?.name || 'Not configured'}</dd></div>
        <div><dt>Material Base AC</dt><dd>{armourPiece.materialName}: {decimal(armourPiece.materialBaseAC)}</dd></div>
        <div><dt>Item Quality</dt><dd>{armourPiece.quality.name}: {signed(armourPiece.quality.modifier)}</dd></div>
        <div><dt>Modified Base AC</dt><dd>{decimal(armourPiece.modifiedBaseAC)}</dd></div>
        <div><dt>Piece Percentage</dt><dd>{Math.round(armourPiece.percentile * 100)}%</dd></div>
      </dl>
      <p className="react-ac-equation">{decimal(armourPiece.modifiedBaseAC)} x {Math.round(armourPiece.percentile * 100)}% = <strong>{decimal(armourPiece.contribution)} AC</strong></p>
      {armourPreview ? <div className="react-item-ac-comparison"><span>Current AC <b>{armourPreview.before.finalAC}</b></span><AsteriaIcon name="chevronRight"/><span>Equipped AC <b>{armourPreview.result.finalAC}</b></span><StatusPill tone={armourPreview.delta.ac >= 0 ? 'success' : 'warning'}>{signed(armourPreview.delta.ac)} AC</StatusPill><small>Mobility {signed(armourPreview.delta.mobility)} | Stealth {signed(armourPreview.delta.stealth)}</small></div> : null}
      {armourPiece.errors.map(error => <p className="react-storage-warning" key={error}>{error}</p>)}
      {armourValidation && !armourValidation.ok ? <p className="react-storage-warning">{armourValidation.error}</p> : null}
    </section> : null}
    <p>{message}</p>
  </Modal>;
}

function CustomItemModal({ campaignId, character, storageId, onClose }) {
  const [form, setForm] = useState({ name: '', type: 'Item', itemClass: 'Common', description: '', marketValue: '', marketPrice: '', isSpellbook: false, spellName: '', element: '', identified: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const pricing = validateMarketPricing({...form,marketValue:manualNumber(form.marketValue),marketPrice:manualNumber(form.marketPrice)});
  const save = async () => {
    if(!isManualNumber(form.marketValue,{min:0,integer:false,optional:true})||!isManualNumber(form.marketPrice,{min:0,integer:false,optional:true}))return setMessage('Enter valid market prices, or leave blank for zero.');
    if(!pricing.valid) { setMessage(pricing.errors[0]); return; }
    setBusy(true);
    const item = createAsteriaItem({ ...form, marketValue:manualNumber(form.marketValue),marketPrice:manualNumber(form.marketPrice),spell: form.isSpellbook ? { name: form.spellName || form.name, element: form.element, rank: 'Rank I' } : null, basicName: form.isSpellbook ? 'Book' : form.type || 'Item' });
    try {
      const result = await firebaseService.updateInventory(campaignId, character.id, { type: 'create-custom-item', item, storageId });
      setMessage(resultText(result, 'Custom item added to the shared catalog and this inventory.'));
    } catch (error) {
      setMessage(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };
  return <Modal title="Create Custom Item" eyebrow="Shared Item Catalog" busy={busy} onClose={onClose} footer={<><button onClick={onClose}>Close</button><button className="primary" disabled={busy || !form.name.trim() || !pricing.valid} onClick={save}>Create Item</button></>}>
    <div className="react-form-grid">
      <label>Name<input value={form.name} onChange={event => set('name', event.target.value)} /></label>
      <label>Type<input value={form.type} onChange={event => set('type', event.target.value)} /></label>
      <label>Item Class<select value={form.itemClass} onChange={event => set('itemClass', event.target.value)}>{['Common', 'Uncommon', 'Unusual', 'Rare', 'Epic', 'Mythic', 'Legendary', 'Relic'].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <fieldset className="react-market-form"><legend>Market Information</legend><div className="react-form-grid">
      <label>Market Value <small>Marks received when selling</small><ManualNumberInput min="0" step="0.01" value={form.marketValue} onChange={event => set('marketValue', event.target.value)} /></label>
      <label>Market Price <small>Marks paid when purchasing</small><ManualNumberInput min="0" step="0.01" value={form.marketPrice} onChange={event => set('marketPrice', event.target.value)} /></label>
    </div>{!pricing.valid ? <p className="react-storage-warning">{pricing.errors[0]}</p> : form.marketValue === 0 && form.marketPrice === 0 ? <p className="react-help">0 / 0 marks this item as Not Normally Tradeable.</p> : null}</fieldset>
    <label>Description<textarea rows="5" value={form.description} onChange={event => set('description', event.target.value)} /></label>
    <label className="react-check-row"><input type="checkbox" checked={form.isSpellbook} onChange={event => set('isSpellbook', event.target.checked)} />This item is a spellbook</label>
    {form.isSpellbook ? <div className="react-form-grid"><label>Spell Name<input value={form.spellName} onChange={event => set('spellName', event.target.value)} /></label><label>Element<input value={form.element} onChange={event => set('element', event.target.value)} /></label></div> : null}
    <p>{message}</p>
  </Modal>;
}

function equipmentFallback(equipment, aliases) {
  const source = equipment && typeof equipment === 'object' ? equipment : {};
  const entry = Object.entries(source).find(([key]) => aliases.some(alias => String(alias).toLowerCase() === String(key).toLowerCase()));
  if (!entry || !entry[1]) return null;
  const [slot, value] = entry;
  const item = typeof value === 'string' ? { name: value } : value;
  return { id: `legacy-equipment-${slot}`, type: 'Equipment', qty: 1, equipped: true, equippedSlot: slot, readOnlyEquipment: true, ...item };
}

function equippedItemForSlot(items, aliases, equipment) {
  const names = aliases.map(value => String(value).toLowerCase());
  return items.find(item => item.equipped && names.includes(String(item.equippedSlot || item.raw?.slot || '').toLowerCase())) || equipmentFallback(equipment, aliases);
}

function itemFitsSlot(item, label) {
  if(!item) return false;
  const allowed = Array.isArray(item.allowedSlots) ? item.allowedSlots : [];
  if(!allowed.length) return true;
  const target = String(label).toLowerCase();
  return allowed.some(slot => target.includes(String(slot).toLowerCase()) || String(slot).toLowerCase().includes(target));
}

function EquipmentSlot({ label, item, dragged, editable, onDrop, onDetails, onUnequip, selectedItem, onEquipSelected }) {
  const [dropState,setDropState]=useState('');
  const inspect=()=>item&&onDetails(item);
  const canDrop=itemFitsSlot(dragged,label);
  const canTapEquip=editable&&!item&&Boolean(selectedItem?.id)&&!selectedItem?.equipped&&
    availableInventoryEquipmentSlots(selectedItem).length>0&&itemFitsSlot({...selectedItem,allowedSlots:availableInventoryEquipmentSlots(selectedItem)},label);
  return <div
    className={`react-inventory-slot ${item ? 'filled' : ''} ${dropState}`}
    role="button"
    tabIndex={item ? 0 : -1}
    aria-label={`${label}: ${item?.name || 'Empty'}`}
    onKeyDown={event=>{if(item&&['Enter',' '].includes(event.key)){event.preventDefault();inspect();}}}
    onDragEnter={event=>{if(editable&&dragged){event.preventDefault();setDropState(canDrop?'valid-drop':'invalid-drop');}}}
    onDragLeave={()=>setDropState('')}
    onDragOver={event => editable && event.preventDefault()}
    onDrop={event => {setDropState(''); if(editable) onDrop(event, label);}}
    onClick={inspect}
    onDoubleClick={inspect}
  >
    <ItemImage item={item || { name: label }} className="react-slot-image" />
    <span><small>{label}</small><b>{item?.name || 'Empty'}</b></span>
    {item && !item.readOnlyEquipment ? <button type="button" title={`Unequip ${item.name}`} aria-label={`Unequip ${item.name}`} disabled={!editable} onClick={event => { event.stopPropagation(); onUnequip(item); }}>×</button> : null}
    {canTapEquip?<button type="button" className="react-inventory-slot-tap-equip" aria-label={`Equip ${selectedItem.name} in ${label}`} onClick={event=>{event.stopPropagation();onEquipSelected(selectedItem,label);}}>Equip</button>:null}
  </div>;
}

function quickSlotItem(character, items, index) {
  const entry = (Array.isArray(character.quickSlots) ? character.quickSlots : [])[index];
  if (!entry) return null;
  const id = typeof entry === 'string' ? entry : entry.id || entry.itemId;
  return items.find(item => String(item.id) === String(id)) || (typeof entry === 'object' ? entry : null);
}

function InventoryEquipmentPanel({ campaignId, character, items, dragged, editable, run, onDetails, selectedItem }) {
  const drop = (event, slot) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData('application/x-asteria-item');
    if (itemId) run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'equip', itemId, slot }), `Equipped item in ${slot}.`);
  };
  const unequip = item => run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'unequip', itemId: item.id }), `${item.name} unequipped.`);
  const equipSelected=(selected,slot)=>run(()=>firebaseService.updateInventory(campaignId,character.id,{
    type:'equip',itemId:selected.id,slot
  }),`Equipped ${selected.name} in ${slot}.`);
  const assignQuick=(selected,index)=>run(()=>firebaseService.updateInventory(campaignId,character.id,{
    type:'quick',itemId:selected.id,index
  }),`Assigned ${selected.name} to Quick Slot ${index+1}.`);
  const dropQuick = (event, index) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData('application/x-asteria-item');
    if (itemId) run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'quick', itemId, index }), `Assigned Quick Slot ${index + 1}.`);
  };
  return <Panel title="Equipment Slots" className="react-inventory-equipment">
    <h3>Armour</h3>
    <div className="react-inventory-slot-list">{ARMOR_SLOTS.map(([label, aliases]) => <EquipmentSlot key={label} label={label} item={equippedItemForSlot(items, aliases, character.equipment)} dragged={dragged} editable={editable} onDrop={drop} onDetails={onDetails} onUnequip={unequip} selectedItem={selectedItem} onEquipSelected={equipSelected} />)}</div>
    <h3>Weapons</h3>
    <div className="react-inventory-slot-list">{WEAPON_SLOTS.map(([label, aliases]) => <EquipmentSlot key={label} label={label} item={equippedItemForSlot(items, aliases, character.equipment)} dragged={dragged} editable={editable} onDrop={drop} onDetails={onDetails} onUnequip={unequip} selectedItem={selectedItem} onEquipSelected={equipSelected} />)}</div>
    <h3>Quick Items</h3>
    <div className="react-inventory-quick-slots">{[0, 1, 2, 3].map(index => {
      const item = quickSlotItem(character, items, index);
      return <div key={index} className={item ? 'filled' : ''} onDragOver={event => editable && event.preventDefault()} onDrop={event => editable && dropQuick(event, index)} onDoubleClick={() => item && onDetails(item)}>
        <small>Q{index + 1}</small><ItemImage item={item || { name: '?' }} className="react-slot-image" /><b>{item?.name || 'Empty'}</b>
        {item?<button type="button" onClick={()=>onDetails(item)} aria-label={`Inspect quick item ${item.name}`}>Inspect</button>:null}
        {editable&&selectedItem?.id?<button type="button" onClick={()=>assignQuick(selectedItem,index)} aria-label={`Assign ${selectedItem.name} to quick slot ${index+1}`}>Assign</button>:null}
      </div>;
    })}</div>
  </Panel>;
}

function InventoryItemCard({ item, editable, selected, onSelect, onDragStart, onDragEnd, onDetails }) {
  return <article
    draggable={editable}
    onDragStart={event => onDragStart(event, item)}
    onDragEnd={onDragEnd}
    onClick={() => onSelect(item)}
    onDoubleClick={() => onDetails(item)}
    className={`react-inventory-item-card rarity-${String(item.rarity||'common').toLowerCase()} ${item.identified === false ? 'unidentified' : ''} ${selected ? 'selected' : ''}`}
    data-rarity={item.identified === false ? 'Unknown' : item.rarity}
    aria-label={`${item.name}, quantity ${item.qty}, ${item.identified === false ? 'unidentified' : `${item.rarity || 'Common'} item`}`}
    tabIndex="0"
    onKeyDown={event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();onDetails(item);}}}
    style={item.isSpellbook ? { '--item-magic': magicColor(item) } : undefined}
  >
    <span className="react-inventory-quantity" title="Quantity">x{item.qty}</span>
    {item.locked||item.bound||item.questItem?<span className="react-inventory-item-state" title={item.locked?'Locked item':item.bound?'Bound item':'Quest item'}>{item.locked?'Locked':item.bound?'Bound':'Quest'}</span>:null}
    <ItemImage item={item} className="react-inventory-item-image" />
    <b title={item.name}>{item.name}</b>
  </article>;
}

function InventoryQuickActions({campaignId,item,character,characters,storages,ecosystem,editable,busy,onRun,onInspect,onOffer,onSell,onUse,onClear}){
  const party=Object.values(characters||{}).filter(row=>row.id!==character.id);
  const merchants=(ecosystem?.shops||[]).filter(shop=>shop.status==='open'&&
    (!Array.isArray(shop.visitorCharacterIds)||!shop.visitorCharacterIds.length||shop.visitorCharacterIds.includes(character.id)));
  const [recipientId,setRecipientId]=useState(party[0]?.id||'');
  const [storageId,setStorageId]=useState(item?.storageId||storages[0]?.id||'');
  const [equipmentSlot,setEquipmentSlot]=useState('');
  const recipient=party.find(row=>row.id===recipientId)||party[0];
  const storage=storages.find(row=>row.id===storageId)||storages[0];
  const slots=availableInventoryEquipmentSlots(item);
  const selectedSlot=slots.includes(equipmentSlot)?equipmentSlot:slots[0]||'';
  const actions=inventoryQuickActionAvailability(item,{editable,busy,hasStorage:Boolean(storage),hasParty:Boolean(recipient),hasMerchant:merchants.length>0});
  const execute=(type,description,slot='')=>onRun(()=>firebaseService.updateInventory(campaignId,character.id,{
    type,itemId:item.id,...(slot?{slot}:{}),
    ...(type==='move-storage'?{storageId:storage?.id,expectedStorageId:item.storageId,expectedStorageSlot:item.storageSlot}:{}),
    expectedCoreRevision:Number(character.coreRevision||0)
  }),description);
  return <section className="react-inventory-quick-actions" aria-label={'Quick actions for '+item.name}>
    <header><div><small>Selected Item</small><strong>{item.name} ×{item.qty}</strong><span>{item.identified===false?'Unidentified item':(item.equipped?'Equipped':item.type)+' · '+(item.rarity||'Common')}</span></div>
      <button type="button" aria-label="Clear item selection" onClick={onClear}>Close</button></header>
    <div className="react-inventory-action-buttons">
      <button type="button" onClick={()=>onInspect(item)} disabled={!actions.inspect}>Inspect</button>
      <button type="button" onClick={()=>onUse(item)} disabled={!actions.use}>Use</button>
      {item.equipped?<button type="button" onClick={()=>execute('unequip','Unequipped '+item.name+'.')} disabled={!actions.unequip}>Unequip</button>:
        <button type="button" onClick={()=>execute('equip','Equipped '+item.name+'.',selectedSlot)} disabled={!actions.equip}>Equip</button>}
      <button type="button" onClick={()=>execute('move-storage','Moved '+item.name+' into '+storage?.name+'.')} disabled={!actions.store}>Store</button>
      <button type="button" onClick={()=>recipient&&onOffer(recipient,item,'give')} disabled={!actions.give}>Give</button>
      <button type="button" onClick={()=>recipient&&onOffer(recipient,item,'trade')} disabled={!actions.trade}>Trade</button>
      <button type="button" onClick={()=>merchants.length?onSell(item):recipient&&onOffer(recipient,item,'sell')} disabled={!actions.sell}>Sell</button>
    </div>
    <div className="react-inventory-quick-destinations">
      {actions.equip?<label>Equip slot<select aria-label="Quick equip slot" value={selectedSlot} onChange={event=>setEquipmentSlot(event.target.value)}>{slots.map(slot=><option key={slot} value={slot}>{slot}</option>)}</select></label>:null}
      {storages.length?<label>Storage<select aria-label="Quick storage destination" value={storage?.id||''} onChange={event=>setStorageId(event.target.value)}>{storages.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}</select></label>:null}
      {party.length?<label>Player recipient<select aria-label="Quick action recipient" value={recipient?.id||''} onChange={event=>setRecipientId(event.target.value)}>{party.map(row=><option value={row.id} key={row.id}>{row.name||'Party Member'}</option>)}</select></label>:null}
    </div>
    <small className="react-inventory-quick-hint">{!editable?'Start an editable campaign session to change items.':item.equipped?'Unequip before storing or transferring this item.':merchants.length?'Sell opens the current merchant with this item selected.':'Give, trade and player sales require another linked character.'}</small>
  </section>;
}

function StoragePanel({ campaignId, character, storages, activeStorage, setActiveStorage, items, editable, busy, run, onCustom, onDragStart, onDragEnd, onDetails, selectedItemId, onSelectItem, quickActions }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [view, setView] = useState('grid');
  const [newStorage, setNewStorage] = useState('');
  const [newRows, setNewRows] = useState('');
  const [newCols, setNewCols] = useState('');
  const [draggedStorageId, setDraggedStorageId] = useState('');
  const [renameDraft,setRenameDraft]=useState('');
  const [destinationId,setDestinationId]=useState('');
  const [splitQuantity,setSplitQuantity]=useState('');
  const storageLimit = Math.max(3, Number(character.storageLimit || 3), storages.length);
  const storage = storages.find(value => value.id === activeStorage) || storages[0] || null;
  const storedItems = useMemo(() => storage ? items.filter(item => !item.equipped && item.storageId === storage.id) : [], [items, storage]);
  const layout=useMemo(()=>storage ? storageSlotLayout(storedItems,storage,sort) : {slots:[],overflow:[],capacity:0,used:0},[sort,storage,storedItems]);
  const grid=layout.slots;
  React.useEffect(()=>setRenameDraft(storage?.name||''),[storage?.id,storage?.name]);
  const selectedItem=items.find(item=>String(item.id)===String(selectedItemId))||null;
  const destination=storages.find(row=>row.id===destinationId)||storage;
  const splittable=selectedItem&&!selectedItem.equipped&&selectedItem.stackable!==false&&
    selectedItem.unique!==true&&selectedItem.bound!==true&&selectedItem.questItem!==true&&
    Number(selectedItem.maxStack||0)!==1&&Number.isSafeInteger(Number(selectedItem.qty))&&Number(selectedItem.qty)>1;
  const placeSelected=(storageId,slot)=>{
    if(!selectedItem||!storageId||!editable||busy)return;
    run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'move-storage',itemId:selectedItem.id,
      storageId,storageSlot:slot,expectedStorageId:selectedItem.storageId,expectedStorageSlot:selectedItem.storageSlot}),
      'Item moved to the selected slot.');
  };
  const moveSelected=async()=>{
    if(!selectedItem||!destination)return;
    const result=await run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'move-storage',
      itemId:selectedItem.id,storageId:destination.id,expectedStorageId:selectedItem.storageId,
      expectedStorageSlot:selectedItem.storageSlot}),`Moved ${selectedItem.name} to ${destination.name}.`);
    if(result?.ok)setActiveStorage(destination.id);
  };
  const splitSelected=async()=>{
    if(!splittable||!destination||!isManualNumber(splitQuantity,{min:1,max:Number(selectedItem.qty)-1}))return;
    const result=await run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'split-stack',
      itemId:selectedItem.id,quantity:manualNumber(splitQuantity),expectedQuantity:Number(selectedItem.qty),
      storageId:destination.id}),`Stack split into ${destination.name}.`);
    if(result?.ok){setSplitQuantity('');setActiveStorage(destination.id);onSelectItem({id:result.itemId});}
  };
  const renameStorage=async()=>{
    if(!storage||!renameDraft.trim())return;
    await run(()=>firebaseService.updateInventory(campaignId,character.id,{
      type:'rename-storage',storageId:storage.id,name:renameDraft.trim()}),'Container renamed.');
  };
  const storageIds = useMemo(() => new Set(storages.map(value => value.id)), [storages]);
  const unassignedItems = items.filter(item => !item.equipped && !storageIds.has(item.storageId));
  const totalWeight = items.reduce((total,item)=>total+Number(item.weight||0)*Number(item.qty||1),0);
  const carryCapacity = Number(character.carryCapacity ?? character.maxCarryWeight ?? character.encumbrance?.maximum ?? 0);
  const matches = item => matchesInventoryFilter(item,query,categoryFilter);
  const createStorage = async () => {
    if(!isManualNumber(newRows,{min:1,max:20})||!isManualNumber(newCols,{min:1,max:20}))return;
    const result = await run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'create-storage', name: newStorage, rows:manualNumber(newRows), cols:manualNumber(newCols) }), 'Storage created.');
    if (result?.ok) { setNewStorage('');setNewRows('');setNewCols(''); }
  };
  const reorderStorage = (sourceId, targetId) => {
    if(!sourceId || !targetId || sourceId === targetId) return;
    const storageIds = storages.map(value => value.id).filter(value => value !== sourceId);
    storageIds.splice(storageIds.indexOf(targetId), 0, sourceId);
    run(() => firebaseService.updateInventory(campaignId, character.id, { type:'reorder-storages', storageIds }), 'Storage order updated.');
  };
  const nudgeStorage = (storageId, direction) => {
    const index = storages.findIndex(value => value.id === storageId);
    const target = storages[index + direction];
    if(target) reorderStorage(storageId, target.id);
  };
  return <Panel title="Inventory / Storage" action={<StatusPill>{items.filter(item => !item.equipped).length} items</StatusPill>} className="react-inventory-storage">
    <nav className="react-storage-tabs" aria-label="Character storage">
      {Array.from({ length:storageLimit }, (_, index) => {
        const record = storages[index];
        return record ? <div key={record.id} className={`react-storage-tab ${draggedStorageId===record.id?'dragging':''}`} draggable={editable} onDragStart={event=>{setDraggedStorageId(record.id);event.dataTransfer.setData('application/x-asteria-storage',record.id);}} onDragEnd={()=>setDraggedStorageId('')}><button type="button" className={storage?.id === record.id ? 'active' : ''} onClick={() => setActiveStorage(record.id)} onDragOver={event => editable && event.preventDefault()} onDrop={event => {
          if (!editable) return;
          event.preventDefault();
          const storageSource = event.dataTransfer.getData('application/x-asteria-storage');
          if(storageSource){reorderStorage(storageSource,record.id);return;}
          const itemId = event.dataTransfer.getData('application/x-asteria-item');
          if (itemId) run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'move-storage', itemId, storageId: record.id }), `Moved item to ${record.name}.`);
        }}><span>{record.name || `Storage ${index + 1}`}</span><small>{items.filter(item => !item.equipped && item.storageId === record.id).length}</small></button><span className="react-storage-tab-order"><button type="button" aria-label={`Move ${record.name} left`} disabled={!editable||index===0} onClick={()=>nudgeStorage(record.id,-1)}>&lt;</button><button type="button" aria-label={`Move ${record.name} right`} disabled={!editable||index===storages.length-1} onClick={()=>nudgeStorage(record.id,1)}>&gt;</button></span></div>
          : <button key={`empty-storage-${index}`} type="button" className="empty" disabled={!editable || busy} onClick={() => setActiveStorage('')}><span>Empty Storage Slot</span><small>+</small></button>;
      })}
    </nav>
    {storage ? <div className="react-storage-rename">
      <label>Container name<input aria-label="Container name" value={renameDraft} disabled={!editable||busy} maxLength={80} onChange={event=>setRenameDraft(event.target.value)}/></label>
      <button type="button" disabled={!editable||busy||!renameDraft.trim()||renameDraft.trim()===storage.name} onClick={renameStorage}>Rename</button>
    </div> : null}
    {quickActions}
    {storage ? <>
      <div className="react-inventory-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Search items..." label="Search inventory" />
        <FilterControl label="Category" value={categoryFilter} onChange={setCategoryFilter}>{INVENTORY_CATEGORIES.map(category=><option key={category.id} value={category.id}>{category.label}</option>)}</FilterControl>
        <FilterControl label="Sort" value={sort} onChange={setSort}><option value="name">Sort: Name</option><option value="rarity">Sort: Rarity</option><option value="quantity">Sort: Quantity</option></FilterControl>
        <div className="react-inventory-view-controls" role="group" aria-label="Inventory view"><Tooltip label="Grid view"><IconButton label="Grid view" className={view==='grid'?'active':''} onClick={()=>setView('grid')}><AsteriaIcon name="grid"/></IconButton></Tooltip><Tooltip label="List view"><IconButton label="List view" className={view==='list'?'active':''} onClick={()=>setView('list')}><AsteriaIcon name="list"/></IconButton></Tooltip></div>
        <button type="button" disabled={!editable} onClick={onCustom}>Add Item</button>
      </div>
      <div className="react-storage-grid-meta"><span>{storage.rows} rows x {storage.cols} columns</span><span>{storedItems.length} / {layout.capacity} item stacks</span>{layout.used>=layout.capacity?<StatusPill tone="warning">{layout.overflow.length ? layout.overflow.length+' overflow' : 'Full'}</StatusPill>:null}<span>{carryCapacity?`${totalWeight.toLocaleString()} / ${carryCapacity.toLocaleString()} weight`:`${totalWeight.toLocaleString()} weight recorded`}</span>{carryCapacity&&totalWeight>carryCapacity?<StatusPill tone="warning">Encumbered</StatusPill>:null}</div>
      <div className="react-inventory-grid-scroll"><div className={`react-inventory-item-grid ${view}`} style={{ '--storage-cols':storage.cols }}>
        {grid.map((item, slot) => <div
        key={slot}
        className={`react-storage-cell ${item ? 'filled' : ''} ${item && !matches(item) ? 'filtered-out' : ''}`}
        data-slot={slot + 1}
        onDragOver={event => editable && event.preventDefault()}
        onDrop={event => {
          if (!editable) return;
          event.preventDefault();
          const itemId = event.dataTransfer.getData('application/x-asteria-item');
          if (itemId) run(() => firebaseService.updateInventory(campaignId, character.id, { type:'move-storage', itemId, storageId:storage.id, storageSlot:slot }), `Moved item to ${storage.name}, slot ${slot + 1}.`);
        }}
        >{item ? <>
          <InventoryItemCard item={item} editable={editable} selected={String(item.id) === String(selectedItemId)} onSelect={onSelectItem} onDragStart={onDragStart} onDragEnd={onDragEnd} onDetails={onDetails} />
          {selectedItem && selectedItem.id!==item.id && editable?<button type="button" className="react-storage-swap-target" disabled={busy} aria-label={'Swap '+selectedItem.name+' with '+item.name} onClick={()=>placeSelected(storage.id,slot)}>Swap</button>:null}
        </> : selectedItem && editable ? <button type="button" className="react-storage-place-target" disabled={busy} aria-label={'Move '+selectedItem.name+' to slot '+(slot+1)} onClick={()=>placeSelected(storage.id,slot)}>{slot+1}<span>Place</span></button> : <small>{slot + 1}</small>}</div>)}
      </div></div>
      {layout.overflow.length ? <section className="react-storage-overflow" aria-label="Overflowed inventory items">
        <p className="react-storage-warning" role="alert">{layout.overflow.length} item stack{layout.overflow.length===1?' is':'s are'} beyond this container's capacity. No items have been removed. Select an item and move it to another container.</p>
        <div className="react-storage-overflow-items">{layout.overflow.map(item=><InventoryItemCard key={item.id} item={item} editable={editable} selected={String(item.id)===String(selectedItemId)} onSelect={onSelectItem} onDragStart={onDragStart} onDragEnd={onDragEnd} onDetails={onDetails}/>)}</div>
      </section>:null}
    </> : <EmptyState title="No storage container equipped">Create a bag, pouch, chest, or other container in one of the available storage slots.</EmptyState>}
    {unassignedItems.length ? <section className="react-storage-overflow" aria-label="Items without a container">
      <p className="react-storage-warning">{unassignedItems.length} item stack{unassignedItems.length===1?' has':'s have'} no available container. These items remain in the inventory record and can be moved once space is available.</p>
      <div className="react-storage-overflow-items">{unassignedItems.map(item=><InventoryItemCard key={item.id} item={item} editable={editable} selected={String(item.id)===String(selectedItemId)} onSelect={onSelectItem} onDragStart={onDragStart} onDragEnd={onDragEnd} onDetails={onDetails}/>)}</div>
    </section> : null}
    {selectedItem && !selectedItem.equipped ? <div className="react-storage-item-actions" aria-label="Selected item storage actions">
      <b title={selectedItem.name}>{selectedItem.name} ×{selectedItem.qty}</b>
      <label>Destination<select value={destination?.id||''} disabled={!editable||busy} onChange={event=>setDestinationId(event.target.value)}>{storages.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <button type="button" disabled={!editable||busy||!destination} onClick={moveSelected}>Move</button>
      {splittable?<><label>Split quantity<ManualNumberInput min="1" max={Number(selectedItem.qty)-1} disabled={!editable||busy} value={splitQuantity} onChange={event=>setSplitQuantity(event.target.value)}/></label>
      <button type="button" disabled={!editable||busy||!destination||!isManualNumber(splitQuantity,{min:1,max:Number(selectedItem.qty)-1})} onClick={splitSelected}>Split Stack</button></>:null}
      <small>Tap an empty slot to place this item, or tap Swap on an occupied slot.</small>
    </div>:null}
    {storages.length < storageLimit ? <div className="react-create-storage"><input disabled={!editable || busy} value={newStorage} onChange={event => setNewStorage(event.target.value)} placeholder="Bag or container name" /><label>Rows<ManualNumberInput min="1" max="20" disabled={!editable || busy} value={newRows} onChange={event => setNewRows(event.target.value)}/></label><label>Columns<ManualNumberInput min="1" max="20" disabled={!editable || busy} value={newCols} onChange={event => setNewCols(event.target.value)}/></label><button disabled={!editable || busy || !newStorage.trim() || !isManualNumber(newRows,{min:1,max:20}) || !isManualNumber(newCols,{min:1,max:20})} onClick={createStorage}>Create Container</button></div> : null}
  </Panel>;
}

function InventorySupportPanel({ character, items, storages }) {
  const storedItems=items.filter(item=>!item.equipped);
  const totalWeight=items.reduce((total,item)=>total+Number(item.weight||item.raw?.weight||0)*Number(item.qty||1),0);
  const carryCapacity=Number(character.carryCapacity??character.maxCarryWeight??character.encumbrance?.maximum??0);
  const slotCapacity=storages.reduce((total,storage)=>total+Number(storage.maxSlots||0),0);
  const unidentified=storedItems.filter(item=>item.identified===false).length;
  const storageLimit=Math.max(3,Number(character.storageLimit||3));
  const weightPercent=carryCapacity?Math.min(100,(totalWeight/carryCapacity)*100):0;
  const resaleValue=storedItems.reduce((total,item)=>total+getInventoryResaleValue(item,item.qty),0);
  return <Panel title="Inventory Info" className="react-inventory-support">
    <div className="react-inventory-support-stat"><span>Carry Weight</span><strong>{totalWeight.toLocaleString()} {carryCapacity?`/ ${carryCapacity.toLocaleString()}`:''}</strong>{carryCapacity?<i><span style={{width:`${weightPercent}%`}}/></i>:null}</div>
    <div className="react-inventory-support-stat"><span>Item Slots</span><strong>{storedItems.length} / {slotCapacity||0}</strong></div>
    <div className="react-inventory-support-stat"><span>Storage Containers</span><strong>{storages.length} / {storageLimit}</strong></div>
    <div className="react-inventory-support-stat"><span>Unidentified Items</span><strong>{unidentified}</strong></div>
    <div className="react-inventory-support-stat"><span>Potential Resale</span><strong>{formatMarks(resaleValue)}</strong></div>
    <div className="react-inventory-support-list"><small>Default Delivery</small><b>{storages[0]?.name||'Create a storage container'}</b><p>New items fill containers from left to right. Drag storage tabs to change that order.</p></div>
    {carryCapacity&&totalWeight>carryCapacity?<StatusPill tone="warning">Encumbered</StatusPill>:null}
  </Panel>;
}

function PartyPortrait({ member, active, editable, onClick, onDrop }) {
  const [failed, setFailed] = useState(false);
  const source = member.image || member.portrait || member.characterImage || member.appearance?.image || member.appearance?.portrait || '';
  React.useEffect(() => setFailed(false), [source]);
  return <button
    type="button"
    className={`react-party-bubble ${active ? 'active' : ''}`}
    title={`Open item actions for ${member.name}`}
    aria-expanded={active}
    disabled={!editable}
    onClick={onClick}
    onDragOver={event => editable && event.preventDefault()}
    onDrop={onDrop}
  >
    <span className="react-party-portrait">{source && !failed ? <img src={source} alt={`${member.name || 'Party member'} portrait`} onError={() => setFailed(true)} /> : <b>{String(member.name || '?').charAt(0)}</b>}<i /></span>
    <span className="react-party-bubble-copy"><b>{member.name}</b><small>{member.klass || member.class || 'Adventurer'} | L{Number(member.level||0)}</small><small>HP {Array.isArray(member.hp)?`${member.hp[0]}/${member.hp[1]}`:'-'}</small></span>
  </button>;
}

function PartyActionBubble({ member, items, selectedItemId, onSelectItem, onAction, onClose }) {
  const hasItems = items.length > 0;
  const selectedItem = items.find(item => String(item.id) === String(selectedItemId));
  return <aside className="react-party-speech" role="dialog" aria-label={`Item actions for ${member.name}`}>
    <button type="button" className="react-party-speech-close" aria-label="Close party actions" onClick={onClose}>X</button>
    <p>Send an item to <b>{member.name}</b></p>
    <select value={selectedItemId} onChange={event => onSelectItem(event.target.value)} disabled={!hasItems}>
      {!hasItems ? <option value="">No available items</option> : null}
      {items.map(item => <option key={item.id} value={item.id}>{item.name} x{item.qty}</option>)}
    </select>
    <div>{[['trade', 'Trade'], ['sell', 'Sell'], ['give', 'Give'], ['identify', 'Identify']].map(([mode, label]) => <button key={mode} type="button" disabled={!selectedItemId || (mode === 'identify' && selectedItem?.identified !== false)} title={mode === 'identify' && selectedItem?.identified !== false ? 'Choose an unidentified item' : `${label} ${selectedItem?.name || 'item'}`} onClick={() => onAction(mode)}>{label}</button>)}</div>
  </aside>;
}

function PartyInventoryPanel({ character, characters, items, editable, dragged, onOffer }) {
  const members = useMemo(() => Object.values(characters || {}).filter(value => value.id !== character.id), [character.id, characters]);
  const availableItems = useMemo(() => items.filter(item => !item.equipped && !item.locked && !item.bound && !item.questItem && Number(item.qty || 0) > 0), [items]);
  const [activeMemberId, setActiveMemberId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const openFor = member => {
    setActiveMemberId(current => current === member.id ? '' : member.id);
    setSelectedItemId(current => availableItems.some(item => item.id === current) ? current : availableItems[0]?.id || '');
  };
  return <aside className="react-inventory-party" aria-label="Party item actions">
    <h2>Party</h2>
    <div className="react-player-bubbles">{members.map(member => <div className="react-party-bubble-row" key={member.id}>
      <PartyPortrait member={member} active={activeMemberId === member.id} editable={editable} onClick={() => openFor(member)} onDrop={event => {
        if (!editable || !dragged) return;
        event.preventDefault();
        setSelectedItemId(dragged.id);
        setActiveMemberId(member.id);
      }} />
      {activeMemberId === member.id ? <PartyActionBubble member={member} items={availableItems} selectedItemId={selectedItemId} onSelectItem={setSelectedItemId} onAction={mode => {
        const item = availableItems.find(value => value.id === selectedItemId);
        if (item) onOffer(member, item, mode);
        setActiveMemberId('');
      }} onClose={() => setActiveMemberId('')} /> : null}
    </div>)}</div>
    {!members.length ? <span className="react-party-empty" title="No other party members">-</span> : null}
  </aside>;
}

export function InventoryWorkspace({ campaignId, character, characters, ecosystem, editable, events=[], partyLoot={} }) {
  const [selectedStorage, setSelectedStorage] = useState('');
  const [details, setDetails] = useState(null);
  const [dragged, setDragged] = useState(null);
  const [offer, setOffer] = useState(null);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [mobileView,setMobileView]=useState('inventory');
  const [selectedItemId,setSelectedItemId]=useState('');
  const [pendingUse,setPendingUse]=useState(null);
  const [saleRequest,setSaleRequest]=useState(null);
  const [activityOpen,setActivityOpen]=useState(false);
  const [activityCategory,setActivityCategory]=useState('all');
  const [activitySearch,setActivitySearch]=useState('');
  const [activityNotice,setActivityNotice]=useState('');
  const seenActivityRef=useRef(null);
  const activity=useMemo(()=>inventoryActivityRecords(character,events,100),[character,events]);
  const visibleActivity=useMemo(()=>filterInventoryActivityRecords(activity,{category:activityCategory,query:activitySearch}),[activity,activityCategory,activitySearch]);
  useEffect(()=>{
    seenActivityRef.current=null;
    setActivityNotice('');setActivityOpen(false);
    setActivityCategory('all');setActivitySearch('');
  },[campaignId,character.id]);
  useEffect(()=>{
    const delta=inventoryActivityDelta(seenActivityRef.current,activity);
    seenActivityRef.current=delta.ids;
    if(delta.added.length)setActivityNotice(delta.added.length===1?delta.added[0].title:delta.added.length+' new inventory updates');
  },[activity]);
  const storages = normalizeCharacterStorages(character);
  const activeStorage = storages.some(value => value.id === selectedStorage) ? selectedStorage : storages[0]?.id || '';
  const items = inventoryItems(character);
  const selectedItem=items.find(row=>String(row.id)===String(selectedItemId))||null;
  const run = async (operation, success) => {
    if(busy)return {ok:false,error:'An inventory action is still processing.'};
    setBusy(true);
    try{
      const result=await operation();
      setMessage(resultText(result,success));
      return result;
    }catch(error){
      const result={ok:false,error:error?.message||'The inventory action could not be completed.'};
      setMessage(result.error);
      return result;
    }finally{
      setBusy(false);
    }
  };
  return <div className="react-inventory-workspace">
    <div className="react-inventory-mobile-feedback" role="status" aria-live="polite">
      <div className="react-inventory-mobile-feedback-copy">
        <strong>{busy?'Processing inventory action':message?'Inventory update':activityNotice?'New activity':'Inventory controls'}</strong>
        <span>{busy?'Your action is being verified.':message||activityNotice||'Tap an item to select it, then use its action buttons. Drag-and-drop is optional.'}</span>
      </div>
      <button type="button" aria-expanded={activityOpen} aria-controls="react-inventory-activity" onClick={()=>{setActivityOpen(v=>!v);setActivityNotice('');}}>{activityOpen?'Hide Activity':'Activity ('+activity.length+')'}</button>
    </div>
    {activityOpen?<section id="react-inventory-activity" className="react-inventory-activity" aria-label="Inventory and trade journal">
      <h3>Inventory &amp; Trade Journal</h3>
      <p className="react-inventory-journal-help">Recent transactions for this character, including merchant purchases, player exchanges, shared stash transfers, currency changes and treasure claims.</p>
      <div className="react-inventory-journal-controls">
        <label>Category<select value={activityCategory} onChange={event=>setActivityCategory(event.target.value)}>
          {INVENTORY_ACTIVITY_CATEGORIES.map(category=><option key={category.id} value={category.id}>{category.label}</option>)}
        </select></label>
        <label>Search history<input type="search" maxLength="120" value={activitySearch}
          onChange={event=>setActivitySearch(event.target.value)} placeholder="Search an item or transaction"/></label>
      </div>
      <small>Showing {visibleActivity.length} of {activity.length} recent entries.</small>
      {visibleActivity.map(row=><p key={row.id}>
        <span><b>{INVENTORY_ACTIVITY_CATEGORIES.find(category=>category.id===row.category)?.label||'Inventory'}</b> · {row.title}</span>
        {row.at?<time dateTime={new Date(row.at).toISOString()}>{new Date(row.at).toLocaleString()}</time>:null}
      </p>)}
      {!visibleActivity.length?<p>{activity.length?'No transactions match these filters.':'No recent inventory or currency activity.'}</p>:null}
      <small>History is read-only and reflects available recent character activity; it is not a complete accounting export. See News / Events / History for other notifications.</small>
    </section>:null}
    <div className="react-inventory-mobile-tabs"><Tabs tabs={[{id:'support',label:'Info',icon:'info'},{id:'equipment',label:'Equipment',icon:'equipment'},{id:'inventory',label:'Inventory',icon:'inventory'},{id:'party',label:'Party',icon:'party'},{id:'shops',label:'Shops',icon:'store'},{id:'party-loot',label:'Party Loot',icon:'inventory'}]} active={mobileView} onChange={setMobileView} ariaLabel="Mobile inventory sections" /></div>
    <div className={`react-inventory-layout mobile-${mobileView}`}>
      <InventorySupportPanel character={character} items={items} storages={storages}/>
      <InventoryEquipmentPanel campaignId={campaignId} character={character} items={items} dragged={dragged} editable={editable} run={run} selectedItem={selectedItem} onDetails={item=>{if(item?.id)setSelectedItemId(item.id);setDetails(item);}} />
      <StoragePanel campaignId={campaignId} character={character} storages={storages} activeStorage={activeStorage} setActiveStorage={setSelectedStorage} items={items} editable={editable} busy={busy} run={run} onCustom={() => setCustom(true)} onDragStart={(event, item) => { setDragged(item); event.dataTransfer.setData('application/x-asteria-item', item.id); }} onDragEnd={() => setDragged(null)} onDetails={setDetails} selectedItemId={selectedItemId} onSelectItem={item => setSelectedItemId(item.id)} quickActions={selectedItem?<InventoryQuickActions key={selectedItem.id} campaignId={campaignId} item={selectedItem} character={character} characters={characters} storages={storages} ecosystem={ecosystem} editable={editable} busy={busy} onRun={run} onInspect={setDetails} onOffer={(target,item,mode)=>setOffer({target,item,mode})} onSell={item=>{setSaleRequest({itemId:item.id,token:Date.now()});setMobileView('shops');}} onUse={setPendingUse} onClear={()=>setSelectedItemId('')}/>:null} />
      <PartyInventoryPanel character={character} characters={characters} items={items} editable={editable} dragged={dragged} onOffer={(target, item, mode) => setOffer({ target, item, mode })} />

      {campaignId?<div className="react-inventory-merchants"><ShopWorkspace campaignId={campaignId} character={character} ecosystem={ecosystem} editable={editable} requestedSale={saleRequest}/></div>:null}
      {campaignId?<PlayerItemLoreWorkspace campaignId={campaignId} character={character}/>:null}
      {campaignId?<div className="react-inventory-party-loot"><PartyLootPlayerPanel campaignId={campaignId} character={character} partyLoot={partyLoot} editable={editable}/></div>:null}
    </div>
    <p className="react-action-message" role="status" aria-live="polite">{message}</p>
    {pendingUse?<Modal title={'Use '+pendingUse.name+'?'} eyebrow="Inventory Quick Action" busy={busy} onClose={()=>setPendingUse(null)} footer={<div className="react-modal-actions"><button type="button" disabled={busy} onClick={()=>setPendingUse(null)}>Cancel</button><button type="button" className="primary" disabled={!editable||busy||!items.some(row=>row.id===pendingUse.id&&Number(row.qty)>0)} onClick={async()=>{const result=await run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'use',itemId:pendingUse.id,expectedCoreRevision:Number(character.coreRevision||0)}),'Used '+pendingUse.name+'.');if(result?.ok)setPendingUse(null);}}>Confirm Use</button></div>}><p>Use one {pendingUse.name}. This may consume an item and update your character's resources.</p></Modal>:null}
    {details ? <ItemDetailModal campaignId={campaignId} character={character} item={details} editable={editable} onClose={() => setDetails(null)} onAction={() => setDetails(null)} /> : null}
    {offer ? <SendPlayerItemModal key={`${offer.target.id}-${offer.item.id}-${offer.mode}`} campaignId={campaignId} character={character} target={offer.target} item={offer.item} mode={offer.mode} editable={editable} onClose={() => { setOffer(null); setDragged(null); }} /> : null}
    {custom ? <CustomItemModal campaignId={campaignId} character={character} storageId={activeStorage} onClose={() => setCustom(false)} /> : null}
  </div>;
}
