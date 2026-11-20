import React,{useMemo,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {gmPartyManagementRoster,gmPartyActionsEnabled} from './gmPartyManagementModel.mjs';
import styles from '../pages/GMDashboardPage.module.css';

/** Restores the original searchable GM Party Control with the existing
 * authenticated GM condition and rest review actions. No direct Firestore
 * writes or legacy global scripts are mounted here.
 */
export function GMPartyManagement({party=[],campaignId,session,busy=false,
  onNavigate,onCondition,onReviewRest}){
  const [query,setQuery]=useState(''),[selectedId,setSelectedId]=useState('');
  const [condition,setCondition]=useState('');
  const roster=useMemo(()=>gmPartyManagementRoster(party,query),[party,query]);
  const selected=roster.rows.find(member=>member.id===selectedId)||roster.rows[0]||null;
  const canAct=gmPartyActionsEnabled(session)&&!busy;
  const apply=async()=>{
    if(!selected||!canAct||!condition.trim())return;
    const ok=await onCondition?.(selected.id,{action:'add',name:condition.trim()});
    if(ok===true)setCondition('');
  };
  const remove=async(id)=>{
    if(!selected||!canAct)return;
    await onCondition?.(selected.id,{action:'remove',id});
  };
  return <SurfacePanel className={styles.panel} as="section"
    data-testid="site-gm-party-management">
    <div className={styles.gmPartyHeader}>
      <div><h2>GM Party Management</h2>
        <BodyText muted>Choose a linked character to review conditions, long rests and GM tools.</BodyText></div>
      <strong>{roster.count} linked character{roster.count===1?'':'s'}</strong>
    </div>
    <label className={styles.gmPartySearch}>Find party member
      <input type="search" value={query} placeholder="Search name, class or ID"
        onChange={event=>setQuery(event.target.value)}/>
    </label>
    <p role="status">{roster.rows.length} of {roster.count} characters shown</p>
    <div className={styles.gmPartyRoster}>
      {roster.rows.map(member=><article key={member.id}
        className={styles.gmPartyMember} data-selected={selected?.id===member.id}>
        {member.image?<img src={member.image} alt="" loading="lazy"/>:null}
        <div><strong>{member.name}</strong>
          <small>{member.className} · Level {member.level??'—'}</small>
          <small>HP {member.hp?.join(' / ')||'—'} · SP {member.sp?.join(' / ')||'—'}</small></div>
        <button type="button" aria-pressed={selected?.id===member.id}
          onClick={()=>setSelectedId(member.id)}>
          {selected?.id===member.id?'Selected':'Select '+member.name}
        </button>
      </article>)}
    </div>
    {!roster.count?<BodyText muted>No characters are linked to this campaign.</BodyText>:null}
    {roster.count>0&&!roster.rows.length?
      <BodyText muted>No linked characters match this search.</BodyText>:null}
    {selected?<div className={styles.gmPartyDetail}>
      <h3>{selected.name} — GM Controls</h3>
      <p>Soul Damage: <strong>{selected.soulDamage}</strong></p>
      <div className={styles.gmPartyActions}>
        <a href={'#/react/character/'+encodeURIComponent(campaignId)+'/'+
          encodeURIComponent(selected.id)}
          aria-label={'Open '+selected.name+' read-only character'}>
          Open Character</a>
        <button type="button" onClick={()=>onNavigate?.('inventory')}>Open PC Inventory</button>
        <button type="button" onClick={()=>onNavigate?.('gameplay')}>Open Combat &amp; Checks</button>
        <button type="button" onClick={()=>onNavigate?.('quests')}>Open Quests</button>
      </div>
      <h4>Conditions</h4>
      {(selected.conditions||[]).length?<ul className={styles.gmPartyConditions}>
        {selected.conditions.map(item=><li key={item.id}>
          <span>{item.name}</span>
          <button type="button" disabled={!canAct}
            aria-label={'Remove '+item.name}
            onClick={()=>remove(item.id)}>Remove</button>
        </li>)}</ul>:<BodyText muted>No active conditions.</BodyText>}
      <div className={styles.gmPartyActions}>
        <label>New condition for selected character
          <input type="text" maxLength={100} value={condition}
            disabled={!canAct} onChange={event=>setCondition(event.target.value)}/></label>
        <button type="button" disabled={!canAct||!condition.trim()}
          onClick={apply}>Apply Condition</button>
      </div>
      <h4>Long Rest Requests</h4>
      {selected.restRequest?.status==='pending'?<div className={styles.gmPartyRest}>
        <p>Requested Soul Recovery: {selected.restRequest.soulRecovery}</p>
        <div className={styles.gmPartyActions}>
          <button type="button" disabled={!canAct} onClick={()=>onReviewRest?.(
            selected.id,selected.restRequest.id,'approved')}>Approve Long Rest</button>
          <button type="button" disabled={!canAct} onClick={()=>onReviewRest?.(
            selected.id,selected.restRequest.id,'denied')}>Deny Long Rest</button>
        </div>
      </div>:<BodyText muted>No pending Long Rest for this character.</BodyText>}
      {!gmPartyActionsEnabled(session)?<BodyText muted>
        Start an active session to apply GM changes.</BodyText>:null}
    </div>:null}
  </SurfacePanel>;
}
