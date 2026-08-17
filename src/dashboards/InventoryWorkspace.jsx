import React, { useMemo, useState } from 'react';
import { EmptyState, Modal, Panel, StatusPill, Tabs } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { characterKnowsIdentify, normalizeCharacterStorages } from '../state/liveWorkspaceModel.mjs';
import { inventoryItems } from './characterWorkspaceData.js';

const ARMOR_SLOTS = [
  ['Head', ['Head', 'Helmet']],
  ['Neck', ['Neck', 'Amulet']],
  ['Shoulders', ['Shoulders']],
  ['Chest', ['Chest', 'Chest Armor', 'Torso']],
  ['Back', ['Back', 'Cloak']],
  ['Hands', ['Hands', 'Gloves']],
  ['Waist', ['Waist', 'Belt']],
  ['Legs', ['Legs', 'Leg Armor']],
  ['Feet', ['Feet', 'Boots']]
];

const WEAPON_SLOTS = [
  ['Main Weapon', ['Main Weapon', 'Main Hand']],
  ['Secondary Weapon', ['Secondary Weapon', 'Ranged Weapon']],
  ['Off Weapon', ['Off Weapon', 'Off Hand']],
  ['Shield', ['Shield']],
  ['Quiver', ['Quiver', 'Ammunition']]
];

function resultText(result, success = 'Saved.') {
  return result?.ok ? success : result?.error || 'That action could not be completed.';
}

function itemDetails(item) {
  return item?.identified === false
    ? { description: '???', effects: ['???'], rarity: 'Unknown', value: '???' }
    : {
        description: item?.raw?.description || item?.raw?.summary || item?.raw?.desc || 'Information coming soon.',
        effects: item?.raw?.effects || item?.raw?.effect || [],
        rarity: item?.rarity,
        value: item?.value
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

function ItemDetailModal({ campaignId, character, item, editable, onClose, onAction }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!item) return null;
  const detail = itemDetails(item);
  const effects = Array.isArray(detail.effects) ? detail.effects : detail.effects ? [detail.effects] : [];
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
      {item.identified === false ? <button
        className="primary"
        disabled={!editable || !characterKnowsIdentify(character)}
        title={characterKnowsIdentify(character) ? 'Cast Identify' : 'This character does not know Identify'}
        onClick={() => run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'identify', itemId: item.id }), 'Item identified.')}
      >Identify</button> : null}
      {item.isSpellbook && item.identified !== false ? <button
        className="primary"
        disabled={!editable}
        onClick={() => run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'read-spellbook', itemId: item.id }), `Learned ${item.spell?.name || item.trueName}.`)}
      >Read &amp; Learn</button> : null}
      <button onClick={onClose}>Close</button>
    </div>}
  >
    <div className="react-item-detail">
      <ItemImage item={item} className="react-item-detail-image" />
      <div><StatusPill>{detail.rarity}</StatusPill><p>{detail.description}</p><dl>
        <div><dt>Type</dt><dd>{item.identified === false ? '???' : item.type}</dd></div>
        <div><dt>Value</dt><dd>{detail.value}</dd></div>
        <div><dt>Quantity</dt><dd>{item.qty}</dd></div>
      </dl></div>
    </div>
    {effects.length ? <><h3>Effects</h3><ul>{effects.map((effect, index) => <li key={index}>{typeof effect === 'object' ? effect.description || effect.name || JSON.stringify(effect) : effect}</li>)}</ul></> : null}
    <p>{message}</p>
  </Modal>;
}

function CustomItemModal({ campaignId, character, storageId, onClose }) {
  const [form, setForm] = useState({ name: '', type: 'Item', itemClass: 'Common', description: '', value: 0, isSpellbook: false, spellName: '', element: '', identified: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true);
    const item = { ...form, spell: form.isSpellbook ? { name: form.spellName || form.name, element: form.element, rank: 'Rank I' } : null, basicName: form.isSpellbook ? 'Book' : form.type || 'Item' };
    const created = await firebaseService.createCustomItem(campaignId, item);
    if (created?.ok) {
      const added = await firebaseService.updateInventory(campaignId, character.id, { type: 'add-item', item: created.item, storageId });
      setMessage(resultText(added, 'Custom item added to the shared catalog and this inventory.'));
    } else setMessage(resultText(created));
    setBusy(false);
  };
  return <Modal title="Create Custom Item" eyebrow="Shared Item Catalog" busy={busy} onClose={onClose} footer={<><button onClick={onClose}>Close</button><button className="primary" disabled={busy || !form.name.trim()} onClick={save}>Create Item</button></>}>
    <div className="react-form-grid">
      <label>Name<input value={form.name} onChange={event => set('name', event.target.value)} /></label>
      <label>Type<input value={form.type} onChange={event => set('type', event.target.value)} /></label>
      <label>Item Class<select value={form.itemClass} onChange={event => set('itemClass', event.target.value)}>{['Common', 'Uncommon', 'Unusual', 'Rare', 'Epic', 'Mythic', 'Legendary', 'Relic'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Value in Copper<input type="number" min="0" value={form.value} onChange={event => set('value', Number(event.target.value || 0))} /></label>
    </div>
    <label>Description<textarea rows="5" value={form.description} onChange={event => set('description', event.target.value)} /></label>
    <label className="react-check-row"><input type="checkbox" checked={form.isSpellbook} onChange={event => set('isSpellbook', event.target.checked)} />This item is a spellbook</label>
    {form.isSpellbook ? <div className="react-form-grid"><label>Spell Name<input value={form.spellName} onChange={event => set('spellName', event.target.value)} /></label><label>Element<input value={form.element} onChange={event => set('element', event.target.value)} /></label></div> : null}
    <p>{message}</p>
  </Modal>;
}

function ItemOfferModal({ campaignId, character, target, item, initialMode = 'give', editable, onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [price, setPrice] = useState(Math.max(0, Number(item?.value || 0)));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!target || !item) return null;
  const send = async () => {
    setBusy(true);
    const result = await firebaseService.createItemOffer(campaignId, character.id, target.id, item.id, mode, { priceCopper: price, note, quantity: 1 });
    setMessage(resultText(result, `${mode === 'identify' ? 'Identify request' : 'Item offer'} sent to ${target.name}.`));
    setBusy(false);
    if (result?.ok) window.setTimeout(onClose, 500);
  };
  return <Modal title={`${item.name} to ${target.name}`} eyebrow="Player Item Action" busy={busy} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!editable || busy} onClick={send}>Send Request</button></>}>
    <div className="react-segmented-actions">{[['trade', 'Trade'], ['sell', 'Sell'], ['give', 'Give'], ['identify', 'Identify']].map(([id, label]) => <button className={mode === id ? 'active' : ''} key={id} onClick={() => setMode(id)}>{label}</button>)}</div>
    {mode === 'sell' ? <label>Sale Price in Copper<input type="number" min="0" value={price} onChange={event => setPrice(Number(event.target.value || 0))} /></label> : null}
    <label>Message<textarea rows="4" value={note} onChange={event => setNote(event.target.value)} /></label>
    <p>{message}</p>
  </Modal>;
}

function IncomingOffers({ campaignId, character, characters, ecosystem, editable }) {
  const offers = (ecosystem.directTrades || []).filter(value => value.toCharacterId === character.id && value.status === 'pending' && value.id?.startsWith('offer-'));
  const exchangeItems = inventoryItems(character).filter(item => !item.equipped && !item.locked && !item.bound && !item.questItem);
  const [exchange, setExchange] = useState('');
  const [revealed, setRevealed] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const respond = async (offer, accepted) => {
    setBusy(true);
    const result = await firebaseService.respondItemOffer(campaignId, character.id, offer.id, accepted, { exchangeItemId: exchange });
    setMessage(resultText(result, accepted ? 'Offer accepted.' : 'Offer declined.'));
    if (result?.revealedItem) setRevealed(result.revealedItem);
    setBusy(false);
  };
  return <Panel title="Incoming Requests" action={<StatusPill>{offers.length} pending</StatusPill>}>
    <div className="react-offer-list">{offers.map(offer => <article key={offer.id}>
      <b>{offer.mode.toUpperCase()}: {offer.item?.name || 'Item'}</b>
      <small>From {characters[offer.fromCharacterId]?.name || 'Party Member'}</small>
      {offer.note ? <p>{offer.note}</p> : null}
      {offer.mode === 'sell' ? <strong>{Number(offer.priceCopper || 0).toLocaleString()} copper</strong> : null}
      {offer.mode === 'trade' ? <select value={exchange} onChange={event => setExchange(event.target.value)}><option value="">Choose your offered item</option>{exchangeItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : null}
      {offer.mode === 'identify' && !characterKnowsIdentify(character) ? <small className="react-warning">Identify spell required</small> : null}
      <div><button disabled={!editable || busy} onClick={() => respond(offer, false)}>Reject</button><button className="primary" disabled={!editable || busy || (offer.mode === 'trade' && !exchange) || (offer.mode === 'identify' && !characterKnowsIdentify(character))} onClick={() => respond(offer, true)}>Accept</button></div>
    </article>)}{!offers.length ? <EmptyState title="No incoming item requests" /> : null}</div>
    <p>{message}</p>
    {revealed ? <ItemDetailModal campaignId={campaignId} character={character} item={{ ...revealed, identified: true }} editable={false} onClose={() => setRevealed(null)} /> : null}
  </Panel>;
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

function EquipmentSlot({ label, item, editable, onDrop, onDetails, onUnequip }) {
  return <div
    className={`react-inventory-slot ${item ? 'filled' : ''}`}
    onDragOver={event => editable && event.preventDefault()}
    onDrop={event => editable && onDrop(event, label)}
    onDoubleClick={() => item && onDetails(item)}
  >
    <ItemImage item={item || { name: label }} className="react-slot-image" />
    <span><small>{label}</small><b>{item?.name || 'Empty'}</b></span>
    {item && !item.readOnlyEquipment ? <button type="button" title={`Unequip ${item.name}`} aria-label={`Unequip ${item.name}`} disabled={!editable} onClick={event => { event.stopPropagation(); onUnequip(item); }}>X</button> : null}
  </div>;
}

function quickSlotItem(character, items, index) {
  const entry = (Array.isArray(character.quickSlots) ? character.quickSlots : [])[index];
  if (!entry) return null;
  const id = typeof entry === 'string' ? entry : entry.id || entry.itemId;
  return items.find(item => String(item.id) === String(id)) || (typeof entry === 'object' ? entry : null);
}

function InventoryEquipmentPanel({ campaignId, character, items, editable, run, onDetails }) {
  const drop = (event, slot) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData('application/x-asteria-item');
    if (itemId) run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'equip', itemId, slot }), `Equipped item in ${slot}.`);
  };
  const unequip = item => run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'unequip', itemId: item.id }), `${item.name} unequipped.`);
  const dropQuick = (event, index) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData('application/x-asteria-item');
    if (itemId) run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'quick', itemId, index }), `Assigned Quick Slot ${index + 1}.`);
  };
  return <Panel title="Equipment Slots" className="react-inventory-equipment">
    <h3>Armor</h3>
    <div className="react-inventory-slot-list">{ARMOR_SLOTS.map(([label, aliases]) => <EquipmentSlot key={label} label={label} item={equippedItemForSlot(items, aliases, character.equipment)} editable={editable} onDrop={drop} onDetails={onDetails} onUnequip={unequip} />)}</div>
    <h3>Weapons</h3>
    <div className="react-inventory-slot-list">{WEAPON_SLOTS.map(([label, aliases]) => <EquipmentSlot key={label} label={label} item={equippedItemForSlot(items, aliases, character.equipment)} editable={editable} onDrop={drop} onDetails={onDetails} onUnequip={unequip} />)}</div>
    <h3>Quick Items</h3>
    <div className="react-inventory-quick-slots">{[0, 1, 2, 3].map(index => {
      const item = quickSlotItem(character, items, index);
      return <div key={index} className={item ? 'filled' : ''} onDragOver={event => editable && event.preventDefault()} onDrop={event => editable && dropQuick(event, index)} onDoubleClick={() => item && onDetails(item)}>
        <small>Q{index + 1}</small><ItemImage item={item || { name: '?' }} className="react-slot-image" /><b>{item?.name || 'Empty'}</b>
      </div>;
    })}</div>
  </Panel>;
}

function InventoryItemCard({ item, editable, onDragStart, onDragEnd, onDetails }) {
  return <article
    draggable={editable}
    onDragStart={event => onDragStart(event, item)}
    onDragEnd={onDragEnd}
    onDoubleClick={() => onDetails(item)}
    className={`react-inventory-item-card ${item.identified === false ? 'unidentified' : ''}`}
    style={item.isSpellbook ? { '--item-magic': magicColor(item) } : undefined}
  >
    <span className="react-inventory-quantity">x{item.qty}</span>
    <ItemImage item={item} className="react-inventory-item-image" />
    <b>{item.name}</b>
    <small>{item.identified === false ? 'Unknown' : item.rarity}</small>
  </article>;
}

function storageGrid(items, storage, sort) {
  const capacity = Math.max(1, Number(storage?.maxSlots || Number(storage?.rows || 4) * Number(storage?.cols || 4)));
  const slots = Array(capacity).fill(null);
  const unplaced = [];
  items.forEach(item => {
    const slot = Number(item.storageSlot);
    if (Number.isInteger(slot) && slot >= 0 && slot < capacity && !slots[slot]) slots[slot] = item;
    else unplaced.push(item);
  });
  unplaced.sort((left, right) => sort === 'rarity'
    ? String(left.rarity).localeCompare(String(right.rarity)) || String(left.name).localeCompare(String(right.name))
    : sort === 'quantity'
      ? Number(right.qty || 0) - Number(left.qty || 0)
      : String(left.name).localeCompare(String(right.name)));
  let cursor = 0;
  unplaced.forEach(item => {
    while (cursor < capacity && slots[cursor]) cursor += 1;
    if (cursor < capacity) slots[cursor] = item;
  });
  return slots;
}

function StoragePanel({ campaignId, character, storages, activeStorage, setActiveStorage, items, editable, busy, run, onCustom, onDragStart, onDragEnd, onDetails }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [newStorage, setNewStorage] = useState('');
  const [newRows, setNewRows] = useState(4);
  const [newCols, setNewCols] = useState(4);
  const storage = storages.find(value => value.id === activeStorage) || storages[0] || { rows:4, cols:4, maxSlots:16 };
  const storedItems = useMemo(() => items.filter(item => !item.equipped && item.storageId === activeStorage), [activeStorage, items]);
  const grid = useMemo(() => storageGrid(storedItems, storage, sort), [sort, storage, storedItems]);
  const matches = item => !query.trim() || `${item.name} ${item.type} ${item.rarity}`.toLowerCase().includes(query.trim().toLowerCase());
  const createStorage = async () => {
    const result = await run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'create-storage', name: newStorage, rows:newRows, cols:newCols }), 'Storage created.');
    if (result?.ok) setNewStorage('');
  };
  return <Panel title="Inventory / Storage" action={<StatusPill>{items.filter(item => !item.equipped).length} items</StatusPill>} className="react-inventory-storage">
    <nav className="react-storage-tabs" aria-label="Character storage">
      {storages.map((storage, index) => <button key={storage.id} type="button" className={activeStorage === storage.id ? 'active' : ''} onClick={() => setActiveStorage(storage.id)} onDragOver={event => editable && event.preventDefault()} onDrop={event => {
        if (!editable) return;
        event.preventDefault();
        const itemId = event.dataTransfer.getData('application/x-asteria-item');
        if (itemId) run(() => firebaseService.updateInventory(campaignId, character.id, { type: 'move-storage', itemId, storageId: storage.id }), `Moved item to ${storage.name}.`);
      }}><span>{storage.name || `Storage ${index + 1}`}</span><small>{items.filter(item => !item.equipped && item.storageId === storage.id).length}</small></button>)}
    </nav>
    <div className="react-inventory-toolbar">
      <label><span className="visually-hidden">Search inventory</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search items..." /></label>
      <select aria-label="Sort inventory" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Sort: Name</option><option value="rarity">Sort: Rarity</option><option value="quantity">Sort: Quantity</option></select>
      <button type="button" disabled={!editable} onClick={onCustom}>Add Item</button>
    </div>
    <div className="react-storage-grid-meta"><span>{storage.rows} rows x {storage.cols} columns</span><span>{storedItems.length} / {storage.maxSlots} slots used</span></div>
    <div className="react-inventory-grid-scroll"><div className="react-inventory-item-grid" style={{ '--storage-cols':storage.cols }}>
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
      >{item ? <InventoryItemCard item={item} editable={editable} onDragStart={onDragStart} onDragEnd={onDragEnd} onDetails={onDetails} /> : <small>{slot + 1}</small>}</div>)}
    </div>
    </div>
    {storages.length < Number(character.storageLimit || 3) ? <div className="react-create-storage"><input disabled={!editable || busy} value={newStorage} onChange={event => setNewStorage(event.target.value)} placeholder="New storage name" /><label>Rows<input type="number" min="1" max="20" disabled={!editable || busy} value={newRows} onChange={event => setNewRows(Math.max(1,Math.min(20,Number(event.target.value||1))))}/></label><label>Columns<input type="number" min="1" max="20" disabled={!editable || busy} value={newCols} onChange={event => setNewCols(Math.max(1,Math.min(20,Number(event.target.value||1))))}/></label><button disabled={!editable || busy || !newStorage.trim()} onClick={createStorage}>Create Storage</button></div> : null}
  </Panel>;
}

function PartyPortrait({ member, active, editable, onClick, onDrop }) {
  const [failed, setFailed] = useState(false);
  const source = member.image || member.portrait || member.characterImage || '';
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
    <span className="react-party-portrait">{source && !failed ? <img src={source} alt="" onError={() => setFailed(true)} /> : <b>{String(member.name || '?').charAt(0)}</b>}<i /></span>
    <span><b>{member.name}</b><small>{member.klass || member.class || 'Adventurer'}</small></span>
  </button>;
}

function PartyActionBubble({ member, items, selectedItemId, onSelectItem, onAction, onClose }) {
  const hasItems = items.length > 0;
  return <aside className="react-party-speech" role="dialog" aria-label={`Item actions for ${member.name}`}>
    <button type="button" className="react-party-speech-close" aria-label="Close party actions" onClick={onClose}>X</button>
    <p>Send an item to <b>{member.name}</b></p>
    <select value={selectedItemId} onChange={event => onSelectItem(event.target.value)} disabled={!hasItems}>
      {!hasItems ? <option value="">No available items</option> : null}
      {items.map(item => <option key={item.id} value={item.id}>{item.name} x{item.qty}</option>)}
    </select>
    <div>{[['trade', 'Trade'], ['sell', 'Sell'], ['give', 'Give'], ['identify', 'Identify']].map(([mode, label]) => <button key={mode} type="button" disabled={!selectedItemId} onClick={() => onAction(mode)}>{label}</button>)}</div>
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
  return <Panel title="Party" action={<StatusPill>{members.length + 1}</StatusPill>} className="react-inventory-party">
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
    {!members.length ? <EmptyState title="No other party members" /> : <p className="react-help">Select a portrait for Trade, Sell, Give, or Identify. Dragging an item onto a portrait also opens these actions.</p>}
  </Panel>;
}

export function InventoryWorkspace({ campaignId, character, characters, ecosystem, editable }) {
  const [view, setView] = useState('inventory');
  const [selectedStorage, setSelectedStorage] = useState('');
  const [details, setDetails] = useState(null);
  const [dragged, setDragged] = useState(null);
  const [offer, setOffer] = useState(null);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const storages = normalizeCharacterStorages(character);
  const activeStorage = storages.some(value => value.id === selectedStorage) ? selectedStorage : storages[0]?.id || '';
  const items = inventoryItems(character);
  const run = async (operation, success) => {
    setBusy(true);
    const result = await operation();
    setMessage(resultText(result, success));
    setBusy(false);
    return result;
  };
  const tabs = [
    { id: 'inventory', label: 'Inventory', icon: '[]' },
    { id: 'shops', label: 'Shops', icon: '$' },
    { id: 'requests', label: 'Player Requests', icon: '<>' }
  ];
  return <div className="react-inventory-workspace">
    <Tabs tabs={tabs} active={view} onChange={setView} ariaLabel="Inventory menu" />
    {view === 'inventory' ? <div className="react-inventory-layout">
      <InventoryEquipmentPanel campaignId={campaignId} character={character} items={items} editable={editable} run={run} onDetails={setDetails} />
      <StoragePanel campaignId={campaignId} character={character} storages={storages} activeStorage={activeStorage} setActiveStorage={setSelectedStorage} items={items} editable={editable} busy={busy} run={run} onCustom={() => setCustom(true)} onDragStart={(event, item) => { setDragged(item); event.dataTransfer.setData('application/x-asteria-item', item.id); }} onDragEnd={() => setDragged(null)} onDetails={setDetails} />
      <PartyInventoryPanel character={character} characters={characters} items={items} editable={editable} dragged={dragged} onOffer={(target, item, mode) => setOffer({ target, item, mode })} />
    </div> : null}
    {view === 'shops' ? <Panel title="Campaign Shops"><div className="react-shop-stock">{(ecosystem.shops || []).filter(shop => shop.status === 'open' && (!(shop.visitorCharacterIds || []).length || shop.visitorCharacterIds.includes(character.id))).flatMap(shop => (shop.stock || []).map((stock, index) => <article key={`${shop.id}-${index}`}><b>{stock.item?.name || 'Item'}</b><small>{shop.name} | {stock.qty} available</small><strong>{Number(stock.priceCopper || 0).toLocaleString()} copper</strong><button disabled={!editable || busy || Number(stock.qty || 0) < 1} onClick={() => run(() => firebaseService.buyShopItem(campaignId, character.id, shop.id, index, 1), 'Purchase completed.')}>Buy</button></article>))}{!(ecosystem.shops || []).some(shop => shop.status === 'open') ? <EmptyState title="No shops are open" /> : null}</div></Panel> : null}
    {view === 'requests' ? <IncomingOffers campaignId={campaignId} character={character} characters={characters} ecosystem={ecosystem} editable={editable} /> : null}
    <p className="react-action-message">{message}</p>
    {details ? <ItemDetailModal campaignId={campaignId} character={character} item={details} editable={editable} onClose={() => setDetails(null)} onAction={() => setDetails(null)} /> : null}
    {offer ? <ItemOfferModal key={`${offer.target.id}-${offer.item.id}-${offer.mode}`} campaignId={campaignId} character={character} target={offer.target} item={offer.item} initialMode={offer.mode} editable={editable} onClose={() => { setOffer(null); setDragged(null); }} /> : null}
    {custom ? <CustomItemModal campaignId={campaignId} character={character} storageId={activeStorage} onClose={() => setCustom(false)} /> : null}
  </div>;
}
