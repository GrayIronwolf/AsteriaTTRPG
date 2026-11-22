import { CampaignInformationWorkspace } from './CampaignInformationWorkspace.jsx';
import { PCInventory } from './PCInventory.jsx';
import { ConditionsPanel, RestRequestsPanel, ResourceRulesPanel } from './CharacterSystemsPanels.jsx';
import { useCharacterSystemsSync } from '../sessions/useCharacterSystemsSync.js';
import { reconcileCharacterSystems } from '../state/characterSystems.mjs';
import { resolveRosterSelection } from '../state/dashboardNavigation.mjs';
import {CanvasWorkspace,CombatCommandPanel} from './combat/CombatCommandCentre.jsx';
import {
  GMQuickRequests,GMQuickPreparedEncounters,GMQuickNotes,
  GMQuickCalendarWeather,GMQuickSession,GMQuickReference
} from './GMDashboardQuickPanels.jsx';
import { GMCombatOverview, GMExplorationOverview, GMQuestTracker, GMInventoryOverview } from './DashboardFocusPanels.jsx';
import { GMToolkitHub } from './GMToolkitHub.jsx';
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
import {GMSessionRecordingWorkspace,GMRecordingParticipationNotice} from './SessionRecordingWorkspace.jsx';
import {GMPlayerPresentationWorkspace} from './PlayerPresentationWorkspace.jsx';
import { GMLayoutBackup } from './GMLayoutBackup.jsx';
import {
  normalizeDashboardLayout,normalizeGMCanvasLayout,GM_DASHBOARD_CANVAS_CONFIG
} from '../state/dashboardLayoutModel.mjs';
import {dashboardTabs} from '../state/dashboardMenuModel.mjs';
import { talentCatalog } from './characterWorkspaceData.js';
import { resourceDefinitions, storedResource } from '../state/resourceEngine.mjs';
import { ManualNumberInput } from '../components/ManualNumberInput.jsx';
import { isManualNumber, manualNumber } from '../state/manualNumber.mjs';
import { openGMCharacter, restoredGMView } from '../app/gmCharacterNavigation.mjs';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { AsteriaAppShell, DashboardNavigation, EmptyState, LiveSyncStatus, Modal, Panel, ResourceBar, StatusPill } from '../components/WorkspaceUI.jsx';
import { useCampaignLiveData } from '../sessions/useCampaignLiveData.js';
import { useArmourClass } from '../systems/armour/useArmourClass.js';
import { validateMarketPricing } from '../systems/items/marketPricing.mjs';
import {GMCombatWorkspace} from './combat/CombatWorkspace.jsx';
import {orderedCombatPartyIds} from './combat/combatWorkspaceLayoutModel.mjs';
import {CharacterDashboard} from './CharacterDashboard.jsx';
import {createSiteCombatApi,createSiteCombatMediaApi} from './combat/siteCombatApi.js';
import { migrateLegacyGMWorkspace, normalizeGMWorkspace } from '../state/gmWorkspaceModel.mjs';
import { resourcePair, soulDamageValue, soulHealingCap } from '../state/specialDamageModel.mjs';
import { buildSpellbookItem, normalizeSpellCompendiumEntries } from '../state/spellbookModel.mjs';
import { CampaignManagerWorkspace, CraftingWorkspace, EconomyWorkspace, GameplayWorkspace, NotesWorkspace, QuestWorkspace, WorldWorkspace } from './GMWorkspacePanels.jsx';
import { GMRewardTools } from './GMRewardTools.jsx';
import { GMPartyLootPanel } from './PartyLootWorkspace.jsx';
import { GMInventoryAuditWorkspace } from './GMInventoryAuditWorkspace.jsx';
import { gmTradeLootOverview } from '../state/gmTradeLootHubModel.mjs';

const GM_TABS = dashboardTabs('gm');

function progression(character = {}) {
  const fallback = { xp: Number(character.xp || 0), xpMax: Number(character.xpMax || 1000), percent: 0 };
  return window.AsteriaProgression?.progressSummary?.(Object.assign({}, character)) || fallback;
}

function CharacterRosterCard({character,selected,presence,onSelect,onOpen,onFocus,
  reorderable=false,onBeginDrag,onMoveDrag,onEndDrag,onMoveByKey,embedded=false,
  dragging=false}){
  const xp=progression(character);
  const armour=useArmourClass(character);
  const soulDamage=soulDamageValue(character);
  const online=Object.values(presence||{}).some(record=>record.characterId===character.id&&record.state==='online');
  const portrait=character.image||character.portrait||character.characterImage||
    character.appearance?.image||character.appearance?.portrait;
  return <article className={'react-party-card'+(selected?' active':'')+(dragging?' is-lifted':'')}
    data-resource-character={character.id}
    onDoubleClick={event=>{
      if(onFocus&&!event.target.closest('button,input,select,textarea,a'))onFocus();
    }}>
    <div className="react-party-card-header">
      <span className="react-party-card-portrait">
        {portrait?<img src={portrait} alt="" loading="lazy" decoding="async"/>:
          <span aria-hidden="true">{String(character.name||'?').charAt(0)}</span>}
      </span>
      <div className="react-party-card-identity">
        <div className="react-party-name"><div><b>{character.name||'Unnamed Character'}</b>
          <small>{character.klass||character.class||'Class'} | Level {Number(character.level||0)}</small></div>
          <StatusPill tone="info">AC {armour.finalAC}</StatusPill>
          <span className={online?'presence online':'presence'}
            title={online?'Online':'Offline'}/>
        </div>
      </div>
      {reorderable?<button type="button" className="react-party-reorder"
        title="Hold and drag to move this card"
        aria-label={'Reorder '+(character.name||'character')+'; drag or use Alt + arrow keys'}
        onPointerDown={event=>onBeginDrag?.(event,character.id)}
        onPointerMove={onMoveDrag}
        onPointerUp={onEndDrag}
        onPointerCancel={onEndDrag}
        onLostPointerCapture={onEndDrag}
        onKeyDown={onMoveByKey}>≡</button>:null}
    </div>
    {resourceDefinitions(character).map(row=>{
      const [value,maximum]=resourcePair(storedResource(character,row.id));
      return <ResourceBar key={row.id} compact label={row.name} kind={row.id}
        value={value} maximum={maximum} reserved={row.id==='hp'?soulDamage:0}/>;
    })}
    <ResourceBar compact label="XP" kind="xp" value={xp.xp} maximum={xp.xpMax}/>
    {!embedded?<div className="react-party-card-actions">
      <button type="button" aria-pressed={selected} onClick={onSelect}>
        {selected?'Selected':'Select'}</button>
      <button type="button" onClick={onOpen}
        aria-label={'Open '+(character.name||'character')+' dashboard'}>Open Character</button>
    </div>:null}
  </article>;
}

function PartySidebar({campaign,characters,selectedId,setSelectedId,presence,onOpen,
  embedded=false,order=[],onReorder=null,onFocus=null}){
  const drag=useRef(null),listRef=useRef(null),beforeReorder=useRef(new Map());
  const animateReorder=useRef(false);
  const [draggingId,setDraggingId]=useState('');
  const partyIds=campaign?.party?.length?campaign.party:Object.keys(characters);
  const present=partyIds.filter(id=>Boolean(characters[id]));
  const orderedIds=orderedCombatPartyIds(present,order);
  const orderKey=orderedIds.join('|');
  const reorder=(from,to)=>{
    if(!onReorder||!from||!to||from===to)return;
    const cards=[...listRef.current?.querySelectorAll('[data-resource-character]')||[]];
    beforeReorder.current=new Map(cards.map(card=>
      [card.dataset.resourceCharacter,card.getBoundingClientRect()]));
    animateReorder.current=true;
    onReorder(from,to,orderedIds);
  };
  useLayoutEffect(()=>{
    if(!animateReorder.current)return;
    animateReorder.current=false;
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const cards=listRef.current?.querySelectorAll('[data-resource-character]')||[];
    for(const card of cards){
      const previous=beforeReorder.current.get(card.dataset.resourceCharacter);
      if(!previous)continue;
      const next=card.getBoundingClientRect();
      const dx=previous.left-next.left,dy=previous.top-next.top;
      if(Math.hypot(dx,dy)<2)continue;
      card.animate?.([
        {transform:'translate3d('+dx+'px,'+dy+'px,0)'},
        {transform:'translate3d(0,0,0)'}
      ],{duration:250,easing:'cubic-bezier(.22,1,.36,1)'});
    }
  },[orderKey]);
  useEffect(()=>()=>{if(drag.current?.frame)cancelAnimationFrame(drag.current.frame);
    drag.current?.overlay?.remove();},[]);
  const beginDrag=(event,id)=>{
    if(!embedded||!onReorder||drag.current||event.isPrimary===false||
      event.button!==0)return;
    const source=event.currentTarget.closest('.react-party-card');
    if(!source||!listRef.current?.contains(source))return;
    const rect=source.getBoundingClientRect();
    const overlay=document.createElement('div');
    overlay.className='react-gm-dashboard react-party-drag-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.style.width=source.offsetWidth+'px';
    const contents=document.createElement('div');
    contents.className='react-party-sidebar-in-canvas';
    const card=source.cloneNode(true);
    card.classList.remove('active','is-lifted','is-drop-target');
    card.removeAttribute('data-resource-character');
    card.setAttribute('aria-hidden','true');
    card.querySelectorAll('button').forEach(button=>{
      button.tabIndex=-1;button.draggable=false;
    });
    contents.appendChild(card);overlay.appendChild(contents);
    document.body.appendChild(overlay);
    const scale=rect.width/Math.max(1,source.offsetWidth);
    overlay.style.transform='translate3d('+rect.left+'px,'+rect.top+'px,0) scale('+scale+')';
    drag.current={id,pointerId:event.pointerId,source,overlay,scale,
      left:rect.left,top:rect.top,startX:event.clientX,startY:event.clientY,
      x:event.clientX,y:event.clientY,target:null,moved:false,frame:0};
    setDraggingId(id);
    event.preventDefault();event.stopPropagation();
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* no capture support */}
  };
  const moveDrag=event=>{
    const gesture=drag.current;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    gesture.x=event.clientX;gesture.y=event.clientY;
    gesture.moved ||= Math.hypot(gesture.x-gesture.startX,gesture.y-gesture.startY)>6;
    const candidate=document.elementFromPoint(gesture.x,gesture.y)
      ?.closest?.('[data-resource-character]');
    const target=candidate&&candidate!==gesture.source&&
      listRef.current?.contains(candidate)?candidate:null;
    if(target!==gesture.target){
      gesture.target?.classList.remove('is-drop-target');
      gesture.target=target;
      target?.classList.add('is-drop-target');
    }
    if(!gesture.frame)gesture.frame=requestAnimationFrame(()=>{
      gesture.frame=0;
      gesture.overlay.style.transform='translate3d('+
        (gesture.left+gesture.x-gesture.startX)+'px,'+
        (gesture.top+gesture.y-gesture.startY)+'px,0) scale('+gesture.scale+')';
    });
    event.preventDefault();event.stopPropagation();
  };
  const endDrag=event=>{
    const gesture=drag.current;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    drag.current=null;
    if(gesture.frame)cancelAnimationFrame(gesture.frame);
    const to=gesture.target?.dataset.resourceCharacter||'';
    gesture.target?.classList.remove('is-drop-target');
    gesture.overlay.remove();
    setDraggingId('');
    if(event.type==='pointerup'&&gesture.moved&&to)reorder(gesture.id,to);
    try{event.currentTarget.releasePointerCapture?.(event.pointerId);}catch{/* already released */}
    event.stopPropagation();
  };
  const list=<>
    <p>{campaign?.name||'Campaign'} party</p>
    <div className="react-party-list" ref={listRef}>
      {orderedIds.map(id=>{
        const character=characters[id];
        return <CharacterRosterCard key={id} character={character}
          selected={selectedId===id} presence={presence} embedded={embedded}
          dragging={draggingId===id}
          onSelect={()=>setSelectedId(id)} onOpen={()=>onOpen(character)}
          onFocus={onFocus?()=>onFocus(character):null}
          reorderable={Boolean(onReorder)}
          onBeginDrag={beginDrag} onMoveDrag={moveDrag} onEndDrag={endDrag}
          onMoveByKey={event=>{
            if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
            event.preventDefault();event.stopPropagation();
            const index=orderedIds.indexOf(id);
            const target=orderedIds[index+(event.key==='ArrowUp'?-1:1)];
            if(target)reorder(id,target);
          }}/>
      })}
      {!present.length?<EmptyState title="No linked characters">
        Characters appear here as soon as they join this campaign.</EmptyState>:null}
    </div>
    <p className="react-help">{embedded?
      'Drag the top-right handle to lift and reorder cards, or use Alt + Up/Down on the handle. Double-click a card to inspect its dashboard.':
      'Select a character to manage them, or open their Character Dashboard.'}</p>
  </>;
  return embedded?<section className="react-party-sidebar react-party-sidebar-in-canvas"
    aria-label="GM Player Resources" data-testid="gm-combat-party-resources">{list}</section>:
    <Panel title="Player Resources" className="react-party-sidebar">{list}</Panel>;
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
  const [canvasCharacterId,setCanvasCharacterId]=useState('');
  const [gmSearchTarget,setGMSearchTarget]=useState(null);
  const [savedDashboardLayout,setSavedDashboardLayout] = useState(null);
  const [dashboardLayoutReady,setDashboardLayoutReady] = useState(false);
  const [savingDashboardSettings,setSavingDashboardSettings] = useState(false);
  const [dashboardLayoutError,setDashboardLayoutError] = useState('');
  const dashboardSaveScope=useRef('');
  const focusSavePending=useRef(false);
  const canvasSaveChain=useRef(Promise.resolve());
  const accountUid=firebaseService.currentUser()?.uid || '';
  const combatApi=useMemo(()=>accountUid?createSiteCombatApi():null,[campaignId,accountUid]);
  const combatMediaApi=useMemo(()=>accountUid?createSiteCombatMediaApi():null,[campaignId,accountUid]);
  const gmTradeHub=useMemo(()=>gmTradeLootOverview({itemEcosystem:live.itemEcosystem,partyLoot:live.partyLoot}),
    [live.itemEcosystem,live.partyLoot]);
  const openCanvasCharacter=character=>{
    if(!window.AsteriaCharacterAccess?.canGMView(live.campaign,character,accountUid)){
      setActionError('You do not have permission to view this character.');
      return;
    }
    setCanvasCharacterId(character.id);
  };
  const openGMHubLink=link=>{
    // The toolkit is a directory of existing GM views, not an arbitrary route.
    if(!GM_TABS.some(item=>item.id===link?.tab))return;
    setGMSearchTarget(null);
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
  useEffect(()=>{setGMHubDestination(null);setGMSearchTarget(null);setCanvasCharacterId('');},[campaignId,accountUid]);
  useEffect(()=>{
    dashboardSaveScope.current=campaignId+':'+accountUid;
    focusSavePending.current=false;
    canvasSaveChain.current=Promise.resolve();
    setDashboardLayoutReady(false);
    setSavedDashboardLayout(null);
    setDashboardLayoutError('');
    if(!campaignId||!accountUid)return;
    const subscriptionScope=campaignId+':'+accountUid;
    return firebaseService.subscribeUserDashboardLayout(campaignId,'gm',layout=>{
      if(dashboardSaveScope.current!==subscriptionScope)return;
      // A pending optimistic Focus switch must not flicker back to a stale
      // server snapshot while the private layout write is in flight.
      if(!focusSavePending.current)setSavedDashboardLayout(layout);
      setDashboardLayoutReady(true);
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
  const commitGMFocus=async layout=>{
    if(!accountUid||!dashboardLayoutReady)return {ok:false,error:'Connect your GM dashboard before changing Focus.'};
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
  const saveGMCanvas=async canvas=>{
    if(!accountUid||!dashboardLayoutReady)
      return {ok:false,error:'GM dashboard layout is not connected.'};
    const scope=campaignId+':'+accountUid;
    const previous=normalizeDashboardLayout(savedDashboardLayout,'gm');
    const next=normalizeDashboardLayout({
      ...previous,gmCanvas:normalizeGMCanvasLayout(canvas)
    },'gm');
    // Save through the existing GM-owned dashboard document; do not
    // create a second layout record or store gameplay state here.
    setSavedDashboardLayout(next);
    setDashboardLayoutError('');
    setSavingDashboardSettings(true);
    focusSavePending.current=true;
    const write=canvasSaveChain.current.then(()=>
      firebaseService.saveUserDashboardLayout(campaignId,'gm',next));
    canvasSaveChain.current=write.catch(()=>{});
    try{
      const result=await write;
      if(dashboardSaveScope.current!==scope)return {ok:false,error:'GM context changed while saving.'};
      if(result?.ok===false){
        setDashboardLayoutError(result.error||'Could not save GM canvas.');
        setSavedDashboardLayout(current=>
          current?.gmCanvas===next.gmCanvas?previous:current);
      }
      return result;
    }catch(error){
      const failure={ok:false,error:error?.message||'Could not save GM canvas.'};
      if(dashboardSaveScope.current===scope)setDashboardLayoutError(failure.error);
      return failure;
    }finally{
      if(dashboardSaveScope.current===scope){
        setSavingDashboardSettings(false);focusSavePending.current=false;
      }
    }
  };
  const gmCanvasLayout=useMemo(()=>
    normalizeDashboardLayout(savedDashboardLayout,'gm').gmCanvas,
    [savedDashboardLayout]);
  const gmPanel=id=>{
    const shortcut=(title,tab)=> <Panel title={title}><p className="react-help">Open the full {title} workspace.</p><button type="button" onClick={()=>setTab(tab)}>Open {title}</button></Panel>;
    switch(id){
      case 'gmResources':return ({order,onReorder})=><PartySidebar embedded
        campaign={live.campaign||{id:campaignId}} characters={live.characters}
        selectedId={selectedId} setSelectedId={setSelectedId} presence={live.presence}
        order={order} onReorder={onReorder} onFocus={openCanvasCharacter}
        onOpen={character=>openGMCharacter(live.campaign,character,{tab})}/>;
      case 'requestsOverview':return <GMQuickRequests campaignId={campaignId}
        characters={live.characters} editable={live.session?.editable}
        onNavigate={setTab}/>;
      case 'preparedOverview':return <GMQuickPreparedEncounters
        api={combatApi} campaignId={campaignId} onNavigate={setTab}/>;
      case 'quickNotes':return <GMQuickNotes workspace={workspace}
        saveSection={saveSection} onNavigate={setTab}/>;
      case 'calendarWeather':return <GMQuickCalendarWeather campaignId={campaignId}
        onNavigate={setTab}/>;
      case 'sessionOverview':return <GMQuickSession session={live.session}
        presence={live.presence} events={live.events} characters={live.characters}
        onNavigate={setTab}/>;
      case 'focusModes':return <GMFocusModes key={campaignId+':'+accountUid}
        layout={savedDashboardLayout} onCommit={commitGMFocus}
        disabled={!accountUid||!dashboardLayoutReady||savingDashboardSettings}/>;
      case 'diceQuick':return <AdvancedDiceWorkspace role="gm"/>;
      case 'npcQuick':return <GMQuickReference title="NPC & Creature Library"
        description={Object.keys(workspace.npcs||{}).length+' campaign NPC entries'}
        target="bestiary" onNavigate={setTab}/>;
      case 'soundboardQuick':return <GMCampaignSoundboard campaignId={campaignId}/>;
      case 'worldQuick':return <GMExplorationOverview workspace={workspace}
        campaign={live.campaign} onNavigate={setTab}/>;
      case 'playerDisplayQuick':return <GMQuickReference title="Player Display"
        description="Manage the existing live presentation screen."
        target="presentation" onNavigate={setTab}/>;
      case 'restRequests':return <RestRequestsPanel campaignId={campaignId} characters={live.characters} editable={live.session?.editable}/>;
      case 'encounter':return <Panel title="Combat Command Centre"><p className="react-help">Encounters, initiative, turns and prepared combat now live in the dedicated Combat menu.</p><button type="button" onClick={()=>setTab('combat')}>Open Combat Command Centre</button></Panel>;
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
    actions={<><SessionActions campaignId={campaignId} session={live.session} busy={busy} run={run} /><LiveSyncStatus online={live.online} connectionState={live.connectionState} error={live.error || actionError || coreSyncError} loading={live.loading} session={live.session} /></>}
  >
    {tab!=='combat'&&tab!=='main'?<section className="react-gm-party-strip" aria-label="GM Player Resources"
      data-testid="gm-player-resources-strip">
      <PartySidebar campaign={live.campaign || { id: campaignId }}
        characters={live.characters} selectedId={selectedId}
        setSelectedId={setSelectedId} presence={live.presence}
        onOpen={character=>openGMCharacter(live.campaign,character,{tab})}/>
    </section>:null}
    <GMRecordingParticipationNotice key={campaignId} campaignId={campaignId}/>
    <DashboardNavigation role="gm" storageScope={campaignId+":"+accountUid} tabs={GM_TABS} active={tab} onChange={next=>{setGMSearchTarget(null);setGMHubDestination(null);setTab(next);}} ariaLabel="GM Dashboard menu" />
    {tab === 'bestiary' ? <GMNpcCreatureLibrary key={campaignId+':'+accountUid+':bestiary'}
      workspace={workspace} saveSection={saveSection} campaignId={campaignId} characters={live.characters} searchTarget={gmSearchTarget}
      onOpenEncounter={()=>setTab('combat')} onOpenWorld={()=>setTab('world')} /> : null}
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
    {tab === 'main' ? <CanvasWorkspace key={campaignId+':'+accountUid+':gm-main'}
        uid={accountUid} campaignId={campaignId}
        canvasConfig={GM_DASHBOARD_CANVAS_CONFIG} layoutValue={gmCanvasLayout}
        onSaveLayout={saveGMCanvas}>
        {GM_DASHBOARD_CANVAS_CONFIG.ids.map(id=><CombatCommandPanel id={id} key={id}>
          {gmPanel(id)}
        </CombatCommandPanel>)}
      </CanvasWorkspace> : null}
    {tab === 'settings' ? <div className="react-settings-workspace">
      <Panel title="GM Dashboard Settings">
        <p className="react-help">The GM Main Dashboard now uses the freeform
          canvas instead of the old grid layout editor. Use the + icon in
          the top-left of that canvas to add or remove windows. Drag titles
          to move them, resize from the edges, and use the toolbar to
          focus, lock, undo, redo or fit your workspace.</p>
        <button type="button" onClick={()=>setTab('main')}>Open GM Canvas</button>
        {dashboardLayoutError?<p role="alert">{dashboardLayoutError}</p>:null}
      </Panel>
      <GMLayoutBackup key={campaignId+':'+accountUid+':backup'} layout={savedDashboardLayout}
        onRestore={commitGMFocus}
        disabled={!accountUid||!dashboardLayoutReady||savingDashboardSettings}/>
    </div> : null}
    {dashboardLayoutError?<p role="alert">{dashboardLayoutError}</p>:null}
    {tab === 'combat' ? <GMCombatWorkspace key={campaignId+':'+accountUid+':combat'}
      api={combatApi} campaignId={campaignId} uid={accountUid} mediaApi={combatMediaApi}
      onNavigate={setTab} legacyEncounter={live.encounter}
      legacyCharacters={live.characters} legacyCombatState={live.gmWorkspace?.combatState}
      renderPartyResources={({order,onReorder})=><PartySidebar embedded
        campaign={live.campaign||{id:campaignId}} characters={live.characters}
        selectedId={selectedId} setSelectedId={setSelectedId} presence={live.presence}
        order={order} onReorder={onReorder} onFocus={openCanvasCharacter}
        onOpen={character=>openGMCharacter(live.campaign,character,{tab})}/>}/> : null}
    {tab === 'inventory' ? <><GMTradeLootHub overview={gmTradeHub} onNavigate={openGMHubLink}/><PCInventory campaignId={campaignId} characters={live.characters} selectedId={selectedId} onSelect={setSelectedId} editable={live.session?.editable} rewards={<><section id="react-gm-inventory-audit" tabIndex={-1}><GMInventoryAuditWorkspace characters={live.characters} events={live.events}/></section><LootRewards campaignId={campaignId} characters={live.characters} events={live.events} customItems={live.customItems}/><GMRewardTools campaignId={campaignId} characters={live.characters} events={live.events} workspace={workspace} saveSection={saveSection} customItems={live.customItems} editable={live.session?.editable}/><section id="react-gm-party-loot" tabIndex={-1}><GMPartyLootPanel campaignId={campaignId} characters={live.characters} partyLoot={live.partyLoot} customItems={live.customItems} editable={live.session?.editable}/></section></>}/></> : null}
    {tab === 'information' ? <CampaignInformationWorkspace campaignId={campaignId} campaign={live.campaign} workspace={workspace} characters={live.characters}/> : null}
    {tab === 'quests' ? <QuestWorkspace campaignId={campaignId} workspace={workspace} characters={live.characters} saveSection={saveSection} searchTarget={gmSearchTarget}/> : null}
    {tab === 'notes' ? <><NotesWorkspace workspace={workspace} session={live.session} saveSection={saveSection}/><GMSessionLibraryWorkspace campaignId={campaignId} searchTarget={gmSearchTarget}/></> : null}
    {tab === 'session-library' ? <GMSessionLibraryWorkspace campaignId={campaignId}/> : null}
    {tab === 'soundboard' ? <GMCampaignSoundboard campaignId={campaignId}/> : null}
    {tab === 'session-recordings' ? <GMSessionRecordingWorkspace campaignId={campaignId} session={live.session}/> : null}
    {tab === 'presentation' ? <GMPlayerPresentationWorkspace campaignId={campaignId} characters={live.characters} onNavigate={setTab}/> : null}
    {tab === 'economy' ? <><GMTradeLootHub overview={gmTradeHub} onNavigate={openGMHubLink}/><EconomyWorkspace campaignId={campaignId} workspace={workspace} characters={live.characters} itemEcosystem={live.itemEcosystem} customItems={live.customItems} saveSection={saveSection} searchTarget={gmSearchTarget}/></> : null}
    {tab === 'crafting' ? <CraftingWorkspace campaignId={campaignId} workspace={workspace} characters={live.characters} saveSection={saveSection}/> : null}
    <GMUniversalCheckNotification campaignId={campaignId} onOpen={()=>setTab('tools')}/>
    {tab === 'tools' ? <div className="react-gm-tools-grid"><GMUniversalCheckManager campaignId={campaignId} characters={live.characters}/>{live.characters[selectedId]?<><ConditionsPanel campaignId={campaignId} character={live.characters[selectedId]} isGM editable={live.session?.editable} clock={{encounter:live.encounter,now:live.clock}}/><ResourceRulesPanel key={selectedId} campaignId={campaignId} character={live.characters[selectedId]} editable={live.session?.editable}/></>:null}<CampaignManagerWorkspace campaignId={campaignId} campaign={live.campaign} characters={live.characters} session={live.session} workspace={workspace} saveSection={saveSection}/><ACInspectionPanel campaignId={campaignId} characters={live.characters} selectedId={selectedId} setSelectedId={setSelectedId}/><PlayerManagementTools campaignId={campaignId} characters={live.characters}/><MagicElementRewards campaignId={campaignId} characters={live.characters} events={live.events} /><GMRewardTools campaignId={campaignId} characters={live.characters} events={live.events} workspace={workspace} saveSection={saveSection} customItems={live.customItems} editable={live.session?.editable}/></div> : null}
    {tab === 'gameplay' ? <GameplayWorkspace campaignId={campaignId} workspace={workspace} partyWorkspace={live.partyWorkspace} characters={live.characters} saveSection={saveSection}/> : null}
    {tab === 'world' ? <WorldWorkspace workspace={workspace} saveSection={saveSection} searchTarget={gmSearchTarget}/> : null}
    {tab === 'battle-maps' ? <GMBattleMapManager campaignId={campaignId} characters={live.characters} encounter={live.encounter} searchTarget={gmSearchTarget}/> : null}
    {tab === 'advanced-dice' ? <AdvancedDiceWorkspace role="gm"/> : null}
    {tab === 'random-tables' ? <GMRandomTableWorkspace key={campaignId} campaignId={campaignId} searchTarget={gmSearchTarget}/> : null}
    {tab === 'encounter-rewards' ? <GMEncounterRewardWorkspace key={campaignId} campaignId={campaignId} encounter={live.encounter} searchTarget={gmSearchTarget} onOpenEncounter={()=>setTab('combat')} onOpenLoot={()=>setTab('inventory')}/> : null}
    {tab === 'asteria-calendar' ? <AsteriaCalendarWorkspace key={campaignId} campaignId={campaignId} workspace={workspace}/> : null}
    {tab === 'weather-environment' ? <GMWeatherEnvironmentWorkspace key={campaignId} campaignId={campaignId}/> : null}
    {tab === 'world-atlas' ? <GMWorldAtlasWorkspace key={campaignId} campaignId={campaignId} searchTarget={gmSearchTarget}/> : null}
    {(tab==='combat'||tab==='main')&&canvasCharacterId&&live.characters[canvasCharacterId]&&
      window.AsteriaCharacterAccess?.canGMView(live.campaign,live.characters[canvasCharacterId],accountUid)?
      <Modal title={(live.characters[canvasCharacterId]?.name||'Character')+' — Player Dashboard'}
        eyebrow="GM Character Inspection" onClose={()=>setCanvasCharacterId('')}>
        <div className="react-canvas-character-dashboard" data-testid="gm-canvas-character-dashboard">
          <CharacterDashboard campaignId={campaignId} characterId={canvasCharacterId}/>
        </div>
      </Modal>:null}
  </AsteriaAppShell>;
}
