import React,{useMemo,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import styles from '../pages/PlayerDashboardPage.module.css';

function QuestObjective({quest,objective,editable,busy,update}){
  const [draft,setDraft]=useState('');
  const active=editable&&!busy&&!quest.closed&&
    !['Pending','Awaiting Review'].includes(quest.status);
  const save=async current=>{
    const result=await update('progress',quest.id,{objectiveId:objective.id,current});
    if(result?.ok)setDraft('');
  };
  return <li className={styles.questObjective}>
    <span>{objective.text}{objective.optional?' (optional)':''} · {objective.current}/{objective.target}</span>
    {objective.target===1?<input type="checkbox" checked={objective.current===1}
      aria-label={objective.text} disabled={!active}
      onChange={e=>save(e.target.checked?1:0)}/>:<div>
      <input type="number" min="0" max={objective.target} step="1"
        aria-label={'Progress for '+objective.text} value={draft}
        onChange={e=>setDraft(e.target.value)} disabled={!active}/>
      <button type="button" disabled={!active||draft.trim()===''||
        !Number.isSafeInteger(Number(draft))||Number(draft)<0||Number(draft)>objective.target}
        onClick={()=>save(Number(draft))}>Save Progress</button>
    </div>}
  </li>;
}

/** Original quest workflows, backed by the existing authenticated action service. */
export function PlayerQuestWorkspace({api,character,campaignId,characterId,editable=false}){
  const [query,setQuery]=useState(''),[status,setStatus]=useState('All'),
    [type,setType]=useState('All'),[busy,setBusy]=useState(false),
    [error,setError]=useState(''),[message,setMessage]=useState('');
  const rows=character.quests||[];
  const types=['All',...new Set(rows.map(row=>row.type).filter(Boolean))];
  const filtered=useMemo(()=>rows.filter(quest=>
    (status==='All'||quest.status===status)&&
    (type==='All'||quest.type===type)&&
    [quest.name,quest.description,quest.questGiver,quest.location].join(' ')
      .toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>
        Number(b.tracked)-Number(a.tracked)),[rows,query,status,type]);
  const run=async(kind,questId,value)=>{
    if(!editable||busy||!campaignId)return {ok:false};
    setBusy(true);setError('');setMessage('');
    try{
      const result=kind==='status'?
        await api.updateQuestStatus(campaignId,characterId,questId,value):
        await api.updateQuestProgress(campaignId,characterId,questId,value);
      setMessage(result.rewardApplied?
        'Quest completed. Rewards delivered once'+(result.rewardSummary?' — '+result.rewardSummary:'')+'.':
        kind==='progress'?'Quest progress saved.':
        value==='Awaiting Review'?'Quest submitted for GM review.':'Quest status updated.');
      return {ok:true};
    }catch(e){setError(e?.message||'Quest action failed.');return {ok:false};}
    finally{setBusy(false);}
  };
  return <SurfacePanel as="section" className={styles.panel} data-testid="site-player-quests">
    <h3>Quests &amp; History</h3>
    <div className={styles.questFilters}>
      <label>Search quests<input type="search" value={query}
        onChange={e=>setQuery(e.target.value)} placeholder="Search quests, givers and locations"/></label>
      <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}>
        {['All','Pending','Accepted','Declined','Active','On Hold','Awaiting Review',
          'Completed','Failed','Expired'].map(s=><option key={s} value={s}>{s}</option>)}
      </select></label>
      <label>Quest type<select value={type} onChange={e=>setType(e.target.value)}>
        {types.map(s=><option key={s} value={s}>{s}</option>)}
      </select></label>
    </div>
    {error?<p role="alert">{error}</p>:null}
    {message?<p role="status">{message}</p>:null}
    {filtered.length?<div className={styles.questCards}>{filtered.map((quest,i)=>{
      const active=!quest.closed&&quest.status!=='Pending'&&quest.status!=='Awaiting Review';
      const control=(name,next,disabled=false)=><button key={name} type="button"
        disabled={!editable||busy||disabled} onClick={()=>run('status',quest.id,next)}>{name}</button>;
      return <article className={styles.questCard} key={quest.id+':'+i}>
        <header><h4>{quest.name}</h4>
          <span>{quest.status}{quest.tracked?' · Tracked':''}
            {quest.rewardClaimed?' · Reward Claimed':''}</span></header>
        {quest.description?<p>{quest.description}</p>:null}
        {quest.questGiver?<p>Quest giver: {quest.questGiver}</p>:null}
        {quest.location?<p>Location: {quest.location}</p>:null}
        {quest.deadline?<p>Deadline: {quest.deadline}</p>:null}
        {quest.successOutcome?<p>On success: {quest.successOutcome}</p>:null}
        {quest.failureConsequences?<p>Failure consequences: {quest.failureConsequences}</p>:null}
        {quest.resolutionNote?<p>GM response: {quest.resolutionNote}</p>:null}
        <p>Required objectives: {quest.completed} / {quest.total}</p>
        {quest.objectives.length?<ul className={styles.questObjectives}>
          {quest.objectives.map(objective=><QuestObjective key={objective.id}
            quest={quest} objective={objective} editable={editable}
            busy={busy} update={run}/>)}
        </ul>:null}
        {quest.rewardText?<p>Reward: {quest.rewardText}</p>:null}
        {quest.requiresGMApproval&&!quest.closed?<p>
          {quest.status==='Awaiting Review'?'Awaiting GM review.':
            'Complete required objectives, then submit to the GM.'}</p>:null}
        <div className={styles.questActions}>
          {quest.status==='Pending'?<>{control('Accept Quest','Accepted')}
            {control('Decline Quest','Declined')}</>:null}
          {!quest.closed?<button type="button" disabled={!editable||busy}
            onClick={()=>run('progress',quest.id,{tracked:!quest.tracked})}>
            {quest.tracked?'Untrack':'Track Quest'}</button>:null}
          {quest.status==='Accepted'?control('Begin Quest','Active'):null}
          {active?<>
            {control(quest.status==='On Hold'?'Resume':'Put On Hold',
              quest.status==='On Hold'?'Active':'On Hold')}
            {control(quest.requiresGMApproval?'Submit for GM Review':'Complete & Claim Reward',
              quest.requiresGMApproval?'Awaiting Review':'Completed',!quest.ready)}
          </>:null}
          {quest.status==='Awaiting Review'?control('Withdraw Submission','Active'):null}
        </div>
        {quest.history.length?<details><summary>Quest History</summary>
          <ul>{quest.history.map((entry,j)=><li key={j}>
            {entry.status}{entry.at?' · '+entry.at:''}{entry.note?' — '+entry.note:''}
          </li>)}</ul>
        </details>:null}
      </article>;
    })}</div>:<BodyText muted>{rows.length?'No quests match the selected filters.':
      'No quests have been assigned to this character.'}</BodyText>}
    {!editable?<BodyText muted>Quest changes require character ownership and an editable campaign session.</BodyText>:null}
  </SurfacePanel>;
}
