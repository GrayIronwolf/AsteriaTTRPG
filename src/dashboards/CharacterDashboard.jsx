import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionBanner, EmptyState, Modal, Panel, ResourceBar, StatusPill, Tabs, WorkspaceShell } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { pendingLootEvent, pendingMagicRewardEvent, xpNoticeEvent } from '../state/liveEventReducer.mjs';
import { characterKnowsIdentify, normalizeCharacterStorages, normalizeDashboardPreferences, parseResourceCost } from '../state/liveWorkspaceModel.mjs';
import { useCampaignLiveData } from '../sessions/useCampaignLiveData.js';
import { DashboardSettingsTab, GalleryTab } from './CharacterGallerySettings.jsx';
import { InventoryWorkspace } from './InventoryWorkspace.jsx';
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
  { id: 'dashboard', label: 'Dashboard', icon: '\u2630' },
  { id: 'character', label: 'Character', icon: '\u25c9' },
  { id: 'talents', label: 'Class/Talent Tree', icon: '\u2726' },
  { id: 'skills', label: 'Skills', icon: '\u25cf' },
  { id: 'spells', label: 'Spells', icon: '\u26a1' },
  { id: 'inventory', label: 'Inventory', icon: '\u25a6' },
  { id: 'quest', label: 'Quest', icon: '\u2691' },
  { id: 'journal', label: 'Journal', icon: '\u270e' },
  { id: 'party', label: 'Party', icon: '\u25c9' },
  { id: 'gallery', label: 'Gallery', icon: '\u25a3' },
  { id: 'settings', label: 'Dashboard Settings', icon: '\u2699' }
];

function values(value) { return Array.isArray(value) ? value : []; }
function itemName(item) { return item?.name || item?.title || 'Empty'; }
function characterClass(character = {}) { return character.klass || character.class || 'Unselected Class'; }

const CHARACTERISTICS = [
  ['STR',['strength','str']], ['DEX',['dexterity','dex']], ['AGI',['agility','agi']],
  ['CON',['constitution','con']], ['END',['endurance','end']], ['INT',['intelligence','int']],
  ['WIS',['wisdom','wis']], ['CHA',['charisma','cha']], ['LCK',['luck','lck']]
];

function characteristicValue(character, aliases) {
  const source = character.characteristics || {};
  const value = aliases.map(key => source[key]).find(item => item !== undefined);
  return Number(value?.value ?? value ?? 0);
}

function characteristicTier(score) {
  const value = Number(score || 0);
  if(value >= 100) return { label:'Tier V', modifier:5 };
  if(value >= 80) return { label:'Tier IV', modifier:4 };
  if(value >= 60) return { label:'Tier III', modifier:3 };
  if(value >= 40) return { label:'Tier II', modifier:2 };
  if(value >= 20) return { label:'Tier I', modifier:1 };
  return { label:'Tier 0', modifier:0 };
}

function isBloodhunter(character) {
  const classes = [characterClass(character), ...(Array.isArray(character.classNames) ? character.classNames : []), ...(Array.isArray(character.classKeys) ? character.classKeys : [])];
  return classes.some(value => String(value || '').toLowerCase().includes('bloodhunter'));
}

function SidebarResource({ campaignId, character, label, resource, value, editable }) {
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const update = async direction => {
    setBusy(true);
    try { await firebaseService.updateResource(campaignId, character.id, resource, direction * Math.max(1, Number(amount || 1)), { source:'Character Dashboard' }); }
    finally { setBusy(false); }
  };
  return <div className="react-sidebar-resource">
    <ResourceBar label={label} kind={resource} value={value?.[0]} maximum={value?.[1]} />
    <div className="react-resource-controls"><input disabled={!editable || busy} aria-label={`${label} change amount`} type="number" min="1" value={amount} onChange={event => setAmount(Math.max(1, Number(event.target.value || 1)))} /><button disabled={!editable || busy} aria-label={`Remove ${amount} ${label}`} onClick={() => update(-1)}>-</button><button disabled={!editable || busy} aria-label={`Add ${amount} ${label}`} onClick={() => update(1)}>+</button></div>
  </div>;
}

function CharacterSidebar({ campaignId, character, partyWorkspace, editable }) {
  const xp = window.AsteriaProgression?.progressSummary?.(Object.assign({}, character)) || { xp: character.xp || 0, xpMax: character.xpMax || 1000 };
  const portrait = character.image || character.portrait || character.characterImage || character.appearance?.image || character.appearance?.portrait;
  const preferences=normalizeDashboardPreferences(character);
  const titles=(Array.isArray(character.titles)?character.titles:[]).map((title,index)=>typeof title==='string'?{id:`title-${index}`,text:title}:title);
  const visibleTitle=titles.find(title=>title.id===preferences.visibleTitleId)||titles[0];
  const membership=(partyWorkspace.organizations||[]).find(value=>String(value.type).toLowerCase()==='adventure party'&&(value.memberCharacterIds||[]).includes(character.id));
  return <Panel className="react-character-sidebar">
    <div className="react-character-identity"><div className="react-character-portrait">{portrait ? <img src={portrait} alt={`${character.name || 'Character'} portrait`} /> : <span>{String(character.name || 'A').charAt(0)}</span>}<b>Level {Number(character.level || 0)}</b></div><div><h2>{character.name || 'Unnamed Character'}</h2><p>{characterClass(character)}</p><small>{character.race || 'Unselected Race'}</small></div></div>
    {visibleTitle?<p className="react-character-title">{visibleTitle.text}</p>:null}{preferences.showPartyMembership&&membership?<p className="react-party-membership">A member of {membership.name}</p>:null}
    <div className="react-xp-sidebar"><ResourceBar label="XP" kind="xp" value={xp.xp} maximum={xp.xpMax} /><small>{Number(xp.xp || 0).toLocaleString()} / {Number(xp.xpMax || 0).toLocaleString()} XP to next level</small></div>
    <div className="react-sidebar-resources">
      <SidebarResource campaignId={campaignId} character={character} label="HP" resource="hp" value={character.hp || [0,0]} editable={editable} />
      <SidebarResource campaignId={campaignId} character={character} label="SP" resource="sp" value={character.sp || [0,0]} editable={editable} />
      <SidebarResource campaignId={campaignId} character={character} label="MP" resource="mp" value={character.mp || [0,0]} editable={editable} />
      {isBloodhunter(character) || Array.isArray(character.bp) ? <SidebarResource campaignId={campaignId} character={character} label="BP" resource="bp" value={character.bp || [0,20]} editable={editable} /> : null}
    </div>
    <div className="react-stat-grid">{CHARACTERISTICS.map(([label, aliases]) => { const score=characteristicValue(character, aliases); const tier=characteristicTier(score); return <div key={label}><b>{label}</b><span>{score}</span><small>{tier.label}{tier.modifier ? ` +${tier.modifier}` : ''}</small></div>; })}</div>
  </Panel>;
}

function SmallCard({ title, image, meta, cost, disabled, onDoubleClick }) {
  return <article className={`react-small-card ${disabled ? 'disabled' : ''}`} tabIndex={onDoubleClick ? 0 : undefined} onDoubleClick={disabled ? undefined : onDoubleClick}><b>{title}</b><div className="react-small-card-image">{image ? <img src={image} alt="" /> : <span>{String(title || '?').charAt(0)}</span>}</div>{meta ? <small>{meta}</small> : null}{cost ? <small>{cost}</small> : null}</article>;
}

function DashboardPanels({ campaignId, character, editable, onNavigate }) {
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const equipment = character.equipment || {};
  const talents = values(character.unlockedTalents || character.talents).filter(talent => talent?.unlocked !== false);
  const spells = values(character.spells || character.activeSpells);
  const skills = values(character.skills || character.selectedSkills);
  const quickSlots = values(character.quickSlots).slice(0, 4);
  const coins = character.coins || character.coinPouch || {};
  const run=async operation=>{setBusy(true);setMessage('Saving...');try{const result=await operation();setMessage(result?.ok?'Dashboard updated.':result?.error||'That action could not be completed.');}catch(error){setMessage(error.message||String(error));}finally{setBusy(false);}};
  const cast=spell=>run(()=>firebaseService.castSpell(campaignId,character.id,spell,parseResourceCost(spell.costs||spell.cost)));
  const panelNodes={
    weapons:<Panel title="Weapons & Quick Items" className="react-loadout-panel"><div className="react-dashboard-loadout"><section><h3>Equipped Weapons</h3><div className="react-equipment-grid weapons" onDoubleClick={()=>onNavigate('inventory')}>{['Main Weapon','Secondary Weapon','Off Weapon','Quiver','Shield'].map(slot => <div key={slot}><small>{slot}</small><b>{itemName(equipment[slot] || equipment[slot.toLowerCase().replaceAll(' ', '')])}</b></div>)}</div></section><section><h3>Quick Items</h3><div className="react-quick-grid">{[0,1,2,3].map(index => <button disabled={!editable||busy||!quickSlots[index]?.id} title="Double-click to use" onDoubleClick={()=>run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'use',itemId:quickSlots[index].id}))} key={index}><b>{index + 1}</b><span>{itemName(quickSlots[index])}</span></button>)}</div></section></div></Panel>,
    talents:<Panel title="Class Talents" className="react-wide-panel"><div className="react-card-gallery compact">{talents.slice(0, 8).map((talent, index) => <SmallCard key={talent.id || talent.name || index} title={talent.name || talent.title} image={talent.image} meta={`Tier ${talent.tier || 1} | Rank ${talent.rank || 1}`} cost={talent.cost} onDoubleClick={()=>onNavigate('talents')} />)}{!talents.length ? <EmptyState title="No unlocked talents" /> : null}</div></Panel>,
    spells:<Panel title="Active Spells" className="react-wide-panel"><div className="react-card-gallery compact">{spells.slice(0, 8).map((spell, index) => <SmallCard key={spell.id || spell.name || index} title={spell.name || spell.title} image={spell.image} meta={spell.element || spell.magicType || ''} cost={spell.cost ? String(spell.cost) : ''} disabled={!editable||busy} onDoubleClick={()=>cast(spell)} />)}{!spells.length ? <EmptyState title="No active spells" /> : null}</div></Panel>,
    skills:<Panel title="Skills"><div className="react-card-gallery compact">{skills.slice(0, 8).map((skill, index) => <SmallCard key={skill.id || skill.name || index} title={skill.name || skill.title || skill} meta={skill.rankName || skill.rank || 'Novice'} onDoubleClick={()=>onNavigate('skills')} />)}{!skills.length ? <EmptyState title="No selected skills" /> : null}</div></Panel>,
    conditions:<Panel title="Conditions"><div className="react-condition-list">{values(character.conditions).map((condition, index) => <StatusPill key={condition.id || condition.name || index}>{condition.name || condition}</StatusPill>)}{!values(character.conditions).length ? <p>No active conditions.</p> : null}</div></Panel>,
    coins:<Panel title="Coin Pouch"><div className="react-coin-list">{Object.entries(coins).map(([name, amount]) => <div key={name}><span>{name}</span><b>{Number(amount || 0).toLocaleString()}</b></div>)}{!Object.keys(coins).length ? <p>No currency recorded.</p> : null}</div><p className="react-action-message">{message}</p></Panel>
  };
  const preferences=normalizeDashboardPreferences(character);
  return <div className="react-character-dashboard-grid">{preferences.panelOrder.filter(key=>!preferences.hiddenPanels.includes(key)).map(key=>React.cloneElement(panelNodes[key],{key,className:`${panelNodes[key].props.className||''} react-panel-${key}`}))}</div>;
}

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
    if(character){
      window.chars = window.chars || {};
      window.chars[character.id] = Object.assign({}, window.chars[character.id] || {}, character);
      window.selected = character.id;
      window.session = Object.assign({}, window.session || {}, { character: character.id });
    }
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
  return <WorkspaceShell
    className="react-character-dashboard"
    eyebrow="Character Dashboard"
    title={live.campaign?.name || character.campaign || 'Campaign'}
    subtitle={editable ? `Live session ${live.session.id || ''}. Gameplay changes are enabled.` : 'The dashboard is read-only until the GM starts a live session.'}
    sidebar={<CharacterSidebar campaignId={campaignId} character={character} partyWorkspace={live.partyWorkspace} editable={editable} />}
    actions={<ConnectionBanner online={live.online} error={live.error} session={live.session} />}
  >
    <SessionGate session={live.session} />
    <Tabs tabs={CHARACTER_TABS} active={tab} onChange={setTab} ariaLabel="Character Dashboard menu" />
    {tab === 'dashboard' ? <><DashboardPanels campaignId={campaignId} character={character} editable={editable} onNavigate={setTab} /><ActivityLog character={character} /></> : null}
    {tab === 'character' ? <CharacterTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'talents' ? <TalentsTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'skills' ? <SkillsTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'spells' ? <SpellsTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'inventory' ? <InventoryWorkspace campaignId={campaignId} character={character} characters={live.characters} ecosystem={live.itemEcosystem} editable={editable} /> : null}
    {tab === 'quest' ? <QuestTab campaignId={campaignId} character={character} partyWorkspace={live.partyWorkspace} editable={editable} /> : null}
    {tab === 'journal' ? <JournalTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'party' ? <PartyTab campaignId={campaignId} character={character} characters={live.characters} partyWorkspace={live.partyWorkspace} messages={live.partyChat} editable={editable} /> : null}
    {tab === 'gallery' ? <GalleryTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {tab === 'settings' ? <DashboardSettingsTab campaignId={campaignId} character={character} editable={editable} /> : null}
    {xpEvent ? <XPModal event={xpEvent} onClose={closeXP} /> : null}
    {editable && lootEvent ? <LootModal campaignId={campaignId} character={character} event={lootEvent} editable={editable} onResolved={resolvedLoot} /> : null}
    {editable && magicEvent ? <MagicRewardModal campaignId={campaignId} character={character} event={magicEvent} onResolved={resolvedMagic} /> : null}
  </WorkspaceShell>;
}
