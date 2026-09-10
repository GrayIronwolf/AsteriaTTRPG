import { ManualNumberInput } from '../components/ManualNumberInput.jsx';
import { isManualNumber, manualNumber } from '../state/manualNumber.mjs';
import { openGMCharacter, restoredGMView } from '../app/gmCharacterNavigation.mjs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { AsteriaAppShell, DashboardNavigation, EmptyState, LiveSyncStatus, Panel, ResourceBar, StatusPill } from '../components/WorkspaceUI.jsx';
import { useCampaignLiveData } from '../sessions/useCampaignLiveData.js';
import { useArmourClass } from '../systems/armour/useArmourClass.js';
import { validateMarketPricing } from '../systems/items/marketPricing.mjs';
import { encounterResourcePair, encounterSourceResources } from '../state/encounterResourceModel.mjs';
import { migrateLegacyGMWorkspace, normalizeGMWorkspace } from '../state/gmWorkspaceModel.mjs';
import { resourcePair, soulDamageValue, soulHealingCap } from '../state/specialDamageModel.mjs';
import { buildSpellbookItem, normalizeSpellCompendiumEntries } from '../state/spellbookModel.mjs';
import { CampaignManagerWorkspace, CraftingWorkspace, EconomyWorkspace, GameplayWorkspace, NotesWorkspace, QuestWorkspace, WorldWorkspace } from './GMWorkspacePanels.jsx';

const GM_TABS = [
  { id: 'main', label: 'GM Main', icon: '\u25c8' },
  { id: 'quests', label: 'Quests', icon: '\u2691' },
  { id: 'notes', label: 'GM Notes', icon: '\u270e' },
  { id: 'economy', label: 'Economy', icon: '\u25ce' },
  { id: 'crafting', label: 'Crafting', icon: '\u2692' },
  { id: 'tools', label: 'GM Tools', icon: '\u2699' },
  { id: 'gameplay', label: 'Gameplay Systems', icon: '\u25a3' },
  { id: 'world', label: 'World Systems', icon: '\u2318' }
];

function progression(character = {}) {
  const fallback = { xp: Number(character.xp || 0), xpMax: Number(character.xpMax || 1000), percent: 0 };
  return window.AsteriaProgression?.progressSummary?.(Object.assign({}, character)) || fallback;
}

function CharacterRosterCard({ character, selected, presence, onSelect, onOpen }) {
  const xp = progression(character);
  const armour = useArmourClass(character);
  const soulDamage = soulDamageValue(character);
  const online = Object.values(presence || {}).some(record => record.characterId === character.id && record.state === 'online');
  return <button className={`react-party-card ${selected ? 'active' : ''}`} type="button" onClick={onSelect} onDoubleClick={onOpen}>
    <div className="react-party-name"><div><b>{character.name || 'Unnamed Character'}</b><small>{character.klass || character.class || 'Class'} | Level {Number(character.level || 0)}</small></div><StatusPill tone="info">AC {armour.finalAC}</StatusPill><span className={online ? 'presence online' : 'presence'} title={online ? 'Online' : 'Offline'} /></div>
    <ResourceBar compact label="HP" kind="hp" value={character.hp?.[0]} maximum={character.hp?.[1]} reserved={soulDamage} />
    <ResourceBar compact label="SP" kind="sp" value={character.sp?.[0]} maximum={character.sp?.[1]} />
    <ResourceBar compact label="MP" kind="mp" value={character.mp?.[0]} maximum={character.mp?.[1]} />
    {Array.isArray(character.bp) ? <ResourceBar compact label="BP" kind="bp" value={character.bp[0]} maximum={character.bp[1]} /> : null}
    <ResourceBar compact label="XP" kind="xp" value={xp.xp} maximum={xp.xpMax} />
  </button>;
}

function PartySidebar({ campaign, characters, selectedId, setSelectedId, presence, onOpen }) {
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
        onOpen={() => onOpen(character)}
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

const EMPTY_CUSTOM_REWARD = {
  name:'',
  type:'Item',
  itemClass:'Common',
  description:'',
  marketValue:'',
  marketPrice:'',
  isSpellbook:false
};

function spellCompendiumEntries() {
  const api = window.AsteriaUniversalCompendium;
  const source = api?.search?.('', { domain:'spell', includeGM:true })
    || api?.entries?.().filter(entry => entry.domain === 'spell')
    || window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries?.filter(entry => entry.domain === 'spell')
    || [];
  return normalizeSpellCompendiumEntries(source);
}

function encounterSources() {
  const codex = window.AsteriaCodexCompendium?.creatureEntries?.() || [];
  const npcStores = [window.npcs, window.NPCS, window.ASTERIA_NPC_DATA, window.ASTERIA_NPCS].filter(Boolean);
  const npcs = npcStores.flatMap(store => Array.isArray(store) ? store : Object.entries(store).map(([id, value]) => Object.assign({ id }, value)));
  const records = [
    ...codex.map(entry => ({ id:entry.id || entry.slug || slug(entry.title), name:entry.title || entry.name, type:entry.creatureType || entry.type || entry.category || 'Creature', threatTier:entry.threatTier || entry.tier || 'Tier 1', initiative:Number(entry.initiative ?? 10), ...encounterSourceResources(entry), source:'Creature Compendium', compendiumSlug:entry.slug || entry.id })),
    ...npcs.map(entry => ({ id:`npc-${entry.id || entry.slug || slug(entry.name || entry.title)}`, name:entry.name || entry.title || 'Unnamed NPC', type:entry.type || entry.category || 'NPC', threatTier:entry.threatTier || entry.tier || 'Tier 1', initiative:Number(entry.initiative ?? 10), ...encounterSourceResources(entry), source:'NPC', compendiumSlug:entry.slug || entry.id }))
  ].filter(entry => entry.name);
  const seen = new Set();
  return records.filter(entry => { const key=slug(entry.name); if(seen.has(key)) return false; seen.add(key); return true; });
}

function EncounterInitiativeInput({ entry, disabled, onCommit }) {
  const [value,setValue]=useState(String(Number(entry.initiative ?? 0)));
  useEffect(()=>setValue(String(Number(entry.initiative ?? 0))),[entry.id,entry.initiative]);
  const commit=()=>{
    const next=Number(value);
    if(!isManualNumber(value)) return setValue(String(Number(entry.initiative ?? 0)));
    if(next!==Number(entry.initiative ?? 0)) onCommit(next);
  };
  return <ManualNumberInput aria-label={`${entry.name} initiative`} disabled={disabled} value={value} onChange={event=>setValue(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){setValue(String(Number(entry.initiative??0)));event.currentTarget.blur();}}}/>;
}

function EncounterResourceControl({ campaignId, entry, resource, disabled, onMessage }) {
  const pair=encounterResourcePair(entry,resource);
  const [current,setCurrent]=useState(pair?String(pair[0]):'');
  const [maximum,setMaximum]=useState(pair?String(pair[1]):'');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{setCurrent(pair?String(pair[0]):'');setMaximum(pair?String(pair[1]):'');},[entry.id,resource,pair?.[0],pair?.[1]]);
  const save=async()=>{
    if(!isManualNumber(current,{min:0})||!isManualNumber(maximum,{min:1})||Number(current)>Number(maximum))return onMessage('Enter valid current and maximum resource values.');
    setBusy(true);
    onMessage(`Saving ${entry.name} ${resource.toUpperCase()}...`);
    const result=await firebaseService.updateEncounterResource(campaignId,entry.id,resource,current,maximum);
    onMessage(result?.ok?`${entry.name} ${resource.toUpperCase()} synchronized.`:result?.error||`${resource.toUpperCase()} could not be saved.`);
    setBusy(false);
  };
  return <div className={`react-encounter-resource ${pair?'':'missing'}`}>
    <header><b>{resource.toUpperCase()}</b><small>{pair?`${pair[0]} / ${pair[1]}`:'Not recorded'}</small></header>
    {pair?<ResourceBar compact label="" kind={resource} value={pair[0]} maximum={pair[1]} reserved={resource==='hp'?soulDamageValue(entry):0}/>:null}
    <div><ManualNumberInput aria-label={`${entry.name} current ${resource.toUpperCase()}`} min="0" placeholder="Current" disabled={disabled||busy} value={current} onChange={event=>setCurrent(event.target.value)}/><ManualNumberInput aria-label={`${entry.name} maximum ${resource.toUpperCase()}`} min="1" placeholder="Maximum" disabled={disabled||busy} value={maximum} onChange={event=>setMaximum(event.target.value)}/><button disabled={disabled||busy||current===''||maximum===''} onClick={save}>{pair?'Apply':'Set'}</button></div>
  </div>;
}

function CampaignEncounter({ campaignId, characters, encounter }) {
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState('');
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
    if(!isManualNumber(quantity,{min:1,max:20}))return setMessage('Enter a whole creature quantity from 1 to 20.');
    const resources=Object.fromEntries(['hp','sp','mp'].filter(key=>Array.isArray(source[key])).map(key=>[key,[...source[key]]]));
    const added = Array.from({ length:Math.max(1, Math.min(20, Number(quantity || 1))) }, (_, index) => ({ id:`enemy-${Date.now()}-${index}`, sourceId:source.id, compendiumSlug:source.compendiumSlug || '', name:Number(quantity) > 1 ? `${source.name} ${index + 1}` : source.name, kind:'enemy', type:source.type, threatTier:source.threatTier, initiative:source.initiative, ...resources, defeated:false }));
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
      <section><h3>Add Creature or NPC</h3><div className="react-form-grid"><label>Search<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search creature compendium and NPCs..." /></label><label>Number<ManualNumberInput min="1" max="20" value={quantity} onChange={event => setQuantity(event.target.value)} /></label></div>{search ? <div className="react-search-results encounter">{results.map(entry => <button key={entry.id} onClick={() => addEnemy(entry)}><b>{entry.name}</b><small>{entry.type} | {entry.threatTier}</small></button>)}{!results.length ? <EmptyState title="No matches" /> : null}</div> : null}</section>
      <section><h3>Initiative Order</h3><div className="react-initiative-list">{(state.combatants || []).map((entry,index) => <article key={entry.id} className={`${index === Number(state.turnIndex || 0) && state.status === 'active' ? 'active' : ''} ${entry.defeated ? 'defeated' : ''}`}><span>{index + 1}</span><div className="react-encounter-combatant"><b>{entry.name}</b><small>{entry.kind === 'player' ? 'Player Character' : entry.type || 'Enemy'}</small>{entry.kind === 'enemy'?<div className="react-encounter-resources">{['hp','sp','mp'].map(resource=><EncounterResourceControl key={resource} campaignId={campaignId} entry={entry} resource={resource} disabled={busy} onMessage={setMessage}/>)}</div>:null}</div><EncounterInitiativeInput entry={entry} disabled={busy} onCommit={initiative=>updateCombatant(entry.id,{initiative})}/>{entry.kind === 'enemy' ? <button title="Toggle defeated" disabled={busy} onClick={() => updateCombatant(entry.id, { defeated:!entry.defeated })}>{entry.defeated ? 'Restore' : 'Defeat'}</button> : null}<button aria-label={`Remove ${entry.name}`} disabled={busy} onClick={() => removeCombatant(entry.id)}>X</button></article>)}{!(state.combatants || []).length ? <EmptyState title="No initiative entries">Start the encounter to add every linked character.</EmptyState> : null}</div></section>
    </div>
  </Panel>;
}

function SpecialDamageControl({ campaignId, characters, encounter }) {
  const targets = [
    ...Object.values(characters).map(character => ({ key:`character:${character.id}`, kind:'character', id:character.id, name:character.name || 'Character', record:character })),
    ...(encounter?.enemies || []).map(enemy => ({ key:`creature:${enemy.id}`, kind:'creature', id:enemy.id, name:enemy.name || 'Creature', record:enemy }))
  ];
  const [targetKey, setTargetKey] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if(!targets.some(target => target.key === targetKey)) setTargetKey(targets[0]?.key || '');
  }, [targetKey, characters, encounter]);
  const target = targets.find(value => value.key === targetKey);
  const hp = resourcePair(target?.record?.hp);
  const soulDamage = soulDamageValue(target?.record);
  const update = async mode => {
    if(!target || !isManualNumber(amount,{min:1,max:Math.max(1,hp[1])})) return setMessage('Choose a target and enter an amount.');
    setBusy(true);
    setMessage(mode === 'recover' ? 'Recovering Soul Damage...' : 'Applying Soul Damage...');
    const result = await firebaseService.updateSpecialDamage(campaignId, { kind:target.kind, id:target.id }, Number(amount), mode, { source:'GM Dashboard' });
    setMessage(result?.ok ? `${target.name}: ${result.soulDamage} Soul Damage remains.` : result?.error || 'Soul Damage could not be updated.');
    setBusy(false);
  };
  return <Panel title="Special Damage" eyebrow="Soul Damage Control" icon="soul" className="react-gm-special-damage" action={target ? <StatusPill tone={soulDamage ? 'pending' : 'success'}>{soulDamage} Soul</StatusPill> : null}>
    {!targets.length ? <EmptyState title="No available targets">Linked characters and encounter creatures appear here.</EmptyState> : <>
      <div className="react-form-grid"><label>Player or Creature<select value={targetKey} onChange={event => setTargetKey(event.target.value)}>{targets.map(value => <option key={value.key} value={value.key}>{value.kind === 'creature' ? 'Creature' : 'Player'} | {value.name}</option>)}</select></label><label>Amount<ManualNumberInput min="1" max={Math.max(1, hp[1])} value={amount} onChange={event => setAmount(event.target.value)} /></label></div>
      <div className="react-gm-special-target"><ResourceBar label={`${target?.name || 'Target'} HP`} kind="hp" value={hp[0]} maximum={hp[1]} reserved={soulDamage} /><span>{soulDamage ? `${soulDamage} HP is sealed. Ordinary healing is capped at ${soulHealingCap(target.record)} HP.` : 'No Soul Damage is recorded.'}</span></div>
      <div className="react-gm-special-actions"><button className="danger" disabled={busy || !target} onClick={() => update('apply')}>Apply Soul Damage</button><button disabled={busy || !target || !soulDamage} onClick={() => update('recover')}>Recover Soul Damage</button></div>
      <p className="react-special-damage-copy">Soul Damage cannot be magically healed. Recovery represents natural time passing and should follow the Soul Damage System.</p>
    </>}
    <p className="react-action-message" role="status">{message}</p>
  </Panel>;
}

function XPDistribution({ campaignId, characters, events }) {
  const [selected, setSelected] = useState([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Campaign reward');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => setSelected(current => current.filter(id => characters[id])), [characters]);
  const send = async () => {
    if(!selected.length || !isManualNumber(amount,{min:1})) return setMessage('Choose at least one character and enter an XP amount.');
    setBusy(true); setMessage('Sending XP...');
    const results = await Promise.allSettled(selected.map(characterId => firebaseService.grantXP(campaignId, characterId, Number(amount), { reason, source: 'GM Dashboard' })));
    const failed = results.filter(result => result.status === 'rejected' || !result.value?.ok).length;
    setMessage(failed ? `${failed} XP award${failed === 1 ? '' : 's'} could not be delivered.` : `XP delivered to ${selected.length} character dashboard${selected.length === 1 ? '' : 's'}.`);
    setBusy(false);
  };
  const xpEvents = events.filter(event => event.type === 'xp-reward').slice(0, 6);
  return <Panel title="Party XP Distribution" eyebrow="Campaign Progression" className="react-xp-panel">
    <div className="react-form-grid">
      <label>XP per character<ManualNumberInput min="1" value={amount} onChange={event => setAmount(event.target.value)} /></label>
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

function LootRewards({ campaignId, characters, events, customItems }) {
  const catalog = useMemo(() => {
    const source = [...(window.AsteriaInventory?.catalogEntries?.() || []), ...(customItems || [])];
    const seen = new Set();
    return source.filter(item => {
      const key = String(item.slug || item.id || item.title || item.name || '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [customItems]);
  const [target, setTarget] = useState('');
  const [search, setSearch] = useState('');
  const [item, setItem] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [customMode,setCustomMode]=useState(false);
  const [custom,setCustom]=useState(EMPTY_CUSTOM_REWARD);
  const [spellSearch,setSpellSearch]=useState('');
  const [selectedSpellId,setSelectedSpellId]=useState('');
  const [message,setMessage]=useState('');
  const spellCatalog=useMemo(spellCompendiumEntries,[]);
  const selectedSpell=spellCatalog.find(spell=>spell.id===selectedSpellId)||null;
  const spellResults=spellCatalog.filter(spell=>`${spell.name} ${spell.element} ${spell.rank}`.toLowerCase().includes(spellSearch.toLowerCase())).slice(0,12);
  const pricedCustom={...custom,marketValue:manualNumber(custom.marketValue),marketPrice:manualNumber(custom.marketPrice)};
  const customPricing=validateMarketPricing(pricedCustom);
  const results = catalog.filter(entry => String(entry.title || entry.name || '').toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  useEffect(() => { if(!target && Object.keys(characters)[0]) setTarget(Object.keys(characters)[0]); }, [characters, target]);
  const send = async () => {
    if(!target || !item) return;
    if(!isManualNumber(quantity,{min:1}))return setMessage('Enter a whole reward quantity of at least 1.');
    setBusy(true);
    const snapshot = window.AsteriaInventory?.itemSnapshot?.(item, manualNumber(quantity)) || Object.assign({}, item, { qty: manualNumber(quantity) });
    const result=await firebaseService.createLootReward(campaignId, target, snapshot, { message: 'The GM awarded an unidentified item.' });
    setMessage(result?.ok?'Unidentified reward sent.':result?.error||'Reward could not be sent.');
    setBusy(false); setItem(null); setSearch('');
  };
  const selectSpell=spell=>{
    setSelectedSpellId(spell.id);
    setCustom(value=>({
      ...value,
      name:`${spell.name} Spellbook`,
      type:'Spellbook',
      isSpellbook:true,
      description:spell.summary
    }));
  };
  const toggleSpellbook=checked=>{
    setSelectedSpellId('');
    setSpellSearch('');
    setCustom(value=>({
      ...value,
      name:'',
      type:checked?'Spellbook':'Item',
      description:'',
      isSpellbook:checked
    }));
  };
  const resetCustomReward=()=>{
    setCustom(EMPTY_CUSTOM_REWARD);
    setSelectedSpellId('');
    setSpellSearch('');
    setCustomMode(false);
  };
  const createAndSend=async()=>{
    if(!target){setMessage('Choose a recipient.');return;}
    if(!isManualNumber(quantity,{min:1}))return setMessage('Enter a whole reward quantity of at least 1.');
    if(!isManualNumber(custom.marketValue,{min:0,integer:false,optional:true})||!isManualNumber(custom.marketPrice,{min:0,integer:false,optional:true}))return setMessage('Enter valid market prices, or leave blank for zero.');
    if(custom.isSpellbook&&!selectedSpell){setMessage('Select a spell from the Spell Compendium.');return;}
    if(!custom.name.trim()||!customPricing.valid){setMessage(customPricing.errors[0]||'Complete the custom item.');return;}
    setBusy(true);
    try{
      const source=custom.isSpellbook
        ? buildSpellbookItem(selectedSpell,pricedCustom)
        : {...pricedCustom,basicName:custom.type||'Item'};
      const created=await firebaseService.createCustomItem(campaignId,source);
      if(!created?.ok){setMessage(created?.error||'Custom item could not be created.');return;}
      const result=await firebaseService.createLootReward(campaignId,target,{...created.item,qty:manualNumber(quantity)},{message:custom.isSpellbook?'The GM awarded an unidentified spellbook.':'The GM awarded an unidentified custom item.'});
      setMessage(result?.ok?'Custom reward added to the shared catalog and sent.':result?.error||'Reward could not be sent.');
      if(result?.ok) resetCustomReward();
    }catch(error){
      setMessage(error.message||String(error));
    }finally{
      setBusy(false);
    }
  };
  return <Panel title="Loot Reward" eyebrow="GM Reward Tool" className="react-loot-panel">
    <div className="react-form-grid">
      <label>Recipient<select value={target} onChange={event => setTarget(event.target.value)}>{Object.values(characters).map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <label>Search Item Compendium<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search exact item..." /></label>
      <label>Quantity<ManualNumberInput min="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
    </div>
    {search ? <div className="react-search-results">{results.map(entry => <button key={entry.slug || entry.id || entry.title} onClick={() => setItem(entry)} className={item === entry ? 'active' : ''}>{entry.title || entry.name}</button>)}</div> : null}
    <div className="react-action-row"><button className="primary" disabled={busy || !item || !target} onClick={send}>{busy ? 'Sending...' : `Send ${item?.title || item?.name || 'Reward'}`}</button><button disabled={busy} onClick={()=>setCustomMode(value=>!value)}>{customMode?'Cancel Custom Item':'Create Custom Item / Spellbook'}</button></div>
    {customMode?<div className="react-custom-loot-form">
      <div className="react-custom-loot-heading"><h3>{custom.isSpellbook?'Create Spellbook':'Create Custom Item'}</h3><label className="react-check-row"><input type="checkbox" checked={custom.isSpellbook} onChange={event=>toggleSpellbook(event.target.checked)}/>Spellbook from Spell Compendium</label></div>
      {custom.isSpellbook?<section className="react-spellbook-picker" aria-label="Spell Compendium search">
        <label>Search Spell Compendium<input type="search" value={spellSearch} onChange={event=>setSpellSearch(event.target.value)} placeholder="Search by spell name, element, or rank..."/></label>
        <div className="react-spellbook-results" role="listbox" aria-label="Spell Compendium results">
          {spellResults.map(spell=><button type="button" role="option" aria-selected={selectedSpellId===spell.id} className={selectedSpellId===spell.id?'active':''} key={spell.id} onClick={()=>selectSpell(spell)}>
            <span className="react-spellbook-result-image">{spell.image?<img src={spell.image} alt="" loading="lazy"/>:<span>{spell.name.charAt(0)}</span>}</span>
            <span><b>{spell.name}</b><small>{spell.element} | {spell.rank}{spell.manaCost?` | ${spell.manaCost}`:''}</small></span>
          </button>)}
          {!spellResults.length?<EmptyState title={spellCatalog.length?'No matching spells':'Spell Compendium unavailable'}>{spellCatalog.length?'Try another spell name, element, or rank.':'No spell records were available to create a spellbook.'}</EmptyState>:null}
        </div>
        {selectedSpell?<div className="react-selected-spell" role="status"><span className="react-spellbook-result-image">{selectedSpell.image?<img src={selectedSpell.image} alt=""/>:<span>{selectedSpell.name.charAt(0)}</span>}</span><div><small>Selected Spell</small><b>{selectedSpell.name}</b><span>{selectedSpell.element} | {selectedSpell.rank}{selectedSpell.manaCost?` | ${selectedSpell.manaCost}`:''}</span></div></div>:<p className="react-help">Select one compendium spell to bind into the new book.</p>}
      </section>:null}
      <div className="react-form-grid"><label>{custom.isSpellbook?'Spellbook Name':'Name'}<input value={custom.name} placeholder={custom.isSpellbook?'Select a spell to create its book':''} onChange={event=>setCustom(value=>({...value,name:event.target.value}))}/></label><label>Type<input value={custom.type} readOnly={custom.isSpellbook} onChange={event=>setCustom(value=>({...value,type:event.target.value}))}/></label><label>Item Class<select value={custom.itemClass} onChange={event=>setCustom(value=>({...value,itemClass:event.target.value}))}>{['Common','Uncommon','Unusual','Rare','Epic','Mythic','Legendary','Relic'].map(value=><option key={value}>{value}</option>)}</select></label></div>
      <fieldset className="react-market-form"><legend>Market Information</legend><div className="react-form-grid"><label>Market Value <small>Marks received when selling</small><ManualNumberInput min="0" step="0.01" value={custom.marketValue} onChange={event=>setCustom(value=>({...value,marketValue:event.target.value}))}/></label><label>Market Price <small>Marks paid when purchasing</small><ManualNumberInput min="0" step="0.01" value={custom.marketPrice} onChange={event=>setCustom(value=>({...value,marketPrice:event.target.value}))}/></label></div>{!customPricing.valid?<p className="react-storage-warning">{customPricing.errors[0]}</p>:pricedCustom.marketValue===0&&pricedCustom.marketPrice===0?<p className="react-help">Blank or zero prices mark this item as Not Normally Tradeable.</p>:null}</fieldset>
      <label>Description<textarea rows="4" value={custom.description} onChange={event=>setCustom(value=>({...value,description:event.target.value}))}/></label>
      <button className="primary" disabled={busy||!target||!custom.name.trim()||!customPricing.valid||(custom.isSpellbook&&!selectedSpell)} onClick={createAndSend}>{custom.isSpellbook?'Create Spellbook & Send':'Create in Compendium & Send'}</button>
    </div>:null}
    <p>{message}</p>
    <div className="react-delivery-list">{events.filter(event => event.type === 'loot-reward').slice(0, 6).map(event => <div key={event.id}><b>{event.payload?.item?.name || 'Item'}</b><span>{characters[event.targetCharacterId]?.name || 'Character'}</span><StatusPill tone={event.status === 'pending' ? 'pending' : 'success'}>{event.status || 'pending'}</StatusPill></div>)}</div>
  </Panel>;
}

function PlayerManagementTools({ campaignId, characters }) {
  const [selected,setSelected]=useState([]);const [title,setTitle]=useState('');const [slots,setSlots]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const [manageCharacterId,setManageCharacterId]=useState('');const [titleEdits,setTitleEdits]=useState({});
  useEffect(()=>setSelected(current=>current.filter(id=>characters[id])),[characters]);
  useEffect(()=>{if(!manageCharacterId||!characters[manageCharacterId])setManageCharacterId(Object.keys(characters)[0]||'');},[characters,manageCharacterId]);
  const run=async(operation,success)=>{setBusy(true);const result=await operation();setMessage(result?.ok?success:result?.error||'The GM change could not be saved.');setBusy(false);return result;};
  const managed=characters[manageCharacterId];
  const managedTitles=(Array.isArray(managed?.titles)?managed.titles:[]).map((value,index)=>typeof value==='string'?{id:`title-${index}`,text:value}:value);
  return <Panel title="Player Titles & Storage" eyebrow="GM Character Tools">
    <div className="react-recipient-actions"><button onClick={()=>setSelected(Object.keys(characters))}>Select All</button><button onClick={()=>setSelected([])}>Clear</button><span>{selected.length} selected</span></div>
    <div className="react-recipient-grid">{Object.values(characters).map(character=><label key={character.id}><input type="checkbox" checked={selected.includes(character.id)} onChange={event=>setSelected(ids=>event.target.checked?[...new Set([...ids,character.id])]:ids.filter(id=>id!==character.id))}/>{character.name}</label>)}</div>
    <div className="react-gm-grant-grid"><section><h3>Grant Player Title</h3><label>Title<input value={title} onChange={event=>setTitle(event.target.value)} placeholder="e.g. Hero of Elarion"/></label><button className="primary" disabled={busy||!selected.length||!title.trim()} onClick={async()=>{const result=await run(()=>firebaseService.grantTitle(campaignId,selected,title),'Title granted to selected characters.');if(result?.ok)setTitle('');}}>Grant Title</button></section><section><h3>Grant Storage Slots</h3><label>Additional Slots<ManualNumberInput min="1" max="10" value={slots} onChange={event=>setSlots(event.target.value)}/></label><button className="primary" disabled={busy||!selected.length} onClick={()=>{if(!isManualNumber(slots,{min:1,max:10}))return setMessage('Enter a whole slot amount from 1 to 10.');return run(()=>firebaseService.grantStorageSlots(campaignId,selected,manualNumber(slots)),'Storage slots granted.');}}>Grant Slots</button></section></div>
    <section className="react-title-manager"><h3>Manage Existing Titles</h3><label>Character<select value={manageCharacterId} onChange={event=>setManageCharacterId(event.target.value)}>{Object.values(characters).map(character=><option key={character.id} value={character.id}>{character.name}</option>)}</select></label><div>{managedTitles.map(record=><article key={record.id}><input aria-label={`Edit ${record.text}`} value={titleEdits[record.id]??record.text} onChange={event=>setTitleEdits(current=>({...current,[record.id]:event.target.value}))}/><button disabled={busy} onClick={()=>run(()=>firebaseService.manageTitle(campaignId,manageCharacterId,record.id,{text:titleEdits[record.id]??record.text}),'Player title updated.')}>Save</button><button className="danger" disabled={busy} onClick={()=>run(()=>firebaseService.manageTitle(campaignId,manageCharacterId,record.id,{revoke:true}),'Player title revoked.')}>Revoke</button></article>)}{!managedTitles.length?<p className="react-help">This character has no granted titles.</p>:null}</div></section>
    <p>{message}</p>
  </Panel>;
}

function ACInspectionPanel({ campaignId, characters, selectedId, setSelectedId }) {
  const character=characters[selectedId]||Object.values(characters)[0]||null;
  const armour=useArmourClass(character||{});
  const [name,setName]=useState('GM AC Modifier');
  const [value,setValue]=useState('');
  const [duration,setDuration]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const decimal=amount=>Number(amount).toFixed(2).replace(/\.00$/,'');
  const signed=amount=>`${Number(amount)>=0?'+':''}${decimal(amount)}`;
  const save=async modifier=>{
    if(!character)return;
    if(!modifier.remove){
      if(!isManualNumber(modifier.value)||!Number(modifier.value)||!isManualNumber(modifier.durationMinutes,{min:0,max:10080,optional:true}))return setMessage('Enter a non-zero AC change and a valid duration. Leave duration blank for no expiry.');
      modifier={...modifier,value:manualNumber(modifier.value),durationMinutes:manualNumber(modifier.durationMinutes)};
    }
    setBusy(true);setMessage('Saving AC modifier...');
    const result=await firebaseService.setACModifier(campaignId,character.id,modifier);
    setMessage(result?.ok?'Armour Class modifier synchronized.':result?.error||'AC modifier could not be saved.');
    setBusy(false);
  };
  return <Panel title="Armour Class Inspector" eyebrow="GM Character Tool" className="react-gm-ac-panel" action={character?<StatusPill tone="info">Final AC {armour.finalAC}</StatusPill>:null}>
    <label>Character<select value={character?.id||''} onChange={event=>setSelectedId(event.target.value)}>{Object.values(characters).map(entry=><option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
    {!character?<EmptyState title="No linked characters">Link a character to inspect its live Armour Class.</EmptyState>:<>
      <div className="react-ac-summary"><div><span>Natural</span><strong>{armour.naturalAC}</strong></div><div><span>Armour</span><strong>{signed(armour.armourAC)}</strong></div><div><span>Type Set</span><strong>{signed(armour.armourTypeSetBonus)}</strong><small>{armour.armourType||'None'}</small></div><div><span>Modifiers</span><strong>{signed(armour.modifierTotal)}</strong></div></div>
      <div className="react-ac-equation"><span>{decimal(armour.naturalAC)} + {decimal(armour.armourAC)} + {decimal(armour.armourTypeSetBonus)} + {decimal(armour.modifierTotal)}</span><b>Raw {decimal(armour.rawAC)}</b><strong>Final AC {armour.finalAC}</strong></div>
      <div className="react-ac-piece-list">{armour.armourPieces.map(piece=><article className={piece.valid?'':'is-invalid'} key={piece.itemId}><div><b>{piece.name}</b><small>{piece.piece?.name||'Unknown'} | {piece.materialName} | {piece.quality.name}</small></div><span>{decimal(piece.modifiedBaseAC)} x {Math.round(piece.percentile*100)}%</span><strong>{signed(piece.contribution)} AC</strong></article>)}{!armour.armourPieces.length?<p className="react-quiet-state">No equipped armour pieces.</p>:null}</div>
      <div className="react-gm-ac-form"><label>Modifier Name<input value={name} onChange={event=>setName(event.target.value)}/></label><label>AC Change<ManualNumberInput step="1" value={value} onChange={event=>setValue(event.target.value)}/></label><label>Duration (minutes)<ManualNumberInput min="0" max="10080" value={duration} onChange={event=>setDuration(event.target.value)}/></label><button className="primary" disabled={busy||!name.trim()||!Number(value)} onClick={()=>save({name,value,durationMinutes:duration})}>Apply Modifier</button></div>
      <div className="react-delivery-list">{armour.modifiers.filter(modifier=>modifier.sourceType==='gm').map(modifier=><div key={modifier.id}><b>{modifier.name}</b><span>{signed(modifier.value)} AC{modifier.temporary?' (temporary)':''}</span><button className="danger" disabled={busy} onClick={()=>save({id:modifier.id,remove:true})}>Remove</button></div>)}{!armour.modifiers.some(modifier=>modifier.sourceType==='gm')?<p className="react-help">No GM AC modifiers are active.</p>:null}</div>
      {[...armour.validation.errors,...armour.validation.warnings].length?<div className="react-ac-warnings">{[...armour.validation.errors,...armour.validation.warnings].map(warning=><p key={warning}>{warning}</p>)}</div>:null}
    </>}
    <p className="react-action-message" role="status">{message}</p>
  </Panel>;
}

export function GMDashboard({ campaignId }) {
  const live = useCampaignLiveData(campaignId, { mode: 'gm' });
  const restored = restoredGMView(campaignId, firebaseService.currentUser()?.uid);
  const [tab, setTab] = useState(() => GM_TABS.some(item => item.id === restored.tab) ? restored.tab : 'main');
  const [selectedId, setSelectedId] = useState(restored.selectedId || '');
  useEffect(() => { if(!live.loading && restored.scrollY) window.scrollTo(0, restored.scrollY); }, [live.loading]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const migrationStarted = useRef(false);
  useEffect(() => { if(!selectedId && Object.keys(live.characters)[0]) setSelectedId(Object.keys(live.characters)[0]); }, [live.characters, selectedId]);
  useEffect(() => {
    if(migrationStarted.current || !live.gmWorkspaceLoaded || live.gmWorkspace || !live.campaign) return;
    migrationStarted.current=true;
    const seed=migrateLegacyGMWorkspace({
      campaign:live.campaign,
      gameplay:window.AsteriaGameplay?.state?.() || {},
      world:window.AsteriaWorld?.world?.() || {},
      partyWorkspace:live.partyWorkspace,
      itemEcosystem:live.itemEcosystem
    });
    firebaseService.saveGMWorkspace(campaignId,seed).then(result=>{
      if(!result?.ok){migrationStarted.current=false;setActionError(result?.error||'Legacy GM systems could not be initialized.');}
    });
  },[campaignId,live.campaign,live.gmWorkspace,live.gmWorkspaceLoaded,live.itemEcosystem,live.partyWorkspace]);
  const workspace=useMemo(()=>normalizeGMWorkspace(live.gmWorkspace||{},live.campaign||{}),[live.gmWorkspace,live.campaign]);
  const saveSection=(section,value)=>firebaseService.saveGMWorkspace(campaignId,{[section]:value});
  const run = async operation => { setBusy(true); setActionError(''); try { await operation(); } catch(error) { setActionError(error.message || String(error)); } finally { setBusy(false); } };
  if(live.loading) return <div className="react-route-state">Connecting GM Dashboard...</div>;
  if(!window.AsteriaCharacterAccess.isGM(live.campaign, firebaseService.currentUser()?.uid)) return <div className="react-route-state" role="alert">You do not have GM access to this campaign.</div>;
  return <AsteriaAppShell
    className="react-gm-dashboard"
    eyebrow="GM Dashboard"
    title={live.campaign?.name || 'Campaign'}
    subtitle="Live campaign control, party resources, rewards, encounters, and session tools."
    sidebar={<PartySidebar campaign={live.campaign || { id: campaignId }} characters={live.characters} selectedId={selectedId} setSelectedId={setSelectedId} presence={live.presence} onOpen={character => openGMCharacter(live.campaign, character, { tab })} />}
    actions={<><SessionActions campaignId={campaignId} session={live.session} busy={busy} run={run} /><LiveSyncStatus online={live.online} connectionState={live.connectionState} error={live.error || actionError} loading={live.loading} session={live.session} /></>}
  >
    <DashboardNavigation tabs={GM_TABS} active={tab} onChange={setTab} ariaLabel="GM Dashboard menu" />
    {tab === 'main' ? <div className="react-gm-main-grid">
      <CampaignEncounter campaignId={campaignId} characters={live.characters} encounter={live.encounter} />
      <XPDistribution campaignId={campaignId} characters={live.characters} events={live.events} />
      <SpecialDamageControl campaignId={campaignId} characters={live.characters} encounter={live.encounter} />
    </div> : null}
    {tab === 'quests' ? <QuestWorkspace campaignId={campaignId} workspace={workspace} characters={live.characters} saveSection={saveSection}/> : null}
    {tab === 'notes' ? <NotesWorkspace workspace={workspace} session={live.session} saveSection={saveSection}/> : null}
    {tab === 'economy' ? <EconomyWorkspace campaignId={campaignId} workspace={workspace} characters={live.characters} itemEcosystem={live.itemEcosystem} customItems={live.customItems} saveSection={saveSection}/> : null}
    {tab === 'crafting' ? <CraftingWorkspace workspace={workspace} characters={live.characters} saveSection={saveSection}/> : null}
    {tab === 'tools' ? <div className="react-gm-tools-grid"><CampaignManagerWorkspace campaignId={campaignId} campaign={live.campaign} characters={live.characters} session={live.session} workspace={workspace} saveSection={saveSection}/><ACInspectionPanel campaignId={campaignId} characters={live.characters} selectedId={selectedId} setSelectedId={setSelectedId}/><PlayerManagementTools campaignId={campaignId} characters={live.characters}/><MagicElementRewards campaignId={campaignId} characters={live.characters} events={live.events} /><LootRewards campaignId={campaignId} characters={live.characters} events={live.events} customItems={live.customItems}/></div> : null}
    {tab === 'gameplay' ? <GameplayWorkspace campaignId={campaignId} workspace={workspace} partyWorkspace={live.partyWorkspace} saveSection={saveSection}/> : null}
    {tab === 'world' ? <WorldWorkspace workspace={workspace} saveSection={saveSection}/> : null}
  </AsteriaAppShell>;
}
