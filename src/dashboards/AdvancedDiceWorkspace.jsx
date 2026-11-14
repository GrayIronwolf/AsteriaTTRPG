import React,{useEffect,useRef,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {
  DICE_SIDES,MAX_DICE_GROUPS,MAX_DICE_PER_ROLL,MAX_DICE_HISTORY,
  MAX_DICE_PRESETS,diceConfig,diceExpression
} from '../state/diceRollModel.mjs';
import '../styles/advanced-dice.css';

const EMPTY={pool:[{count:1,sides:20}],modifier:0,label:''};
const visibleTime=timestamp=>Number.isFinite(Number(timestamp))?
  new Date(Number(timestamp)).toLocaleString():'';
const signed=value=>Number(value)>=0?'+'+value:String(value);
const readFailure=error=>error?.message||'Unable to complete the dice action.';
export function AdvancedDiceWorkspace({role='player'}){
  const [workspace,setWorkspace]=useState({presets:[],history:[]});
  const [config,setConfig]=useState(EMPTY),[presetName,setPresetName]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [notice,setNotice]=useState(''),[showHistory,setShowHistory]=useState(true);
  const lastRequest=useRef(null);
  useEffect(()=>{
    setWorkspace({presets:[],history:[]});setError('');setNotice('');
    try{return firebaseService.subscribeDiceWorkspace(value=>
      setWorkspace({presets:Array.isArray(value?.presets)?value.presets:[],
        history:Array.isArray(value?.history)?value.history:[]}));}
    catch(err){setError(readFailure(err));return undefined;}
  },[]);
  const setGroup=(index,key,value)=>setConfig(previous=>({
    ...previous,pool:previous.pool.map((row,i)=>i===index?{...row,[key]:Number(value)}:row)
  }));
  const replaceConfig=value=>{
    setConfig({pool:value.pool.map(row=>({...row})),modifier:value.modifier,label:value.label});
    setError('');setNotice('Preset loaded. Roll when ready.');
  };
  const execute=async(input,success)=>{
    if(busy)return null;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await firebaseService.advancedDiceAction(input);
      if(!response?.ok)throw Error(response?.error||'The dice action could not be saved.');
      setNotice(success||'Changes saved.');
      return response;
    }catch(err){setError(readFailure(err));return null;}
    finally{setBusy(false);}
  };
  const roll=async()=>{
    let checked;
    try{checked=diceConfig(config);}catch(err){setError(readFailure(err));return;}
    // Preserve the request ID after a transient network failure to prevent
    // an ambiguous retry from creating a second roll on the server.
    const fingerprint=JSON.stringify(checked);
    if(lastRequest.current?.fingerprint!==fingerprint)
      lastRequest.current={fingerprint,requestId:crypto.randomUUID()};
    const response=await execute({action:'roll',...checked,requestId:lastRequest.current.requestId},
      'Digital roll recorded in your private history.');
    if(response?.ok)lastRequest.current=null;
  };
  const savePreset=async()=>{
    let checked;
    try{checked=diceConfig(config);}catch(err){setError(readFailure(err));return;}
    const name=presetName.trim();
    if(!name||name.length>60){setError('Enter a preset name of 1–60 characters.');return;}
    const matching=(workspace.presets||[]).find(row=>row.name.toLowerCase()===name.toLowerCase());
    const result=await execute({action:'save-preset',preset:{
      id:matching?.id||crypto.randomUUID(),name,...checked
    }},'Saved dice preset: '+name);
    if(result?.ok)setPresetName('');
  };
  const deletePreset=async preset=>{
    await execute({action:'delete-preset',presetId:preset.id},'Preset removed.');
  };
  const clear=async()=>{
    if(!window.confirm('Permanently clear your private dice roll history? Saved presets will remain.'))return;
    await execute({action:'clear-history',confirmed:true},'Private dice history cleared.');
  };
  let expression='',validation='';
  try{expression=diceExpression(config);}catch(err){validation=readFailure(err);}
  const totalDice=config.pool.reduce((total,row)=>total+(Number(row.count)||0),0);
  const latest=workspace.history?.[0];
  return <section className={'asteria-advanced-dice asteria-advanced-dice--'+role} aria-label="Advanced Dice Roller">
    <header className="asteria-advanced-dice-heading">
      <div><h2>Advanced Dice Roller</h2>
        <p>Independent dice rolls for the GM and players. These do not spend AP, replace Universal Check Requests, or change combat results.</p></div>
      <span>Private account history</span>
    </header>
    <div className="asteria-advanced-dice-grid">
      <div className="asteria-advanced-dice-editor">
        <h3>Build a roll</h3>
        <div className="asteria-advanced-dice-pools">
          {config.pool.map((group,index)=><div className="asteria-advanced-dice-pool" key={index}>
            <label>Number of dice<input type="number" min="1" max={MAX_DICE_PER_ROLL} step="1"
              value={group.count} onChange={event=>setGroup(index,'count',event.target.value)}/></label>
            <label>Die type<select value={group.sides}
              onChange={event=>setGroup(index,'sides',event.target.value)}>
              {DICE_SIDES.map(sides=><option key={sides} value={sides}>d{sides}</option>)}
            </select></label>
            <button type="button" disabled={busy||config.pool.length===1}
              onClick={()=>setConfig(old=>({...old,pool:old.pool.filter((_,i)=>i!==index)}))}
              aria-label={'Remove dice group '+(index+1)}>Remove</button>
          </div>)}
        </div>
        <div className="asteria-advanced-dice-actions">
          <button type="button" disabled={busy||config.pool.length>=MAX_DICE_GROUPS||totalDice>=MAX_DICE_PER_ROLL}
            onClick={()=>setConfig(old=>({...old,pool:[...old.pool,{count:1,sides:6}]}))}>Add dice group</button>
          <button type="button" disabled={busy}
            onClick={()=>{setConfig(EMPTY);setError('');setNotice('Roll builder reset.');}}>Reset builder</button>
        </div>
        <div className="asteria-advanced-dice-fields">
          <label>Modifier<input type="number" step="1" min="-999" max="999"
            value={config.modifier} onChange={e=>setConfig(old=>({...old,modifier:Number(e.target.value)}))}/></label>
          <label>Roll label<input maxLength={80} value={config.label}
            onChange={e=>setConfig(old=>({...old,label:e.target.value}))}
            placeholder="e.g. Falling boulders"/></label>
        </div>
        <div className="asteria-advanced-dice-expression">
          <span>Dice expression</span><strong>{validation||expression}</strong>
          <small>{totalDice}/{MAX_DICE_PER_ROLL} dice · {config.pool.length}/{MAX_DICE_GROUPS} groups</small>
        </div>
        <button type="button" className="asteria-advanced-dice-primary" disabled={busy||Boolean(validation)}
          onClick={roll}>{busy?'Saving roll…':'Roll digital dice'}</button>
        <p className="asteria-advanced-dice-help">Digital results are generated and saved by the Firebase server. Rolls reported from physical dice are handled separately through Universal Check Requests.</p>
        <section className="asteria-advanced-dice-presets" aria-label="Saved dice presets">
          <h3>Saved presets ({workspace.presets.length}/{MAX_DICE_PRESETS})</h3>
          <div className="asteria-advanced-dice-preset-save">
            <label>Preset name<input maxLength={60} value={presetName}
              onChange={event=>setPresetName(event.target.value)}
              placeholder="Save this dice combination"/></label>
            <button type="button" disabled={busy||Boolean(validation)||!presetName.trim()||
              (workspace.presets.length>=MAX_DICE_PRESETS&&!workspace.presets.some(p=>p.name.toLowerCase()===presetName.trim().toLowerCase()))}
              onClick={savePreset}>Save preset</button>
          </div>
          <ul>{workspace.presets.map(preset=><li key={preset.id}>
            <span><b>{preset.name}</b><small>{diceExpression(preset)}</small></span>
            <button type="button" disabled={busy} onClick={()=>replaceConfig(preset)}>Load</button>
            <button type="button" disabled={busy} onClick={()=>deletePreset(preset)}
              aria-label={'Remove '+preset.name}>Remove</button>
          </li>)}</ul>
          {!workspace.presets.length?<p>No saved presets yet.</p>:null}
        </section>
      </div>
      <div className="asteria-advanced-dice-record">
        <h3>Last roll</h3>
        {latest?<article className="asteria-advanced-dice-latest" aria-live="polite">
          <strong className="asteria-advanced-dice-total">{latest.total}</strong>
          <b>{latest.label||latest.expression}</b>
          <p>{latest.expression} · subtotal {latest.subtotal} · modifier {signed(latest.modifier)}</p>
          {latest.natural?<p>{latest.natural==='natural-20'?'Natural 20':'Natural 1'}</p>:null}
          <div className="asteria-advanced-dice-faces">
            {latest.results.map((group,index)=><p key={index}>d{group.sides}: {group.faces.join(', ')} = {group.sum}</p>)}
          </div>
          <small>{visibleTime(latest.at)} · Server digital dice</small>
        </article>:<p>Roll digital dice to see your result.</p>}
        <section className="asteria-advanced-dice-history" aria-label="Private dice history">
          <div className="asteria-advanced-dice-history-heading">
            <h3>Roll history ({workspace.history.length}/{MAX_DICE_HISTORY})</h3>
            <button type="button" onClick={()=>setShowHistory(!showHistory)}>
              {showHistory?'Hide history':'Show history'}</button>
          </div>
          {showHistory?<ol>{workspace.history.map(row=><li key={row.id}>
            <div><b>{row.label||row.expression}</b><small>{visibleTime(row.at)}</small></div>
            <span>{row.expression}</span><strong>{row.total}</strong>
          </li>)}</ol>:null}
          {!workspace.history.length?<p>No saved rolls yet.</p>:null}
          {workspace.history.length?<button type="button" disabled={busy}
            onClick={clear}>Clear roll history</button>:null}
        </section>
      </div>
    </div>
    {error?<p className="asteria-advanced-dice-message" role="alert">{error}</p>:null}
    {notice?<p className="asteria-advanced-dice-message" role="status">{notice}</p>:null}
  </section>;
}
