import React from 'react';
import styles from './GMOverviewPanels.module.css';

/** Original GM panel IDs are preserved in the saved layout model. These
 * controls navigate to the existing authenticated React modules rather than
 * recreating unverified Firestore mutations inside a decorative panel. */
export function GMOverviewPanel({id,party=[],session={},onNavigate,available={}}){
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
    <p>Rest approval and recovery require authenticated campaign-state commands.</p>
    {available.combat?open('gameplay','Open Gameplay Systems'):null}
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
  if(id==='specialDamage')return <p>Soul Damage inspection must be restored from
    original character-system source data before this panel can issue commands.</p>;
  return <p>This panel requires its original secure GM gameplay module.</p>;
}
