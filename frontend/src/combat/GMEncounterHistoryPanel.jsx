import React,{useEffect,useState} from 'react';
import {ENCOUNTER_COMPLETION_OUTCOMES,hasEncounterBundle}
  from '../../../src/state/encounterCompletionModel.mjs';
import styles from './GMEncounterHistoryPanel.module.css';

const currencyOptions=['copper','silver','gold','platinum_crown',
  'royal_crown','royal_platinum'];
const pretty=value=>String(value||'').replaceAll('-',' ');
const fromHistory=record=>({
  outcome:record.outcome||'unresolved',notes:record.notes||'',
  rewards:(record.rewards||[]).map(row=>({
    characterId:row.characterId,xp:Number(row.xp||0),
    currency:row.currency||{key:'copper',amount:0},items:row.items||[]
  }))
});
export function GMEncounterHistoryPanel({api,campaignId,busy=false}){
  const [history,setHistory]=useState([]),[error,setError]=useState(''),
    [notice,setNotice]=useState(''),[loading,setLoading]=useState(true),
    [chosen,setChosen]=useState(''),[draft,setDraft]=useState(null),
    [sending,setSending]=useState(false);
  useEffect(()=>{
    setHistory([]);setChosen('');setDraft(null);setError('');setLoading(true);
    if(!api?.watchGMHistory){setLoading(false);
      setError('Encounter history is unavailable in this build.');return;}
    return api.watchGMHistory(campaignId,records=>{
      setHistory(records);setLoading(false);setError('');
    },failure=>{setLoading(false);
      setError(failure?.message||'Encounter history access denied.');});
  },[api,campaignId]);
  const selected=history.find(row=>row.id===chosen)||history[0]||null;
  useEffect(()=>{if(selected){setChosen(selected.id);setDraft(fromHistory(selected));}
    else setDraft(null);},[selected?.id,selected?.revision]);
  const updateReward=(characterId,update)=>setDraft(old=>({...old,
    rewards:old.rewards.map(row=>row.characterId===characterId?
      {...row,...update}:row)
  }));
  const submit=async(input)=>{
    if(busy||sending||!selected)return;
    setSending(true);setError('');setNotice('');
    try{
      const result=await api.reviewCompletion(campaignId,{
        ...input,encounterId:selected.id,expectedRevision:selected.revision
      });
      setNotice(result.status==='approved'?
        'GM approved this reward plan. Delivery requires separate confirmation.':
        'Encounter review saved. No rewards distributed.');
    }catch(failure){setError(failure?.message||'Encounter review failed.');}
    finally{setSending(false);}
  };
  const deliver=async(characterId,kind)=>{
    if(sending||!selected||!window.confirm(
      'Confirm delivery of this approved '+(kind==='xp'?'XP':'item/currency')+
      ' reward? This changes the character record.'))return;
    setSending(true);setError('');setNotice('');
    try{
      await api.deliverCompletion(campaignId,characterId,kind,selected);
      setNotice('Reward confirmed by Firebase. Encounter delivery receipt saved.');
    }catch(failure){setError(failure?.message||'Reward delivery was not confirmed. Do not retry until the record refreshes.');}
    finally{setSending(false);}
  };
  const locked=busy||sending;
  return <section className={styles.panel} data-testid="site-gm-encounter-history">
    <h3>Encounter Completion &amp; History</h3>
    <p>Completed encounters are separate from reusable prepared templates.
      Rewards remain private until the GM approves and delivers them.</p>
    {loading?<p role="status">Loading private encounter history…</p>:null}
    {history.length?<label>Completed encounter
      <select value={selected?.id||''} onChange={e=>setChosen(e.target.value)}>
        {history.map(row=><option key={row.id} value={row.id}>
          {row.name||'Encounter'} · {new Date(row.endedAt).toLocaleDateString()} · {row.status}
        </option>)}
      </select></label>:!loading?<p>No completed encounters yet.</p>:null}
    {selected&&draft?<div className={styles.content}>
      <p>Round {selected.rounds} · {selected.summary?.players||0} players ·
        {' '}{selected.summary?.defeatedEnemies||0} defeated enemies /
        {' '}{selected.summary?.enemies||0} total</p>
      <p>Suggested defeated-enemy XP: {selected.xpSuggested||0}
        {selected.xpUnconfigured?' ('+selected.xpUnconfigured+' enemies without configured XP)':''}.
        XP is not automatically divided or awarded.</p>
      <label>Outcome<select value={draft.outcome}
        disabled={locked||selected.status!=='pending-review'}
        onChange={e=>setDraft(old=>({...old,outcome:e.target.value}))}>
        {ENCOUNTER_COMPLETION_OUTCOMES.map(outcome=>
          <option key={outcome} value={outcome}>{pretty(outcome)}</option>)}
      </select></label>
      <label>Private GM notes<textarea value={draft.notes} maxLength={1500}
        disabled={locked||selected.status!=='pending-review'}
        onChange={e=>setDraft(old=>({...old,notes:e.target.value}))}/></label>
      <details>
        <summary>Final roster, waves, events &amp; action log</summary>
        <ul>{(selected.participants||[]).map(row=><li key={row.id}>
          {row.name} ({row.kind}) · {row.outcome} · Initiative {row.initiative??'unset'}
          {row.hp?' · HP '+row.hp.join(' / '):''}
        </li>)}</ul>
        <h4>Prepared waves</h4>
        <ul>{(selected.waves||[]).map(row=><li key={row.id}>
          {row.name} · {row.status}</li>)}</ul>
        <h4>Events</h4>
        <ul>{(selected.events||[]).map(row=><li key={row.id}>
          {row.name} · {row.status}</li>)}</ul>
        <h4>Combat log</h4>
        <ul>{(selected.actions||[]).map((row,i)=><li key={row.id+'-'+i}>
          {row.message}</li>)}</ul>
      </details>
      <h4>Reward review</h4>
      <p>Set per-character XP and currency. Item rewards can be prepared
        through the existing GM Rewards and Party Loot workspaces; no items
        are added automatically.</p>
      {draft.rewards.map(row=>{
        const delivery=selected.deliveries?.[row.characterId]||{};
        const participant=selected.participants.find(p=>p.characterId===row.characterId);
        return <div key={row.characterId} className={styles.reward}>
          <strong>{participant?.name||row.characterId}</strong>
          {selected.status==='pending-review'?<div className={styles.fields}>
            <label>XP <input type="number" min="0" max="1000000"
              disabled={locked} value={row.xp}
              onChange={e=>updateReward(row.characterId,{
                xp:Math.max(0,Math.min(1000000,Number(e.target.value)||0))
              })}/></label>
            <label>Currency<select disabled={locked} value={row.currency.key}
              onChange={e=>updateReward(row.characterId,{currency:{
                ...row.currency,key:e.target.value}})}>
              {currencyOptions.map(key=><option key={key} value={key}>{pretty(key)}</option>)}
            </select></label>
            <label>Amount<input type="number" min="0" max="1000000000"
              disabled={locked} value={row.currency.amount}
              onChange={e=>updateReward(row.characterId,{currency:{
                ...row.currency,
                amount:Math.max(0,Math.min(1000000000,Number(e.target.value)||0))
              }})}/></label>
          </div>:<p>{row.xp} XP · {row.currency.amount} {pretty(row.currency.key)}
            {' · '}{row.items.length} item types</p>}
          {selected.status==='approved'?<div className={styles.actions}>
            {row.xp>0?<button type="button" disabled={locked||Boolean(delivery.xp)}
              onClick={()=>deliver(row.characterId,'xp')}>
              {delivery.xp?'XP delivered':'Deliver XP'}</button>:null}
            {hasEncounterBundle(row)?<button type="button"
              disabled={locked||Boolean(delivery.bundle)}
              onClick={()=>deliver(row.characterId,'bundle')}>
              {delivery.bundle?'Items/currency delivered':'Deliver items/currency'}</button>:null}
          </div>:null}
        </div>;
      })}
      {selected.status==='pending-review'?<div className={styles.actions}>
        <button type="button" disabled={locked}
          onClick={()=>submit({type:'review',...draft})}>Save Review</button>
        <button type="button" disabled={locked||draft.outcome==='unresolved'}
          onClick={()=>{
            if(!window.confirm('Approve the SAVED outcome and reward allocations? No rewards are distributed until separately delivered.'))return;
            submit({type:'approve',confirmation:'approve-rewards'});
          }}>Approve Saved Plan</button>
      </div>:<p>Approved. Reward delivery uses existing canonical character
        transactions with server-side duplicate protection.</p>}
    </div>:null}
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
