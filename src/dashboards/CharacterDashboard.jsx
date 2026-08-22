import React, { useEffect, useRef, useState } from 'react';
import { AsteriaAppShell, DashboardNavigation, Modal, StatusPill } from '../components/WorkspaceUI.jsx';
import { DashboardInformationRow } from '../components/DashboardInformation.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { pendingLootEvent, pendingMagicRewardEvent, xpNoticeEvent } from '../state/liveEventReducer.mjs';
import { characterKnowsIdentify, normalizeCharacterStorages } from '../state/liveWorkspaceModel.mjs';
import { useCampaignLiveData } from '../sessions/useCampaignLiveData.js';
import { mirrorCharacterSnapshot } from '../app/legacyBridge.js';
import { DashboardSettingsTab, GalleryTab } from './CharacterGallerySettings.jsx';
import { InventoryWorkspace } from './InventoryWorkspace.jsx';
import { PlayerItemRequestCenter } from './PlayerItemExchange.jsx';
import { PlayerDashboardOverview } from './PlayerDashboardOverview.jsx';
import {
  ActivityLog,
  CharacterTab,
  JournalTab,
  PartyTab,
  QuestTab,
  SessionGate,
  SkillsTab,
  SpellsTab,
  TalentsTab
} from './CharacterWorkspaceTabs.jsx';

const CHARACTER_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'character', label: 'Character', icon: 'character' },
  { id: 'talents', label: 'Class/Talent Tree', icon: 'talents' },
  { id: 'skills', label: 'Skills', icon: 'skills' },
  { id: 'spells', label: 'Spells', icon: 'spells' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory' },
  { id: 'quest', label: 'Quest', icon: 'quest' },
  { id: 'journal', label: 'Journal', icon: 'journal' },
  { id: 'party', label: 'Party', icon: 'party' },
  { id: 'gallery', label: 'Gallery', icon: 'gallery' },
  { id: 'settings', label: 'Dashboard Settings', icon: 'settings' }
];

function values(value) { return Array.isArray(value) ? value : []; }

function LootModal({ campaignId, character, event, editable, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const reward = values(character.pendingItemRewards).find(item => String(item.id) === String(event.id)) || {
    id: event.id,
    campaignId: event.campaignId,
    campaignName: event.payload?.campaignName,
    item: event.payload?.item,
    message: event.payload?.message,
    status: 'pending'
  };
  const slots = window.AsteriaInventory?.inferSlots?.(reward.item) || [];
  const [slot, setSlot] = useState(slots[0] || '');
  const storages=normalizeCharacterStorages(character);
  const [storageId,setStorageId]=useState(storages[0]?.id||'');
  const resolve = async action => {
    setBusy(true);
    const result = await firebaseService.resolveLoot(campaignId, character.id, reward, action, action==='equip'?slot:storageId);
    setBusy(false);
    setMessage(result?.ok?'Reward resolved.':result?.error||'The reward could not be resolved.');
    if(result?.ok) onResolved?.();
  };
  const identify=async()=>{setBusy(true);const result=await firebaseService.identifyLootReward(campaignId,character.id,reward.id);setMessage(result?.ok?'Item identified.':result?.error||'The item could not be identified.');setBusy(false);};
  const unknown=reward.item?.identified===false;
  return <Modal title={reward.item?.name || 'Loot Reward'} eyebrow={reward.campaignName || 'Campaign Reward'} busy={busy} onClose={() => {}} footer={<div className="react-modal-actions"><button disabled={!editable || busy} onClick={() => resolve('declined')}>Decline</button>{unknown?<button disabled={!editable||busy||!characterKnowsIdentify(character)} title={characterKnowsIdentify(character)?'Cast Identify':'Identify spell required'} onClick={identify}>Identify</button>:null}<button className="primary" disabled={!editable || busy || !storages.length} title={storages.length?'Add this reward to storage':'Create a storage container first'} onClick={() => resolve('inventory')}>Add to Storage</button>{slots.length ? <button className="primary" disabled={!editable || busy} onClick={() => resolve('equip')}>Equip</button> : null}</div>}>
    <div className="react-loot-hero">{reward.item?.image ? <img src={reward.item.image} alt="" /> : <span>{String(reward.item?.name || '?').charAt(0)}</span>}<div><p>{reward.message || 'The GM awarded an item.'}</p><StatusPill>{unknown?'Unknown':reward.item?.itemClass || 'Common'}</StatusPill><p>Quantity {Number(reward.item?.qty || 1)}</p><p>{unknown?'Description: ???':reward.item?.description||reward.item?.summary||'Information coming soon.'}</p></div></div>
    <label>Inventory Storage<select disabled={!storages.length} value={storageId} onChange={event=>setStorageId(event.target.value)}>{!storages.length?<option value="">Create a storage container first</option>:null}{storages.map(storage=><option key={storage.id} value={storage.id}>{storage.name}</option>)}</select></label>
    {slots.length ? <label>Equipment slot<select value={slot} onChange={event => setSlot(event.target.value)}>{slots.map(value => <option key={value}>{value}</option>)}</select></label> : null}
    <p>{message}</p>
  </Modal>;
}

function XPModal({ event, onClose }) {
  return <Modal title="XP Received" eyebrow="Campaign Progression" onClose={onClose} footer={<button className="primary" onClick={onClose}>Continue</button>}><div className="react-xp-reward"><strong>+{Number(event.payload?.amount || 0).toLocaleString()} XP</strong><p>{event.payload?.reason || 'Campaign reward'}</p>{event.payload?.leveled ? <StatusPill tone="success">Level {event.payload?.toLevel}</StatusPill> : null}</div></Modal>;
}

function MagicRewardModal({ campaignId, character, event, onResolved }) {
  const [busy, setBusy] = useState(false);
  const magicType = event.payload?.magicType || 'Unknown Magic';
  const info = window.ASTERIA_MAGIC_LIBRARY?.all?.find(item => item.name === magicType) || {};
  const respond = async accepted => {
    setBusy(true);
    const result = await firebaseService.respondMagicReward(campaignId, character.id, event.id, accepted);
    setBusy(false);
    if(result?.ok) onResolved?.();
  };
  return <Modal title={magicType} eyebrow="New Magical Element" busy={busy} onClose={() => {}} footer={<div className="react-modal-actions"><button disabled={busy} onClick={() => respond(false)}>Decline</button><button className="primary" disabled={busy} onClick={() => respond(true)}>Accept Element</button></div>}>
    <div className="react-magic-reward" style={{ '--magic-color':info.color || '#26d9ff' }}><span>{String(info.label || magicType).charAt(0)}</span><div><h3>{magicType}</h3><p>{event.payload?.message || 'The GM granted access to a new magical element.'}</p><p>{info.description || 'Accepting adds this element to the character as a GM-granted affinity.'}</p></div></div>
  </Modal>;
}

export function CharacterDashboard({ campaignId, characterId }) {
  const live = useCampaignLiveData(campaignId, { mode: 'character', characterId });
  const [tab, setTab] = useState('dashboard');
  const [acknowledged, setAcknowledged] = useState(() => new Set());
  const processedLoot = useRef(new Set());
  const processedMagic = useRef(new Set());
  const character = live.character;
  useEffect(()=>{
    const openTab=event=>{if(CHARACTER_TABS.some(tabRecord=>tabRecord.id===event.detail?.tab))setTab(event.detail.tab);};
    window.addEventListener('asteria:open-character-tab',openTab);
    return()=>window.removeEventListener('asteria:open-character-tab',openTab);
  },[]);
  useEffect(() => {
    mirrorCharacterSnapshot(character);
  }, [character]);
  const xpEvent = xpNoticeEvent(live.events.filter(event => !event.targetCharacterId || event.targetCharacterId === characterId), acknowledged);
  const lootEvent = pendingLootEvent(live.events.filter(event => (!event.targetCharacterId || event.targetCharacterId === characterId) && !processedLoot.current.has(event.id)));
  const magicEvent = pendingMagicRewardEvent(live.events.filter(event => (!event.targetCharacterId || event.targetCharacterId === characterId) && !processedMagic.current.has(event.id)));
  const closeXP = async () => {
    if(!xpEvent) return;
    setAcknowledged(previous => new Set([...previous, xpEvent.id]));
    await firebaseService.acknowledgeEvent(campaignId, xpEvent.id, { status: 'acknowledged' }).catch(() => {});
  };
  const resolvedLoot = () => { if(lootEvent) processedLoot.current.add(lootEvent.id); };
  const resolvedMagic = () => { if(magicEvent) processedMagic.current.add(magicEvent.id); };
  if(live.loading || !character) return <div className="react-route-state">Connecting Character Dashboard...</div>;
  const editable = Boolean(live.session?.editable);
  const updateResource = (resource, amount) => firebaseService.updateResource(campaignId, character.id, resource, amount, { source:'Character Dashboard HUD' });
  return <AsteriaAppShell
    className="react-character-dashboard"
    showHeader={false}
  >
    <DashboardInformationRow campaign={live.campaign} session={live.session} character={character} partyWorkspace={live.partyWorkspace} editable={editable} onResourceChange={updateResource} online={live.online} connectionState={live.connectionState} error={live.error} loading={live.loading} />
    <SessionGate session={live.session} />
    <DashboardNavigation tabs={CHARACTER_TABS} active={tab} onChange={setTab} ariaLabel="Character Dashboard menu" />
    {tab === 'dashboard' ? <><PlayerDashboardOverview campaignId={campaignId} character={character} characters={live.characters} partyWorkspace={live.partyWorkspace} editable={editable} onNavigate={setTab} /><ActivityLog character={character} /></> : null}
    {tab === 'character' ? <CharacterTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'talents' ? <TalentsTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'skills' ? <SkillsTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'spells' ? <SpellsTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'inventory' ? <InventoryWorkspace campaignId={campaignId} character={character} characters={live.characters} editable={editable} /> : null}
    {tab === 'quest' ? <QuestTab campaignId={campaignId} character={character} partyWorkspace={live.partyWorkspace} editable={editable} /> : null}
    {tab === 'journal' ? <JournalTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'party' ? <PartyTab campaignId={campaignId} character={character} characters={live.characters} partyWorkspace={live.partyWorkspace} messages={live.partyChat} presence={live.presence} editable={editable} /> : null}
    {tab === 'gallery' ? <GalleryTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'settings' ? <DashboardSettingsTab campaignId={campaignId} character={character} editable={editable} /> : null}
    <PlayerItemRequestCenter campaignId={campaignId} character={character} characters={live.characters} ecosystem={live.itemEcosystem} editable={editable} />
    {xpEvent ? <XPModal event={xpEvent} onClose={closeXP} /> : null}
    {editable && lootEvent ? <LootModal campaignId={campaignId} character={character} event={lootEvent} editable={editable} onResolved={resolvedLoot} /> : null}
    {editable && magicEvent ? <MagicRewardModal campaignId={campaignId} character={character} event={magicEvent} onResolved={resolvedMagic} /> : null}
  </AsteriaAppShell>;
}
