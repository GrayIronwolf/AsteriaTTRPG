import React, { useEffect, useMemo, useState } from 'react';
import { EmptyState, Modal, Panel, StatusPill, Tabs } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { CHARACTERISTICS, TALENT_TIER_LEVELS, characteristicCap, characteristicTier, characteristicValue, parseResourceCost, sessionRemainingMs, talentRankCost, talentTierUnlocked } from '../state/liveWorkspaceModel.mjs';
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

export function CharacterTab({ campaignId, character, editable }) {
  const action=useAction();
  const [trait,setTrait]=useState(null);
  const traits=raceTraits(character);
  return <div className="react-character-tab-grid">
    <Panel title="Character Identity"><dl className="react-detail-list"><div><dt>Name</dt><dd>{character.name}</dd></div><div><dt>Race</dt><dd>{character.race||'Unselected'}</dd></div><div><dt>Class</dt><dd>{characterClasses(character).join(' / ')||'Unselected'}</dd></div><div><dt>Level</dt><dd>{Number(character.level||0)}</dd></div><div><dt>Campaign</dt><dd>{character.campaign||character.campaignName||'Linked campaign'}</dd></div></dl></Panel>
    <Panel title="Characteristics" action={<StatusPill>{Number(character.cp||0)} CP</StatusPill>} className="react-characteristics-panel">
      <p className="react-help">Each point in CON, END, or WIS also adds 10 maximum HP, SP, or MP.</p>
      <div className="react-characteristic-gallery">{CHARACTERISTICS.map(stat=>{const value=characteristicValue(character,stat.key);const tier=characteristicTier(value);const cap=characteristicCap(character,stat.key);return <article key={stat.key}><header><b>{stat.label}</b><span>{stat.short}</span></header><strong>{value}</strong><small>{tier.label}{tier.modifier?` +${tier.modifier}`:''}</small><small>Tier cap {cap}</small><button disabled={!editable||action.busy||Number(character.cp||0)<1||value>=cap} onClick={()=>action.run(()=>firebaseService.spendCP(campaignId,character.id,stat.key,1),`Added 1 CP to ${stat.label}.`)}>+ Spend 1 CP</button></article>;})}</div>
      <p className="react-action-message">{action.message}</p>
    </Panel>
    <Panel title="Racial Traits" className="react-full-panel"><div className="react-card-gallery">{traits.map(record=><button className="react-record-card" key={record.id} onDoubleClick={()=>setTrait(record)}><b>{record.name}</b><span>{record.description}</span><small>Double-click for full trait</small></button>)}{!traits.length?<EmptyState title="Racial traits coming soon"/>:null}</div></Panel>
    <InfoModal record={trait} eyebrow={`${character.race||'Race'} Trait`} onClose={()=>setTrait(null)}/>
  </div>;
}

function TalentCard({ campaignId, character, talent, editable }) {
  const action=useAction();
  const [details,setDetails]=useState(false);
  const rank=talentRank(character,talent);
  const maximum=Number(talent.maxRank||5);
  const cost=rank<maximum?talentRankCost(rank+1):0;
  return <article className={`react-talent-card ${rank?'unlocked':''}`} onDoubleClick={()=>setDetails(true)}>
    <b>{talent.name}</b><div className="react-small-card-image">{talent.image?<img src={talent.image} alt=""/>:<span>{talent.name.charAt(0)}</span>}</div>
    <small>Tier {talent.tier} | Rank {rank}/{maximum}</small><small>{talent.type}</small>
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
  const action=useAction();
  return <Panel title="Character Skills" action={<StatusPill>{skills.length} selected</StatusPill>}><div className="react-card-gallery">{skills.map(skill=><article key={skill.id} className="react-skill-card" onDoubleClick={()=>setDetails(skill)}><b>{skill.name}</b><strong>{skill.rankName}</strong><small>{skill.category}</small><div className="react-skill-meter"><i style={{width:`${skill.target?Math.min(100,skill.successes/skill.target*100):100}%`}}/></div><small>{skill.target?`${skill.successes}/${skill.target} successful checks`:'Maximum rank'}</small><button disabled={!editable||action.busy||!skill.target} onClick={()=>action.run(()=>firebaseService.recordSkillSuccess(campaignId,character.id,skill),`${skill.name} success recorded.`)}>Successful Check</button><button onClick={()=>setDetails(skill)}>Techniques</button></article>)}{!skills.length?<EmptyState title="No selected skills"/>:null}</div><p>{action.message}</p><InfoModal record={details} eyebrow={`${details?.rankName||''} Skill Techniques`} onClose={()=>setDetails(null)}/></Panel>;
}

export function SpellsTab({ campaignId, character, editable }) {
  const spells=knownSpells(character);
  const elements=knownMagic(character);
  const [filter,setFilter]=useState('All');
  const [details,setDetails]=useState(null);
  const action=useAction();
  const visible=spells.filter(spell=>filter==='All'||spell.element.toLowerCase().includes(filter.toLowerCase()));
  const cast=spell=>action.run(()=>firebaseService.castSpell(campaignId,character.id,spell,parseResourceCost(spell.costs||spell.cost)),`${spell.name} cast once.`);
  return <Panel title="Spells" action={<StatusPill>{spells.length} known</StatusPill>}><div className="react-filter-tabs"><button className={filter==='All'?'active':''} onClick={()=>setFilter('All')}>All</button>{elements.map(element=><button key={element} className={filter===element?'active':''} onClick={()=>setFilter(element)}>{element}</button>)}</div><div className="react-card-gallery">{visible.map(spell=><article className="react-spell-card" key={spell.id} onDoubleClick={()=>editable&&cast(spell)}><b>{spell.name}</b><div className="react-small-card-image">{spell.image?<img src={spell.image} alt=""/>:<span>{spell.name.charAt(0)}</span>}</div><small>{spell.element} | {spell.rank}</small><small>{Object.entries(parseResourceCost(spell.costs||spell.cost)).map(([key,value])=>`${value} ${key.toUpperCase()}`).join(' | ')||'No resource cost'}</small><div><button onClick={()=>setDetails(spell)}>Details</button><button className="primary" disabled={!editable||action.busy} onClick={()=>cast(spell)}>Cast</button></div></article>)}{!visible.length?<EmptyState title="No spells in this element"/>:null}</div><p>{action.message}</p><InfoModal record={details} eyebrow={`${details?.element||''} Spell`} onClose={()=>setDetails(null)}/></Panel>;
}

function ItemCard({ campaignId, character, item, editable, action }) {
  const [details,setDetails]=useState(false);
  const [slot,setSlot]=useState(item.equippedSlot||item.allowedSlots?.[0]||'');
  return <article className={`react-item-card rarity-${String(item.rarity).toLowerCase()}`} onDoubleClick={()=>setDetails(true)}><StatusPill>{item.rarity}</StatusPill><div className="react-small-card-image">{item.image?<img src={item.image} alt=""/>:<span>{item.name.charAt(0)}</span>}</div><b>{item.name}</b><small>{item.type} | x{item.qty}</small>{item.allowedSlots?.length?<select value={slot} onChange={event=>setSlot(event.target.value)}>{item.allowedSlots.map(value=><option key={value}>{value}</option>)}</select>:null}<div className="react-item-actions">{item.equipped?<button disabled={!editable||action.busy} onClick={()=>action.run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'unequip',itemId:item.id}),`${item.name} unequipped.`)}>Unequip</button>:item.allowedSlots?.length?<button disabled={!editable||action.busy} onClick={()=>action.run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'equip',itemId:item.id,slot}),`${item.name} equipped.`)}>Equip</button>:null}{item.effect?<button disabled={!editable||action.busy} onClick={()=>action.run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'use',itemId:item.id}),`${item.name} used.`)}>Use</button>:null}</div><div className="react-quick-actions">{[0,1,2,3].map(index=><button title={`Assign Quick Slot ${index+1}`} disabled={!editable||action.busy} key={index} onClick={()=>action.run(()=>firebaseService.updateInventory(campaignId,character.id,{type:'quick',itemId:item.id,index}),`${item.name} assigned to Quick Slot ${index+1}.`)}>{index+1}</button>)}</div><InfoModal record={details?{...item,summary:item.raw?.desc||item.raw?.description,effects:item.raw?.effects||item.raw?.effect}:null} eyebrow="Inventory Item" onClose={()=>setDetails(false)}/></article>;
}

function ShopsView({ campaignId, character, ecosystem, editable, action }) {
  const shops=(ecosystem.shops||[]).filter(shop=>shop.status==='open'&&(!(shop.visitorCharacterIds||[]).length||shop.visitorCharacterIds.includes(character.id)));
  return <div className="react-shop-list">{shops.map(shop=><Panel key={shop.id} title={shop.name} action={<StatusPill>{shop.type||'Merchant'}</StatusPill>}><div className="react-shop-stock">{(shop.stock||[]).map((stock,index)=><article key={`${shop.id}-${index}`}><b>{stock.item?.name||stock.item?.title||'Item'}</b><small>{Number(stock.qty||0)} in stock</small><strong>{Number(stock.priceCopper||stock.item?.value||0).toLocaleString()} copper</strong><button disabled={!editable||action.busy||Number(stock.qty||0)<1} onClick={()=>action.run(()=>firebaseService.buyShopItem(campaignId,character.id,shop.id,index,1),'Purchase completed.')}>Buy One</button></article>)}</div><h3>Sell Items</h3><div className="react-sell-list">{inventoryItems(character).filter(item=>!item.equipped&&!item.locked&&!item.bound&&!item.questItem).map(item=><div key={item.id}><span>{item.name}</span><button disabled={!editable||action.busy} onClick={()=>action.run(()=>firebaseService.sellShopItem(campaignId,character.id,shop.id,item.id),`${item.name} sold.`)}>Sell One</button></div>)}</div></Panel>)}{!shops.length?<EmptyState title="No accessible shops">The GM can open a shop for this character during a live session.</EmptyState>:null}</div>;
}

function TradeView({ campaignId, character, characters, ecosystem, editable, action }) {
  const items=inventoryItems(character).filter(item=>!item.equipped&&!item.locked&&!item.bound&&!item.questItem);
  const [recipient,setRecipient]=useState(Object.keys(characters).find(id=>id!==character.id)||'');
  const [itemId,setItemId]=useState(items[0]?.id||'');
  const [note,setNote]=useState('');
  const trades=(ecosystem.directTrades||[]).filter(trade=>[trade.fromCharacterId,trade.toCharacterId].includes(character.id)&&trade.status==='pending');
  return <div className="react-trade-grid"><Panel title="Send Trade Request"><div className="react-form-grid"><label>Party Member<select value={recipient} onChange={event=>setRecipient(event.target.value)}>{Object.values(characters).filter(value=>value.id!==character.id).map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select></label><label>Offer Item<select value={itemId} onChange={event=>setItemId(event.target.value)}>{items.map(item=><option key={item.id} value={item.id}>{item.name} x{item.qty}</option>)}</select></label><label>Note<input value={note} onChange={event=>setNote(event.target.value)}/></label></div><button className="primary" disabled={!editable||action.busy||!recipient||!itemId} onClick={()=>action.run(()=>firebaseService.createTrade(campaignId,character.id,recipient,itemId,1,note),'Trade request sent.')}>Send Trade</button></Panel><Panel title="Open Trades"><div className="react-trade-list">{trades.map(trade=><article key={trade.id}><b>{trade.item?.name||'Item'} x{trade.quantity||1}</b><small>{trade.fromCharacterId===character.id?`Sent to ${characters[trade.toCharacterId]?.name||'party member'}`:`From ${characters[trade.fromCharacterId]?.name||'party member'}`}</small><p>{trade.note}</p>{trade.toCharacterId===character.id?<div><button disabled={!editable||action.busy} onClick={()=>action.run(()=>firebaseService.respondTrade(campaignId,character.id,trade.id,false),'Trade declined.')}>Decline</button><button className="primary" disabled={!editable||action.busy} onClick={()=>action.run(()=>firebaseService.respondTrade(campaignId,character.id,trade.id,true),'Trade accepted.')}>Accept</button></div>:<StatusPill>Pending</StatusPill>}</article>)}{!trades.length?<EmptyState title="No open trades"/>:null}</div></Panel></div>;
}

export function InventoryTab({ campaignId, character, characters, ecosystem, editable }) {
  const [view,setView]=useState('bags');
  const action=useAction();
  const items=inventoryItems(character);
  const tabs=[{id:'bags',label:'Bags',icon:'[]'},{id:'equipment',label:'Equipment',icon:'+'},{id:'shops',label:'Shops',icon:'$'},{id:'trade',label:'Trade',icon:'<>'}];
  return <div className="react-inventory-workspace"><Tabs tabs={tabs} active={view} onChange={setView} ariaLabel="Inventory menu"/>{view==='bags'?<Panel title="Inventory Bags" action={<StatusPill>{items.length} item types</StatusPill>}><div className="react-card-gallery">{items.map(item=><ItemCard key={item.id} campaignId={campaignId} character={character} item={item} editable={editable} action={action}/>)}{!items.length?<EmptyState title="Inventory is empty"/>:null}</div></Panel>:null}{view==='equipment'?<Panel title="Equipped Items"><div className="react-equipment-workspace">{items.filter(item=>item.equipped).map(item=><ItemCard key={item.id} campaignId={campaignId} character={character} item={item} editable={editable} action={action}/>)}{!items.some(item=>item.equipped)?<EmptyState title="No equipped items"/>:null}</div></Panel>:null}{view==='shops'?<ShopsView campaignId={campaignId} character={character} ecosystem={ecosystem} editable={editable} action={action}/>:null}{view==='trade'?<TradeView campaignId={campaignId} character={character} characters={characters} ecosystem={ecosystem} editable={editable} action={action}/>:null}<p className="react-action-message">{action.message}</p></div>;
}

export function QuestTab({ campaignId, character, partyWorkspace, editable }) {
  const rows=quests(character,partyWorkspace);const action=useAction();
  return <Panel title="Quest Log" action={<StatusPill>{rows.length} quests</StatusPill>}><div className="react-quest-list">{rows.map(quest=><article key={quest.id}><div><b>{quest.name}</b><p>{quest.description}</p></div><select disabled={!editable||action.busy} value={quest.status} onChange={event=>action.run(()=>firebaseService.updateQuest(campaignId,character.id,quest.id,event.target.value),'Quest status updated.')}><option>Active</option><option>Completed</option><option>Failed</option><option>On Hold</option></select></article>)}{!rows.length?<EmptyState title="No active quests"/>:null}</div><p>{action.message}</p></Panel>;
}

export function JournalTab({ campaignId, character, editable }) {
  const [title,setTitle]=useState('');const [body,setBody]=useState('');const action=useAction();const entries=Array.isArray(character.journal)?character.journal:[];
  const add=async()=>{if(!body.trim())return action.setMessage('Write a journal entry first.');const result=await action.run(()=>firebaseService.addJournalEntry(campaignId,character.id,{title,body}),'Journal entry saved.');if(result?.ok){setTitle('');setBody('');}};
  return <div className="react-journal-grid"><Panel title="New Journal Entry"><label>Title<input disabled={!editable} value={title} onChange={event=>setTitle(event.target.value)}/></label><label>Entry<textarea disabled={!editable} rows="8" value={body} onChange={event=>setBody(event.target.value)}/></label><button className="primary" disabled={!editable||action.busy} onClick={add}>Save Entry</button><p>{action.message}</p></Panel><Panel title="Journal"><div className="react-journal-list">{entries.map((entry,index)=><article key={entry.id||index}><b>{entry.title||'Journal Entry'}</b><small>{entry.createdAt?new Date(entry.createdAt).toLocaleString():''}</small><p>{entry.body||entry.text||entry}</p></article>)}{!entries.length?<EmptyState title="No journal entries"/>:null}</div></Panel></div>;
}

export function PartyTab({ campaignId, character, characters, partyWorkspace, messages, editable }) {
  const [message,setMessage]=useState('');const [notes,setNotes]=useState(partyWorkspace.sharedNotes||'');const [section,setSection]=useState('overview');const [organizationName,setOrganizationName]=useState('');const [organizationType,setOrganizationType]=useState('Adventure Party');const action=useAction();
  useEffect(()=>setNotes(partyWorkspace.sharedNotes||''),[partyWorkspace.sharedNotes]);
  const send=async()=>{const result=await action.run(()=>firebaseService.sendPartyMessage(campaignId,character.id,message),'Message sent.');if(result?.ok)setMessage('');};
  const organizations=Array.isArray(partyWorkspace.organizations)?partyWorkspace.organizations:[];
  const current=organizations.find(value=>value.id===section);
  const create=async()=>{const result=await action.run(()=>firebaseService.createPartyOrganization(campaignId,character.id,{name:organizationName,type:organizationType}),'Organization created.');if(result?.ok){setOrganizationName('');setSection(result.organization.id);}};
  const tabs=[{id:'overview',label:'Party Overview',icon:'P'},{id:'create',label:'Form Organization',icon:'+'},...organizations.map(value=>({id:value.id,label:value.name,icon:String(value.type||'O').charAt(0)}))];
  return <div className="react-party-container"><Tabs tabs={tabs} active={section} onChange={setSection} ariaLabel="Party and organization menu"/>{section==='overview'?<div className="react-party-workspace"><Panel title="Party Members"><div className="react-member-grid">{Object.values(characters).map(member=><article key={member.id}><b>{member.name}</b><small>{member.klass||member.class||'Class'} | Level {Number(member.level||0)}</small></article>)}</div></Panel><Panel title="Shared Notes"><textarea disabled={!editable} rows="10" value={notes} onChange={event=>setNotes(event.target.value)}/><button className="primary" disabled={!editable||action.busy} onClick={()=>action.run(()=>firebaseService.updatePartyNotes(campaignId,notes),'Shared notes saved.')}>Save Shared Notes</button></Panel><Panel title="Live Party Chat" className="react-party-chat"><div className="react-chat-log">{messages.map(row=><article key={row.id}><header><b>{row.characterName||'Party Member'}</b><small>{row.createdAt?new Date(row.createdAt.toDate?row.createdAt.toDate():row.createdAt).toLocaleTimeString():''}</small></header><p>{row.text}</p></article>)}{!messages.length?<EmptyState title="No party messages"/>:null}</div><div className="react-chat-compose"><input disabled={!editable} value={message} onChange={event=>setMessage(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&message.trim())send();}} placeholder={editable?'Message the party...':'Chat unlocks when the session starts.'}/><button className="primary" disabled={!editable||action.busy||!message.trim()} onClick={send}>Send</button></div></Panel></div>:null}{section==='create'?<Panel title="Form a Party or Organization"><p>Create an Adventure Party, business, guild, mercenary company, or another campaign organization.</p><div className="react-form-grid"><label>Organization Type<select disabled={!editable} value={organizationType} onChange={event=>setOrganizationType(event.target.value)}>{['Adventure Party','Business','Guild','Mercenary Company','Religious Order','Custom Organization'].map(value=><option key={value}>{value}</option>)}</select></label><label>Name<input disabled={!editable} value={organizationName} onChange={event=>setOrganizationName(event.target.value)} placeholder="Organization name"/></label></div><button className="primary" disabled={!editable||action.busy||!organizationName.trim()} onClick={create}>Create Organization</button></Panel>:null}{current?<div className="react-organization-workspace"><Panel title={current.name} eyebrow={current.type} action={<StatusPill>{(current.memberCharacterIds||[]).length} member(s)</StatusPill>}><div className="react-member-grid">{(current.memberCharacterIds||[]).map(id=>characters[id]).filter(Boolean).map(member=><article key={member.id}><b>{member.name}</b><small>{member.klass||member.class||'Class'} | Level {Number(member.level||0)}</small></article>)}</div></Panel><Panel title="Organization Notes"><p>{current.notes||'Organization notes and shared resources can be developed here during future sessions.'}</p></Panel></div>:null}<p>{action.message}</p></div>;
}

export function ActivityLog({ character }) {
  const rows=Array.isArray(character.actionLog)?character.actionLog:[];
  return <Panel title="Action / Resource Log" className="react-action-log"><div>{rows.slice(0,20).map(row=><article key={row.id}><span>{row.at?new Date(row.at).toLocaleTimeString():''}</span><p>{row.message||row.type}</p></article>)}{!rows.length?<p>No live-session actions recorded yet.</p>:null}</div></Panel>;
}
