import React,{useState} from 'react';
import styles from './GMOverviewPanels.module.css';

function GMConditions({party,busy,onCondition}){
  const [target,setTarget]=useState(''),[name,setName]=useState('');
  const selected=party.find(row=>row.id===target)||party[0]||null;
  return <div className={styles.section}>
    <h4>Special Damage &amp; Conditions</h4>
    {party.length?<label>Character
      <select value={selected?.id||''} onChange={e=>setTarget(e.target.value)}>
        {party.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>:<p>No linked characters.</p>}
    {selected?<><p>Soul Damage: <strong>{selected.soulDamage||0}</strong></p>
      <ul className={styles.party}>{(selected.conditions||[]).map(condition=>
        <li key={condition.id} className={styles.row}>
          <span>{condition.name}</span>
          <button type="button" disabled={busy}
            onClick={()=>onCondition?.(selected.id,{action:'remove',id:condition.id})}>
            Remove</button>
        </li>)}</ul>
      {!selected.conditions?.length?<p>No active conditions.</p>:null}
      <label>New condition
        <input maxLength={100} value={name} onChange={e=>setName(e.target.value)}/>
      </label>
      <button type="button" disabled={busy||!name.trim()} onClick={()=>{
        onCondition?.(selected.id,{action:'add',name:name.trim()});
        setName('');
      }}>Apply Condition</button>
    </>:null}
  </div>;
}

/** Original GM panel IDs are preserved in the saved layout model. These
 * controls navigate to the existing authenticated React modules rather than
 * recreating unverified Firestore mutations inside a decorative panel. */
export function GMOverviewPanel({id,party=[],session={},onNavigate,available={},onReviewRest,onCondition,busy=false}){
  const open=(destination,label)=> <button className={styles.action} type="button"
    onClick={()=>onNavigate(destination)}>{label}</button>;
  if(id==='partySummary')return <div className={styles.party}>
    {party.length?party.slice(0,12).map(member=><div className={styles.row} key={member.id}>
      <strong>{member.name}</strong><span>Level {member.level}</span>
      <small>HP {member.hp?.join(' / ')||'—'} · SP {member.sp?.join(' / ')||'—'}</small>
    </div>):<p>No linked characters in this campaign yet.</p>}
  </div>;
  if(id==='encounter')return <div className={styles.section}>
    <strong>Live encounter</strong><p>Session: {session.status||'idle'}</p>
    {available.combat?open('gameplay','Open Combat & Encounter Controls'):
      <p>Combat service unavailable for this campaign.</p>}
  </div>;
  if(id==='xp')return <div className={styles.section}>
    <p>XP and universal checks use GM-controlled secure campaign actions.</p>
    {available.progression?open('gameplay','Open XP & Check Requests'):
      <p>Progression service unavailable.</p>}
  </div>;
  if(id==='restRequests')return <div className={styles.section}>
    {party.filter(member=>member.restRequest?.status==='pending').length?
      party.filter(member=>member.restRequest?.status==='pending').map(member=>
        <div className={styles.row} key={member.id}>
          <strong>{member.name}</strong>
          <span>Long Rest · Soul Recovery {member.restRequest.soulRecovery}</span>
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={()=>onReviewRest?.(
              member.id,member.restRequest.id,'approved')}>Approve</button>
            <button type="button" disabled={busy} onClick={()=>onReviewRest?.(
              member.id,member.restRequest.id,'denied')}>Deny</button>
          </div>
        </div>):<p>No pending Long Rest requests.</p>}
  </div>;
  const destinations={
    loot:['economy','Open Loot & Rewards'],
    magicRewards:['toolkit','Open GM Toolkit'],
    acInspector:['inventory','Open PC Inventory'],
    playerManagement:['inventory','Open PC Inventory'],
    shortcutInventory:['inventory','Open PC Inventory'],
    shortcutQuests:['quests','Open Quests'],
    shortcutNotes:['notes','Open GM Notes'],
    shortcutEconomy:['economy','Open Economy'],
    shortcutCrafting:['crafting','Open Crafting'],
    shortcutTools:['tools','Open GM Tools'],
    shortcutWorld:['world','Open World Systems'],
    combatOverview:['gameplay','Open Combat'],
    explorationOverview:['world-atlas','Open World Atlas'],
    questTracker:['quests','Open Quest Tracker'],
    inventoryOverview:['inventory','Open PC Inventory']
  };
  if(destinations[id])return open(...destinations[id]);
  if(id==='specialDamage')return <GMConditions party={party}
    busy={busy} onCondition={onCondition}/>;
  return <p>This panel requires its original secure GM gameplay module.</p>;
}
