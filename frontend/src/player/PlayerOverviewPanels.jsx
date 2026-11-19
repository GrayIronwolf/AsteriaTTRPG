import React,{useState} from 'react';
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
function Conditions({character,editable=false,busy=false,onAction}){
  return <div className={styles.section}>
    {(character.conditionDetails||[]).length?
      <ul className={styles.list}>{character.conditionDetails.map(condition=><li key={condition.id}>
        <strong>{condition.name}</strong>{condition.duration?<small> · {condition.duration}</small>:null}
        {condition.description?<p>{condition.description}</p>:null}
        {editable&&condition.allowPlayerRemoval?
          <button type="button" disabled={busy} onClick={()=>onAction?.('removeCondition',condition.id)}>
            Remove condition</button>:null}
      </li>)}</ul>:<p>No active conditions.</p>}
  </div>;
}
function Effects({character}){
  return (character.activeEffects||[]).length?
    <ul className={styles.list}>{character.activeEffects.map(effect=><li key={effect.id}>
      <strong>{effect.name}</strong> · {effect.target} {effect.operation} {effect.value}
    </li>)}</ul>:<p>No active effects.</p>;
}
function Damage({character}){
  return <div className={styles.section}>
    <p><strong>Soul Damage:</strong> {character.soulDamage??0} HP sealed</p>
    <p><strong>HP healing cap:</strong> {character.soulHealingCap??'—'}</p>
    <p>Soul Damage cannot be restored through ordinary HP healing.</p>
  </div>;
}
function Rest({character,editable=false,busy=false,onAction}){
  const [recovery,setRecovery]=useState('0');
  const pending=character.restRequest?.status==='pending';
  return <div className={styles.section}>
    <div className={styles.buttons}>
      <button type="button" disabled={!editable||busy||pending}
        onClick={()=>onAction?.('takeRest',{type:'short',soulRecovery:0})}>Short Rest</button>
      <button type="button" disabled={!editable||busy||pending}
        onClick={()=>onAction?.('takeRest',{type:'long',soulRecovery:Number(recovery)})}>Request Long Rest</button>
    </div>
    <label>Soul Recovery <input type="number" min="0" max={character.soulDamage??0}
      value={recovery} disabled={!editable||busy||pending}
      onChange={e=>setRecovery(e.target.value)}/></label>
    <p>Short Rest: 4 hours. Long Rest: 8 hours and GM approval.</p>
    {character.restRequest?<p role="status">Long Rest: {character.restRequest.status}</p>:null}
  </div>;
}
function Currency({character,editable=false,busy=false,onAction}){
  return <div className={styles.section}>
    {(character.currencies||[]).map(coin=><div className={styles.coin} key={coin.id}>
      <span>{coin.label}: <strong>{coin.amount.toLocaleString()}</strong></span>
      {!coin.id.startsWith('extra:')&&editable?<div className={styles.buttons}>
        <button disabled={busy||coin.amount<1} type="button" aria-label={'Decrease '+coin.label}
          onClick={()=>onAction?.('adjustCurrency',{key:coin.id,delta:-1})}>−</button>
        <button disabled={busy} type="button" aria-label={'Increase '+coin.label}
          onClick={()=>onAction?.('adjustCurrency',{key:coin.id,delta:1})}>+</button>
      </div>:null}
    </div>)}
  </div>;
}

/** Uses only the server-filtered character projection. Every gameplay link
 * opens a real authorised React workspace; no legacy globals are mounted. */
export function PlayerOverviewPanel({id,character,campaign,onNavigate,available={},editable=false,busy=false,onAction}){
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
  if(id==='conditions')return <Conditions character={character} editable={editable} busy={busy} onAction={onAction}/>;
  if(id==='effects')return <Effects character={character}/>;
  if(id==='specialDamage')return <Damage character={character}/>;
  if(id==='rest')return <Rest character={character} editable={editable} busy={busy} onAction={onAction}/>;
  if(id==='currency')return <Currency character={character} editable={editable} busy={busy} onAction={onAction}/>;
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
