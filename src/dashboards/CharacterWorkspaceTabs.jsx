import React, { useEffect, useMemo, useState } from 'react';
import { EmptyState, FilterControl, Modal, Panel, ResourceBar, SearchField, StatusPill, Tabs } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { CHARACTERISTICS, TALENT_TIER_LEVELS, characteristicCap, characteristicTier, characteristicValue, parseResourceCost, sessionRemainingMs, talentRankCost, talentTierUnlocked } from '../state/liveWorkspaceModel.mjs';
import { useArmourClass } from '../systems/armour/useArmourClass.js';
import { characterClasses, classTalentGroups, inventoryItems, knownMagic, knownSpells, quests, raceTraits, selectedSkills, talentRank } from './characterWorkspaceData.js';

function resultMessage(result, fallback='Saved.') { return result?.ok ? fallback : result?.error || 'That change could not be saved.'; }
function formatDuration(milliseconds) {
  const seconds=Math.max(0,Math.floor(milliseconds/1000));
  return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}

export function SessionGate({ session }) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  return <div className={`react-session-gate ${session.editable?'open':'locked'}`} role="status">
    <b>{session.editable?'Live editing enabled':'Dashboard locked'}</b>
    <span>{session.editable?`Session ends automatically in ${formatDuration(sessionRemainingMs(session,now))}`:session.status==='expired'?'The 10-hour session limit was reached.':session.status==='paused'?'The GM paused this session.':'The GM must start the session to enable gameplay actions.'}</span>
  </div>;
}

function useAction() {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const run=async (operation,success='Saved.')=>{setBusy(true);setMessage('Saving...');try{const result=await operation();setMessage(resultMessage(result,success));return result;}catch(error){setMessage(error.message||String(error));return {ok:false,error:error.message};}finally{setBusy(false);}};
  return {busy,message,run,setMessage};
}

function InfoModal({ record, title, eyebrow, onClose }) {
  if(!record) return null;
  const effects=Array.isArray(record.effects)?record.effects:record.effects?[record.effects]:[];
  return <Modal title={title||record.name} eyebrow={eyebrow} onClose={onClose} footer={<button className="primary" onClick={onClose}>Close</button>}>
    {record.image?<img className="react-record-art" src={record.image} alt=""/>:null}
    <p>{record.description||record.summary||'Information coming soon.'}</p>
    {effects.length?<><h3>Effects</h3><ul>{effects.map((effect,index)=><li key={index}>{typeof effect==='object'?effect.description||effect.name||JSON.stringify(effect):effect}</li>)}</ul></>:null}
    {record.body?<div className="react-source-preview">{String(record.body).slice(0,4000)}</div>:null}
  </Modal>;
}

function CharacteristicsPanel({ campaignId, character, editable }) {
  const action=useAction();
  const [draft,setDraft]=useState({});
  useEffect(()=>setDraft({}),[character.id]);
  const staged=Object.values(draft).reduce((sum,value)=>sum+Number(value||0),0);
  const available=Math.max(0,Number(character.cp||0)-staged);
  const change=(key,delta)=>setDraft(current=>{
    const value=characteristicValue(character,key);
    const cap=characteristicCap(character,key);
    const currentAmount=Number(current[key]||0);
    const nextAmount=Math.max(0,Math.min(currentAmount+delta,Math.max(0,cap-value)));
    if(delta>0 && available<1) return current;
    const next={...current,[key]:nextAmount};
    if(!nextAmount) delete next[key];
    return next;
  });
  const apply=async()=>{
    const result=await action.run(()=>firebaseService.spendCPBatch(campaignId,character.id,draft),`Applied ${staged} Characteristic Point${staged===1?'':'s'}.`);
    if(result?.ok) setDraft({});
  };
  return <Panel title="Characteristics" action={<StatusPill>{available} CP available</StatusPill>} className="react-characteristics-panel">
    <p className="react-help">Stage available Characteristic Points with the controls below. Constitution, Endurance, and Wisdom each add 10 maximum HP, SP, or MP per applied point.</p>
    <div className="react-characteristic-gallery">{CHARACTERISTICS.map(stat=>{
      const base=characteristicValue(character,stat.key);
      const pending=Number(draft[stat.key]||0);
      const value=base+pending;
      const tier=characteristicTier(value);
      const cap=characteristicCap(character,stat.key);
      return <article key={stat.key}>
        <header><h3>{stat.label}</h3><span>{stat.short}</span></header>
        <strong>{value}</strong>
        <small>{tier.label}</small>
        <small>Tier Cap {cap}</small>
        <div className="react-characteristic-controls">
          <button aria-label={`Remove staged point from ${stat.label}`} disabled={!editable||action.busy||pending<1} onClick={()=>change(stat.key,-1)} type="button">-</button>
          <span>{pending?`+${pending} staged`:'No change'}</span>
          <button aria-label={`Add point to ${stat.label}`} disabled={!editable||action.busy||available<1||value>=cap} onClick={()=>change(stat.key,1)} type="button">+</button>
        </div>
      </article>;
    })}</div>
    <div className="react-characteristics-apply"><span>{staged} CP staged</span><button className="primary" disabled={!editable||action.busy||staged<1} onClick={apply} type="button">Apply Characteristic Points</button></div>
    <p className="react-action-message" role="status">{action.message}</p>
  </Panel>;
}

export function CharacterTab({ campaignId, character, editable }) {
  const [trait,setTrait]=useState(null);
  const traits=raceTraits(character);
  const items=inventoryItems(character);
  const equipped=items.filter(item=>item.equipped);
  const progression=window.AsteriaProgression?.progressSummary?.({...character})||{xp:Number(character.xp||0),xpMax:Number(character.xpMax||1000)};
  const armour=useArmourClass(character);
  const conditions=Array.isArray(character.conditions)?character.conditions:[];
  return <div className="react-character-tab-grid">
    <Panel title="Character Identity" className="react-character-identity-panel"><div className="react-character-identity-summary">{character.image||character.portrait?<img src={character.image||character.portrait} alt={`${character.name||'Character'} portrait`}/>:<span>{String(character.name||'?').charAt(0)}</span>}<dl className="react-detail-list"><div><dt>Name</dt><dd>{character.name}</dd></div><div><dt>Race</dt><dd>{character.race||'Unselected'}</dd></div><div><dt>Class</dt><dd>{characterClasses(character).join(' / ')||'Unselected'}</dd></div><div><dt>Campaign</dt><dd>{character.campaign||character.campaignName||'Linked campaign'}</dd></div></dl></div></Panel>
    <div className="react-character-support-grid">
      <Panel title="Progression"><ResourceBar label="XP" kind="xp" value={progression.xp} maximum={progression.xpMax}/><dl className="react-detail-list"><div><dt>Level</dt><dd>{Number(character.level||0)}</dd></div><div><dt>CP</dt><dd>{Number(character.cp||0)}</dd></div><div><dt>TP</dt><dd>{Number(character.tp||0)}</dd></div></dl></Panel>
      <Panel title="Defences & Conditions"><dl className="react-detail-list"><div><dt>Armour Class</dt><dd>{armour.finalAC}</dd></div><div><dt>Raw AC</dt><dd>{Number(armour.rawAC).toFixed(2).replace(/\.00$/,'')}</dd></div><div><dt>Mobility</dt><dd>{armour.mobilityModifier>=0?'+':''}{armour.mobilityModifier}</dd></div><div><dt>Stealth</dt><dd>{armour.stealthModifier>=0?'+':''}{armour.stealthModifier}</dd></div><div><dt>Movement</dt><dd>{character.movement||character.speed||'Not recorded'}</dd></div></dl>{armour.validation.errors.length?<div className="react-ac-warnings">{armour.validation.errors.map(error=><p key={error}>{error}</p>)}</div>:null}<div className="react-condition-list">{conditions.map((condition,index)=><StatusPill key={condition.id||condition.name||index} tone="warning">{condition.name||condition}</StatusPill>)}{!conditions.length?<small>No active conditions.</small>:null}</div></Panel>
      <Panel title="Equipped Items"><div className="react-character-equipment-list">{equipped.slice(0,8).map(item=><button key={item.id} type="button"><b>{item.equippedSlot||item.raw?.slot||'Equipment'}</b><span>{item.name}</span></button>)}{!equipped.length?<EmptyState title="No equipped items"/>:null}</div></Panel>
    </div>
    <CharacteristicsPanel campaignId={campaignId} character={character} editable={editable}/>
    <Panel title="Racial Traits" className="react-full-panel"><div className="react-card-gallery">{traits.map(record=><button className="react-record-card" key={record.id} onClick={()=>setTrait(record)}><b>{record.name}</b><span>{record.description}</span><small>Open full trait</small></button>)}{!traits.length?<EmptyState title="Racial traits coming soon"/>:null}</div></Panel>
    <InfoModal record={trait} eyebrow={`${character.race||'Race'} Trait`} onClose={()=>setTrait(null)}/>
  </div>;
}

function TalentCard({ campaignId, character, talent, editable }) {
  const action=useAction();
  const [details,setDetails]=useState(false);
  const rank=talentRank(character,talent);
  const maximum=Number(talent.maxRank||5);
  const cost=rank<maximum?talentRankCost(rank+1):0;
  const state=rank?'purchased':Number(character.tp||0)>=cost?'available':'locked';
  return <article className={`react-talent-card ${state}`} onDoubleClick={()=>setDetails(true)}>
    <b>{talent.name}</b><div className="react-small-card-image">{talent.image?<img src={talent.image} alt=""/>:<span>{talent.name.charAt(0)}</span>}</div>
    <small>Tier {talent.tier} | Rank {rank}/{maximum}</small><small>{talent.type}</small><StatusPill tone={state==='purchased'?'success':state==='available'?'info':'warning'}>{state}</StatusPill>
    <button disabled={!editable||action.busy||rank>=maximum||Number(character.tp||0)<cost} onClick={event=>{event.stopPropagation();action.run(()=>firebaseService.purchaseTalent(campaignId,character.id,talent),`${talent.name} advanced to Rank ${rank+1}.`);}}>{rank?`Buy Rank ${rank+1} (${cost} TP)`:`Unlock (${cost} TP)`}</button>
    {action.message?<em>{action.message}</em>:null}<InfoModal record={details?talent:null} eyebrow={`Tier ${talent.tier} Talent | Rank ${Math.max(1,rank)}`} onClose={()=>setDetails(false)}/>
  </article>;
}

export function TalentsTab({ campaignId, character, editable }) {
  const [tier,setTier]=useState(1);
  const groups=classTalentGroups(character);
  return <div className="react-talent-workspaces">
    <Panel title="Class Talent Trees" action={<StatusPill>{Number(character.tp||0)} TP</StatusPill>}>
      <div className="react-tier-tabs">{[1,2,3,4,5].map(value=>{const unlocked=talentTierUnlocked(character.level,value);return <button key={value} className={tier===value?'active':''} onClick={()=>setTier(value)}><b>Tier {value}</b><small>{unlocked?'Available':`Level ${TALENT_TIER_LEVELS[value]}`}</small></button>;})}</div>
    </Panel>
    {groups.map(group=><Panel key={group.className} title={`${group.className} Talent Tree`} action={<StatusPill>{group.talents.filter(talent=>talent.tier===tier).length} talents</StatusPill>}>
      {!talentTierUnlocked(character.level,tier)?<EmptyState title={`Tier ${tier} is locked`}>Reach Level {TALENT_TIER_LEVELS[tier]} to purchase talents from this tier.</EmptyState>:<div className="react-card-gallery">{group.talents.filter(talent=>talent.tier===tier).map(talent=><TalentCard key={talent.id||talent.name} campaignId={campaignId} character={character} talent={talent} editable={editable}/>)}</div>}
    </Panel>)}
    {!groups.length?<Panel><EmptyState title="Talent tree data coming soon">This character's selected class has no linked talent records yet.</EmptyState></Panel>:null}
  </div>;
}

export function SkillsTab({ campaignId, character, editable }) {
  const skills=selectedSkills(character);
  const [details,setDetails]=useState(null);
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('All');
  const action=useAction();
  const categories=['All',...new Set(skills.map(skill=>skill.category).filter(Boolean))];
  const visible=skills.filter(skill=>(category==='All'||skill.category===category)&&`${skill.name} ${skill.rankName} ${skill.category} ${skill.description||''}`.toLowerCase().includes(query.toLowerCase()));
  return <Panel title="Character Skills" action={<StatusPill>{visible.length} of {skills.length}</StatusPill>}><div className="react-content-toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search selected skills..."/><FilterControl label="Category" value={category} onChange={setCategory}>{categories.map(value=><option key={value}>{value}</option>)}</FilterControl></div><div className="react-card-gallery">{visible.map(skill=><article key={skill.id} className="react-skill-card" onDoubleClick={()=>setDetails(skill)}><b>{skill.name}</b><strong>{skill.rankName}</strong><small>{skill.category}</small><div className="react-skill-meter"><i style={{width:`${skill.target?Math.min(100,skill.successes/skill.target*100):100}%`}}/></div><small>{skill.target?`${skill.successes}/${skill.target} successful checks`:'Maximum rank'}</small><button disabled={!editable||action.busy||!skill.target} onClick={()=>action.run(()=>firebaseService.recordSkillSuccess(campaignId,character.id,skill),`${skill.name} success recorded.`)}>Successful Check</button><button onClick={()=>setDetails(skill)}>Techniques</button></article>)}{!visible.length?<EmptyState title={skills.length?'No matching skills':'No selected skills'}/>:null}</div><p>{action.message}</p><InfoModal record={details} eyebrow={`${details?.rankName||''} Skill Techniques`} onClose={()=>setDetails(null)}/></Panel>;
}

export function SpellsTab({ campaignId, character, editable }) {
  const spells=knownSpells(character);
  const elements=knownMagic(character);
  const [filter,setFilter]=useState('All');
  const [query,setQuery]=useState('');
  const [details,setDetails]=useState(null);
  const action=useAction();
  const visible=spells.filter(spell=>(filter==='All'||spell.element.toLowerCase().includes(filter.toLowerCase()))&&`${spell.name} ${spell.element} ${spell.rank} ${spell.description||''}`.toLowerCase().includes(query.toLowerCase()));
  const cast=spell=>action.run(()=>firebaseService.castSpell(campaignId,character.id,spell,parseResourceCost(spell.costs||spell.cost)),`${spell.name} cast once.`);
  return <Panel title="Spells" action={<StatusPill>{visible.length} of {spells.length}</StatusPill>}><div className="react-content-toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search known spells..."/></div><div className="react-filter-tabs"><button className={filter==='All'?'active':''} onClick={()=>setFilter('All')}>All</button>{elements.map(element=><button key={element} className={filter===element?'active':''} onClick={()=>setFilter(element)}>{element}</button>)}</div><div className="react-card-gallery">{visible.map(spell=><article className="react-spell-card" key={spell.id} onDoubleClick={()=>editable&&cast(spell)}><b>{spell.name}</b><div className="react-small-card-image">{spell.image?<img src={spell.image} alt="" loading="lazy"/>:<span>{spell.name.charAt(0)}</span>}</div><small>{spell.element} | {spell.rank}</small><small>{Object.entries(parseResourceCost(spell.costs||spell.cost)).map(([key,value])=>`${value} ${key.toUpperCase()}`).join(' | ')||'No resource cost'}</small><div><button onClick={()=>setDetails(spell)}>Details</button><button className="primary" disabled={!editable||action.busy} onClick={()=>cast(spell)}>Cast</button></div></article>)}{!visible.length?<EmptyState title={spells.length?'No matching spells':'No known spells'}/>:null}</div><p>{action.message}</p><InfoModal record={details} eyebrow={`${details?.element||''} Spell`} onClose={()=>setDetails(null)}/></Panel>;
}

export function QuestTab({ campaignId, character, partyWorkspace, editable }) {
  const rows=quests(character,partyWorkspace);const action=useAction();
  const [query,setQuery]=useState('');const [status,setStatus]=useState('All');
  const visible=rows.filter(quest=>(status==='All'||String(quest.status||'Active')===status)&&`${quest.name} ${quest.description||''}`.toLowerCase().includes(query.toLowerCase()));
  return <Panel title="Quest Log" action={<StatusPill>{visible.length} of {rows.length}</StatusPill>}><div className="react-content-toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search quests..."/><FilterControl label="Status" value={status} onChange={setStatus}>{['All','Active','Completed','Failed','On Hold'].map(value=><option key={value}>{value}</option>)}</FilterControl></div><div className="react-quest-list">{visible.map(quest=><article key={quest.id} className={`status-${String(quest.status||'active').toLowerCase().replaceAll(' ','-')} ${quest.tracked?'tracked':''}`}><div><header><b>{quest.name}</b><StatusPill tone={quest.status==='Completed'?'success':quest.status==='Failed'?'danger':quest.status==='On Hold'?'warning':'info'}>{quest.status||'Active'}</StatusPill>{quest.tracked?<StatusPill>Tracked</StatusPill>:null}</header><p>{quest.description||'No quest description recorded.'}</p></div><select aria-label={`Status for ${quest.name}`} disabled={!editable||action.busy} value={quest.status||'Active'} onChange={event=>action.run(()=>firebaseService.updateQuest(campaignId,character.id,quest.id,event.target.value),'Quest status updated.')}><option>Active</option><option>Completed</option><option>Failed</option><option>On Hold</option></select></article>)}{!visible.length?<EmptyState title={rows.length?'No matching quests':'No quests recorded'}/>:null}</div><p>{action.message}</p></Panel>;
}

export function JournalTab({ campaignId, character, editable }) {
  const [title,setTitle]=useState('');const [body,setBody]=useState('');const [query,setQuery]=useState('');const [view,setView]=useState('Current');const action=useAction();const entries=Array.isArray(character.journal)?character.journal:[];
  const visible=entries.filter(entry=>(view==='All'||(view==='Archived')===Boolean(entry.archived))&&`${entry.title||''} ${entry.body||entry.text||entry}`.toLowerCase().includes(query.toLowerCase())).sort((left,right)=>new Date(right.createdAt||0)-new Date(left.createdAt||0));
  const add=async()=>{if(!body.trim())return action.setMessage('Write a journal entry first.');const result=await action.run(()=>firebaseService.addJournalEntry(campaignId,character.id,{title,body}),'Journal entry saved.');if(result?.ok){setTitle('');setBody('');}};
  return <div className="react-journal-grid"><Panel title="New Journal Entry"><label>Title<input disabled={!editable} value={title} onChange={event=>setTitle(event.target.value)}/></label><label>Entry<textarea disabled={!editable} rows="8" value={body} onChange={event=>setBody(event.target.value)}/></label><button className="primary" disabled={!editable||action.busy} onClick={add}>Save Entry</button><p>{action.message}</p></Panel><Panel title="Journal" action={<StatusPill>{visible.length} entries</StatusPill>}><div className="react-content-toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search journal..."/><FilterControl label="Entries" value={view} onChange={setView}>{['Current','Archived','All'].map(value=><option key={value}>{value}</option>)}</FilterControl></div><div className="react-journal-list">{visible.map((entry,index)=><article key={entry.id||index} className={entry.archived?'archived':''}><header><b>{entry.title||'Journal Entry'}</b>{entry.unread?<StatusPill tone="info">Unread</StatusPill>:entry.archived?<StatusPill>Archived</StatusPill>:null}</header><small>{entry.createdAt?new Date(entry.createdAt).toLocaleString():''}</small><p>{entry.body||entry.text||entry}</p></article>)}{!visible.length?<EmptyState title={entries.length?'No matching entries':'No journal entries'}/>:null}</div></Panel></div>;
}

export function PartyTab({ campaignId, character, characters, partyWorkspace, messages, presence, editable }) {
  const [message,setMessage]=useState('');const [notes,setNotes]=useState(partyWorkspace.sharedNotes||'');const [section,setSection]=useState('overview');const [organizationName,setOrganizationName]=useState('');const [organizationType,setOrganizationType]=useState('Adventure Party');const action=useAction();
  useEffect(()=>setNotes(partyWorkspace.sharedNotes||''),[partyWorkspace.sharedNotes]);
  const send=async()=>{const result=await action.run(()=>firebaseService.sendPartyMessage(campaignId,character.id,message),'Message sent.');if(result?.ok)setMessage('');};
  const organizations=Array.isArray(partyWorkspace.organizations)?partyWorkspace.organizations:[];
  const current=organizations.find(value=>value.id===section);
  const create=async()=>{const result=await action.run(()=>firebaseService.createPartyOrganization(campaignId,character.id,{name:organizationName,type:organizationType}),'Organization created.');if(result?.ok){setOrganizationName('');setSection(result.organization.id);}};
  const tabs=[{id:'overview',label:'Party Overview',icon:'party'},{id:'create',label:'Form Organization',icon:'character'},...organizations.map(value=>({id:value.id,label:value.name,icon:'party'}))];
  const onlineIds=new Set(Array.isArray(presence)?presence.map(record=>record.characterId||record.id):Object.entries(presence||{}).filter(([,value])=>value?.online!==false).map(([id,value])=>value?.characterId||id));
  const MemberCard=({member})=>{const portrait=member.image||member.portrait||member.characterImage;const hp=Array.isArray(member.hp)?member.hp:[0,0];const online=onlineIds.has(member.id);return <article className="react-party-member-card"><span className="react-party-member-portrait">{portrait?<img src={portrait} alt="" loading="lazy"/>:String(member.name||'?').charAt(0)}<i className={online?'online':'offline'}/></span><div><b>{member.name}</b><small>{member.klass||member.class||'Adventurer'} | Level {Number(member.level||0)}</small><ResourceBar compact label="HP" kind="hp" value={hp[0]} maximum={hp[1]}/><small>{online?'Online':'Away'}</small></div></article>;};
  return <div className="react-party-container"><Tabs tabs={tabs} active={section} onChange={setSection} ariaLabel="Party and organization menu"/>{section==='overview'?<div className="react-party-workspace"><Panel title="Party Members"><div className="react-member-grid">{Object.values(characters).map(member=><MemberCard key={member.id} member={member}/>)}</div></Panel><Panel title="Shared Notes"><textarea disabled={!editable} rows="10" value={notes} onChange={event=>setNotes(event.target.value)}/><button className="primary" disabled={!editable||action.busy} onClick={()=>action.run(()=>firebaseService.updatePartyNotes(campaignId,notes),'Shared notes saved.')}>Save Shared Notes</button></Panel><Panel title="Live Party Chat" className="react-party-chat"><div className="react-chat-log">{messages.map(row=><article key={row.id}><header><b>{row.characterName||'Party Member'}</b><small>{row.createdAt?new Date(row.createdAt.toDate?row.createdAt.toDate():row.createdAt).toLocaleTimeString():''}</small></header><p>{row.text}</p></article>)}{!messages.length?<EmptyState title="No party messages"/>:null}</div><div className="react-chat-compose"><input disabled={!editable} value={message} onChange={event=>setMessage(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&message.trim())send();}} placeholder={editable?'Message the party...':'Chat unlocks when the session starts.'}/><button className="primary" disabled={!editable||action.busy||!message.trim()} onClick={send}>Send</button></div></Panel></div>:null}{section==='create'?<Panel title="Form a Party or Organization"><p>Create an Adventure Party, business, guild, mercenary company, or another campaign organization.</p><div className="react-form-grid"><label>Organization Type<select disabled={!editable} value={organizationType} onChange={event=>setOrganizationType(event.target.value)}>{['Adventure Party','Business','Guild','Mercenary Company','Religious Order','Custom Organization'].map(value=><option key={value}>{value}</option>)}</select></label><label>Name<input disabled={!editable} value={organizationName} onChange={event=>setOrganizationName(event.target.value)} placeholder="Organization name"/></label></div><button className="primary" disabled={!editable||action.busy||!organizationName.trim()} onClick={create}>Create Organization</button></Panel>:null}{current?<div className="react-organization-workspace"><Panel title={current.name} eyebrow={current.type} action={<StatusPill>{(current.memberCharacterIds||[]).length} member(s)</StatusPill>}><div className="react-member-grid">{(current.memberCharacterIds||[]).map(id=>characters[id]).filter(Boolean).map(member=><MemberCard key={member.id} member={member}/>)}</div></Panel><Panel title="Organization Notes"><p>{current.notes||'Organization notes and shared resources can be developed here during future sessions.'}</p></Panel></div>:null}<p>{action.message}</p></div>;
}

export function ActivityLog({ character }) {
  const rows=Array.isArray(character.actionLog)?character.actionLog:[];
  return <Panel title="Action / Resource Log" className="react-action-log"><div>{rows.slice(0,20).map(row=><article key={row.id}><span>{row.at?new Date(row.at).toLocaleTimeString():''}</span><p>{row.message||row.type}</p></article>)}{!rows.length?<p>No live-session actions recorded yet.</p>:null}</div></Panel>;
}
