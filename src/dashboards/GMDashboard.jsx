import React, { useEffect, useMemo, useState } from 'react';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { ConnectionBanner, EmptyState, Panel, ResourceBar, StatusPill, Tabs, WorkspaceShell } from '../components/WorkspaceUI.jsx';
import { useCampaignLiveData } from '../sessions/useCampaignLiveData.js';

const GM_TABS = [
  { id: 'main', label: 'GM Main', icon: '\u25c8' },
  { id: 'quests', label: 'Quests', icon: '\u2691' },
  { id: 'notes', label: 'GM Notes', icon: '\u270e' },
  { id: 'economy', label: 'Economy', icon: '\u25ce' },
  { id: 'crafting', label: 'Crafting', icon: '\u2692' },
  { id: 'tools', label: 'GM Tools', icon: '\u2699' },
  { id: 'campaign', label: 'Campaign Manager', icon: '\u25a3' },
  { id: 'world', label: 'World Systems', icon: '\u2318' }
];

function progression(character = {}) {
  const fallback = { xp: Number(character.xp || 0), xpMax: Number(character.xpMax || 1000), percent: 0 };
  return window.AsteriaProgression?.progressSummary?.(Object.assign({}, character)) || fallback;
}

function CharacterRosterCard({ character, selected, presence, onSelect, onOpen }) {
  const xp = progression(character);
  const online = Object.values(presence || {}).some(record => record.characterId === character.id && record.state === 'online');
  return <button className={`react-party-card ${selected ? 'active' : ''}`} type="button" onClick={onSelect} onDoubleClick={onOpen}>
    <div className="react-party-name"><div><b>{character.name || 'Unnamed Character'}</b><small>{character.klass || character.class || 'Class'} | Level {Number(character.level || 0)}</small></div><span className={online ? 'presence online' : 'presence'} title={online ? 'Online' : 'Offline'} /></div>
    <ResourceBar compact label="HP" kind="hp" value={character.hp?.[0]} maximum={character.hp?.[1]} />
    <ResourceBar compact label="SP" kind="sp" value={character.sp?.[0]} maximum={character.sp?.[1]} />
    <ResourceBar compact label="MP" kind="mp" value={character.mp?.[0]} maximum={character.mp?.[1]} />
    {Array.isArray(character.bp) ? <ResourceBar compact label="BP" kind="bp" value={character.bp[0]} maximum={character.bp[1]} /> : null}
    <ResourceBar compact label="XP" kind="xp" value={xp.xp} maximum={xp.xpMax} />
  </button>;
}

function PartySidebar({ campaign, characters, selectedId, setSelectedId, presence }) {
  const partyIds = campaign?.party?.length ? campaign.party : Object.keys(characters);
  return <Panel title="Party Stats" className="react-party-sidebar">
    <p>{campaign?.name || 'Campaign'} party</p>
    <div className="react-party-list">
      {partyIds.map(id => characters[id]).filter(Boolean).map(character => <CharacterRosterCard
        key={character.id}
        character={character}
        selected={selectedId === character.id}
        presence={presence}
        onSelect={() => setSelectedId(character.id)}
        onOpen={() => window.AsteriaReactMigration?.openCharacter?.(campaign.id, character.id)}
      />)}
      {!partyIds.length ? <EmptyState title="No linked characters">Characters appear here as soon as they join this campaign.</EmptyState> : null}
    </div>
    <p className="react-help">Double-click a character to open the live Character Dashboard.</p>
  </Panel>;
}

function SessionActions({ campaignId, session, busy, run }) {
  const active = session?.status === 'active';
  const paused = session?.status === 'paused';
  return <div className="react-session-actions">
    {!active && !paused ? <button className="primary" disabled={busy} onClick={() => run(() => firebaseService.startSession(campaignId))}>Start Session</button> : null}
    {active ? <button disabled={busy} onClick={() => run(() => firebaseService.pauseSession(campaignId))}>Pause Session</button> : null}
    {paused ? <button className="primary" disabled={busy} onClick={() => run(() => firebaseService.startSession(campaignId))}>Resume Session</button> : null}
    {(active || paused) ? <button className="danger" disabled={busy} onClick={() => run(() => firebaseService.endSession(campaignId))}>End Session</button> : null}
  </div>;
}

function slug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

function encounterSources() {
  const codex = window.AsteriaCodexCompendium?.creatureEntries?.() || [];
  const npcStores = [window.npcs, window.NPCS, window.ASTERIA_NPC_DATA, window.ASTERIA_NPCS].filter(Boolean);
  const npcs = npcStores.flatMap(store => Array.isArray(store) ? store : Object.entries(store).map(([id, value]) => Object.assign({ id }, value)));
  const records = [
    ...codex.map(entry => ({ id:entry.id || entry.slug || slug(entry.title), name:entry.title || entry.name, type:entry.creatureType || entry.type || entry.category || 'Creature', threatTier:entry.threatTier || entry.tier || 'Tier 1', initiative:Number(entry.initiative || 10), hp:Number(entry.hp || entry.health || 50), source:'Creature Compendium', compendiumSlug:entry.slug || entry.id })),
    ...npcs.map(entry => ({ id:`npc-${entry.id || entry.slug || slug(entry.name || entry.title)}`, name:entry.name || entry.title || 'Unnamed NPC', type:entry.type || entry.category || 'NPC', threatTier:entry.threatTier || entry.tier || 'Tier 1', initiative:Number(entry.initiative || 10), hp:Number(entry.hp || entry.health || 50), source:'NPC', compendiumSlug:entry.slug || entry.id }))
  ].filter(entry => entry.name);
  const seen = new Set();
  return records.filter(entry => { const key=slug(entry.name); if(seen.has(key)) return false; seen.add(key); return true; });
}

function CampaignEncounter({ campaignId, characters, encounter }) {
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const sources = useMemo(encounterSources, []);
  const state = Object.assign({ status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] }, encounter || {});
  const results = search ? sources.filter(entry => `${entry.name} ${entry.type} ${entry.source}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8) : [];
  const save = async next => {
    setBusy(true); setMessage('Saving encounter...');
    const result = await firebaseService.saveEncounter(campaignId, next);
    setMessage(result?.ok ? 'Encounter synchronized.' : result?.error || 'Encounter could not be saved.');
    setBusy(false);
  };
  const ensurePlayers = combatants => {
    const existing = new Set(combatants.filter(entry => entry.kind === 'player').map(entry => entry.characterId));
    return [...combatants, ...Object.values(characters).filter(character => !existing.has(character.id)).map(character => ({ id:`player-${character.id}`, characterId:character.id, name:character.name || 'Character', kind:'player', initiative:Number(character.initiative || 10), defeated:false }))];
  };
  const start = () => save({ ...state, status:'active', round:Math.max(1, Number(state.round || 1)), turnIndex:0, combatants:ensurePlayers(state.combatants || []) });
  const addEnemy = source => {
    const added = Array.from({ length:Math.max(1, Math.min(20, Number(quantity || 1))) }, (_, index) => ({ id:`enemy-${Date.now()}-${index}`, sourceId:source.id, compendiumSlug:source.compendiumSlug || '', name:Number(quantity) > 1 ? `${source.name} ${index + 1}` : source.name, kind:'enemy', type:source.type, threatTier:source.threatTier, initiative:source.initiative, hp:[source.hp, source.hp], defeated:false }));
    save({ ...state, enemies:[...(state.enemies || []), ...added], combatants:[...(state.combatants || []), ...added] });
    setSearch('');
  };
  const updateCombatant = (id, patch) => save({ ...state, combatants:(state.combatants || []).map(entry => entry.id === id ? { ...entry, ...patch } : entry), enemies:(state.enemies || []).map(entry => entry.id === id ? { ...entry, ...patch } : entry) });
  const removeCombatant = id => save({ ...state, combatants:(state.combatants || []).filter(entry => entry.id !== id), enemies:(state.enemies || []).filter(entry => entry.id !== id), turnIndex:0 });
  const sortInitiative = () => save({ ...state, combatants:[...(state.combatants || [])].sort((a,b) => Number(b.initiative || 0) - Number(a.initiative || 0)), turnIndex:0 });
  const nextTurn = () => {
    const count=(state.combatants || []).length;
    if(!count) return;
    const nextIndex=(Number(state.turnIndex || 0)+1)%count;
    save({ ...state, turnIndex:nextIndex, round:nextIndex === 0 ? Number(state.round || 1)+1 : Number(state.round || 1) });
  };
  return <Panel title="Campaign Encounters" eyebrow="Initiative & Encounter Tracker" className="react-encounter-panel" action={<StatusPill tone={state.status === 'active' ? 'success' : ''}>{state.status}</StatusPill>}>
    <div className="react-encounter-toolbar"><button className="primary" disabled={busy} onClick={start}>{state.status === 'active' ? 'Refresh Players' : 'Start Encounter'}</button><button disabled={busy || !(state.combatants || []).length} onClick={sortInitiative}>Sort Initiative</button><button disabled={busy || state.status !== 'active'} onClick={nextTurn}>Next Turn</button><button className="danger" disabled={busy} onClick={() => save({ ...state, status:'ended' })}>End</button><button disabled={busy} onClick={() => save({ status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] })}>Clear</button></div>
    <div className="react-encounter-summary"><StatusPill>Round {Number(state.round || 1)}</StatusPill><StatusPill>{(state.enemies || []).length} enemies</StatusPill><StatusPill>{Object.keys(characters).length} players</StatusPill><span>{message}</span></div>
    <div className="react-encounter-builder">
      <section><h3>Add Creature or NPC</h3><div className="react-form-grid"><label>Search<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search creature compendium and NPCs..." /></label><label>Number<input type="number" min="1" max="20" value={quantity} onChange={event => setQuantity(Math.max(1, Number(event.target.value || 1)))} /></label></div>{search ? <div className="react-search-results encounter">{results.map(entry => <button key={entry.id} onClick={() => addEnemy(entry)}><b>{entry.name}</b><small>{entry.type} | {entry.threatTier}</small></button>)}{!results.length ? <EmptyState title="No matches" /> : null}</div> : null}</section>
      <section><h3>Initiative Order</h3><div className="react-initiative-list">{(state.combatants || []).map((entry,index) => <article key={entry.id} className={`${index === Number(state.turnIndex || 0) && state.status === 'active' ? 'active' : ''} ${entry.defeated ? 'defeated' : ''}`}><span>{index + 1}</span><div><b>{entry.name}</b><small>{entry.kind === 'player' ? 'Player Character' : entry.type || 'Enemy'}</small></div><input aria-label={`${entry.name} initiative`} type="number" value={Number(entry.initiative || 0)} onChange={event => updateCombatant(entry.id, { initiative:Number(event.target.value || 0) })} />{entry.kind === 'enemy' ? <button title="Toggle defeated" onClick={() => updateCombatant(entry.id, { defeated:!entry.defeated })}>{entry.defeated ? 'Restore' : 'Defeat'}</button> : null}<button aria-label={`Remove ${entry.name}`} onClick={() => removeCombatant(entry.id)}>X</button></article>)}{!(state.combatants || []).length ? <EmptyState title="No initiative entries">Start the encounter to add every linked character.</EmptyState> : null}</div></section>
    </div>
  </Panel>;
}

function XPDistribution({ campaignId, characters, events }) {
  const [selected, setSelected] = useState([]);
  const [amount, setAmount] = useState(1000);
  const [reason, setReason] = useState('Campaign reward');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => setSelected(current => current.filter(id => characters[id])), [characters]);
  const send = async () => {
    if(!selected.length || Number(amount) <= 0) return setMessage('Choose at least one character and enter an XP amount.');
    setBusy(true); setMessage('Sending XP...');
    const results = await Promise.allSettled(selected.map(characterId => firebaseService.grantXP(campaignId, characterId, Number(amount), { reason, source: 'GM Dashboard' })));
    const failed = results.filter(result => result.status === 'rejected' || !result.value?.ok).length;
    setMessage(failed ? `${failed} XP award${failed === 1 ? '' : 's'} could not be delivered.` : `XP delivered to ${selected.length} character dashboard${selected.length === 1 ? '' : 's'}.`);
    setBusy(false);
  };
  const xpEvents = events.filter(event => event.type === 'xp-reward').slice(0, 6);
  return <Panel title="Party XP Distribution" eyebrow="Campaign Progression" className="react-xp-panel">
    <div className="react-form-grid">
      <label>XP per character<input type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <label>Reason<input value={reason} onChange={event => setReason(event.target.value)} /></label>
    </div>
    <div className="react-recipient-actions"><button type="button" onClick={() => setSelected(Object.keys(characters))}>Select All</button><button type="button" onClick={() => setSelected([])}>Clear</button><span>{selected.length} selected</span></div>
    <div className="react-recipient-grid">{Object.values(characters).map(character => <label key={character.id}><input type="checkbox" checked={selected.includes(character.id)} onChange={event => setSelected(ids => event.target.checked ? [...new Set([...ids, character.id])] : ids.filter(id => id !== character.id))} />{character.name}</label>)}</div>
    <div className="react-action-row"><button className="primary" type="button" disabled={busy} onClick={send}>{busy ? 'Delivering...' : 'Grant XP'}</button><span>{message}</span></div>
    <div className="react-delivery-list">{xpEvents.map(event => <div key={event.id}><b>{event.payload?.characterName || characters[event.targetCharacterId]?.name || 'Character'}</b><span>+{Number(event.payload?.amount || 0).toLocaleString()} XP</span><StatusPill tone={event.acknowledged ? 'success' : 'pending'}>{event.acknowledged ? 'Acknowledged' : event.deliveryStatus || 'Delivered'}</StatusPill></div>)}</div>
  </Panel>;
}

function MagicElementRewards({ campaignId, characters, events }) {
  const magicTypes = window.ASTERIA_MAGIC_LIBRARY?.all || [];
  const [target, setTarget] = useState('');
  const [selectedMagic, setSelectedMagic] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { if(!target && Object.keys(characters)[0]) setTarget(Object.keys(characters)[0]); }, [characters, target]);
  const results = magicTypes.filter(item => `${item.name} ${item.group}`.toLowerCase().includes(search.toLowerCase()));
  const send = async () => {
    if(!target || !selectedMagic) return setMessage('Choose a character and magical element.');
    setBusy(true); setMessage('Sending magic reward...');
    const result = await firebaseService.createMagicReward(campaignId, target, selectedMagic, { message:'The GM granted access to a new magical element.' });
    setMessage(result?.ok ? `${selectedMagic} sent to ${characters[target]?.name || 'character'} for acceptance.` : result?.error || 'Magic reward could not be sent.');
    if(result?.ok) setSelectedMagic('');
    setBusy(false);
  };
  return <Panel title="Additional Magic Elements" eyebrow="GM Reward Tool" className="react-magic-grant-panel">
    <div className="react-form-grid"><label>Recipient<select value={target} onChange={event => setTarget(event.target.value)}>{Object.values(characters).map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label><label>Filter Elements<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search magic elements..." /></label></div>
    <div className="react-magic-grid">{results.map(item => <button key={item.slug} type="button" className={selectedMagic === item.name ? 'active' : ''} style={{ '--magic-color':item.color }} onClick={() => setSelectedMagic(item.name)}><span>{String(item.label || item.name).charAt(0)}</span><b>{item.name}</b><small>{item.group}</small></button>)}</div>
    <div className="react-action-row"><button className="primary" disabled={busy || !target || !selectedMagic} onClick={send}>{busy ? 'Sending...' : `Send ${selectedMagic || 'Magic Reward'}`}</button><span>{message}</span></div>
    <div className="react-delivery-list">{events.filter(event => event.type === 'magic-element-reward').slice(0, 8).map(event => <div key={event.id}><b>{event.payload?.magicType || 'Magic Element'}</b><span>{characters[event.targetCharacterId]?.name || event.payload?.characterName || 'Character'}</span><StatusPill tone={event.status === 'pending' ? 'pending' : 'success'}>{event.status || 'pending'}</StatusPill></div>)}</div>
  </Panel>;
}

function LootRewards({ campaignId, characters, events }) {
  const catalog = useMemo(() => window.AsteriaInventory?.catalogEntries?.() || [], []);
  const [target, setTarget] = useState('');
  const [search, setSearch] = useState('');
  const [item, setItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const results = catalog.filter(entry => String(entry.title || entry.name || '').toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  useEffect(() => { if(!target && Object.keys(characters)[0]) setTarget(Object.keys(characters)[0]); }, [characters, target]);
  const send = async () => {
    if(!target || !item) return;
    setBusy(true);
    const snapshot = window.AsteriaInventory?.itemSnapshot?.(item, quantity) || Object.assign({}, item, { qty: quantity });
    await firebaseService.createLootReward(campaignId, target, snapshot, { message: 'The GM awarded an item.' });
    setBusy(false); setItem(null); setSearch('');
  };
  return <Panel title="Party Loot" eyebrow="GM Loot Tool" className="react-loot-panel">
    <div className="react-form-grid">
      <label>Recipient<select value={target} onChange={event => setTarget(event.target.value)}>{Object.values(characters).map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <label>Search Item Compendium<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search exact item..." /></label>
      <label>Quantity<input type="number" min="1" value={quantity} onChange={event => setQuantity(Math.max(1, Number(event.target.value || 1)))} /></label>
    </div>
    {search ? <div className="react-search-results">{results.map(entry => <button key={entry.slug || entry.id || entry.title} onClick={() => setItem(entry)} className={item === entry ? 'active' : ''}>{entry.title || entry.name}</button>)}</div> : null}
    <div className="react-action-row"><button className="primary" disabled={busy || !item || !target} onClick={send}>{busy ? 'Sending...' : `Send ${item?.title || item?.name || 'Reward'}`}</button></div>
    <div className="react-delivery-list">{events.filter(event => event.type === 'loot-reward').slice(0, 6).map(event => <div key={event.id}><b>{event.payload?.item?.name || 'Item'}</b><span>{characters[event.targetCharacterId]?.name || 'Character'}</span><StatusPill tone={event.status === 'pending' ? 'pending' : 'success'}>{event.status || 'pending'}</StatusPill></div>)}</div>
  </Panel>;
}

function ExistingSystem({ title, copy, tab }) {
  return <Panel title={title}><p>{copy}</p><button type="button" onClick={() => { window.AsteriaReactMigration?.openLegacyGM?.(); window.setGMSystem?.(tab); }}>Open existing {title}</button></Panel>;
}

export function GMDashboard({ campaignId }) {
  const live = useCampaignLiveData(campaignId, { mode: 'gm' });
  const [tab, setTab] = useState('main');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  useEffect(() => { if(!selectedId && Object.keys(live.characters)[0]) setSelectedId(Object.keys(live.characters)[0]); }, [live.characters, selectedId]);
  const run = async operation => { setBusy(true); setActionError(''); try { await operation(); } catch(error) { setActionError(error.message || String(error)); } finally { setBusy(false); } };
  if(live.loading) return <div className="react-route-state">Connecting GM Dashboard...</div>;
  return <WorkspaceShell
    className="react-gm-dashboard"
    eyebrow="GM Dashboard"
    title={live.campaign?.name || 'Campaign'}
    subtitle="Live campaign control, party resources, rewards, encounters, and session tools."
    sidebar={<PartySidebar campaign={live.campaign || { id: campaignId }} characters={live.characters} selectedId={selectedId} setSelectedId={setSelectedId} presence={live.presence} />}
    actions={<><SessionActions campaignId={campaignId} session={live.session} busy={busy} run={run} /><ConnectionBanner online={live.online} error={live.error || actionError} session={live.session} /></>}
  >
    <Tabs tabs={GM_TABS} active={tab} onChange={setTab} ariaLabel="GM Dashboard menu" />
    {tab === 'main' ? <div className="react-gm-main-grid">
      <CampaignEncounter campaignId={campaignId} characters={live.characters} encounter={live.encounter} />
      <XPDistribution campaignId={campaignId} characters={live.characters} events={live.events} />
    </div> : null}
    {tab === 'quests' ? <ExistingSystem title="Quests" copy="Campaign objectives, hooks, and quest updates remain available during migration." tab="quests" /> : null}
    {tab === 'notes' ? <ExistingSystem title="GM Notes" copy="Private preparation, live notes, and session logs remain in the current GM system." tab="gm-notes" /> : null}
    {tab === 'economy' ? <ExistingSystem title="Economy" copy="Prices, trade routes, shipping, scarcity, merchants, and shops remain operational." tab="economy" /> : null}
    {tab === 'crafting' ? <ExistingSystem title="Crafting" copy="Projects, approvals, materials, recipes, and enchantments remain operational." tab="crafting" /> : null}
    {tab === 'tools' ? <div className="react-gm-tools-grid"><MagicElementRewards campaignId={campaignId} characters={live.characters} events={live.events} /><LootRewards campaignId={campaignId} characters={live.characters} events={live.events} /></div> : null}
    {tab === 'campaign' ? <Panel title="Campaign Manager"><p><b>UCN:</b> {live.campaign?.ucn || live.campaign?.uniqueCampaignCode || 'Not generated'}</p><p>{Object.keys(live.characters).length} linked character{Object.keys(live.characters).length === 1 ? '' : 's'}.</p><button onClick={() => { window.location.hash = ''; window.setView?.('campaigns'); }}>Open Campaign Manager</button></Panel> : null}
    {tab === 'world' ? <ExistingSystem title="World Systems" copy="World state, events, factions, settlements, merchants, and timeline tools remain available in the static workspace." tab="world" /> : null}
  </WorkspaceShell>;
}
