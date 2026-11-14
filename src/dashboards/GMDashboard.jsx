import { CampaignInformationWorkspace } from './CampaignInformationWorkspace.jsx';
import { PCInventory } from './PCInventory.jsx';
import { ConditionsPanel, RestRequestsPanel, ResourceRulesPanel } from './CharacterSystemsPanels.jsx';
import { useCharacterSystemsSync } from '../sessions/useCharacterSystemsSync.js';
import { reconcileCharacterSystems } from '../state/characterSystems.mjs';
import { resolveRosterSelection } from '../state/dashboardNavigation.mjs';
import { DashboardLayoutEditor, DashboardLayoutWorkspace } from '../components/DashboardCustomisation.jsx';
import { GMCombatOverview, GMExplorationOverview, GMQuestTracker, GMInventoryOverview } from './DashboardFocusPanels.jsx';
import { GMToolkitHub, GMToolkitQuickAccess } from './GMToolkitHub.jsx';
import { GMUniversalCheckManager, GMUniversalCheckNotification } from './UniversalCheckWorkspace.jsx';
import { GMFocusModes } from './GMFocusModes.jsx';
import { GMPartyControl } from './GMPartyControl.jsx';
import { GMNpcCreatureLibrary } from './GMNpcCreatureLibrary.jsx';
import {GMBattleMapManager} from './BattleMapWorkspace.jsx';
import {AdvancedDiceWorkspace} from './AdvancedDiceWorkspace.jsx';
import {GMRandomTableWorkspace} from './GMRandomTableWorkspace.jsx';
import {GMEncounterRewardWorkspace} from './GMEncounterRewardWorkspace.jsx';
import {AsteriaCalendarWorkspace} from './AsteriaCalendarWorkspace.jsx';
import {GMWeatherEnvironmentWorkspace} from './WeatherEnvironmentWorkspace.jsx';
import {GMWorldAtlasWorkspace} from './WorldAtlasWorkspace.jsx';
import {GMSessionLibraryWorkspace} from './SessionLibraryWorkspace.jsx';
import {GMCampaignSoundboard} from './CampaignSoundboardWorkspace.jsx';
import { GMLayoutBackup } from './GMLayoutBackup.jsx';
import { defaultDashboardLayout, normalizeDashboardLayout, visibleDashboardPanels } from '../state/dashboardLayoutModel.mjs';
import { talentCatalog } from './characterWorkspaceData.js';
import { resourceDefinitions, storedResource } from '../state/resourceEngine.mjs';
import { ManualNumberInput } from '../components/ManualNumberInput.jsx';
import { isManualNumber, manualNumber } from '../state/manualNumber.mjs';
import { openGMCharacter, restoredGMView } from '../app/gmCharacterNavigation.mjs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { AsteriaAppShell, DashboardNavigation, EmptyState, LiveSyncStatus, Panel, ResourceBar, StatusPill } from '../components/WorkspaceUI.jsx';
import { useCampaignLiveData } from '../sessions/useCampaignLiveData.js';
import { useArmourClass } from '../systems/armour/useArmourClass.js';
import { validateMarketPricing } from '../systems/items/marketPricing.mjs';
import { encounterResourcePair, encounterSourceResources, encounterResourceKeys, encounterXP, customEncounterCreature } from '../state/encounterResourceModel.mjs';
import { libraryEncounterReady } from '../state/gmNpcCreatureLibraryModel.mjs';
import { GMCombatPanel } from './CombatPanel.jsx';
import { useAsyncAction } from '../components/useAsyncAction.js';
import { encounterPlayerRoster } from '../state/campaignCharacterRecords.mjs';
import { migrateLegacyGMWorkspace, normalizeGMWorkspace } from '../state/gmWorkspaceModel.mjs';
import { resourcePair, soulDamageValue, soulHealingCap } from '../state/specialDamageModel.mjs';
import { buildSpellbookItem, normalizeSpellCompendiumEntries } from '../state/spellbookModel.mjs';
import { CampaignManagerWorkspace, CraftingWorkspace, EconomyWorkspace, GameplayWorkspace, NotesWorkspace, QuestWorkspace, WorldWorkspace } from './GMWorkspacePanels.jsx';
import { GMRewardTools } from './GMRewardTools.jsx';
import { GMPartyLootPanel } from './PartyLootWorkspace.jsx';
import { GMInventoryAuditWorkspace } from './GMInventoryAuditWorkspace.jsx';
import { gmTradeLootOverview } from '../state/gmTradeLootHubModel.mjs';

const GM_TABS = [
  { id: 'main', label: 'GM Main', icon: '\u25c8' },
  { id: 'toolkit', label: 'GM Toolkit', icon: 'settings' },
  { id: 'bestiary', label: 'NPC & Creature Library', icon: 'journal' },
  { id: 'settings', label: 'Dashboard Settings', icon: 'settings' },
  { id: 'inventory', label: 'PC Inventory', icon: 'inventory' },
  { id:'information', label:'News & Events', icon:'journal' },
  { id: 'quests', label: 'Quests', icon: '\u2691' },
  { id: 'notes', label: 'GM Notes', icon: '\u270e' },
  { id: 'session-library', label: 'Session Library', icon: 'journal' },
  { id: 'soundboard', label: 'Soundboard & Ambience', icon: 'journal' },
  { id: 'economy', label: 'Economy', icon: '\u25ce' },
  { id: 'crafting', label: 'Crafting', icon: '\u2692' },
  { id: 'tools', label: 'GM Tools', icon: '\u2699' },
  { id: 'gameplay', label: 'Gameplay Systems', icon: '\u25a3' },
  { id: 'world', label: 'World Systems', icon: '\u2318' },
  { id: 'battle-maps', label: 'Battle Maps', icon: 'journal' },
  { id: 'advanced-dice', label: 'Advanced Dice', icon: 'settings' },
  { id: 'random-tables', label: 'Random Tables', icon: 'journal' },
  { id: 'encounter-rewards', label: 'Encounter Generator', icon: 'journal' },
  { id: 'asteria-calendar', label: 'Asteria Calendar', icon: 'journal' },
  { id: 'weather-environment', label: 'Weather Generator', icon: 'journal' },
  { id: 'world-atlas', label: 'World Atlas', icon: 'journal' }
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
  return <article className={`react-party-card ${selected ? 'active' : ''}`}>
    <div className="react-party-name"><div><b>{character.name || 'Unnamed Character'}</b><small>{character.klass || character.class || 'Class'} | Level {Number(character.level || 0)}</small></div><StatusPill tone="info">AC {armour.finalAC}</StatusPill><span className={online ? 'presence online' : 'presence'} title={online ? 'Online' : 'Offline'} /></div>
    {resourceDefinitions(character).map(row=>{const [value,maximum]=resourcePair(storedResource(character,row.id));return <ResourceBar key={row.id} compact label={row.name} kind={row.id} value={value} maximum={maximum} reserved={row.id==='hp'?soulDamage:0}/>;})}
    <ResourceBar compact label="XP" kind="xp" value={xp.xp} maximum={xp.xpMax} />
    <div className="react-party-card-actions">
      <button type="button" aria-pressed={selected} onClick={onSelect}>{selected ? 'Selected' : 'Select'}</button>
      <button type="button" onClick={onOpen} aria-label={`Open ${character.name || 'character'} dashboard`}>Open Character</button>
    </div>
  </article>;
}

function PartySidebar({ campaign, characters, selectedId, setSelectedId, presence, onOpen }) {
  const partyIds = campaign?.party?.length ? campaign.party : Object.keys(characters);
  return <Panel title="Player Resources" className="react-party-sidebar">
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
      {!partyIds.some(id => Boolean(characters[id])) ? <EmptyState title="No linked characters">Characters appear here as soon as they join this campaign.</EmptyState> : null}
    </div>
    <p className="react-help">Select a character to manage them, or open their Character Dashboard.</p>
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

function encounterSources(campaignNPCs=[],campaignCreatures=[]) {
  const codex = window.AsteriaCodexCompendium?.creatureEntries?.() || [];
  const npcStores = [window.npcs, window.NPCS, window.ASTERIA_NPC_DATA, window.ASTERIA_NPCS].filter(Boolean);
  const npcs = [...campaignNPCs,...npcStores.flatMap(store => Array.isArray(store) ? store : Object.entries(store).map(([id, value]) => Object.assign({ id }, value)))];
  const records = [
    ...codex.map(entry => ({ id:entry.id || entry.slug || slug(entry.title), name:entry.title || entry.name, type:entry.creatureType || entry.type || entry.category || 'Creature', threatTier:entry.threatTier || entry.tier || 'Tier 1', initiative:Number(entry.initiative ?? 10), ...(entry.ac!==undefined?{ac:entry.ac}:{}), ...encounterSourceResources(entry), xpReward:encounterXP(entry), source:'Creature Compendium', compendiumSlug:entry.slug || entry.id })),
    ...npcs.map(entry => ({ id:`npc-${entry.id || entry.slug || slug(entry.name || entry.title)}`, name:entry.name || entry.title || 'Unnamed NPC', type:entry.type || entry.category || 'NPC', threatTier:entry.threatTier || entry.tier || 'Tier 1', initiative:Number(entry.initiative ?? 10), ...(entry.ac!==undefined?{ac:entry.ac}:{}), ...encounterSourceResources(entry), xpReward:encounterXP(entry), source:'NPC', compendiumSlug:entry.slug || entry.id })),
    ...campaignCreatures.filter(libraryEncounterReady).map(entry => ({ id:'library-'+entry.id, name:entry.name, type:entry.species || 'Creature', threatTier:entry.threatTier || 'Tier 1', initiative:Number(entry.initiative ?? 10), ...(entry.ac!==undefined?{ac:entry.ac}:{}), ...encounterSourceResources(entry), xpReward:encounterXP(entry), source:'Campaign Creature' }))
  ].filter(entry => entry.name);
  const seen = new Set();
  return records.filter(entry => { const key=slug(entry.name)+':'+entry.source; if(seen.has(key)) return false; seen.add(key); return true; });
}

function EncounterInitiativeInput({ entry, disabled, onCommit }) {
  const displayed=entry.initiativeSet===false&&!entry.initiativeRoll?'':entry.initiative===undefined||entry.initiative===null?'':String(Number(entry.initiative));
  const [value,setValue]=useState(displayed);
  useEffect(()=>setValue(displayed),[entry.id,displayed]);
  const commit=()=>{
    const next=Number(value);
    if(!isManualNumber(value)) return setValue(displayed);
    if(next!==Number(entry.initiative ?? 0)||!entry.initiativeSet) onCommit(next);
  };
  return <ManualNumberInput aria-label={`${entry.name} initiative`} placeholder="Roll on start" disabled={disabled} value={value} onChange={event=>setValue(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){setValue(displayed);event.currentTarget.blur();}}}/>;
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

function CampaignEncounter({ campaignId, campaign, campaignNPCs, campaignCreatures, characters, encounter, combatState }) {
  const [search, setSearch] = useState('');
  const [custom,setCustom]=useState({type:'Creature',name:'',hp:'',sp:'',mp:'',xpReward:'',ac:'',initiative:''});
  const [quantity, setQuantity] = useState('');
  const {message,setMessage,busy,run}=useAsyncAction();
  const sources = useMemo(()=>encounterSources(campaignNPCs,campaignCreatures), [campaignNPCs,campaignCreatures]);
  const state = Object.assign({ status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] }, encounter || {});
  const results = search ? sources.filter(entry => `${entry.name} ${entry.type} ${entry.source}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8) : [];
  const active=state.status==='active'&&state.combat?.version===1;
  const setup=state.status==='ready'||state.status==='active'&&!active;
  const save = next => run(()=>firebaseService.saveEncounter(campaignId,next),'Encounter synchronized.');
  const playerRoster=encounterPlayerRoster(campaignId,campaign,characters,state.combatants,window.AsteriaCharacterAccess);
  const addLinkedPlayers = async () => {
    const result=await save({...state,combatants:playerRoster.combatants});
    if(result?.ok)setMessage(`${result.message||'Encounter synchronized.'} ${playerRoster.added.length} linked player(s) added.${playerRoster.skipped.length?` Not added: ${playerRoster.skipped.map(row=>row.name).join(', ')}. See link details below.`:''}`);
  };
  const command=(operation,extra={})=>run(()=>firebaseService.combatCommand(campaignId,'encounter',{operation,revision:Number(state.combat?.revision||0),...extra}),'Combat synchronized.');
  const start=()=>command('start');
  const end=()=>{if(window.confirm('End combat for all participants? Pending actions will close. Spent resources remain spent.'))return command('end');};
  const addEnemy = async source => {
    if(!isManualNumber(quantity,{min:1,max:20}))return setMessage('Enter a whole creature quantity from 1 to 20.');
    const resources=encounterSourceResources(source);
    const added = Array.from({ length:Math.max(1, Math.min(20, Number(quantity || 1))) }, (_, index) => ({ id:`enemy-${crypto.randomUUID()}`, sourceId:source.id, compendiumSlug:source.compendiumSlug || '', name:Number(quantity) > 1 ? `${source.name} ${index + 1}` : source.name, kind:'enemy', type:source.type, threatTier:source.threatTier, initiative:source.initiative, ...(source.ac!==undefined?{ac:source.ac}:{}), xpReward:encounterXP(source), ...resources, defeated:false }));
    const result=await save({ ...state, enemies:[...(state.enemies || []), ...added], combatants:[...(state.combatants || []), ...added] });
    if(result?.ok)setSearch('');
  };
  const updateCombatant = (id, patch) => save({ ...state, combatants:(state.combatants || []).map(entry => entry.id === id ? { ...entry, ...patch } : entry), enemies:(state.enemies || []).map(entry => entry.id === id ? { ...entry, ...patch } : entry) });
  const removeCombatant = id => save({ ...state, combatants:(state.combatants || []).filter(entry => entry.id !== id), enemies:(state.enemies || []).filter(entry => entry.id !== id), turnIndex:0 });
  const nextTurn = () => command('next');
  return <Panel title="Campaign Encounters" eyebrow="Initiative & Encounter Tracker" className="react-encounter-panel" action={<StatusPill tone={active ? 'success' : ''}>{active?'COMBAT ACTIVE':state.status==='ended'?'ENDED':'SETUP'}</StatusPill>}>
    <div className="react-encounter-toolbar"><button disabled={busy} onClick={addLinkedPlayers}>Add linked players</button>{state.status==='ended'?<button disabled={busy} onClick={()=>save({...state,status:'ready'})}>Set Up Combat</button>:<button className="primary" disabled={busy||!setup||!state.combatants.length} onClick={start}>{active?'COMBAT ACTIVE':'START COMBAT'}</button>}<button disabled={busy||!active} onClick={nextTurn}>Next Turn</button><button className="danger" disabled={busy||!active} onClick={end}>END COMBAT</button><button disabled={busy||active} onClick={()=>command('clear')}>Clear Setup</button></div>
    {setup?<p className="react-help">Add participants and enter initiative, or leave it to roll when combat starts.</p>:null}
    <div className="react-encounter-summary"><StatusPill>Round {Number(state.round || 1)}</StatusPill><StatusPill>{(state.enemies || []).length} enemies</StatusPill><StatusPill>{state.combatants.filter(row=>row.characterId).length} players in encounter</StatusPill><StatusPill>{playerRoster.linkedCount} linked players</StatusPill><span role="status">{message}</span></div>
    {playerRoster.skipped.length?<div className="react-help" role="status"><b>Character links need attention</b><ul>{playerRoster.skipped.map(row=><li key={row.id}><b>{row.name}:</b> {row.reason}</li>)}</ul><p>The character owner can reconnect their saved character from Character Forge. Existing character sheets and ownership are preserved.</p></div>:null}
    <GMCombatPanel campaignId={campaignId} encounter={state} characters={characters} combatState={combatState}/>
    <div className="react-encounter-builder">
      <section><h3>Add Creature or NPC</h3><div className="react-form-grid"><label>Search<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search creature compendium and NPCs..." /></label><label>Number<ManualNumberInput min="1" max="20" value={quantity} onChange={event => setQuantity(event.target.value)} /></label></div>{search ? <div className="react-search-results encounter">{results.map(entry => <button key={entry.id} disabled={busy} onClick={() => addEnemy(entry)}><b>{entry.name}</b><small>{entry.type} | {entry.threatTier}</small></button>)}{!results.length ? <EmptyState title="No matches" /> : null}</div> : null}</section>
      <section><h3>Initiative Order</h3><div className="react-initiative-list">{(state.combatants || []).map((entry,index) => <article key={entry.id} className={`${index === Number(state.turnIndex || 0) && state.status === 'active' ? 'active' : ''} ${entry.defeated ? 'defeated' : ''}`}><span>{index + 1}</span><div className="react-encounter-combatant"><b>{entry.name}</b><small>{entry.kind === 'player' ? 'Player Character' : entry.type || 'Enemy'}</small></div><EncounterInitiativeInput entry={entry} disabled={busy||active} onCommit={initiative=>updateCombatant(entry.id,{initiative,initiativeSet:true})}/>{entry.kind === 'enemy' ? <button title="Toggle defeated" disabled={busy} onClick={() => updateCombatant(entry.id, { defeated:!entry.defeated })}>{entry.defeated ? 'Restore' : 'Defeat'}</button> : null}<button aria-label={`Remove ${entry.name}`} disabled={busy} onClick={() => removeCombatant(entry.id)}>X</button></article>)}{!(state.combatants || []).length ? <EmptyState title="No initiative entries">Add linked players or creatures, then start combat.</EmptyState> : null}</div></section>
      <section className="react-creature-resources"><h3>Creature Resources</h3>{(state.enemies || []).map(entry=><article key={entry.id}><header><b>{entry.name}</b><StatusPill>{entry.defeated?'Defeated':'In encounter'}</StatusPill></header><p>XP Reward: {encounterXP(entry)===null?'Not configured':encounterXP(entry).toLocaleString()}</p>{entry.ac!==undefined?<small>AC {entry.ac}</small>:null}<div className="react-encounter-resources">{encounterResourceKeys(entry).map(resource=><EncounterResourceControl key={resource} campaignId={campaignId} entry={entry} resource={resource} disabled={busy} onMessage={setMessage}/>)}</div></article>)}{!(state.enemies || []).length?<EmptyState title="No creatures in this encounter"/>:null}</section>
      <section><h3>Create Custom Creature or NPC</h3><div className="react-form-grid"><label>Type<select value={custom.type} onChange={e=>setCustom(c=>({...c,type:e.target.value}))}><option>Creature</option><option>NPC</option></select></label>{[['name','Name'],['hp','HP'],['sp','SP (optional)'],['mp','MP (optional)'],['xpReward','XP Reward'],['ac','AC (optional)'],['initiative','Initiative (optional)']].map(([key,label])=><label key={key}>{label}{key==='name'?<input maxLength={120} value={custom[key]} onChange={e=>setCustom(c=>({...c,[key]:e.target.value}))}/>:<ManualNumberInput min="0" value={custom[key]} onChange={e=>setCustom(c=>({...c,[key]:e.target.value}))}/>}</label>)}</div><button disabled={busy} className="primary" onClick={()=>{try{const entry={...customEncounterCreature(custom,`enemy-${crypto.randomUUID()}`),initiativeSet:custom.initiative!==''};save({...state,enemies:[...(state.enemies||[]),entry],combatants:[...(state.combatants||[]),entry]});}catch(error){setMessage(error.message);}}}>Add to Encounter</button><p className="react-help">This creature belongs to this encounter only.</p></section>
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
  const catalog = useMemo(() => window.AsteriaInventory?.catalogEntries?.(customItems) || [], [customItems]);
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
      const result=await firebaseService.createCustomLootReward(campaignId,target,{...source,qty:manualNumber(quantity)},{message:custom.isSpellbook?'The GM awarded an unidentified spellbook.':'The GM awarded an unidentified custom item.'});
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
    {search ? <div className="react-search-results">{results.map(entry => <button key={entry.id || entry.slug || entry.title} onClick={() => setItem(entry)} className={item === entry ? 'active' : ''}>{entry.title || entry.name}</button>)}</div> : null}
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
  useEffect(()=>setTitleEdits({}),[manageCharacterId]);
  const run=async(operation,success)=>{setBusy(true);setMessage('Saving...');try{const result=await operation();setMessage(result?.ok?success:result?.error||'The GM change could not be saved.');return result;}catch(error){const detail=error?.message||String(error);setMessage(detail);return {ok:false,error:detail};}finally{setBusy(false);}};
  const managed=characters[manageCharacterId];
  const managedTitles=(Array.isArray(managed?.titles)?managed.titles:[]).map((value,index)=>typeof value==='string'?{id:`title-${index}`,text:value}:value);
  return <Panel title="Player Titles & Storage" eyebrow="GM Character Tools">
    <div className="react-recipient-actions"><button onClick={()=>setSelected(Object.keys(characters))}>Select All</button><button onClick={()=>setSelected([])}>Clear</button><span>{selected.length} selected</span></div>
    <div className="react-recipient-grid">{Object.values(characters).map(character=><label key={character.id}><input type="checkbox" checked={selected.includes(character.id)} onChange={event=>setSelected(ids=>event.target.checked?[...new Set([...ids,character.id])]:ids.filter(id=>id!==character.id))}/>{character.name}</label>)}</div>
    <div className="react-gm-grant-grid"><section><h3>Grant Player Title</h3><label>Title<input value={title} onChange={event=>setTitle(event.target.value)} placeholder="e.g. Hero of Elarion"/></label><button className="primary" disabled={busy||!selected.length||!title.trim()} onClick={async()=>{const result=await run(()=>firebaseService.grantTitle(campaignId,selected,title),'Title granted to selected characters.');if(result?.ok)setTitle('');}}>Grant Title</button></section><section><h3>Grant Storage Slots</h3><label>Additional Slots<ManualNumberInput min="1" max="10" value={slots} onChange={event=>setSlots(event.target.value)}/></label><button className="primary" disabled={busy||!selected.length} onClick={()=>{if(!isManualNumber(slots,{min:1,max:10}))return setMessage('Enter a whole slot amount from 1 to 10.');return run(()=>firebaseService.grantStorageSlots(campaignId,selected,manualNumber(slots)),'Storage slots granted.');}}>Grant Slots</button></section></div>
    <section className="react-title-manager"><h3>Manage Existing Titles</h3><label>Character<select value={manageCharacterId} onChange={event=>setManageCharacterId(event.target.value)}>{Object.values(characters).map(character=><option key={character.id} value={character.id}>{character.name}</option>)}</select></label><div>{managedTitles.map(record=><article key={record.id}><input aria-label={`Edit ${record.text}`} value={titleEdits[record.id]??record.text} onChange={event=>setTitleEdits(current=>({...current,[record.id]:event.target.value}))}/><button disabled={busy||!(titleEdits[record.id]??record.text).trim()} onClick={()=>run(()=>firebaseService.manageTitle(campaignId,manageCharacterId,record.id,{text:titleEdits[record.id]??record.text}),'Player title updated.')}>Save</button><button className="danger" disabled={busy} onClick={()=>run(()=>firebaseService.manageTitle(campaignId,manageCharacterId,record.id,{revoke:true}),'Player title revoked.')}>Revoke</button></article>)}{!managedTitles.length?<p className="react-help">This character has no granted titles.</p>:null}</div></section>
    <p className="react-action-message" role="status">{message}</p>
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
    try {
      const result=await firebaseService.setACModifier(campaignId,character.id,modifier);
      setMessage(result?.ok?'Armour Class modifier synchronized.':result?.error||'AC modifier could not be saved.');
    } catch(error) {
      setMessage(error?.message||'AC modifier could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return <Panel title="Armour Class Inspector" eyebrow="GM Character Tool" className="react-gm-ac-panel" action={character?<StatusPill tone="info">Final AC {armour.finalAC}</StatusPill>:null}>
    <label>Character<select value={character?.id||''} onChange={event=>setSelectedId(event.target.value)}>{Object.values(characters).map(entry=><option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
    {!character?<EmptyState title="No linked characters">Link a character to inspect its live Armour Class.</EmptyState>:<>
      <div className="react-ac-summary"><div><span>Natural</span><strong>{armour.naturalAC}</strong></div><div><span>Armour</span><strong>{signed(armour.armourAC)}</strong></div><div><span>Type Set</span><strong>{signed(armour.armourTypeSetBonus)}</strong><small>{armour.armourType||'None'}</small></div><div><span>Modifiers</span><strong>{signed(armour.modifierTotal)}</strong></div></div>
      <div className="react-ac-equation"><span>{decimal(armour.naturalAC)} + {decimal(armour.armourAC)} + {decimal(armour.armourTypeSetBonus)} + {decimal(armour.modifierTotal)}</span><b>Raw {decimal(armour.rawAC)}</b><strong>Final AC {armour.finalAC}</strong></div>
      <p className="react-help">Minimum AC: {armour.naturalAC} (racial NAC).</p>
      <div className="react-ac-piece-list">{armour.armourPieces.map(piece=><article className={piece.valid?'':'is-invalid'} key={piece.itemId}><div><b>{piece.name}</b><small>{piece.piece?.name||'Unknown'} | {piece.materialName} | {piece.quality.name}</small></div><span>{decimal(piece.modifiedBaseAC)} x {Math.round(piece.percentile*100)}%</span><strong>{signed(piece.contribution)} AC</strong></article>)}{!armour.armourPieces.length?<p className="react-quiet-state">No equipped armour pieces.</p>:null}</div>
      <div className="react-gm-ac-form"><label>Modifier Name<input value={name} onChange={event=>setName(event.target.value)}/></label><label>AC Change<ManualNumberInput step="1" value={value} onChange={event=>setValue(event.target.value)}/></label><label>Duration (minutes)<ManualNumberInput min="0" max="10080" value={duration} onChange={event=>setDuration(event.target.value)}/></label><button className="primary" disabled={busy||!name.trim()||!Number(value)} onClick={()=>save({name,value,durationMinutes:duration})}>Apply Modifier</button></div>
      <div className="react-delivery-list">{armour.modifiers.filter(modifier=>modifier.sourceType==='gm').map(modifier=><div key={modifier.id}><b>{modifier.name}</b><span>{signed(modifier.value)} AC{modifier.temporary?' (temporary)':''}</span><button className="danger" disabled={busy} onClick={()=>save({id:modifier.id,remove:true})}>Remove</button></div>)}{!armour.modifiers.some(modifier=>modifier.sourceType==='gm')?<p className="react-help">No GM AC modifiers are active.</p>:null}</div>
      {[...armour.validation.errors,...armour.validation.warnings].length?<div className="react-ac-warnings">{[...armour.validation.errors,...armour.validation.warnings].map(warning=><p key={warning}>{warning}</p>)}</div>:null}
    </>}
    <p className="react-action-message" role="status">{message}</p>
  </Panel>;
}


function GMTradeLootHub({overview,onNavigate}){
  return <section className="react-gm-trade-hub" aria-label="GM Trade and Loot shortcuts">
    <div className="react-gm-trade-hub-heading">
      <div>
        <h3>Trade &amp; Loot — GM Quick Access</h3>
        <p>Open the existing campaign management tools without searching through panels.</p>
      </div>
      <span>{overview.hiddenDrafts} hidden drafts · {overview.awaitingCopper} currency drops awaiting distribution</span>
    </div>
    <div className="react-gm-trade-hub-links">
      {overview.links.map(link=><button type="button" key={link.id}
        onClick={()=>onNavigate(link)}
        aria-label={link.label+' — '+link.detail}>
        <strong>{link.label}</strong>
        <span>{link.detail}</span>
      </button>)}
    </div>
  </section>;
}

export function GMDashboard({ campaignId }) {
  const rawLive = useCampaignLiveData(campaignId, { mode: 'gm' });
  // A one-second session clock may expire effects, but does not alter the
  // learned talent catalogue. Build catalogues only when character data changes.
  const characterCatalogs=useMemo(()=>Object.fromEntries(Object.entries(rawLive.characters).map(([id,character])=>[id,talentCatalog(character)])),[rawLive.characters]);
  const derivedCharacters=useMemo(()=>Object.fromEntries(Object.entries(rawLive.characters).map(([id,character])=>[id,reconcileCharacterSystems(character,characterCatalogs[id],{encounter:rawLive.encounter,now:rawLive.clock})])),[rawLive.characters,characterCatalogs,rawLive.encounter,rawLive.clock]);
  const live={...rawLive,characters:derivedCharacters};
  const coreSyncError=useCharacterSystemsSync(campaignId,rawLive.characters,rawLive.encounter,rawLive.session?.editable);
  const restored = restoredGMView(campaignId, firebaseService.currentUser()?.uid);
  const [tab, setTab] = useState(() => GM_TABS.some(item => item.id === restored.tab) ? restored.tab : 'main');
  const [selectedId, setSelectedId] = useState(restored.selectedId || '');
  const [gmHubDestination,setGMHubDestination]=useState(null);
  const [savedDashboardLayout,setSavedDashboardLayout] = useState(null);
  const [dashboardLayoutReady,setDashboardLayoutReady] = useState(false);
  const [dashboardSettingsDraft,setDashboardSettingsDraft] = useState(()=>defaultDashboardLayout('gm'));
  const [dashboardSettingsMessage,setDashboardSettingsMessage] = useState('');
  const [savingDashboardSettings,setSavingDashboardSettings] = useState(false);
  const [dashboardLayoutError,setDashboardLayoutError] = useState('');
  const dashboardDraftDirty=useRef(false);
  const dashboardDraftRevision=useRef(0);
  const dashboardSaveScope=useRef('');
  const focusSavePending=useRef(false);
  const accountUid=firebaseService.currentUser()?.uid || '';
  const gmTradeHub=useMemo(()=>gmTradeLootOverview({itemEcosystem:live.itemEcosystem,partyLoot:live.partyLoot}),
    [live.itemEcosystem,live.partyLoot]);
  const openGMHubLink=link=>{
    // The toolkit is a directory of existing GM views, not an arbitrary route.
    if(!GM_TABS.some(item=>item.id===link?.tab))return;
    setGMHubDestination(link.targetId?{tab:link.tab,targetId:link.targetId}:null);
    setTab(link.tab);
  };
  useEffect(()=>{
    if(!gmHubDestination||tab!==gmHubDestination.tab)return;
    const target=document.getElementById(gmHubDestination.targetId);
    if(!target)return;
    target.scrollIntoView({behavior:'smooth',block:'start'});
    target.focus({preventScroll:true});
    setGMHubDestination(null);
  },[tab,gmHubDestination]);
  useEffect(()=>setGMHubDestination(null),[campaignId,accountUid]);
  useEffect(()=>{
    dashboardDraftDirty.current=false;
    dashboardDraftRevision.current++;
    dashboardSaveScope.current=campaignId+':'+accountUid;
    focusSavePending.current=false;
    setDashboardLayoutReady(false);
    setDashboardSettingsDraft(defaultDashboardLayout('gm'));
    setSavedDashboardLayout(null);
    setDashboardSettingsMessage('');
    setDashboardLayoutError('');
    if(!campaignId||!accountUid)return;
    const subscriptionScope=campaignId+':'+accountUid;
    return firebaseService.subscribeUserDashboardLayout(campaignId,'gm',layout=>{
      if(dashboardSaveScope.current!==subscriptionScope)return;
      // A pending optimistic Focus switch must not flicker back to a stale
      // server snapshot while the private layout write is in flight.
      if(!focusSavePending.current)setSavedDashboardLayout(layout);
      setDashboardLayoutReady(true);
      // Session clocks and background sync can re-emit the same snapshot.
      // Do not erase unsaved edits while the settings editor is open.
      if(!dashboardDraftDirty.current)
        setDashboardSettingsDraft(normalizeDashboardLayout(layout,'gm'));
      setDashboardLayoutError('');
    });
  },[campaignId,accountUid]);

  useEffect(() => { if(!live.loading && restored.scrollY) window.scrollTo(0, restored.scrollY); }, [live.loading]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const migrationStarted = useRef(false);
  useEffect(() => {
    const validSelection = resolveRosterSelection(live.characters, selectedId);
    if(validSelection !== selectedId) setSelectedId(validSelection);
  }, [live.characters, selectedId]);
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
  // One-time server-authorized migration of legacy shared trade arrays into
  // owner-restricted request documents; also seeds the public shop view.
  const itemPrivacyScope=useRef('');
  useEffect(()=>{
    if(!campaignId || !accountUid || !live.campaign) return;
    const firstCharacterId=Object.keys(rawLive.characters||{})[0];
    if(!firstCharacterId) return;
    const scope=campaignId+':'+accountUid;
    if(itemPrivacyScope.current===scope) return;
    itemPrivacyScope.current=scope;
    const migrate=async()=>{
      for(let attempt=0;attempt<6;attempt++){
        const result=await firebaseService.syncCampaignItemPrivacy(campaignId,firstCharacterId);
        if(itemPrivacyScope.current!==scope)return;
        if(!result?.ok){
          setActionError(result?.error||'Private trade migration could not finish.');
          return;
        }
        if(!result.remaining)return;
        if(!result.migrated){
          setActionError('Some legacy trades require GM review before their private migration can finish.');
          return;
        }
      }
    };
    migrate().catch(error=>{if(itemPrivacyScope.current===scope)setActionError(error.message||String(error));});
  },[campaignId,accountUid,live.campaign,rawLive.characters]);
  // Migrate bounded batches on the trusted server. Each batch copies records
  // transactionally before removing legacy source rows; no client-side rewrite.
  const itemStoresMigrationScope=useRef('');
  useEffect(()=>{
    if(!campaignId||!accountUid||!live.campaign||!live.gmWorkspaceLoaded)return;
    const scopeId=Object.keys(rawLive.characters||{})[0]||'gm-scope';
    const scope=campaignId+':'+accountUid;
    if(itemStoresMigrationScope.current===scope)return;
    itemStoresMigrationScope.current=scope;
    const migrate=async()=>{
      for(let attempt=0;attempt<40;attempt++){
        const result=await firebaseService.syncCampaignShopStores(campaignId,scopeId);
        if(itemStoresMigrationScope.current!==scope)return;
        if(!result?.ok)throw Error(result?.error||'Shop consolidation could not finish.');
        if(!result.remaining)break;
        if(attempt===39)throw Error('Shop consolidation needs a further bounded migration pass.');
      }
      for(let attempt=0;attempt<40;attempt++){
        const result=await firebaseService.syncGMRewardBundles(campaignId,scopeId);
        if(itemStoresMigrationScope.current!==scope)return;
        if(!result?.ok)throw Error(result?.error||'GM reward template consolidation could not finish.');
        if(!result.remaining)break;
        if(attempt===39)throw Error('Reward template consolidation needs a further bounded migration pass.');
      }
    };
    migrate().catch(error=>{
      if(itemStoresMigrationScope.current===scope)setActionError(error.message||String(error));
    });
  },[campaignId,accountUid,live.campaign,live.gmWorkspaceLoaded,rawLive.characters]);
  const workspace=useMemo(()=>normalizeGMWorkspace(live.gmWorkspace||{},live.campaign||{}),[live.gmWorkspace,live.campaign]);
  const saveSection=(section,value)=>firebaseService.saveGMWorkspace(campaignId,{[section]:value});
  const saveDashboardLayout=async layout=>{
    const saveScope=campaignId+':'+accountUid;
    const result=await firebaseService.saveUserDashboardLayout(campaignId,'gm',layout);
    // A response for an old account or campaign must never mutate the new view.
    if(dashboardSaveScope.current!==saveScope)return result;
    if(result?.ok){setSavedDashboardLayout(layout);setDashboardLayoutError('');}
    else setDashboardLayoutError(result?.error||'Could not save GM dashboard layout.');
    return result;
  };
  const commitGMFocus=async layout=>{
    if(!accountUid||!dashboardLayoutReady)return {ok:false,error:'Connect your GM dashboard before changing Focus.'};
    if(dashboardDraftDirty.current)return {ok:false,error:'Save or discard pending Dashboard Settings before switching Focus.'};
    if(focusSavePending.current||savingDashboardSettings)return {ok:false,error:'A dashboard save is already in progress.'};
    const scope=campaignId+':'+accountUid;
    const previous=normalizeDashboardLayout(savedDashboardLayout,'gm');
    const next=normalizeDashboardLayout(layout,'gm');
    focusSavePending.current=true;
    // Immediately display the selected Focus; roll back on save errors.
    setSavedDashboardLayout(next);
    setDashboardLayoutError('');
    try{
      const result=await firebaseService.saveUserDashboardLayout(campaignId,'gm',next);
      if(dashboardSaveScope.current!==scope)return {ok:false,error:'Campaign or account changed during Focus save.'};
      if(result?.ok){
        setSavedDashboardLayout(next);
        setDashboardSettingsDraft(next);
        setDashboardSettingsMessage('');
      }else{
        setSavedDashboardLayout(previous);
        setDashboardLayoutError(result?.error||'Could not save GM Focus.');
      }
      return result||{ok:false,error:'Could not save GM Focus.'};
    }catch(error){
      const failure={ok:false,error:error?.message||'Could not save GM Focus.'};
      if(dashboardSaveScope.current===scope){
        setSavedDashboardLayout(previous);
        setDashboardLayoutError(failure.error);
      }
      return failure;
    }finally{
      if(dashboardSaveScope.current===scope)focusSavePending.current=false;
    }
  };
  const updateDashboardSettingsDraft=change=>{
    dashboardDraftDirty.current=true;
    dashboardDraftRevision.current++;
    setDashboardSettingsDraft(change);
  };
  const applyGMLayout=async layout=>{
    if(!accountUid)return {ok:false,error:'Sign in to customise this dashboard.'};
    const applyScope=campaignId+':'+accountUid;
    setSavingDashboardSettings(true);
    setDashboardSettingsMessage('Saving layout...');
    try{
      const result=await saveDashboardLayout(layout);
      if(dashboardSaveScope.current!==applyScope)return {ok:false,error:'Account or campaign changed while saving.'};
      if(result?.ok){
        dashboardDraftDirty.current=false;
        setDashboardSettingsDraft(layout);
        setDashboardSettingsMessage('Dashboard layout saved.');
      }else setDashboardSettingsMessage(result?.error||'Could not save dashboard layout.');
      return result;
    }catch(error){
      const failure={ok:false,error:error?.message||'Could not save dashboard layout.'};
      setDashboardSettingsMessage(failure.error);return failure;
    }finally{setSavingDashboardSettings(false);}
  };
  const saveDashboardSettings=async()=>{
    if(savingDashboardSettings)return;
    const saveScope=campaignId+':'+accountUid,saveRevision=dashboardDraftRevision.current;
    setSavingDashboardSettings(true);
    setDashboardSettingsMessage('Saving panel settings...');
    try{
      const result=await saveDashboardLayout(dashboardSettingsDraft);
      if(dashboardSaveScope.current!==saveScope)return;
      if(result?.ok&&dashboardDraftRevision.current===saveRevision)dashboardDraftDirty.current=false;
      setDashboardSettingsMessage(result?.ok===false?result.error||'Could not save panel settings.':dashboardDraftDirty.current?'Earlier settings saved; newer changes still need saving.':'Dashboard panel settings saved.');
    }catch(error){
      if(dashboardSaveScope.current===saveScope)setDashboardSettingsMessage(error?.message||'Could not save panel settings.');
    }finally{setSavingDashboardSettings(false);}
  };
  const gmPanel=id=>{
    const shortcut=(title,tab)=> <Panel title={title}><p className="react-help">Open the full {title} workspace.</p><button type="button" onClick={()=>setTab(tab)}>Open {title}</button></Panel>;
    switch(id){
      case 'restRequests':return <RestRequestsPanel campaignId={campaignId} characters={live.characters} editable={live.session?.editable}/>;
      case 'encounter':return <CampaignEncounter campaignId={campaignId} campaign={live.campaign} campaignNPCs={live.gmWorkspace?.world?.npcs} campaignCreatures={live.gmWorkspace?.world?.creatures||[]} characters={live.characters} encounter={live.encounter} combatState={live.gmWorkspace?.combatState}/>;
      case 'xp':return <XPDistribution campaignId={campaignId} characters={live.characters} events={live.events}/>;
      case 'specialDamage':return <SpecialDamageControl campaignId={campaignId} characters={live.characters} encounter={live.encounter}/>;
      case 'loot':return <LootRewards campaignId={campaignId} characters={live.characters} events={live.events} customItems={live.customItems}/>;
      case 'magicRewards':return <MagicElementRewards campaignId={campaignId} characters={live.characters} events={live.events}/>;
      case 'acInspector':return <ACInspectionPanel campaignId={campaignId} characters={live.characters} selectedId={selectedId} setSelectedId={setSelectedId}/>;
      case 'playerManagement':return <PlayerManagementTools campaignId={campaignId} characters={live.characters}/>;
      case 'partySummary':return <Panel title="Party Summary"><p className="react-help">{Object.keys(live.characters||{}).length} characters linked to this campaign.</p><div className="react-party-summary-list">{Object.values(live.characters||{}).map(character=><button key={character.id} onClick={()=>setSelectedId(character.id)}>{character.name||'Unnamed Character'} · Level {Number(character.level||0)}</button>)}</div><button type="button" onClick={()=>setTab('tools')}>Open GM Character Tools</button></Panel>;
      case 'combatOverview':return <GMCombatOverview encounter={live.encounter} session={live.session} characters={live.characters} onNavigate={setTab}/>;
      case 'explorationOverview':return <GMExplorationOverview workspace={workspace} campaign={live.campaign} onNavigate={setTab}/>;
      case 'questTracker':return <GMQuestTracker workspace={workspace} onNavigate={setTab}/>;
      case 'inventoryOverview':return <GMInventoryOverview characters={live.characters} itemEcosystem={live.itemEcosystem} onNavigate={setTab}/>;
      case 'shortcutInventory':return shortcut('PC Inventory','inventory');
      case 'shortcutQuests':return shortcut('Quests','quests');
      case 'shortcutNotes':return shortcut('GM Notes','notes');
      case 'shortcutEconomy':return shortcut('Economy','economy');
      case 'shortcutCrafting':return shortcut('Crafting','crafting');
      case 'shortcutTools':return shortcut('GM Tools','tools');
      case 'shortcutWorld':return shortcut('World Systems','world');
      default:return null;
    }
  };

  const run = async operation => { setBusy(true); setActionError(''); try { const result=await operation(); if(result?.ok===false) setActionError(result.error || 'The change could not be saved.'); } catch(error) { setActionError(error.message || String(error)); } finally { setBusy(false); } };
  if(live.loading) return <div className="react-route-state">Connecting GM Dashboard...</div>;
  if(!window.AsteriaCharacterAccess.isGM(live.campaign, firebaseService.currentUser()?.uid)) return <div className="react-route-state" role="alert">You do not have GM access to this campaign.</div>;
  return <AsteriaAppShell
    className="react-gm-dashboard"
    eyebrow="GM Dashboard"
    title={live.campaign?.name || 'Campaign'}
    subtitle="Live campaign control, party resources, rewards, encounters, and session tools."
    sidebar={<PartySidebar campaign={live.campaign || { id: campaignId }} characters={live.characters} selectedId={selectedId} setSelectedId={setSelectedId} presence={live.presence} onOpen={character => openGMCharacter(live.campaign, character, { tab })} />}
    actions={<><SessionActions campaignId={campaignId} session={live.session} busy={busy} run={run} /><LiveSyncStatus online={live.online} connectionState={live.connectionState} error={live.error || actionError || coreSyncError} loading={live.loading} session={live.session} /></>}
  >
    <DashboardNavigation tabs={GM_TABS} active={tab} onChange={setTab} ariaLabel="GM Dashboard menu" />
    {tab === 'bestiary' ? <GMNpcCreatureLibrary key={campaignId+':'+accountUid+':bestiary'}
      workspace={workspace} saveSection={saveSection} campaignId={campaignId} characters={live.characters}
      onOpenEncounter={()=>setTab('main')} onOpenWorld={()=>setTab('world')} /> : null}
    {tab === 'toolkit' ? <>
      <GMToolkitHub key={campaignId+':'+accountUid}
        session={live.session} characters={live.characters} workspace={workspace}
        itemEcosystem={live.itemEcosystem} partyLoot={live.partyLoot}
        onNavigate={openGMHubLink} />
      <GMPartyControl key={campaignId+':'+accountUid+':party'} campaign={live.campaign}
        characters={live.characters} selectedId={selectedId} onSelect={setSelectedId}
        onNavigate={openGMHubLink}
        onOpenCharacter={character=>openGMCharacter(live.campaign,character,{tab})}/>
    </> : null}
    {tab === 'main' ? <>
      <GMToolkitQuickAccess onNavigate={openGMHubLink}/>
      <GMFocusModes key={campaignId+':'+accountUid} layout={savedDashboardLayout}
        onCommit={commitGMFocus} disabled={!accountUid||!dashboardLayoutReady||savingDashboardSettings}/>
      <DashboardLayoutWorkspace key={campaignId+':'+accountUid} role="gm" title="GM Main Dashboard"
      layout={savedDashboardLayout} canEdit={Boolean(accountUid)} onSave={saveDashboardLayout} renderPanel={gmPanel}
      defaultContent={<div className="react-gm-main-grid">
        <RestRequestsPanel campaignId={campaignId} characters={live.characters} editable={live.session?.editable}/>
        <CampaignEncounter campaignId={campaignId} campaign={live.campaign} campaignNPCs={live.gmWorkspace?.world?.npcs} campaignCreatures={live.gmWorkspace?.world?.creatures||[]} characters={live.characters} encounter={live.encounter} combatState={live.gmWorkspace?.combatState}/>
        <XPDistribution campaignId={campaignId} characters={live.characters} events={live.events}/>
        <SpecialDamageControl campaignId={campaignId} characters={live.characters} encounter={live.encounter}/>
      </div>}
    />
    </> : null}
    {tab === 'settings' ? <div className="react-settings-workspace">
      <Panel title="GM Dashboard Settings" action={<StatusPill>{visibleDashboardPanels(dashboardSettingsDraft,'gm').length} panels</StatusPill>}>
        <p className="react-help">Manage all GM dashboard panels here. The party/resource sidebar and dashboard navigation remain fixed.</p>
        <DashboardLayoutEditor role="gm" layout={dashboardSettingsDraft} onChange={updateDashboardSettingsDraft} onApply={applyGMLayout} disabled={!accountUid||savingDashboardSettings}/>
        <div className="react-settings-save">
          <button type="button" className="primary" disabled={!accountUid||savingDashboardSettings} onClick={saveDashboardSettings}>{savingDashboardSettings?'Saving...':'Save Dashboard Settings'}</button>
        </div>
        <p role="status">{dashboardSettingsMessage}</p>
      </Panel>
      <GMLayoutBackup key={campaignId+':'+accountUid+':backup'} layout={savedDashboardLayout}
        onRestore={commitGMFocus}
        disabled={!accountUid||!dashboardLayoutReady||savingDashboardSettings}/>

    </div> : null}
    {dashboardLayoutError?<p role="alert">{dashboardLayoutError}</p>:null}
    {tab === 'inventory' ? <><GMTradeLootHub overview={gmTradeHub} onNavigate={openGMHubLink}/><PCInventory campaignId={campaignId} characters={live.characters} selectedId={selectedId} onSelect={setSelectedId} editable={live.session?.editable} rewards={<><section id="react-gm-inventory-audit" tabIndex={-1}><GMInventoryAuditWorkspace characters={live.characters} events={live.events}/></section><LootRewards campaignId={campaignId} characters={live.characters} events={live.events} customItems={live.customItems}/><GMRewardTools campaignId={campaignId} characters={live.characters} events={live.events} workspace={workspace} saveSection={saveSection} customItems={live.customItems} editable={live.session?.editable}/><section id="react-gm-party-loot" tabIndex={-1}><GMPartyLootPanel campaignId={campaignId} characters={live.characters} partyLoot={live.partyLoot} customItems={live.customItems} editable={live.session?.editable}/></section></>}/></> : null}
    {tab === 'information' ? <CampaignInformationWorkspace campaignId={campaignId} campaign={live.campaign} workspace={workspace} characters={live.characters}/> : null}
    {tab === 'quests' ? <QuestWorkspace campaignId={campaignId} workspace={workspace} characters={live.characters} saveSection={saveSection}/> : null}
    {tab === 'notes' ? <><NotesWorkspace workspace={workspace} session={live.session} saveSection={saveSection}/><GMSessionLibraryWorkspace campaignId={campaignId}/></> : null}
    {tab === 'session-library' ? <GMSessionLibraryWorkspace campaignId={campaignId}/> : null}
    {tab === 'soundboard' ? <GMCampaignSoundboard campaignId={campaignId}/> : null}
    {tab === 'economy' ? <><GMTradeLootHub overview={gmTradeHub} onNavigate={openGMHubLink}/><EconomyWorkspace campaignId={campaignId} workspace={workspace} characters={live.characters} itemEcosystem={live.itemEcosystem} customItems={live.customItems} saveSection={saveSection}/></> : null}
    {tab === 'crafting' ? <CraftingWorkspace campaignId={campaignId} workspace={workspace} characters={live.characters} saveSection={saveSection}/> : null}
    <GMUniversalCheckNotification campaignId={campaignId} onOpen={()=>setTab('tools')}/>
    {tab === 'tools' ? <div className="react-gm-tools-grid"><GMUniversalCheckManager campaignId={campaignId} characters={live.characters}/>{live.characters[selectedId]?<><ConditionsPanel campaignId={campaignId} character={live.characters[selectedId]} isGM editable={live.session?.editable} clock={{encounter:live.encounter,now:live.clock}}/><ResourceRulesPanel key={selectedId} campaignId={campaignId} character={live.characters[selectedId]} editable={live.session?.editable}/></>:null}<CampaignManagerWorkspace campaignId={campaignId} campaign={live.campaign} characters={live.characters} session={live.session} workspace={workspace} saveSection={saveSection}/><ACInspectionPanel campaignId={campaignId} characters={live.characters} selectedId={selectedId} setSelectedId={setSelectedId}/><PlayerManagementTools campaignId={campaignId} characters={live.characters}/><MagicElementRewards campaignId={campaignId} characters={live.characters} events={live.events} /><GMRewardTools campaignId={campaignId} characters={live.characters} events={live.events} workspace={workspace} saveSection={saveSection} customItems={live.customItems} editable={live.session?.editable}/></div> : null}
    {tab === 'gameplay' ? <GameplayWorkspace campaignId={campaignId} workspace={workspace} partyWorkspace={live.partyWorkspace} characters={live.characters} saveSection={saveSection}/> : null}
    {tab === 'world' ? <WorldWorkspace workspace={workspace} saveSection={saveSection}/> : null}
    {tab === 'battle-maps' ? <GMBattleMapManager campaignId={campaignId} characters={live.characters} encounter={live.encounter}/> : null}
    {tab === 'advanced-dice' ? <AdvancedDiceWorkspace role="gm"/> : null}
    {tab === 'random-tables' ? <GMRandomTableWorkspace key={campaignId} campaignId={campaignId}/> : null}
    {tab === 'encounter-rewards' ? <GMEncounterRewardWorkspace key={campaignId} campaignId={campaignId} encounter={live.encounter} onOpenEncounter={()=>setTab('main')} onOpenLoot={()=>setTab('inventory')}/> : null}
    {tab === 'asteria-calendar' ? <AsteriaCalendarWorkspace key={campaignId} campaignId={campaignId} workspace={workspace}/> : null}
    {tab === 'weather-environment' ? <GMWeatherEnvironmentWorkspace key={campaignId} campaignId={campaignId}/> : null}
    {tab === 'world-atlas' ? <GMWorldAtlasWorkspace key={campaignId} campaignId={campaignId}/> : null}
  </AsteriaAppShell>;
}
