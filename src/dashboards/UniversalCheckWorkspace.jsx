import React,{useEffect,useRef,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {UNIVERSAL_CHECK_TYPES,UNIVERSAL_CHECK_RANKS,UNIVERSAL_CHARACTERISTICS} from '../state/universalCheckModel.mjs';

const timestamp=value=>value?.toDate?.()?.toLocaleString?.()||'';
const modifierLabel=value=>Number(value)>=0?'+'+value:String(value);
const sourceLabel=row=>row.context?(row.context.label+(row.context.detail?' · '+row.context.detail:'')):'';
function useRequests(campaignId,gm){
  const [rows,setRows]=useState([]);
  useEffect(()=>{
    setRows([]);
    if(!campaignId)return;
    return firebaseService.subscribeUniversalChecks(campaignId,setRows,{gm});
  },[campaignId,gm]);
  return rows;
}
function useAction(campaignId){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const outstanding=useRef(null);
  const send=async data=>{
    if(busy)return null;
    setBusy(true);setError('');
    const fingerprint=JSON.stringify(data);
    if(outstanding.current?.fingerprint!==fingerprint){
      outstanding.current={fingerprint,operationId:crypto.randomUUID()};
    }
    try{
      const result=await firebaseService.universalCheckAction({campaignId,...data,operationId:outstanding.current.operationId});
      if(!result?.ok)throw Error(result?.error||'Check action failed.');
      outstanding.current=null;
      return result;
    }catch(e){setError(e.message||'Check action failed.');return null;}
    finally{setBusy(false);}
  };
  return {send,busy,error};
}
function Breakdown({row}){
  return <div>
    <p><strong>Roll:</strong> 1d20 {row.advantage?'(advantage: roll twice, use higher)':row.disadvantage?'(disadvantage: roll twice, use lower)':''}</p>
    <ul>{(row.modifiers||[]).map((entry,index)=><li key={index}>{entry.label}: {modifierLabel(entry.value)}</li>)}</ul>
    {(row.advantageSources||[]).length?<p><strong>Dice conditions:</strong> {row.advantageSources.map(x=>x.label+' ('+x.operation.toLowerCase()+')').join('; ')}</p>:null}
    <p><strong>Total modifier:</strong> {modifierLabel(row.modifierTotal)}</p>
  </div>;
}
function Result({row}){
  const result=row.result;
  if(!result)return null;
  const final=row.gmOutcome||result.outcome;
  const dice=row.dice?.second!=null?row.dice.first+' / '+row.dice.second+' → '+row.dice.die:row.dice?.die;
  return <div role="status">
    <p><strong>{final}</strong> — {row.mode==='digital'?'Server digital dice':row.mode==='physical'?'Player-reported physical dice':'Player-reported outcome'}
      {dice!=null?' ('+dice+')':''}{result.total!=null?' · Total '+result.total:''}
      {row.gmOutcome?<span> · GM override: {row.gmOverrideReason}</span>:null}
    </p>
    {row.groupId?<p>Group: {row.groupOutcome?row.groupOutcome.outcome+(row.groupOutcome.winnerId?' · Winning request: '+row.groupOutcome.winnerId:''):'Awaiting other participants'}</p>:null}
  </div>;
}
export function GMUniversalCheckManager({campaignId,characters={}}){
  const rows=useRequests(campaignId,true),{send,busy,error}=useAction(campaignId);
  const [characterIds,setCharacterIds]=useState([]),[type,setType]=useState('skill'),
    [skill,setSkill]=useState(''),[characteristic,setCharacteristic]=useState(''),
    [rankOverride,setRankOverride]=useState(''),[dc,setDc]=useState(15),
    [description,setDescription]=useState(''),[npcName,setNpcName]=useState(''),
    [modifier,setModifier]=useState(0),[advantage,setAdvantage]=useState(false),
    [disadvantage,setDisadvantage]=useState(false),[requiredSuccesses,setRequiredSuccesses]=useState(''),
    [overrideReasons,setOverrideReasons]=useState({});
  const roster=Object.entries(characters).filter(([,character])=>character?.ownerUid);
  const multi=type==='group'||type==='opposed';
  const chosen=characterIds.filter(id=>roster.some(([key])=>key===id));
  const submit=async event=>{
    event.preventDefault();
    const chosenIds=multi?chosen:chosen.slice(0,1);
    const result=await send({action:'create',type,characterId:chosenIds[0],
      ...(multi?{characterIds:chosenIds}:{}),skill,characteristic,rankOverride,
      dc:type==='opposed'?0:Number(dc),description,npcName,requiredSuccesses:requiredSuccesses===''?0:Number(requiredSuccesses),
      modifiers:[{label:'Situational modifier',value:Number(modifier)}],advantage,disadvantage});
    if(result){setDescription('');setModifier(0);}
  };
  return <section className="react-panel" aria-label="Universal check manager">
    <h3>Universal Check Requests</h3>
    <form onSubmit={submit}>
      <label>Check type <select value={type} onChange={event=>{setType(event.target.value);setCharacterIds([]);}}>
        {UNIVERSAL_CHECK_TYPES.map(value=><option key={value} value={value}>{value}</option>)}
      </select></label>
      <fieldset><legend>{multi?'Choose participants':'Choose a player character'}</legend>
        {roster.map(([id,character])=><label key={id} style={{display:'block'}}>
          <input type={multi?'checkbox':'radio'} name="check-participant" checked={chosen.includes(id)}
            onChange={event=>setCharacterIds(previous=>multi?
              event.target.checked?[...previous.filter(value=>value!==id),id]:previous.filter(value=>value!==id):[id])}/>
          {character.name||id}
        </label>)}
      </fieldset>
      <label>Skill or check name <input value={skill} onChange={event=>setSkill(event.target.value)} required={type!=='characteristic'&&type!=='saving'}/></label>
      <label>Governing characteristic <select value={characteristic} required onChange={event=>setCharacteristic(event.target.value)}>
        <option value="">Choose a characteristic</option>
        {UNIVERSAL_CHARACTERISTICS.map(value=><option key={value} value={value}>{value}</option>)}
      </select></label>
      <label>Legacy skill rank conversion, if required <select value={rankOverride} onChange={event=>setRankOverride(event.target.value)}>
        <option value="">Use character's approved named rank</option>
        {Object.keys(UNIVERSAL_CHECK_RANKS).map(value=><option key={value}>{value}</option>)}
      </select></label>
      {type!=='opposed'?<label>Difficulty Class <input type="number" min="0" max="1000" required value={dc} onChange={event=>setDc(event.target.value)}/></label>
        :<p>Opposed checks compare both participants' totals. Exact ties remain tied.</p>}
      {type==='group'?<label>Successes required (blank = majority) <input type="number" min="1" max={chosen.length||10}
        value={requiredSuccesses} onChange={event=>setRequiredSuccesses(event.target.value)}/></label>:null}
      <label>Situational modifier <input type="number" min="-100" max="100" required value={modifier} onChange={event=>setModifier(event.target.value)}/></label>
      <label><input type="checkbox" checked={advantage} onChange={event=>setAdvantage(event.target.checked)}/> GM advantage</label>
      <label><input type="checkbox" checked={disadvantage} onChange={event=>setDisadvantage(event.target.checked)}/> GM disadvantage</label>
      <label>NPC (optional) <input value={npcName} onChange={event=>setNpcName(event.target.value)}/></label>
      <label>Instructions <textarea value={description} onChange={event=>setDescription(event.target.value)}/></label>
      <button disabled={busy||!characteristic||(multi?chosen.length<(type==='opposed'?2:2)||type==='opposed'&&chosen.length!==2:chosen.length!==1)}>
        {busy?'Submitting…':'Send Check Request'}
      </button>
    </form>
    {error?<p role="alert">{error}</p>:null}
    <h4>Request history ({rows.length})</h4>
    {!rows.length?<p>No check requests yet.</p>:null}
    {rows.map(row=><article key={row.id} className="react-panel">
      <h5>{row.characterName} — {row.skill||row.characteristic}</h5>
      <p>{row.type} {row.dc!=null?'· DC '+row.dc:''} · {row.status} · Attempt {row.attempt}
        {timestamp(row.createdAt)?' · '+timestamp(row.createdAt):''}</p>
      {sourceLabel(row)?<p><b>Interaction:</b> {sourceLabel(row)}</p>:null}
      {row.description?<p>{row.description}</p>:null}
      <details><summary>Frozen modifiers</summary><Breakdown row={row}/></details>
      <Result row={row}/>
      {row.status==='pending'?<>
        <button type="button" disabled={busy} onClick={()=>send({action:'resend',requestId:row.id})}>Resend notification</button>
        <button type="button" disabled={busy} onClick={()=>send({action:'cancel',requestId:row.id})}>Cancel{row.groupId?' group':''}</button>
      </>:null}
      {row.status==='submitted'?<button type="button" disabled={busy} onClick={()=>send({action:'acknowledge',requestId:row.id})}>Acknowledge</button>:null}
      {['submitted','acknowledged'].includes(row.status)?<>
        <button type="button" disabled={busy} onClick={()=>send({action:'reroll',requestId:row.id})}>Request reroll{row.groupId?' for group':''}</button>
        <label>Override reason <input value={overrideReasons[row.id]||''}
          onChange={event=>setOverrideReasons(previous=>({...previous,[row.id]:event.target.value}))}/></label>
        <button type="button" disabled={busy||(overrideReasons[row.id]||'').trim().length<3}
          onClick={()=>send({action:'override',requestId:row.id,outcome:'success',reason:overrideReasons[row.id]})}>Override success</button>
        <button type="button" disabled={busy||(overrideReasons[row.id]||'').trim().length<3}
          onClick={()=>send({action:'override',requestId:row.id,outcome:'failure',reason:overrideReasons[row.id]})}>Override failure</button>
      </>:null}
      {(row.history||[]).length?<details><summary>Previous attempts ({row.history.length})</summary>
        <ul>{row.history.map((entry,index)=><li key={index}>Attempt {entry.attempt}: {entry.result?.outcome||'Not submitted'} · {entry.mode||'No dice'} · {entry.result?.total??'Unreported total'}</li>)}</ul>
      </details>:null}
    </article>)}
  </section>;
}
export function GMUniversalCheckNotification({campaignId,onOpen}){
  const rows=useRequests(campaignId,true);
  const previous=useRef(null);
  const [newResults,setNewResults]=useState([]);
  useEffect(()=>{previous.current=null;setNewResults([]);},[campaignId]);
  useEffect(()=>{
    const state=new Map(rows.map(row=>[row.id,row.status+':'+row.attempt]));
    if(previous.current){
      const incoming=rows.filter(row=>row.status==='submitted'&&previous.current.get(row.id)!==row.status+':'+row.attempt);
      if(incoming.length)setNewResults(old=>[...incoming.map(row=>row.id),...old].slice(0,20));
    }
    previous.current=state;
  },[rows]);
  const selected=rows.filter(row=>newResults.includes(row.id));
  if(!selected.length)return null;
  return <aside className="react-panel" role="status" aria-label="New universal check results">
    <strong>New player check results ({selected.length})</strong>
    <ul>{selected.map(row=><li key={row.id}>{row.characterName}: {row.skill||row.characteristic} — {row.result?.outcome||'submitted'}
      <button type="button" onClick={()=>setNewResults(previous=>previous.filter(id=>id!==row.id))}>Dismiss</button></li>)}</ul>
    {onOpen?<button type="button" onClick={onOpen}>Open check manager</button>:null}
  </aside>;
}
export function PlayerUniversalCheckPopup({campaignId,characterId}){
  const rows=useRequests(campaignId,false).filter(row=>row.characterId===characterId);
  const {send,busy,error}=useAction(campaignId);
  const [first,setFirst]=useState(''),[second,setSecond]=useState(''),[reported,setReported]=useState('success');
  const [hidden,setHidden]=useState([]),[showHistory,setShowHistory]=useState(false);
  const pending=rows.filter(row=>row.status==='pending');
  const row=pending.find(item=>!hidden.includes(item.id+':'+item.attempt+':'+item.notificationRevision));
  const hasDouble=row?.advantage||row?.disadvantage;
  const submit=async data=>{
    const result=await send({action:'submit',requestId:row.id,...data});
    if(result){setFirst('');setSecond('');}
  };
  return <section aria-label="Player check requests">
    {pending.length?<button type="button" onClick={()=>setHidden([])}>Pending GM check requests: {pending.length}</button>:null}
    <button type="button" onClick={()=>setShowHistory(!showHistory)}>Check history ({rows.length})</button>
    {showHistory?<div className="react-panel">
      <h4>My Check History</h4>
      {rows.map(entry=><article key={entry.id}><strong>{entry.skill||entry.characteristic}</strong> · {entry.status} · Attempt {entry.attempt}
        {sourceLabel(entry)?' · '+sourceLabel(entry):''}
        {entry.dc!=null?' · DC '+entry.dc:''}
        <Result row={entry}/>
      </article>)}
    </div>:null}
    {row?<div role="dialog" aria-modal="true" aria-label="GM check request" className="react-panel">
      <h3>GM Check Request</h3>
      {sourceLabel(row)?<p><strong>Interaction:</strong> {sourceLabel(row)}</p>:null}
      <p>{row.description}</p>
      <p>{row.npcName?row.npcName+' — ':''}{row.type}: {row.skill||row.characteristic}
        {row.dc!=null?', DC '+row.dc:', opposed total'} · Attempt {row.attempt}</p>
      <Breakdown row={row}/>
      <button type="button" disabled={busy} onClick={()=>submit({mode:'digital'})}>Roll digital dice (server)</button>
      <fieldset><legend>Physical dice — player-reported</legend>
        <label>First d20 <input type="number" min="1" max="20" value={first} onChange={event=>setFirst(event.target.value)}/></label>
        {hasDouble?<label>Second d20 <input type="number" min="1" max="20" value={second} onChange={event=>setSecond(event.target.value)}/></label>:null}
        <button type="button" disabled={busy||!Number.isInteger(Number(first))||Number(first)<1||Number(first)>20||
          hasDouble&&(!Number.isInteger(Number(second))||Number(second)<1||Number(second)>20)}
          onClick={()=>submit({mode:'physical',die:Number(first),...(hasDouble?{secondDie:Number(second)}:{})})}>
          Submit physical roll
        </button>
      </fieldset>
      {row.type!=='opposed'?<label>Manual outcome
        <select value={reported} onChange={event=>setReported(event.target.value)}>
          <option value="success">Success</option><option value="failure">Failure</option>
        </select>
        <button type="button" disabled={busy} onClick={()=>submit({mode:'manual',reported})}>Self-report result</button>
      </label>:null}
      <button type="button" onClick={()=>setHidden(previous=>[...previous,row.id+':'+row.attempt+':'+row.notificationRevision])}>Dismiss popup (keep pending)</button>
      {error?<p role="alert">{error}</p>:null}
    </div>:null}
  </section>;
}
