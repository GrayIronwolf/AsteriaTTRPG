import React, { useMemo, useState } from 'react';
import { DashboardPanel, StatusPill, Tooltip } from '../components/WorkspaceUI.jsx';
import { AsteriaIcon } from '../components/AsteriaIcons.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { normalizeDashboardPreferences, parseResourceCost } from '../state/liveWorkspaceModel.mjs';
import { quests as selectQuests } from './characterWorkspaceData.js';

function values(value) {
  return Array.isArray(value) ? value : [];
}

function record(value, fallback = 'Unknown') {
  return typeof value === 'string' ? { name:value } : value || { name:fallback };
}

function itemName(item) {
  return item?.name || item?.title || 'Empty';
}

function itemImage(item) {
  return item?.image || item?.icon || item?.artwork || '';
}

function itemRarity(item) {
  return String(item?.itemClass || item?.rarity || '').trim();
}

function rarityClass(item) {
  return itemRarity(item).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function equipmentItem(equipment = {}, slot) {
  const compact = slot.toLowerCase().replace(/[^a-z0-9]/g, '');
  const camel = slot.toLowerCase().replace(/\s+(\w)/g, (_, value) => value.toUpperCase());
  const key = Object.keys(equipment).find(value => value.toLowerCase().replace(/[^a-z0-9]/g, '') === compact);
  return equipment[slot] || equipment[slot.toLowerCase()] || equipment[camel] || (key ? equipment[key] : null);
}

function costText(value) {
  if(!value) return '';
  if(typeof value === 'object') {
    return Object.entries(value)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([resource, amount]) => `${Number(amount)} ${String(resource).toUpperCase()}`)
      .join(' | ');
  }
  return String(value);
}

function LoadoutSlot({ label, item, icon = 'equipment', shortcut = '', onOpen, onUse, disabled = false }) {
  const name = itemName(item);
  const image = itemImage(item);
  const rarity = itemRarity(item);
  const activate = () => {
    if(disabled) return;
    if(item && onUse) onUse(item);
    else onOpen?.();
  };
  const tooltip = item ? `${label}: ${name}${rarity ? ` (${rarity})` : ''}` : `${label}: Empty`;
  return <Tooltip label={tooltip}>
    <button
      className={`react-loadout-slot ${item ? 'is-filled' : 'is-empty'} ${rarity ? `rarity-${rarityClass(item)}` : ''}`}
      disabled={disabled}
      onClick={!onUse ? onOpen : undefined}
      onDoubleClick={onUse ? activate : onOpen}
      type="button"
      aria-label={tooltip}
    >
      <span className="react-loadout-slot-art">{image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <AsteriaIcon name={icon} />}{shortcut ? <i>{shortcut}</i> : null}</span>
      <span className="react-loadout-slot-copy"><small>{label}</small><b>{name}</b>{rarity ? <em>{rarity}</em> : null}</span>
    </button>
  </Tooltip>;
}

function DashboardEmpty({ title, description, actionLabel, onAction }) {
  return <div className="react-empty react-dashboard-empty" role="status"><AsteriaIcon name="info" size={24} /><h3>{title}</h3>{description ? <p>{description}</p> : null}{onAction ? <button className="react-empty-action" type="button" onClick={onAction}>{actionLabel}</button> : null}</div>;
}

function ArmourPanel({ character, onNavigate, style }) {
  const equipment = character.equipment || {};
  const left = ['Head', 'Chest', 'Hands', 'Feet'];
  const right = ['Back', 'Torso', 'Waist', 'Shoulders'];
  const armourClass = Number(character.ac ?? character.armourClass ?? character.armorClass ?? 10);
  return <DashboardPanel icon="armour" title="Equipment / Armour" variant="equipment" className="react-overview-armour" style={style}>
    <div className="react-armour-layout">
      <div className="react-armour-slots">{left.map(slot => <LoadoutSlot key={slot} label={slot} item={equipmentItem(equipment, slot)} icon="armour" onOpen={() => onNavigate('inventory')} />)}</div>
      <button className="react-armour-core" type="button" onClick={() => onNavigate('inventory')} aria-label={`Open equipment. Armour Class ${armourClass}`}>
        <AsteriaIcon name="armour" size={46} />
        <small>Armour Class</small>
        <strong>{armourClass}</strong>
        <span>Open Equipment</span>
      </button>
      <div className="react-armour-slots">{right.map(slot => <LoadoutSlot key={slot} label={slot} item={equipmentItem(equipment, slot)} icon="armour" onOpen={() => onNavigate('inventory')} />)}</div>
    </div>
  </DashboardPanel>;
}

function WeaponsPanel({ character, onNavigate, style }) {
  const equipment = character.equipment || {};
  const slots = ['Main Weapon', 'Secondary Weapon', 'Off Weapon', 'Quiver', 'Shield'];
  return <DashboardPanel icon="weapon" title="Equipped Weapons" variant="equipment" className="react-overview-weapons" style={style}>
    <div className="react-weapon-slot-grid">{slots.map(slot => <LoadoutSlot key={slot} label={slot} item={equipmentItem(equipment, slot)} icon={slot === 'Shield' ? 'armour' : 'weapon'} onOpen={() => onNavigate('inventory')} />)}</div>
  </DashboardPanel>;
}

function QuickItemsPanel({ campaignId, character, editable, busy, onNavigate, run, style }) {
  const quickSlots = values(character.quickSlots).slice(0, 4).map(record);
  const useItem = item => run(() => firebaseService.updateInventory(campaignId, character.id, { type:'use', itemId:item.id }));
  return <DashboardPanel icon="quick" title="Quick Items" variant="equipment" className="react-overview-quick" style={style}>
    <div className="react-quick-slot-grid">{[0, 1, 2, 3].map(index => <LoadoutSlot key={index} label={`Quick ${index + 1}`} shortcut={String(index + 1)} item={quickSlots[index]} icon="quick" disabled={!editable || busy} onOpen={() => onNavigate('inventory')} onUse={quickSlots[index]?.id ? useItem : undefined} />)}</div>
  </DashboardPanel>;
}

function AbilityCard({ ability, type, disabled = false, onActivate }) {
  const entry = record(ability);
  const title = entry.name || entry.title || 'Unknown';
  const image = entry.image || entry.icon || '';
  const talentMeta = `Tier ${Number(entry.tier || 1)} | Rank ${Number(entry.rank || 1)}`;
  const spellMeta = entry.element || entry.magicType || entry.school || '';
  const meta = type === 'talent' ? talentMeta : spellMeta;
  const cost = costText(entry.costs || entry.cost);
  const activate = () => { if(!disabled) onActivate?.(entry); };
  return <Tooltip label={`${title}${meta ? ` - ${meta}` : ''}${cost ? ` - ${cost}` : ''}`}>
    <button className={`react-ability-card ${type} ${disabled ? 'is-disabled' : ''}`} disabled={disabled} onDoubleClick={activate} onKeyDown={event => { if(event.key === 'Enter'){ event.preventDefault(); activate(); } }} type="button">
      <span className="react-ability-art">{image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <AsteriaIcon name={type === 'talent' ? 'talents' : 'spells'} size={25} />}</span>
      <b>{title}</b>
      {meta ? <small>{meta}</small> : null}
      {cost ? <em>{cost}</em> : null}
    </button>
  </Tooltip>;
}

function TalentSummary({ talents, onNavigate, style }) {
  return <DashboardPanel icon="talents" title="Class Talents" action={<button type="button" onClick={() => onNavigate('talents')}>Open Talent Tree</button>} className="react-overview-talents" style={style}>
    {talents.length ? <div className="react-ability-grid">{talents.slice(0, 8).map((talent, index) => <AbilityCard key={talent.id || talent.name || index} ability={talent} type="talent" onActivate={() => onNavigate('talents')} />)}</div> : <DashboardEmpty title="No Talents Unlocked" description="Spend Talent Points in the Class/Talent Tree to unlock talents." actionLabel="Open Talent Tree" onAction={() => onNavigate('talents')} />}
  </DashboardPanel>;
}

function SpellSummary({ campaignId, character, spells, editable, busy, onNavigate, run, style }) {
  const elements = useMemo(() => [...new Set(spells.map(spell => record(spell).element || record(spell).magicType).filter(Boolean))], [spells]);
  const [filter, setFilter] = useState('All');
  const visible = filter === 'All' ? spells : spells.filter(spell => (record(spell).element || record(spell).magicType) === filter);
  const cast = spell => run(() => firebaseService.castSpell(campaignId, character.id, spell, parseResourceCost(spell.costs || spell.cost)));
  return <DashboardPanel icon="spells" title="Active Spells" action={<button type="button" onClick={() => onNavigate('spells')}>Open Spell Menu</button>} className="react-overview-spells" style={style}>
    {elements.length ? <div className="react-ability-filters" aria-label="Spell element filters">{['All', ...elements].map(element => <button className={filter === element ? 'active' : ''} aria-pressed={filter === element} key={element} onClick={() => setFilter(element)} type="button">{element}</button>)}</div> : null}
    {visible.length ? <div className="react-ability-grid">{visible.slice(0, 8).map((spell, index) => <AbilityCard key={spell.id || spell.name || index} ability={spell} type="spell" disabled={!editable || busy} onActivate={cast} />)}</div> : <DashboardEmpty title="No Active Spells" description="Known spells will appear here after they are added to this character." actionLabel="Open Spell Menu" onAction={() => onNavigate('spells')} />}
  </DashboardPanel>;
}

function SkillsSummary({ skills, onNavigate, style }) {
  return <DashboardPanel icon="skills" title="Skills" compact className="react-overview-skills" style={style}>
    {skills.length ? <div className="react-dashboard-skill-grid">{skills.slice(0, 8).map((skill, index) => { const entry = record(skill); return <button key={entry.id || entry.name || index} type="button" onClick={() => onNavigate('skills')}><AsteriaIcon name="skills" /><span><b>{entry.name || entry.title}</b><small>{entry.rankName || entry.rank || 'Novice'}</small></span></button>; })}</div> : <DashboardEmpty title="No Selected Skills" description="Starting skills selected in the Character Forge will appear here." actionLabel="Open Skills" onAction={() => onNavigate('skills')} />}
  </DashboardPanel>;
}

function ConditionsSummary({ conditions, style }) {
  return <DashboardPanel icon="info" title="Conditions" compact className="react-overview-conditions" style={style}><div className="react-condition-list">{conditions.map((condition, index) => { const entry = record(condition); return <StatusPill key={entry.id || entry.name || index}>{entry.name}</StatusPill>; })}{!conditions.length ? <p className="react-quiet-state">No active conditions.</p> : null}</div></DashboardPanel>;
}

function SummaryPanels({ character, characters, partyWorkspace, onNavigate }) {
  const currentQuests = selectQuests(character, partyWorkspace).filter(quest => String(quest.status || 'Active').toLowerCase() === 'active').slice(0, 3);
  const journals = values(character.journal).slice().sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)).slice(0, 3);
  const party = Object.values(characters || {}).filter(member => member.id !== character.id).slice(0, 4);
  return <div className="react-dashboard-summary-grid">
    <DashboardPanel icon="quest" title="Current Quests" compact action={<button type="button" onClick={() => onNavigate('quest')}>Open Quest Log</button>}><div className="react-summary-list">{currentQuests.map(quest => <button key={quest.id} onClick={() => onNavigate('quest')}><b>{quest.name}</b><span>{quest.description || 'No quest summary recorded.'}</span></button>)}{!currentQuests.length ? <DashboardEmpty title="No Active Quests" description="Tracked campaign quests will appear here." /> : null}</div></DashboardPanel>
    <DashboardPanel icon="journal" title="Recent Journal" compact action={<button type="button" onClick={() => onNavigate('journal')}>Open Journal</button>}><div className="react-summary-list">{journals.map((entry, index) => <button key={entry.id || index} onClick={() => onNavigate('journal')}><b>{entry.title || 'Journal Entry'}</b><span>{entry.body || entry.text || ''}</span></button>)}{!journals.length ? <DashboardEmpty title="No Journal Entries" description="Session notes and discoveries will appear here." /> : null}</div></DashboardPanel>
    <DashboardPanel icon="party" title="Party" compact action={<button type="button" onClick={() => onNavigate('party')}>Open Party</button>}><div className="react-dashboard-party-summary">{party.map(member => <button key={member.id} onClick={() => onNavigate('party')}><span>{member.image || member.portrait ? <img src={member.image || member.portrait} alt="" loading="lazy" decoding="async" /> : String(member.name || '?').charAt(0)}</span><b>{member.name}</b><small>{member.klass || member.class || 'Adventurer'} | Level {Number(member.level || 0)}</small></button>)}{!party.length ? <DashboardEmpty title="No Linked Party Members" description="Campaign party members will appear after they link a character." /> : null}</div></DashboardPanel>
  </div>;
}

export function PlayerDashboardOverview({ campaignId, character, characters, partyWorkspace, editable, onNavigate }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const talents = values(character.unlockedTalents || character.talents).map(record).filter(talent => talent.unlocked !== false);
  const spells = values(character.spells || character.activeSpells).map(record);
  const skills = values(character.skills || character.selectedSkills).map(record);
  const conditions = values(character.conditions).map(record);
  const preferences = normalizeDashboardPreferences(character);
  const visible = key => !preferences.hiddenPanels.includes(key);
  const order = key => Math.max(0, preferences.panelOrder.indexOf(key)) * 10;
  const run = async operation => {
    setBusy(true);
    setMessage('Saving...');
    try {
      const result = await operation();
      setMessage(result?.ok ? 'Dashboard updated.' : result?.error || 'That action could not be completed.');
      return result;
    } catch(error) {
      setMessage(error.message || String(error));
      return { ok:false };
    } finally {
      setBusy(false);
    }
  };
  return <>
    <div className="react-player-overview-grid">
      {visible('weapons') ? <><ArmourPanel character={character} onNavigate={onNavigate} style={{ order:order('weapons') }} /><WeaponsPanel character={character} onNavigate={onNavigate} style={{ order:order('weapons') + 1 }} /><QuickItemsPanel campaignId={campaignId} character={character} editable={editable} busy={busy} onNavigate={onNavigate} run={run} style={{ order:order('weapons') + 2 }} /></> : null}
      {visible('talents') ? <TalentSummary talents={talents} onNavigate={onNavigate} style={{ order:order('talents') }} /> : null}
      {visible('spells') ? <SpellSummary campaignId={campaignId} character={character} spells={spells} editable={editable} busy={busy} onNavigate={onNavigate} run={run} style={{ order:order('spells') }} /> : null}
      {visible('skills') ? <SkillsSummary skills={skills} onNavigate={onNavigate} style={{ order:order('skills') }} /> : null}
      {visible('conditions') ? <ConditionsSummary conditions={conditions} style={{ order:order('conditions') }} /> : null}
    </div>
    <SummaryPanels character={character} characters={characters} partyWorkspace={partyWorkspace} onNavigate={onNavigate} />
    <p className="react-action-message" role="status">{message}</p>
  </>;
}

export default PlayerDashboardOverview;
