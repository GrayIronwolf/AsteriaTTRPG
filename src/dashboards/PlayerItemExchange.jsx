import React, { useEffect, useMemo, useState } from 'react';
import { EmptyState, Modal, StatusPill } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { characterKnowsIdentify, normalizeCharacterStorages } from '../state/liveWorkspaceModel.mjs';
import { inventoryItems } from './characterWorkspaceData.js';

const ACTIONS = {
  trade: { label:'Trade', eyebrow:'Player Trade', action:'Send Trade Request', description:'Offer this item and let the other player choose an item to exchange.' },
  sell: { label:'Sell', eyebrow:'Player Sale', action:'Send Sale Offer', description:'Set a price. The buyer pays when they accept the item.' },
  give: { label:'Give', eyebrow:'Player Gift', action:'Send Item', description:'Give this item to another linked character without requesting payment.' },
  identify: { label:'Identify', eyebrow:'Identification Request', action:'Request Identification', description:'Ask a character who knows Identify to reveal this item.' }
};

function resultMessage(result, success) {
  return result?.ok ? success : result?.error || 'That request could not be completed.';
}

function characterImage(character = {}) {
  return character.image || character.portrait || character.characterImage || character.appearance?.image || character.appearance?.portrait || '';
}

function currencyTotal(character = {}) {
  const coins = character.coins || character.coinPouch || {};
  const values = [['royal_platinum',10000000000],['royal_crown',100000000],['platinum_crown',1000000],['gold',10000],['silver',100],['copper',1]];
  return values.reduce((sum, [key, multiplier]) => {
    const title = key.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    return sum + Number(coins[key] ?? coins[key.replaceAll('_', ' ')] ?? coins[title] ?? 0) * multiplier;
  }, 0);
}

export function itemRequestRecords(ecosystem = {}) {
  const records = [...(Array.isArray(ecosystem.playerItemRequests) ? ecosystem.playerItemRequests : [])];
  (Array.isArray(ecosystem.directTrades) ? ecosystem.directTrades : [])
    .filter(value => String(value.id || '').startsWith('offer-'))
    .forEach(value => { if(!records.some(record => String(record.id) === String(value.id))) records.push(value); });
  return records.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

function CharacterIdentity({ character, direction }) {
  const [failed, setFailed] = useState(false);
  const source = characterImage(character);
  useEffect(() => setFailed(false), [source]);
  return <div className="react-exchange-character">
    <div className="react-exchange-portrait">{source && !failed ? <img src={source} alt={`${character.name || 'Character'} portrait`} onError={() => setFailed(true)} /> : <b>{String(character.name || '?').charAt(0)}</b>}</div>
    <small>{direction}</small>
    <strong>{character.name || 'Party Member'}</strong>
    <span>{character.klass || character.class || 'Adventurer'}</span>
  </div>;
}

function ExchangeItem({ item, quantity, caption = '' }) {
  const [failed, setFailed] = useState(false);
  const source = item?.image || item?.raw?.image || '';
  useEffect(() => setFailed(false), [source]);
  return <article className={`react-exchange-item ${item?.identified === false ? 'unidentified' : ''}`}>
    <div>{source && !failed ? <img src={source} alt="" onError={() => setFailed(true)} /> : <b>{String(item?.name || '?').charAt(0)}</b>}</div>
    <span><strong>{item?.name || 'Unknown Item'}</strong><small>{caption || item?.type || 'Inventory Item'}</small></span>
    <StatusPill>{item?.identified === false ? 'Unknown' : item?.rarity || item?.itemClass || 'Common'}</StatusPill>
    <b className="react-exchange-quantity">x{Math.max(1, Number(quantity || item?.qty || 1))}</b>
  </article>;
}

export function SendPlayerItemModal({ campaignId, character, target, item, mode = 'give', editable, onClose }) {
  const action = ACTIONS[mode] || ACTIONS.give;
  const maximum = mode === 'identify' ? 1 : Math.max(1, Number(item?.qty || 1));
  const [quantity, setQuantity] = useState(1);
  const [priceCopper, setPriceCopper] = useState(Math.max(0, Number(item?.value || 0)));
  const [requestedItem, setRequestedItem] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if(!target || !item) return null;
  const invalidIdentify = mode === 'identify' && item.identified !== false;
  const send = async () => {
    setBusy(true);
    setMessage('Sending request...');
    const result = await firebaseService.createItemRequest(campaignId, character.id, target.id, item.id, mode, { quantity, priceCopper, requestedItem, note });
    setMessage(resultMessage(result, `${action.label} request sent to ${target.name}.`));
    setBusy(false);
    if(result?.ok) window.setTimeout(onClose, 650);
  };
  return <Modal title={`${action.label}: ${item.name}`} eyebrow={action.eyebrow} busy={busy} onClose={onClose} footer={<div className="react-modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!editable || busy || invalidIdentify} onClick={send}>{action.action}</button></div>}>
    <div className="react-exchange-route"><CharacterIdentity character={character} direction="From" /><span aria-hidden="true">&gt;</span><CharacterIdentity character={target} direction="To" /></div>
    <p className="react-exchange-description">{action.description}</p>
    <ExchangeItem item={item} quantity={quantity} />
    {mode !== 'identify' ? <label>Quantity<input type="number" min="1" max={maximum} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(maximum, Number(event.target.value || 1))))} /></label> : null}
    {mode === 'sell' ? <label>Price in Copper<input type="number" min="0" value={priceCopper} onChange={event => setPriceCopper(Math.max(0, Number(event.target.value || 0)))} /></label> : null}
    {mode === 'trade' ? <label>Requested Item or Terms<input value={requestedItem} onChange={event => setRequestedItem(event.target.value)} placeholder="Optional, for example: healing potion or similar value" /></label> : null}
    <label>Message<textarea rows="3" value={note} onChange={event => setNote(event.target.value)} placeholder="Optional message for the other player" /></label>
    {invalidIdentify ? <p className="react-warning">This item is already identified.</p> : null}
    <p className="react-action-message" role="status">{message}</p>
  </Modal>;
}

function IncomingRequestModal({ campaignId, character, sender, request, editable, onDismiss }) {
  const action = ACTIONS[request.mode] || ACTIONS.give;
  const storages = normalizeCharacterStorages(character);
  const exchangeItems = inventoryItems(character).filter(item => !item.equipped && !item.locked && !item.bound && !item.questItem && Number(item.qty || 0) > 0);
  const [storageId, setStorageId] = useState(storages[0]?.id || '');
  const [exchangeItemId, setExchangeItemId] = useState(exchangeItems[0]?.id || '');
  const selectedExchange = exchangeItems.find(item => String(item.id) === String(exchangeItemId));
  const [exchangeQuantity, setExchangeQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState(null);
  const needsStorage = request.mode !== 'identify';
  const canIdentify = characterKnowsIdentify(character);
  const insufficientFunds = request.mode === 'sell' && currencyTotal(character) < Number(request.priceCopper || 0);
  const respond = async accepted => {
    setBusy(true);
    setMessage(accepted ? 'Completing transaction...' : 'Declining request...');
    const result = await firebaseService.respondItemRequest(campaignId, character.id, request.id, accepted, { storageId, exchangeItemId, exchangeQuantity });
    setMessage(resultMessage(result, result?.awaitingSender ? 'Your offer is ready for the other player\'s final confirmation.' : accepted ? `${action.label} completed.` : 'Request declined.'));
    setBusy(false);
    if(result?.revealedItem) setRevealed(result.revealedItem);
    else if(result?.ok) onDismiss();
  };
  if(revealed) return <Modal title={revealed.name || 'Item Identified'} eyebrow="Identification Complete" onClose={onDismiss} footer={<button className="primary" onClick={onDismiss}>Done</button>}><ExchangeItem item={{...revealed, identified:true}} quantity={1} /><p>{revealed.raw?.description || revealed.description || 'The item has been identified and updated in the owner\'s inventory.'}</p></Modal>;
  const acceptDisabled = !editable || busy || (needsStorage && !storages.length) || (request.mode === 'trade' && !exchangeItemId) || (request.mode === 'identify' && !canIdentify) || insufficientFunds;
  return <Modal title={`${action.label} Request`} eyebrow="New Player Item Request" busy={busy} onClose={onDismiss} footer={<div className="react-modal-actions"><button disabled={!editable || busy} onClick={() => respond(false)}>Decline</button><button className="primary" disabled={acceptDisabled} onClick={() => respond(true)}>{request.mode === 'sell' ? 'Buy Item' : request.mode === 'identify' ? 'Identify Item' : request.mode === 'trade' ? 'Confirm Exchange' : 'Accept Item'}</button></div>}>
    <div className="react-exchange-route"><CharacterIdentity character={sender || {name:request.fromCharacterName}} direction="From" /><span aria-hidden="true">&gt;</span><CharacterIdentity character={character} direction="To" /></div>
    <ExchangeItem item={request.item} quantity={request.quantity} caption={`${action.label} offer`} />
    {request.note ? <blockquote>{request.note}</blockquote> : null}
    {request.mode === 'sell' ? <div className="react-exchange-price"><span>Sale price</span><strong>{Number(request.priceCopper || 0).toLocaleString()} Copper</strong><small>Your available currency: {currencyTotal(character).toLocaleString()} Copper equivalent</small></div> : null}
    {request.mode === 'trade' ? <div className="react-trade-response"><p><b>Requested terms:</b> {request.requestedItem || 'Choose an item you consider a fair exchange.'}</p><label>Your Item<select value={exchangeItemId} onChange={event => { setExchangeItemId(event.target.value); setExchangeQuantity(1); }}><option value="">Choose an item</option>{exchangeItems.map(item => <option key={item.id} value={item.id}>{item.name} x{item.qty}</option>)}</select></label>{selectedExchange ? <><label>Quantity<input type="number" min="1" max={Math.max(1, Number(selectedExchange.qty || 1))} value={exchangeQuantity} onChange={event => setExchangeQuantity(Math.max(1, Math.min(Number(selectedExchange.qty || 1), Number(event.target.value || 1))))} /></label><ExchangeItem item={selectedExchange} quantity={exchangeQuantity} caption="Your exchange" /></> : null}</div> : null}
    {needsStorage ? <label>Receive Into<select value={storageId} disabled={!storages.length} onChange={event => setStorageId(event.target.value)}>{!storages.length ? <option value="">Create a storage container first</option> : null}{storages.map(storage => <option key={storage.id} value={storage.id}>{storage.name}</option>)}</select></label> : null}
    {request.mode === 'identify' && !canIdentify ? <p className="react-warning">This character does not know the Identify spell.</p> : null}
    {insufficientFunds ? <p className="react-warning">You do not have enough currency for this purchase.</p> : null}
    {!editable ? <p className="react-warning">The GM must start the live session before this request can be resolved.</p> : null}
    <p className="react-action-message" role="status">{message}</p>
  </Modal>;
}

function RequestResultModal({ campaignId, character, recipient, request, onDone }) {
  const action = ACTIONS[request.mode] || ACTIONS.give;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const acknowledge = async () => {
    setBusy(true);
    const result = await firebaseService.acknowledgeItemRequest(campaignId, character.id, request.id);
    setMessage(resultMessage(result, 'Result acknowledged.'));
    setBusy(false);
    if(result?.ok) onDone();
  };
  const accepted = request.status === 'accepted';
  const awaitingSender = request.status === 'awaiting-sender';
  const finalize = async acceptedTrade => {
    setBusy(true);
    const result = await firebaseService.finalizeItemTrade(campaignId, character.id, request.id, acceptedTrade);
    setMessage(resultMessage(result, acceptedTrade ? 'Trade completed.' : 'Trade declined and both items returned.'));
    setBusy(false);
    if(result?.ok) onDone();
  };
  if(awaitingSender) return <Modal title="Final Trade Confirmation" eyebrow="Both Players Must Confirm" busy={busy} onClose={onDone} footer={<div className="react-modal-actions"><button className="danger" disabled={busy} onClick={()=>finalize(false)}>Decline &amp; Return Items</button><button className="primary" disabled={busy} onClick={()=>finalize(true)}>Confirm Final Trade</button></div>}>
    <p><b>{recipient?.name || request.toCharacterName || 'The other player'}</b> has selected their exchange item. Review both offers before committing the atomic transfer.</p>
    <div className="react-final-trade-grid"><section><small>Your Offer</small><ExchangeItem item={request.item} quantity={request.quantity}/></section><section><small>Their Offer</small><ExchangeItem item={request.exchangeItem} quantity={request.exchangeItem?.qty}/></section></div>
    <p className="react-action-message" role="status">{message}</p>
  </Modal>;
  return <Modal title={`${action.label} ${accepted ? 'Completed' : request.status === 'cancelled' ? 'Cancelled' : 'Declined'}`} eyebrow="Player Item Update" busy={busy} onClose={acknowledge} footer={<button className="primary" disabled={busy} onClick={acknowledge}>Continue</button>}>
    <div className="react-exchange-result"><StatusPill tone={accepted ? 'success' : 'warning'}>{String(request.status || 'updated').toUpperCase()}</StatusPill><h3>{request.item?.name || 'Item Request'}</h3><p>{recipient?.name || request.toCharacterName || 'The other player'} {accepted ? `accepted your ${action.label.toLowerCase()} request.` : `did not accept your ${action.label.toLowerCase()} request.`}</p>
      {request.resolution?.exchangeItem ? <p>You received <b>{request.resolution.exchangeItem.name} x{request.resolution.exchangeItem.qty}</b>.</p> : null}
      {request.resolution?.revealedItem ? <p>The item was identified as <b>{request.resolution.revealedItem.name}</b>.</p> : null}
      {request.mode === 'sell' && accepted ? <p>Payment received: <b>{Number(request.resolution?.priceCopper || request.priceCopper || 0).toLocaleString()} Copper</b>.</p> : null}
    </div>
    <p className="react-action-message" role="status">{message}</p>
  </Modal>;
}

function RecipientResultModal({ campaignId, character, sender, request, onDone }) {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const acknowledge=async()=>{setBusy(true);const result=await firebaseService.acknowledgeRecipientItemUpdate(campaignId,character.id,request.id);setMessage(resultMessage(result,'Update acknowledged.'));setBusy(false);if(result?.ok)onDone();};
  const accepted=request.status==='accepted';
  return <Modal title={`Trade ${accepted?'Completed':'Declined'}`} eyebrow="Player Item Update" busy={busy} onClose={acknowledge} footer={<button className="primary" disabled={busy} onClick={acknowledge}>Continue</button>}><StatusPill tone={accepted?'success':'warning'}>{String(request.status).toUpperCase()}</StatusPill><p>{sender?.name||request.fromCharacterName||'The other player'} {accepted?'confirmed the final exchange. Your item has been placed in the first available storage slot.':'declined the final exchange. Your offered item has been returned to your inventory.'}</p>{accepted?<ExchangeItem item={request.item} quantity={request.quantity} caption="Item received"/>:null}<p className="react-action-message">{message}</p></Modal>;
}

function SentRequestsModal({ campaignId, character, characters, requests, editable, onClose, onOpen }) {
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const cancel = async request => {
    setBusyId(request.id);
    const result = await firebaseService.cancelItemRequest(campaignId, character.id, request.id);
    setMessage(resultMessage(result, 'Request cancelled and escrowed item returned.'));
    setBusyId('');
  };
  return <Modal title="Sent Item Requests" eyebrow="Player Exchange History" onClose={onClose} footer={<button onClick={onClose}>Close</button>}>
    <div className="react-request-history">{requests.map(request => <article key={request.id}><ExchangeItem item={request.item} quantity={request.quantity} caption={(ACTIONS[request.mode] || ACTIONS.give).label} /><div><small>To {characters[request.toCharacterId]?.name || request.toCharacterName || 'Party Member'}</small><StatusPill tone={request.status === 'accepted' ? 'success' : request.status === 'pending' ? 'info' : 'warning'}>{request.status || 'pending'}</StatusPill></div><div>{request.status === 'pending' ? <button disabled={!editable || Boolean(busyId)} onClick={() => cancel(request)}>Cancel Request</button> : request.senderNotice !== 'acknowledged' ? <button className="primary" onClick={() => onOpen(request.id)}>View Result</button> : null}</div></article>)}{!requests.length ? <EmptyState title="No sent item requests" /> : null}</div>
    <p className="react-action-message" role="status">{message}</p>
  </Modal>;
}

export function PlayerItemRequestCenter({ campaignId, character, characters, ecosystem, editable }) {
  const requests = useMemo(() => itemRequestRecords(ecosystem), [ecosystem]);
  const incoming = requests.filter(request => String(request.toCharacterId) === String(character.id) && request.status === 'pending');
  const sent = requests.filter(request => String(request.fromCharacterId) === String(character.id));
  const updates = sent.filter(request => request.status !== 'pending' && request.senderNotice !== 'acknowledged');
  const recipientUpdates = requests.filter(request => String(request.toCharacterId) === String(character.id) && ['accepted','declined','cancelled'].includes(request.status) && request.recipientNotice === 'unread');
  const [activeId, setActiveId] = useState('');
  const [dismissed, setDismissed] = useState(() => new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    setActiveId('');
    setDismissed(new Set());
    setHistoryOpen(false);
  }, [character.id]);
  useEffect(() => {
    if(activeId) return;
    const next = incoming.find(request => !dismissed.has(request.id)) || recipientUpdates.find(request => !dismissed.has(request.id)) || updates.find(request => !dismissed.has(request.id));
    if(next) setActiveId(next.id);
  }, [activeId, dismissed, incoming, recipientUpdates, updates]);
  const active = requests.find(request => String(request.id) === String(activeId));
  const dismiss = () => {
    if(activeId) setDismissed(current => new Set([...current, activeId]));
    setActiveId('');
  };
  // Keep the center mounted while a recipient is viewing a completed Identify
  // result; otherwise the live request update would discard the reveal state.
  if(!incoming.length && !sent.length && !active) return null;
  return <>
    <div className="react-item-request-dock" aria-live="polite">
      {incoming.length ? <button className="primary" onClick={() => { setHistoryOpen(false); setActiveId(incoming[0].id); }}><span>{incoming.length}</span> Incoming Item Request{incoming.length === 1 ? '' : 's'}</button> : null}
      {updates.length ? <button onClick={() => { setHistoryOpen(false); setActiveId(updates[0].id); }}><span>{updates.length}</span> Item Update{updates.length === 1 ? '' : 's'}</button> : null}
      {recipientUpdates.length ? <button onClick={() => { setHistoryOpen(false); setActiveId(recipientUpdates[0].id); }}><span>{recipientUpdates.length}</span> Received Update{recipientUpdates.length === 1 ? '' : 's'}</button> : null}
      {sent.length ? <button onClick={() => setHistoryOpen(true)}>Sent Requests</button> : null}
    </div>
    {active && active.status === 'pending' && String(active.toCharacterId) === String(character.id) ? <IncomingRequestModal campaignId={campaignId} character={character} sender={characters[active.fromCharacterId]} request={active} editable={editable} onDismiss={dismiss} /> : null}
    {active && recipientUpdates.some(request=>request.id===active.id) ? <RecipientResultModal campaignId={campaignId} character={character} sender={characters[active.fromCharacterId]} request={active} onDone={dismiss}/> : null}
    {active && active.status !== 'pending' && String(active.fromCharacterId) === String(character.id) ? <RequestResultModal campaignId={campaignId} character={character} recipient={characters[active.toCharacterId]} request={active} onDone={dismiss} /> : null}
    {historyOpen ? <SentRequestsModal campaignId={campaignId} character={character} characters={characters} requests={sent} editable={editable} onClose={() => setHistoryOpen(false)} onOpen={requestId => { setHistoryOpen(false); setActiveId(requestId); }} /> : null}
  </>;
}
