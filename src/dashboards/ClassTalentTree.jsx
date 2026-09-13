import React, { useEffect, useRef, useState } from 'react';
import { EmptyState, Modal, Panel, SearchField, StatusPill } from '../components/WorkspaceUI.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { TALENT_TIER_LEVELS, talentRankCost, talentTierUnlocked } from '../state/liveWorkspaceModel.mjs';
import { prerequisiteProblem, rankDefined, talentEffectActive } from '../state/talentModel.mjs';
import { talentRules } from '../state/talentMechanics.mjs';
import { knownSpells, talentCatalog, talentRank } from './characterWorkspaceData.js';

function Inline({text}) {return String(text).split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:part.replace(/(?<!\*)\*(?!\*)/g,''));}
export function TalentText({text=''}) {
  return <div className="react-talent-prose">{text.split(/\n\s*\n/).filter(Boolean).map((block,i)=>{
    if(/^#{1,6}\s/.test(block)) return <h3 key={i}>{block.replace(/^#{1,6}\s+/,'')}</h3>;
    if(/^[-*]\s/.test(block.trim())) return <ul key={i}>{block.split('\n').filter(line=>line.trim()).map((line,j)=><li key={j}><Inline text={line.replace(/^\s*[-*]\s+/,'')}/></li>)}</ul>;
    if(/^>/.test(block)) return <blockquote key={i}><Inline text={block.replace(/^>\s*/gm,'')}/></blockquote>;
    if(/^[-#\s]+$/.test(block)) return null;
    return <p key={i}><Inline text={block}/></p>;
  })}</div>;
}
const priceText=costs=>Object.entries(costs || {}).filter(([,n])=>n>0).map(([key,n])=>`${n} ${key.toUpperCase()}`).join(' · ') || 'No resource cost';
const reference=(talent,rank)=>({id:talent.id,name:talent.name,className:talent.className,expectedRank:rank});
function useAction() {
  const pending=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const run=async(operation,success)=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);setMessage('Saving…');
    try{const result=await operation();setMessage(result?.ok?success:result?.error || 'The action could not be saved.');}
    catch(error){setMessage(error.message || 'The connection was interrupted. Refresh to check whether the action was saved.');}
    finally{pending.current=false;setBusy(false);}
  };
  return {busy,message,run};
}
export function TalentDetails({campaignId,character,talent,initialRank,editable,characters={},onClose}) {
  const learned=talentRank(character,talent),[rank,setRank]=useState(initialRank || Math.max(1,learned));
  const [choice,setChoice]=useState(''),[spell,setSpell]=useState(''),[targetId,setTargetId]=useState(character.id),[trigger,setTrigger]=useState(false);
  const action=useAction(),rules=talentRules(talent,rank),learnedRules=talentRules(talent,Math.max(1,learned));
  const nextCost=talentRankCost(learned+1,talent.tier),maximum=talent.maxRank || 5;
  const prerequisite=prerequisiteProblem(character,talent,talentCatalog(character));
  const buyReason=!editable?'Gameplay actions require an active session and the character owner.':!talentTierUnlocked(character.level,talent.tier)?`Tier ${talent.tier} unlocks at Level ${TALENT_TIER_LEVELS[talent.tier]}.`:prerequisite || (!rankDefined(talent,learned+1)?'The next rank has not been written yet.':Number(character.tp || 0)<nextCost?`You need ${nextCost} TP for the next rank.`:'');
  const chosen=learnedRules.choices.find(row=>row.id===choice),usage=character.talentUsage?.[talent.id];
  const canUse=editable && learned>0 && !learnedRules.blocked && (!learnedRules.choices.length || chosen) && (!learnedRules.needsSpell || spell) && (!learnedRules.requiresTrigger || trigger);
  return <Modal title={talent.name} eyebrow={`${talent.className || 'Class'} · Tier ${talent.tier || 1} · ${talent.type || 'Talent'}`} onClose={onClose} busy={action.busy} footer={<><span role="status" className="react-action-message">{action.message}</span><button type="button" disabled={action.busy} onClick={onClose}>Close</button></>}>
    <div className="react-talent-detail-summary"><StatusPill tone={learned?'success':'info'}>{learned?`Learned Rank ${learned} / ${maximum}`:'Not learned'}</StatusPill><strong>{Number(character.tp || 0)} TP available</strong></div>
    <nav className="react-talent-rank-tabs" aria-label={`${talent.name} ranks`}>{Array.from({length:maximum},(_,i)=>i+1).map(value=><button type="button" key={value} aria-pressed={rank===value} onClick={()=>setRank(value)}>Rank {value}{value<=learned?' ✓':''}</button>)}</nav>
    <div className="react-talent-rank-heading"><h2>Rank {rank}</h2><span>{talentRankCost(rank,talent.tier)} TP · {rank<=learned?'Learned':rank===learned+1?'Next rank':'Learn earlier ranks first'}</span></div>
    <dl className="react-talent-facts"><div><dt>Resource cost</dt><dd>{rules.choices.length?'Choose an option below':priceText(rules.costs)}{rules.bpGain?` · Gain ${rules.bpGain} BP`:''}{rules.needsSpell?' + the woven spell’s cost':''}</dd></div><div><dt>Cooldown</dt><dd>{rules.cooldown}</dd></div><div><dt>Duration</dt><dd>{rules.duration}</dd></div><div><dt>Prerequisites</dt><dd>{talent.prerequisite || 'None'}</dd></div></dl>
    {learned<maximum?<div className="react-talent-purchase"><button className="primary" type="button" disabled={action.busy || Boolean(buyReason)} onClick={()=>action.run(()=>firebaseService.purchaseTalent(campaignId,character.id,reference(talent,learned)),`Purchased ${talent.name} Rank ${learned+1}.`)}>Buy Rank {learned+1} · {nextCost} TP</button>{buyReason?<p>{buyReason}</p>:null}</div>:<p>All ranks learned.</p>}
    {learned>0?<section className="react-talent-use"><h3>{learnedRules.activation?`Use learned Rank ${learned}`:'Passive benefits'}</h3>{!learnedRules.activation?<p>Sheet bonuses appear in Talent Effects. Apply the remaining passive benefits below when relevant.</p>:<>
      {learnedRules.blocked?<p>{learnedRules.blocked}</p>:null}
      {learnedRules.choices.length?<label>Talent option<select value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Choose an option</option>{learnedRules.choices.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>:null}
      {learnedRules.needsSpell?<label>Spell to weave<select value={spell} onChange={e=>setSpell(e.target.value)}><option value="">Choose a known spell</option>{knownSpells(character).map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select></label>:null}
      {learnedRules.targetChoice?<label>Aegis target<select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value={character.id}>Self · {character.name}</option>{Object.values(characters).filter(row=>row.id!==character.id && row.ownerUid).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>:null}
      {learnedRules.requiresTrigger?<label><input type="checkbox" checked={trigger} onChange={e=>setTrigger(e.target.checked)}/> The GM confirmed an eligible trigger.</label>:null}
      <p>{priceText(chosen?.costs || learnedRules.costs)}{(chosen?.bpGain ?? learnedRules.bpGain)?` · Gain ${chosen?.bpGain ?? learnedRules.bpGain} BP`:''}{learnedRules.needsSpell?' + spell cost':''}{learnedRules.uses?` · ${usage?.count || 0}/${learnedRules.uses} uses recorded`:''}</p>
      <button className="primary" type="button" disabled={action.busy || !canUse} onClick={()=>action.run(()=>firebaseService.useTalent(campaignId,character.id,reference(talent,learned),{choice,spell,targetId,triggerConfirmed:trigger}),`Used ${talent.name}. Resources and effects saved.`)}>Use {talent.name}</button>
      <p className="react-help">Resource costs and tracked effects are applied on use. Resolve attacks, saves, range and conditional effects with the GM.</p>
    </>}</section>:null}
    <TalentText text={rules.body || talent.summary || 'This rank has not been written yet.'}/>
  </Modal>;
}
export function TalentEffects({campaignId,character,editable,encounter}) {
  const action=useAction(),effects=(character.talentEffects || []).filter(effect=>talentEffectActive(effect,{encounter})),bonuses=character.talentResourceState || {};
  return <Panel title="Talent Effects" className="react-talent-effects"><div className="react-talent-bonus-list">
    {bonuses.mp?.multiplier>1?<p><b>Mana Well</b> Base {bonuses.mp.baseMaximum} × {bonuses.mp.multiplier} = {bonuses.mp.maximum} maximum MP</p>:null}
    {bonuses.bp?.addition>0?<p><b>Blood Control</b> +{bonuses.bp.addition} maximum BP</p>:null}
    {(character.talentSavingThrows || []).map(bonus=><p key={bonus.source}><b>{bonus.source}</b> +{bonus.value} to saves against {bonus.against.join(', ')}</p>)}
    {character.talentRestBonus>0?<p><b>Mystic Recovery</b> +{Math.round(character.talentRestBonus*100)}% natural recovery while resting</p>:null}
    </div>{effects.length?effects.map(effect=><article key={effect.id}><div><b>{effect.name}</b><small>{effect.ac?`+${effect.ac} AC · `:''}{effect.untilRound?`Until round ${effect.untilRound}`:effect.expiresAt?`Ends ${new Date(effect.expiresAt).toLocaleTimeString()}`:'Active until dismissed'}</small></div><details><summary>Effect details</summary><TalentText text={effect.description}/></details><button type="button" disabled={!editable || action.busy} onClick={()=>action.run(()=>firebaseService.endTalentEffect(campaignId,character.id,effect.id),`Ended ${effect.name}.`)}>End effect</button></article>):<p className="react-help">No temporary talent effects are active.</p>}<p role="status">{action.message}</p></Panel>;
}
export function TalentsTab({campaignId,character,editable,characters={},encounter}) {
  const catalog=talentCatalog(character),classes=[...new Set(catalog.map(t=>t.className))];
  const [chosenClass,setClass]=useState(''),[tier,setTier]=useState(1),[query,setQuery]=useState(''),[selected,setSelected]=useState(null);
  const className=classes.includes(chosenClass)?chosenClass:classes[0],visible=catalog.filter(t=>t.className===className && t.tier===tier && t.name.toLowerCase().includes(query.toLowerCase()));
  useEffect(()=>{setSelected(null);setClass('');setTier(1);setQuery('');},[character.id]);
  const height=Math.max(260,visible.length*116+100);
  return <div className="react-talent-workspaces"><Panel title="Class Talent Trees" eyebrow="Choose your path" action={<StatusPill>{Number(character.tp || 0)} TP available</StatusPill>}>
    <p className="react-help">Open any talent or rank bubble to read its effects. Learn ranks in order using Talent Points.</p>
    <div className="react-talent-class-tabs" aria-label="Class trees">{classes.map(name=><button type="button" key={name} aria-pressed={className===name} onClick={()=>{setClass(name);setQuery('');}}>{name}</button>)}</div>
    <div className="react-tier-tabs">{[1,2,3,4,5].map(value=><button type="button" key={value} aria-pressed={tier===value} className={tier===value?'active':''} onClick={()=>setTier(value)}><b>Tier {value}</b><small>{talentTierUnlocked(character.level,value)?'Available':`Level ${TALENT_TIER_LEVELS[value]}`}</small></button>)}</div>
    <SearchField value={query} onChange={setQuery} placeholder="Find a talent in this tier…"/>
    <div className="react-talent-legend"><span>● Learned</span><span>◉ Next rank</span><span>○ Unlearned · open to inspect</span></div>
    {!talentTierUnlocked(character.level,tier)?<p className="react-help">Tier {tier} unlocks at Level {TALENT_TIER_LEVELS[tier]}. You can preview its talents now.</p>:null}
    {visible.length?<div className="react-talent-graph-scroll" tabIndex={0} role="region" aria-label={`${className} Tier ${tier} talent graph. Scroll horizontally to explore ranks.`}><div className="react-talent-graph" style={{height}}>
      <svg aria-hidden="true" className="react-talent-links" viewBox={`0 0 860 ${height}`} preserveAspectRatio="none">{visible.map((talent,i)=><g key={talent.id}><path d={`M 90 ${height/2} C 175 ${height/2}, 160 ${100+i*116}, 240 ${100+i*116}`}/><path d={`M 340 ${100+i*116} H 794`}/></g>)}</svg>
      <div className="react-talent-root" style={{top:height/2-49}}><span>✦</span><strong>{className}</strong><small>Tier {tier}</small></div>
      {visible.map((talent,i)=>{const learned=talentRank(character,talent);return <div className="react-talent-branch" key={talent.id} style={{top:100+i*116-29}}><button type="button" className="react-talent-name" onClick={()=>setSelected({talent,rank:Math.max(1,learned)})}><strong>{talent.name}</strong><small>{talent.type} · {learned}/{talent.maxRank} ranks</small></button><div className="react-talent-nodes">{Array.from({length:talent.maxRank},(_,j)=>j+1).map(rank=><button type="button" key={rank} className={`react-talent-node ${rank<=learned?'learned':rank===learned+1 && talentTierUnlocked(character.level,tier)?'available':'unlearned'}`} aria-label={`${talent.name}, Rank ${rank}, ${rank<=learned?'learned':`${talentRankCost(rank,tier)} TP`}`} onClick={()=>setSelected({talent,rank})}><span>{rank<=learned?'✓':rank}</span><small>Rank {rank}</small></button>)}</div></div>;})}
    </div></div>:<EmptyState title={catalog.length?'No talents in this selection':'No class talents found'}>{catalog.length?'Choose another tier or change the search.':'Check the character’s selected classes and refresh the compendium.'}</EmptyState>}
    </Panel><TalentEffects campaignId={campaignId} character={character} editable={editable} encounter={encounter}/>
    {selected?<TalentDetails key={selected.talent.id} campaignId={campaignId} character={character} characters={characters} talent={selected.talent} initialRank={selected.rank} editable={editable} onClose={()=>setSelected(null)}/>:null}
  </div>;
}
