import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionBanner, EmptyState, Modal, Panel, ResourceBar, StatusPill, Tabs, WorkspaceShell } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { pendingLootEvent, pendingMagicRewardEvent, xpNoticeEvent } from '../state/liveEventReducer.mjs';
import { useCampaignLiveData } from '../sessions/useCampaignLiveData.js';

const CHARACTER_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '\u2630' },
  { id: 'character', label: 'Character', icon: '\u25c9' },
  { id: 'talents', label: 'Class/Talent Tree', icon: '\u2726' },
  { id: 'skills', label: 'Skills', icon: '\u25cf' },
  { id: 'spells', label: 'Spells', icon: '\u26a1' },
  { id: 'inventory', label: 'Inventory', icon: '\u25a6' },
  { id: 'quest', label: 'Quest', icon: '\u2691' },
  { id: 'journal', label: 'Journal', icon: '\u270e' },
  { id: 'party', label: 'Party', icon: '\u25c9' }
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

function SidebarResource({ campaignId, character, label, resource, value }) {
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const update = async direction => {
    setBusy(true);
    try { await firebaseService.updateResource(campaignId, character.id, resource, direction * Math.max(1, Number(amount || 1)), { source:'Character Dashboard' }); }
    finally { setBusy(false); }
  };
  return <div className="react-sidebar-resource">
    <ResourceBar label={label} kind={resource} value={value?.[0]} maximum={value?.[1]} />
    <div className="react-resource-controls"><input aria-label={`${label} change amount`} type="number" min="1" value={amount} onChange={event => setAmount(Math.max(1, Number(event.target.value || 1)))} /><button disabled={busy} aria-label={`Remove ${amount} ${label}`} onClick={() => update(-1)}>-</button><button disabled={busy} aria-label={`Add ${amount} ${label}`} onClick={() => update(1)}>+</button></div>
  </div>;
}

function CharacterSidebar({ campaignId, character }) {
  const xp = window.AsteriaProgression?.progressSummary?.(Object.assign({}, character)) || { xp: character.xp || 0, xpMax: character.xpMax || 1000 };
  const portrait = character.image || character.portrait || character.characterImage || character.appearance?.image || character.appearance?.portrait;
  return <Panel className="react-character-sidebar">
    <div className="react-character-identity"><div className="react-character-portrait">{portrait ? <img src={portrait} alt={`${character.name || 'Character'} portrait`} /> : <span>{String(character.name || 'A').charAt(0)}</span>}<b>Level {Number(character.level || 0)}</b></div><div><h2>{character.name || 'Unnamed Character'}</h2><p>{characterClass(character)}</p><small>{character.race || 'Unselected Race'}</small></div></div>
    <div className="react-xp-sidebar"><ResourceBar label="XP" kind="xp" value={xp.xp} maximum={xp.xpMax} /><small>{Number(xp.xp || 0).toLocaleString()} / {Number(xp.xpMax || 0).toLocaleString()} XP to next level</small></div>
    <div className="react-sidebar-resources">
      <SidebarResource campaignId={campaignId} character={character} label="HP" resource="hp" value={character.hp || [0,0]} />
      <SidebarResource campaignId={campaignId} character={character} label="SP" resource="sp" value={character.sp || [0,0]} />
      <SidebarResource campaignId={campaignId} character={character} label="MP" resource="mp" value={character.mp || [0,0]} />
      {isBloodhunter(character) || Array.isArray(character.bp) ? <SidebarResource campaignId={campaignId} character={character} label="BP" resource="bp" value={character.bp || [0,20]} /> : null}
    </div>
    <div className="react-stat-grid">{CHARACTERISTICS.map(([label, aliases]) => { const score=characteristicValue(character, aliases); const tier=characteristicTier(score); return <div key={label}><b>{label}</b><span>{score}</span><small>{tier.label}{tier.modifier ? ` +${tier.modifier}` : ''}</small></div>; })}</div>
  </Panel>;
}

function SmallCard({ title, image, meta, cost }) {
  return <article className="react-small-card"><b>{title}</b><div className="react-small-card-image">{image ? <img src={image} alt="" /> : <span>{String(title || '?').charAt(0)}</span>}</div>{meta ? <small>{meta}</small> : null}{cost ? <small>{cost}</small> : null}</article>;
}

function DashboardPanels({ character }) {
  const equipment = character.equipment || {};
  const inventory = values(character.inventory);
  const talents = values(character.unlockedTalents || character.talents).filter(talent => talent?.unlocked !== false);
  const spells = values(character.spells || character.activeSpells);
  const skills = values(character.skills || character.selectedSkills);
  const quickSlots = values(character.quickSlots).slice(0, 4);
  const coins = character.coins || character.coinPouch || {};
  return <div className="react-character-dashboard-grid">
    <Panel title="Equipment / Armor" className="react-equipment-panel"><div className="react-equipment-grid">{['Head','Chest','Hands','Feet','Back','Torso','Waist','Shoulders'].map(slot => <div key={slot}><small>{slot}</small><b>{itemName(equipment[slot] || equipment[slot.toLowerCase()])}</b></div>)}</div></Panel>
    <Panel title="Equipped Weapons"><div className="react-equipment-grid weapons">{['Main Weapon','Secondary Weapon','Off Weapon','Quiver','Shield'].map(slot => <div key={slot}><small>{slot}</small><b>{itemName(equipment[slot] || equipment[slot.toLowerCase().replaceAll(' ', '')])}</b></div>)}</div></Panel>
    <Panel title="Quick Items"><div className="react-quick-grid">{[0,1,2,3].map(index => <div key={index}><b>{index + 1}</b><span>{itemName(quickSlots[index])}</span></div>)}</div></Panel>
    <Panel title="Class Talents" className="react-wide-panel"><div className="react-card-gallery compact">{talents.slice(0, 8).map((talent, index) => <SmallCard key={talent.id || talent.name || index} title={talent.name || talent.title} image={talent.image} meta={`Tier ${talent.tier || 1} | Rank ${talent.rank || 1}`} cost={talent.cost} />)}{!talents.length ? <EmptyState title="No unlocked talents" /> : null}</div></Panel>
    <Panel title="Active Spells" className="react-wide-panel"><div className="react-card-gallery compact">{spells.slice(0, 8).map((spell, index) => <SmallCard key={spell.id || spell.name || index} title={spell.name || spell.title} image={spell.image} meta={spell.element || spell.magicType || ''} cost={spell.cost ? `${spell.cost} MP` : ''} />)}{!spells.length ? <EmptyState title="No active spells" /> : null}</div></Panel>
    <Panel title="Skills"><div className="react-card-gallery compact">{skills.slice(0, 8).map((skill, index) => <SmallCard key={skill.id || skill.name || index} title={skill.name || skill.title || skill} meta={skill.rankName || skill.rank || 'Novice'} />)}{!skills.length ? <EmptyState title="No selected skills" /> : null}</div></Panel>
    <Panel title="Conditions"><div className="react-condition-list">{values(character.conditions).map((condition, index) => <StatusPill key={condition.id || condition.name || index}>{condition.name || condition}</StatusPill>)}{!values(character.conditions).length ? <p>No active conditions.</p> : null}</div></Panel>
    <Panel title="Coin Pouch"><div className="react-coin-list">{Object.entries(coins).map(([name, amount]) => <div key={name}><span>{name}</span><b>{Number(amount || 0).toLocaleString()}</b></div>)}{!Object.keys(coins).length ? <p>No currency recorded.</p> : null}</div></Panel>
  </div>;
}

function LootModal({ character, event, onResolved }) {
  const [busy, setBusy] = useState(false);
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
  const resolve = async action => {
    setBusy(true);
    const ok = await firebaseService.resolveLoot(character.id, reward, action, slot);
    setBusy(false);
    if(ok !== false) onResolved?.();
  };
  return <Modal title={reward.item?.name || 'Loot Reward'} eyebrow={reward.campaignName || 'Campaign Reward'} busy={busy} onClose={() => {}} footer={<div className="react-modal-actions"><button disabled={busy} onClick={() => resolve('declined')}>Decline</button><button className="primary" disabled={busy} onClick={() => resolve('inventory')}>Add to Inventory</button>{slots.length ? <button className="primary" disabled={busy} onClick={() => resolve('equip')}>Equip</button> : null}</div>}>
    <div className="react-loot-hero">{reward.item?.image ? <img src={reward.item.image} alt="" /> : <span>{String(reward.item?.name || '?').charAt(0)}</span>}<div><p>{reward.message || 'The GM awarded an item.'}</p><StatusPill>{reward.item?.itemClass || 'Common'}</StatusPill><p>Quantity {Number(reward.item?.qty || 1)}</p></div></div>
    {slots.length ? <label>Equipment slot<select value={slot} onChange={event => setSlot(event.target.value)}>{slots.map(value => <option key={value}>{value}</option>)}</select></label> : null}
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

function LegacyTab({ title, copy, characterId, open }) {
  return <Panel title={title}><p>{copy}</p><button onClick={() => { window.AsteriaReactMigration?.openLegacyCharacter?.(characterId); if(open) window.setPlayerTab?.(open); }}>Open full existing {title}</button></Panel>;
}

export function CharacterDashboard({ campaignId, characterId }) {
  const live = useCampaignLiveData(campaignId, { mode: 'character', characterId });
  const [tab, setTab] = useState('dashboard');
  const [acknowledged, setAcknowledged] = useState(() => new Set());
  const processedLoot = useRef(new Set());
  const processedMagic = useRef(new Set());
  const character = live.character;
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
  return <WorkspaceShell
    className="react-character-dashboard"
    eyebrow="Character Dashboard"
    title={live.campaign?.name || character.campaign || 'Campaign'}
    subtitle={live.session?.status === 'active' ? `Live session ${live.session.id || ''}` : 'Character synchronization remains active outside live sessions.'}
    sidebar={<CharacterSidebar campaignId={campaignId} character={character} />}
    actions={<ConnectionBanner online={live.online} error={live.error} session={live.session} />}
  >
    <Tabs tabs={CHARACTER_TABS} active={tab} onChange={setTab} ariaLabel="Character Dashboard menu" />
    {tab === 'dashboard' ? <DashboardPanels character={character} /> : null}
    {tab === 'character' ? <LegacyTab title="Character" copy="Identity, race information, racial traits, characteristics, and CP remain connected to the current character sheet." characterId={characterId} open="characteristicsPane" /> : null}
    {tab === 'talents' ? <LegacyTab title="Class/Talent Tree" copy="Class talent trees, tier locks, ranks, TP purchases, and class compendium links remain operational." characterId={characterId} open="talents" /> : null}
    {tab === 'skills' ? <LegacyTab title="Skills" copy="Selected skills, ranks, successful checks, and techniques remain operational." characterId={characterId} open="skillsPane" /> : null}
    {tab === 'spells' ? <LegacyTab title="Spells" copy="Known magic elements, spell filters, costs, and spell compendium links remain operational." characterId={characterId} open="spells" /> : null}
    {tab === 'inventory' ? <LegacyTab title="Inventory" copy={`${values(character.inventory).length} item records are synchronized. Bags, equipment, quick slots, shops, and trading remain operational.`} characterId={characterId} open="inventory" /> : null}
    {tab === 'quest' ? <LegacyTab title="Quest" copy="Campaign objectives and quest progress remain operational." characterId={characterId} open="questsPane" /> : null}
    {tab === 'journal' ? <LegacyTab title="Journal" copy="Character notes and story records remain operational." characterId={characterId} open="journal" /> : null}
    {tab === 'party' ? <LegacyTab title="Party" copy="Shared notes, loot, guild information, and party systems remain operational." characterId={characterId} open="partyPane" /> : null}
    {xpEvent ? <XPModal event={xpEvent} onClose={closeXP} /> : null}
    {lootEvent ? <LootModal character={character} event={lootEvent} onResolved={resolvedLoot} /> : null}
    {magicEvent ? <MagicRewardModal campaignId={campaignId} character={character} event={magicEvent} onResolved={resolvedMagic} /> : null}
  </WorkspaceShell>;
}
