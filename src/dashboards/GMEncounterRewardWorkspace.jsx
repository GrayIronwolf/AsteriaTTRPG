import React,{useEffect,useMemo,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {planEncounterCombatants,ENCOUNTER_PLAN_MAX_ENEMIES,ENCOUNTER_PLAN_MAX_LOOT_ROLLS} from '../state/encounterRewardModel.mjs';
import '../styles/encounter-rewards.css';

const defaults={threatTier:1,tolerance:0,count:3,source:'all',
 biome:'',lootTableId:'',lootRolls:0,randomTableId:''};
const displayDate=value=>value?.toDate?.()?.toLocaleString?.()||'';
const describeXP=value=>Number.isSafeInteger(value)?value.toLocaleString()+' XP':'XP not configured';
export function GMEncounterRewardWorkspace({campaignId,encounter,onOpenEncounter,onOpenLoot}){
 const [settings,setSettings]=useState(defaults);
 const [plans,setPlans]=useState([]),[lootTables,setLootTables]=useState([]),[randomTables,setRandomTables]=useState([]);
 const [selectedId,setSelectedId]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const active=plans.find(row=>row.id===selectedId)||null;
 const lootChoices=useMemo(()=>lootTables.filter(row=>row.status==='active'),[lootTables]);
 const randomChoices=useMemo(()=>randomTables.filter(row=>row.status==='active'&&row.category==='encounter'&&
  row.threatTier===Number(settings.threatTier)),[randomTables,settings.threatTier]);
 useEffect(()=>{
  setPlans([]);setRandomTables([]);setLootTables([]);setSelectedId('');setMessage('');setError('');
  if(!campaignId)return;
  const stops=[
   firebaseService.subscribeEncounterPlans(campaignId,setPlans),
   firebaseService.subscribeLootTables(campaignId,setLootTables),
   firebaseService.subscribeRandomTables(campaignId,setRandomTables)
  ];
  return()=>stops.forEach(stop=>stop?.());
 },[campaignId]);
 const patch=(key,value)=>setSettings(old=>({...old,[key]:value}));
 const submit=async(action,success)=>{
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const result=await firebaseService.manageEncounterReward(campaignId,'gm-scope',action);
   if(result?.ok!==true)throw Error(result?.error||'The server did not confirm this encounter action.');
   if(result.planId)setSelectedId(result.planId);
   setMessage(success(result));
  }catch(error){setError(error?.message||'The encounter action failed.');}
  finally{setBusy(false);}
 };
 const generate=()=>submit({
  type:'generate',threatTier:Number(settings.threatTier),
  tolerance:Number(settings.tolerance),count:Number(settings.count),
  source:settings.source,biome:settings.biome,lootTableId:settings.lootTableId,
  lootRolls:Number(settings.lootRolls),randomTableId:settings.randomTableId
 },result=>'Encounter preview saved. '+result.creatureCount+' creatures; '+result.rewardRollCount+
 ' treasure rolls. No combat or inventory changes.');
 const changeStatus=type=>{
  if(!active||!window.confirm(type==='approve'?
   'Approve this encounter? Any treasure rolls become hidden GM-only drafts. No rewards are distributed.':
   'Archive this proposal without awarding rewards?'))return;
  submit({type,planId:active.id,expectedRevision:active.revision},result=>
   type==='approve'?'Approved. '+result.stagedLoot+
   ' hidden treasure draft(s) staged; use GM Treasure to review and reveal.':
   'Encounter proposal archived.');
 };
 const addToCombat=async()=>{
  if(!active||busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const prepared=planEncounterCombatants(active,encounter||{status:'ready',combatants:[],enemies:[]});
   if(!prepared.added.length){
    setMessage('All creatures from this approved plan are already in the encounter.');
    return;
   }
   if(!window.confirm('Add '+prepared.added.length+' creatures to the current encounter setup? This will not start combat or grant XP.'))return;
   const result=await firebaseService.saveEncounter(campaignId,prepared.encounter);
   if(result?.ok!==true)throw Error(result?.error||'Combat command did not confirm encounter setup.');
   setMessage(prepared.added.length+' generated creatures added to the existing encounter setup.');
  }catch(error){setError(error?.message||'Could not prepare the encounter.');}
  finally{setBusy(false);}
 };
 return <Panel title="Encounter & Reward Generator" eyebrow="Digital GM Toolkit · Phase 7.3">
  <div className="asteria-encounter-rewards">
   <p>Create GM-private encounter proposals from official Asteria creatures and eligible campaign library records. Threat Tier is matched to source data; no challenge rating or XP is invented.</p>
   <section className="asteria-encounter-rewards-card">
    <h3>Generate encounter</h3>
    <div className="asteria-encounter-rewards-grid">
     <label>Threat Tier (1–20)<input type="number" min="1" max="20" step="1" value={settings.threatTier} disabled={busy}
       onChange={event=>patch('threatTier',event.target.value)}/></label>
     <label>Tier tolerance<select value={settings.tolerance} disabled={busy}
       onChange={event=>patch('tolerance',event.target.value)}>
       <option value="0">Exact tier</option><option value="1">±1 tier</option><option value="2">±2 tiers</option>
     </select></label>
     <label>Creatures (1–{ENCOUNTER_PLAN_MAX_ENEMIES})<input type="number" min="1" max={ENCOUNTER_PLAN_MAX_ENEMIES} step="1"
       value={settings.count} disabled={busy} onChange={event=>patch('count',event.target.value)}/></label>
     <label>Creature source<select value={settings.source} disabled={busy}
       onChange={event=>patch('source',event.target.value)}>
       <option value="all">Official & campaign</option><option value="official">Official Compendium</option>
       <option value="campaign">Campaign NPCs & creatures</option>
     </select></label>
     <label>Biome / location (optional)<input value={settings.biome} maxLength={80}
       onChange={event=>patch('biome',event.target.value)} disabled={busy}
       placeholder="Forest, Mountain, Tundra..."/></label>
     <label>Encounter narrative table (optional)<select value={settings.randomTableId} disabled={busy}
       onChange={event=>patch('randomTableId',event.target.value)}>
       <option value="">No narrative table</option>
       {randomChoices.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
     </select></label>
     <label>Loot table (optional)<select value={settings.lootTableId} disabled={busy}
       onChange={event=>patch('lootTableId',event.target.value)}>
       <option value="">None / use narrative link</option>
       {lootChoices.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
     </select></label>
     <label>Loot rolls (0–{ENCOUNTER_PLAN_MAX_LOOT_ROLLS})<input type="number" min="0" max={ENCOUNTER_PLAN_MAX_LOOT_ROLLS}
       value={settings.lootRolls} disabled={busy} step="1"
       onChange={event=>patch('lootRolls',event.target.value)}/></label>
    </div>
    <button className="primary" type="button" disabled={busy} onClick={generate}>
      {busy?'Processing...':'Generate private preview'}</button>
    <p className="react-help">If the filters find no eligible creatures, generation stops without saving anything. Linked loot rolls remain unreleased until GM approval and separate treasury review.</p>
   </section>
   <section className="asteria-encounter-rewards-card">
    <h3>Saved encounter proposals</h3>
    <label>Select proposal<select value={selectedId} onChange={event=>{setSelectedId(event.target.value);setMessage('');setError('');}}>
     <option value="">Choose a proposal</option>
     {plans.map(row=><option key={row.id} value={row.id}>{row.status} · TT {row.threatTier} · {row.creatures?.length||0} creatures</option>)}
    </select></label>
    {active?<div className="asteria-encounter-rewards-details">
     <p><strong>{active.status.toUpperCase()}</strong> · Tier {active.threatTier} ±{active.tolerance} · {active.creatures?.length} creatures · {displayDate(active.createdAt)}</p>
     <p>{active.candidateCount} eligible creature types · {describeXP(active.totalXP)}
       {active.xpUnconfigured>0?' · '+active.xpUnconfigured+' creature(s) without configured XP':''}</p>
     {active.prompt?<aside><strong>Random-table event: {active.prompt.label}</strong>
      {active.prompt.description?<p>{active.prompt.description}</p>:null}
      {active.prompt.note?<p>GM note: {active.prompt.note}</p>:null}</aside>:null}
     <h4>Generated creatures</h4>
     <ol>{(active.creatures||[]).map(row=><li key={row.slot}>
      <b>{row.name}</b> · TT {row.threatTier} · HP {row.hp?.[1]} · {describeXP(row.xpReward)}
      <small>{row.source} · {row.type}{row.biome?' · '+row.biome:''}</small>
     </li>)}</ol>
     {active.reward?<section><h4>Treasure preview — {active.reward.tableName}</h4>
       <p>{active.reward.generatedCount} generated / {active.reward.emptyCount} empty · saved table revision {active.reward.tableRevision}</p>
       <ol>{active.reward.rolls.map(row=><li key={row.rollNumber}>
        {row.roll.kind==='item'?row.roll.item?.name+' ×'+row.roll.item?.quantity:
         row.roll.kind==='currency'?row.roll.currencyCopper+' copper':'Nothing found'}
       </li>)}</ol>
       <p className="react-help">These details are GM-private. Approval creates only hidden treasure drafts, not player inventory or currency.</p>
      </section>:null}
     <div className="asteria-encounter-rewards-actions">
      <button className="primary" type="button" disabled={busy||active.status!=='draft'}
       onClick={()=>changeStatus('approve')}>Approve proposal & stage treasure</button>
      <button type="button" disabled={busy||active.status!=='draft'}
       onClick={()=>changeStatus('archive')}>Archive draft</button>
      <button type="button" disabled={busy||active.status!=='approved'||encounter?.status!=='ready'}
       onClick={addToCombat}>Add to combat setup</button>
      <button type="button" onClick={onOpenEncounter}>Open encounter board</button>
      <button type="button" onClick={onOpenLoot}>Open GM treasure review</button>
     </div>
    </div>:<p className="react-help">Generate a preview to review creatures, source tiers, possible XP and treasure rolls.</p>}
   </section>
   {error?<p role="alert" className="asteria-encounter-rewards-error">{error}</p>:null}
   {message?<p role="status">{message}</p>:null}
   <p className="react-help">This generator does not begin combat, award XP, reveal loot or modify player characters. GM approval stages private treasure; existing combat and party-loot workflows remain authoritative.</p>
  </div>
 </Panel>;
}