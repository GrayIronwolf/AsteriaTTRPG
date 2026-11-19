import React from 'react';
import styles from './PlayerOverviewPanels.module.css';

const first=(items=[],limit=12)=>Array.isArray(items)?items.slice(0,limit):[];
function Navigate({to,go,children}){return <button type="button" onClick={()=>go(to)}>{children}</button>;}
function Slot({name,item,go}){
  return <button type="button" className={styles.slot} onClick={()=>go('Inventory')}
    aria-label={name+': '+(item?.name||'Empty')+'. Open Inventory'}>
    <span className={styles.slotArt}>{item?.image?<img src={item.image} alt="" loading="lazy"/>:null}</span>
    <span className={styles.slotText}><small>{name}</small><strong>{item?.name||'Empty'}</strong>
      {item?.rarity?<em>{item.rarity}</em>:null}</span>
  </button>;
}
function ItemSummary({rows,empty,limit=10}){
  const items=first(rows,limit);
  return items.length?<ul className={styles.list}>{items.map((item,i)=>
    <li key={i}>{typeof item==='string'?item:item.name||item.title||'Item'}
      {item.quantity>1?' × '+item.quantity:''}{item.rank?' · '+item.rank:''}</li>)}</ul>:
    <p className={styles.empty}>{empty}</p>;
}
/** Uses only the server-filtered character projection. Every gameplay link
 * opens a real authorised React workspace; no legacy globals are mounted. */
export function PlayerOverviewPanel({id,character,campaign,onNavigate,available={}}){
  const slots=character.equipmentSlots||{};
  const go=onNavigate||(()=>{});
  if(id==='armour')return <div className={styles.armour}>
    <div className={styles.armourSlots}>{['Head','Chest','Hands','Feet'].map(name=>
      <Slot key={name} name={name} item={slots[name]} go={go}/>)}</div>
    <button type="button" className={styles.armourClass} onClick={()=>go('Inventory')}>
      <small>Armour Class</small><strong>{character.naturalAC??'—'}</strong>
      <span>Equipment details</span>
    </button>
    <div className={styles.armourSlots}>{['Back','Torso','Waist','Shoulders'].map(name=>
      <Slot key={name} name={name} item={slots[name]} go={go}/>)}</div>
  </div>;
  if(id==='weapons')return <div className={styles.weaponSlots}>
    {['Main Weapon','Secondary Weapon','Off Weapon','Quiver','Shield'].map(name=>
      <Slot key={name} name={name} item={slots[name]} go={go}/>)}
  </div>;
  if(id==='quick')return <div className={styles.weaponSlots}>
    {Array.from({length:4},(_,i)=><Slot key={i} name={'Quick '+(i+1)}
      item={character.quickSlots?.[i]} go={go}/>)}
  </div>;
  if(id==='skills')return <><ItemSummary rows={character.skills} empty="No skills recorded."/>
    <Navigate go={go} to="Skills">Open Skills</Navigate></>;
  if(id==='talents')return <><ItemSummary rows={character.talents} empty="No talents recorded."/>
    <Navigate go={go} to="Class/Talent Tree">Open Talent Tree</Navigate></>;
  if(id==='spells')return <><ItemSummary rows={character.spells} empty="No spells recorded."/>
    <Navigate go={go} to="Spells">Open Spells</Navigate></>;
  if(id==='conditions')return <ItemSummary rows={character.conditions} empty="No active conditions."/>;
  if(id==='effects')return <p className={styles.empty}>No active effect details available in the new character projection.</p>;
  if(id==='specialDamage')return <p className={styles.empty}>Soul Damage information requires the original character-system projection to be restored.</p>;
  if(id==='rest')return <><p>Light Rest: 2 hours · Short Rest: 4 hours · Long Rest: 8 hours.</p>
    <p className={styles.empty}>Rest requests must be connected to the original secure character commands.</p></>;
  if(id==='currency')return <p className={styles.empty}>Character currency is not yet included in the new read-only projection.</p>;
  if(id==='quests'||id==='questTracker')return <><ItemSummary rows={character.quests} empty="No current quests."/>
    <Navigate go={go} to="Quests">Open Quests</Navigate></>;
  if(id==='journal')return <><ItemSummary rows={character.journal} empty="No journal entries."/>
    <Navigate go={go} to="Journal">Open Journal</Navigate></>;
  if(id==='party')return <ItemSummary rows={campaign?.party} empty="No campaign party is linked."/>;
  const shortcuts={
    shortcutInventory:['Inventory','Open Inventory'],
    shortcutQuest:['Quests','Open Quests'],
    shortcutCharacter:['Character','Open Character'],
    shortcutSpells:['Spells','Open Spellbook'],
    shortcutGallery:['Gallery','Open Gallery'],
    shortcutSettings:['Dashboard Settings','Open Dashboard Settings'],
    combatOverview:['Combat','Open Combat'],
    explorationOverview:['World Map','Open World Map'],
    inventoryOverview:['Inventory','Open Inventory']
  };
  if(shortcuts[id])return <Navigate go={go} to={shortcuts[id][0]}>{shortcuts[id][1]}</Navigate>;
  return <p className={styles.empty}>This panel still needs its original interactive gameplay implementation.</p>;
}
