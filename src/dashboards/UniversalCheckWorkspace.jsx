import React,{useEffect,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {UNIVERSAL_CHECK_TYPES} from '../state/universalCheckModel.mjs';
function useRequests(campaignId,gm){
  const [rows,setRows]=useState([]);
  useEffect(()=>{if(!campaignId)return;return firebaseService.subscribeUniversalChecks(campaignId,setRows,{gm});},[campaignId,gm]);
  return rows;
}
function useAction(campaignId){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const send=async data=>{
    setBusy(true);setError('');
    try{const result=await firebaseService.universalCheckAction({campaignId,...data});
      if(!result?.ok)throw Error(result?.error||'Check action failed.');return result;
    }catch(e){setError(e.message);return null;}finally{setBusy(false);}
  };
  return {send,busy,error};
}
export function GMUniversalCheckManager({campaignId,characters={}}){
  const rows=useRequests(campaignId,true),{send,busy,error}=useAction(campaignId);
  const [characterId,setCharacterId]=useState(''),[type,setType]=useState('skill'),
    [skill,setSkill]=useState(''),[dc,setDc]=useState(15),[description,setDescription]=useState(''),
    [npcName,setNpcName]=useState(''),[modifier,setModifier]=useState(0);
  const roster=Object.entries(characters).filter(([,c])=>c?.ownerUid);
  return <section className="react-panel" aria-label="Universal check manager">
    <h3>Request Check</h3>
    <form onSubmit={async e=>{e.preventDefault();await send({action:'create',characterId,type,skill,dc:Number(dc),description,npcName,
      modifiers:[{label:'GM situational modifier',value:Number(modifier)}]});}}>
      <label>Character<select value={characterId} onChange={e=>setCharacterId(e.target.value)} required>
        <option value="">Select player</option>{roster.map(([id,c])=><option key={id} value={id}>{c.name||id}</option>)}</select></label>
      <label>Type<select value={type} onChange={e=>setType(e.target.value)}>{UNIVERSAL_CHECK_TYPES.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label>Skill or characteristic<input value={skill} onChange={e=>setSkill(e.target.value)} required/></label>
      <label>DC<input type="number" min="0" max="1000" value={dc} onChange={e=>setDc(e.target.value)}/></label>
      <label>Situational modifier<input type="number" min="-100" max="100" value={modifier} onChange={e=>setModifier(e.target.value)}/></label>
      <label>NPC (optional)<input value={npcName} onChange={e=>setNpcName(e.target.value)}/></label>
      <label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <button disabled={busy||!characterId}>Send Check Request</button>
    </form>
    {error?<p role="alert">{error}</p>:null}
    <h4>Check Request History</h4>
    {rows.map(row=><div key={row.id} className="react-panel">
      <strong>{row.characterName} — {row.skill}</strong> DC {row.dc} — {row.status}
      {row.result?<p>{row.result.outcome} ({row.mode}) — {row.result.total??'self-reported'}</p>:null}
      {row.status==='pending'?<><button disabled={busy} onClick={()=>send({action:'resend',requestId:row.id})}>Resend</button>
        <button disabled={busy} onClick={()=>send({action:'cancel',requestId:row.id})}>Cancel</button></>:null}
      {row.status==='submitted'?<button disabled={busy} onClick={()=>send({action:'acknowledge',requestId:row.id})}>Acknowledge</button>:null}
      {['submitted','acknowledged'].includes(row.status)?<>
        <button disabled={busy} onClick={()=>send({action:'reroll',requestId:row.id})}>Request Reroll</button>
        <button disabled={busy} onClick={()=>send({action:'override',requestId:row.id,outcome:'success',reason:'GM decision'})}>Override Success</button>
        <button disabled={busy} onClick={()=>send({action:'override',requestId:row.id,outcome:'failure',reason:'GM decision'})}>Override Failure</button></>:null}
    </div>)}
  </section>;
}
export function PlayerUniversalCheckPopup({campaignId,characterId}){
  const rows=useRequests(campaignId,false),{send,busy,error}=useAction(campaignId);
  const [die,setDie]=useState(''),[reported,setReported]=useState('success');
  const row=rows.find(r=>r.characterId===characterId&&r.status==='pending');
  if(!row)return null;
  return <div role="dialog" aria-modal="true" aria-label="GM check request" className="react-panel">
    <h3>GM Check Request</h3>
    <p>{row.description}</p><p>{row.npcName?row.npcName+' — ':''}{row.type}: {row.skill}, DC {row.dc}, 1d20</p>
    <ul>{(row.modifiers||[]).map((m,i)=><li key={i}>{m.label}: {m.value>=0?'+':''}{m.value}</li>)}</ul>
    <p>Total modifier: {row.modifierTotal>=0?'+':''}{row.modifierTotal}</p>
    <button disabled={busy} onClick={()=>send({action:'submit',requestId:row.id,mode:'digital'})}>Roll Digital Dice</button>
    <label>Physical d20<input type="number" min="1" max="20" value={die} onChange={e=>setDie(e.target.value)}/></label>
    <button disabled={busy||!die} onClick={()=>send({action:'submit',requestId:row.id,mode:'physical',die:Number(die)})}>Submit Physical Roll</button>
    <label>Manual result<select value={reported} onChange={e=>setReported(e.target.value)}>
      <option value="success">Success</option><option value="failure">Failure</option></select></label>
    <button disabled={busy} onClick={()=>send({action:'submit',requestId:row.id,mode:'manual',reported})}>Self-report Result</button>
    {error?<p role="alert">{error}</p>:null}
  </div>;
}
