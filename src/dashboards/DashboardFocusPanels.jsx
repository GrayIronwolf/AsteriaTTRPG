import React from 'react';
import { DashboardPanel } from '../components/WorkspaceUI.jsx';
import { resourcePair } from '../state/specialDamageModel.mjs';
import { inventoryItems, quests as playerQuestRows } from './characterWorkspaceData.js';
import { openDashboardQuests, encounterRosterCount } from '../state/gameplayIntegrationView.mjs';

// These are read-only views of existing Firebase-backed records. They never
// create parallel quest, inventory, resource or encounter state.
const arr=value=>Array.isArray(value)?value:[];
const name=value=>String(value?.name||value?.title||value?.text||'Unnamed').slice(0,100);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const itemQuantity=item=>Math.max(0,number(item?.qty??item?.quantity??1));
// Use the same canonical inventory/quest selectors as the full Player workspaces.
const itemRows=character=>inventoryItems(character);
const questRows=(character,workspace)=>openDashboardQuests(playerQuestRows(character,workspace));
const stat=(label,value)=><div className="react-focus-stat" key={label}><span>{label}</span><strong>{value}</strong></div>;
const OpenButton=({tab,onNavigate,children})=><button type="button" onClick={()=>onNavigate(tab)}>{children}</button>;
function FocusPanel({title,eyebrow,children,tab,onNavigate,button}){
  return <DashboardPanel title={title} eyebrow={eyebrow} compact className="react-focus-overview" action={tab&&onNavigate?<OpenButton tab={tab} onNavigate={onNavigate}>{button||'Open'}</OpenButton>:null}>
    {children}
  </DashboardPanel>;
}
function PreviewList({rows,empty,render}) {
  return rows.length?<ul className="react-focus-preview-list">{rows.slice(0,4).map((row,index)=><li key={row?.id||row?.instanceId||index}>{render(row)}</li>)}</ul>
    :<p className="react-help">{empty}</p>;
}
export function PlayerCombatOverview({character={},combat={},onNavigate}){
  const [hp,hpMax]=resourcePair(character.hp||[0,0]);
  const [mp,mpMax]=resourcePair(character.mp||[0,0]);
  const conditions=arr(character.conditions);
  return <FocusPanel title="Combat Overview" eyebrow="Player Focus" tab="character" button="Character Sheet" onNavigate={onNavigate}>
    <div className="react-focus-stats">{stat('HP',hp+' / '+hpMax)}{stat('MP',mp+' / '+mpMax)}{stat('Conditions',conditions.length)}{stat('Combat',combat?.active?'Active':'Idle')}</div>
    <PreviewList rows={conditions} empty="No active conditions." render={row=><span>{name(row)}</span>}/>
    <p className="react-help">Live resources and combat actions remain in the existing dashboard and combat systems.</p>
  </FocusPanel>;
}
export function PlayerExplorationOverview({campaign={},partyWorkspace={},character={},onNavigate}){
  const location=campaign.location||partyWorkspace.location||character.location||'Not recorded';
  const region=campaign.region||partyWorkspace.region||'Not recorded';
  return <FocusPanel title="Exploration Overview" eyebrow="Player Focus" tab="journal" button="Journal" onNavigate={onNavigate}>
    <div className="react-focus-stats">{stat('Location',location)}{stat('Region',region)}</div>
    <p className="react-help">Open the Journal to review recorded discoveries and exploration notes.</p>
  </FocusPanel>;
}
export function PlayerQuestTracker({character={},partyWorkspace={},onNavigate}){
  const quests=questRows(character,partyWorkspace);
  return <FocusPanel title="Quest Tracker" eyebrow="Player Focus" tab="quest" button="Quest Log" onNavigate={onNavigate}>
    <div className="react-focus-stats">{stat('Open quests',quests.length)}</div>
    <PreviewList rows={quests} empty="No open personal or shared quests." render={row=><><b>{name(row)}</b><span>{String(row.status||'Active')}{row.tracked?' · Tracked':''}</span></>}/>
  </FocusPanel>;
}
export function PlayerInventoryOverview({character={},onNavigate}){
  const rows=itemRows(character);
  return <FocusPanel title="Inventory Overview" eyebrow="Player Focus" tab="inventory" button="Inventory" onNavigate={onNavigate}>
    <div className="react-focus-stats">{stat('Item entries',rows.length)}{stat('Total quantity',rows.reduce((sum,row)=>sum+itemQuantity(row),0))}</div>
    <PreviewList rows={rows} empty="No inventory items recorded." render={row=><><b>{name(row)}</b><span>×{itemQuantity(row)}</span></>}/>
  </FocusPanel>;
}
export function GMCombatOverview({encounter={},session={},characters={},onNavigate}){
  const combat=encounter?.combat||encounter||{};
  const combatants=encounterRosterCount(encounter);
  const running=combat.status==='active'||combat.active===true;
  return <FocusPanel title="Combat Overview" eyebrow="GM Focus" tab="main" button="Encounter Board" onNavigate={onNavigate}>
    <div className="react-focus-stats">{stat('Encounter',running?'Active':String(combat.status||'Idle'))}{stat('Combatants',combatants)}{stat('Party',Object.keys(characters||{}).length)}{stat('Session',String(session.status||'Idle'))}</div>
    <p className="react-help">Use the existing Campaign Encounter panel to manage turns, enemies and rewards.</p>
  </FocusPanel>;
}
export function GMExplorationOverview({workspace={},campaign={},onNavigate}){
  const world=workspace.world||{};
  const locations=arr(world.settlements),events=arr(world.events);
  return <FocusPanel title="Exploration Overview" eyebrow="GM Focus" tab="world" button="World Systems" onNavigate={onNavigate}>
    <div className="react-focus-stats">{stat('Location',world.location||campaign.location||'Not recorded')}{stat('Settlements',locations.length)}{stat('World events',events.length)}</div>
    <PreviewList rows={events} empty="No world events recorded." render={row=><b>{name(row)}</b>}/>
  </FocusPanel>;
}
export function GMQuestTracker({workspace={},onNavigate}){
  const quests=arr(workspace.quests),active=openDashboardQuests(quests);
  return <FocusPanel title="Quest Tracker" eyebrow="GM Focus" tab="quests" button="Manage Quests" onNavigate={onNavigate}>
    <div className="react-focus-stats">{stat('Open quests',active.length)}{stat('Total quests',quests.length)}</div>
    <PreviewList rows={active} empty="No active quests recorded." render={row=><><b>{name(row)}</b><span>{String(row.status||'Active')}</span></>}/>
  </FocusPanel>;
}
export function GMInventoryOverview({characters={},itemEcosystem={},onNavigate}){
  const party=Object.values(characters||{});
  const entries=party.reduce((sum,character)=>sum+itemRows(character).length,0);
  const shops=arr(itemEcosystem.shops);
  return <FocusPanel title="Inventory Overview" eyebrow="GM Focus" tab="inventory" button="PC Inventory" onNavigate={onNavigate}>
    <div className="react-focus-stats">{stat('Linked characters',party.length)}{stat('Item entries',entries)}{stat('Shops',shops.length)}</div>
    <PreviewList rows={shops} empty="No campaign shops recorded." render={row=><b>{name(row)}</b>}/>
  </FocusPanel>;
}
