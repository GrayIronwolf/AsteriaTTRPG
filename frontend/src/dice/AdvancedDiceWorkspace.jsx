import React,{useEffect,useState,useRef} from 'react';
import {
  DICE_SIDES,MAX_DICE_PER_ROLL,MAX_DICE_GROUPS,MAX_DICE_PRESETS,MAX_DICE_HISTORY,
  diceConfig,diceExpression
} from '../../../src/state/diceRollModel.mjs';
import styles from './AdvancedDiceWorkspace.module.css';

const fresh=()=>({pool:[{count:1,sides:20}],modifier:0,label:''});
export function AdvancedDiceWorkspace({api,role='player'}){
  const [config,setConfig]=useState(fresh),[workspace,setWorkspace]=useState({presets:[],history:[]}),
    [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),
    [presetName,setPresetName]=useState(''),[showHistory,setShowHistory]=useState(true);
  const pending=useRef(null);
  useEffect(()=>{
    setError('');setNotice('');setWorkspace({presets:[],history:[]});
    if(!api?.availability().enabled)return undefined;
    return api.watch(setWorkspace,err=>setError(err?.message||'Dice history unavailable.'));
  },[api]);
  const setGroup=(index,key,value)=>setConfig(old=>({...old,pool:old.pool.map((group,i)=>
    i===index?{...group,[key]:Number(value)}:group)}));
  const perform=async(input,label)=>{
    if(busy)return null;
    setBusy(true);setError('');setNotice('');
    try{const response=await api.action(input);setNotice(label);return response;}
    catch(e){setError(e?.message||'Dice action rejected.');return null;}
    finally{setBusy(false);}
  };
  const check=()=>{try{return diceConfig(config);}catch(e){setError(e.message);return null;}};
  const roll=async()=>{
    const checked=check();if(!checked)return;
    const fingerprint=JSON.stringify(checked);
    if(pending.current?.fingerprint!==fingerprint)
      pending.current={fingerprint,id:crypto.randomUUID()};
    const result=await perform({action:'roll',...checked,requestId:pending.current.id},
      'Digital roll saved in private history.');
    if(result?.ok)pending.current=null;
  };
  const save=async()=>{
    const checked=check();if(!checked)return;
    const name=presetName.trim();
    if(!name||name.length>60){setError('Enter a preset name up to 60 characters.');return;}
    const matching=workspace.presets.find(x=>x.name.toLowerCase()===name.toLowerCase());
    const result=await perform({action:'save-preset',preset:{
      id:matching?.id||crypto.randomUUID(),name,...checked
    }},'Dice preset saved.');
    if(result?.ok)setPresetName('');
  };
  let expression='',validation='';
  try{expression=diceExpression(config);}catch(e){validation=e.message;}
  const total=config.pool.reduce((n,g)=>n+g.count,0);
  const latest=workspace.history?.[0];
  return <section className={styles.workspace} aria-label="Advanced Dice Roller"
    data-testid="site-advanced-dice" data-role={role}>
    <header><h2>Advanced Dice Roller</h2>
      <p>Digital dice results are generated and saved by Firebase. Dice rolled here do not automatically resolve combat or Universal Check Requests.</p></header>
    <div className={styles.columns}>
      <section className={styles.editor}>
        <h3>Build a roll</h3>
        {config.pool.map((group,index)=><div className={styles.pool} key={index}>
          <label>Number of dice<input type="number" min="1" max={MAX_DICE_PER_ROLL}
            value={group.count} onChange={e=>setGroup(index,'count',e.target.value)}/></label>
          <label>Die type<select value={group.sides}
            onChange={e=>setGroup(index,'sides',e.target.value)}>
            {DICE_SIDES.map(sides=><option value={sides} key={sides}>d{sides}</option>)}
          </select></label>
          <button disabled={busy||config.pool.length===1} onClick={()=>
            setConfig(old=>({...old,pool:old.pool.filter((_,i)=>i!==index)}))}>Remove</button>
        </div>)}
        <div className={styles.buttons}>
          <button disabled={busy||config.pool.length>=MAX_DICE_GROUPS||total>=MAX_DICE_PER_ROLL}
            onClick={()=>setConfig(old=>({...old,pool:[...old.pool,{count:1,sides:6}]}))}>
            Add dice group</button>
          <button disabled={busy} onClick={()=>{setConfig(fresh());setError('');}}>Reset builder</button>
        </div>
        <div className={styles.pool}>
          <label>Modifier<input type="number" min="-999" max="999" step="1"
            value={config.modifier} onChange={e=>setConfig(old=>({...old,modifier:Number(e.target.value)}))}/></label>
          <label>Roll label<input value={config.label} maxLength="80"
            onChange={e=>setConfig(old=>({...old,label:e.target.value}))}/></label>
        </div>
        <div className={styles.expression}><span>Dice expression</span>
          <strong>{validation||expression}</strong><small>{total}/{MAX_DICE_PER_ROLL} dice</small></div>
        <button className={styles.primary} onClick={roll} disabled={busy||!!validation}>
          {busy?'Saving roll…':'Roll digital dice'}</button>
        <section className={styles.presets}>
          <h3>Saved presets ({workspace.presets.length}/{MAX_DICE_PRESETS})</h3>
          <label>Preset name<input value={presetName} maxLength="60"
            onChange={e=>setPresetName(e.target.value)}/></label>
          <button disabled={busy||!presetName.trim()||!!validation} onClick={save}>Save preset</button>
          {workspace.presets.map(preset=><div className={styles.preset} key={preset.id}>
            <strong>{preset.name}</strong><small>{diceExpression(preset)}</small>
            <button disabled={busy} onClick={()=>setConfig({pool:preset.pool.map(x=>({...x})),
              modifier:preset.modifier,label:preset.label})}>Load</button>
            <button disabled={busy} onClick={()=>perform({action:'delete-preset',presetId:preset.id},
              'Dice preset deleted.')}>Delete</button>
          </div>)}
        </section>
      </section>
      <section className={styles.record} aria-live="polite">
        <h3>Last roll</h3>
        {latest?<><strong className={styles.result}>{latest.total}</strong>
          <p>{latest.label||latest.expression}</p>
          <p>{latest.expression} · Subtotal {latest.subtotal} · Modifier {latest.modifier}</p>
          {latest.natural?<p>{latest.natural==='natural-20'?'Natural 20':'Natural 1'}</p>:null}
          {latest.results?.map((group,i)=><p key={i}>d{group.sides}: {group.faces.join(', ')} = {group.sum}</p>)}
        </>:<p>No rolls recorded yet.</p>}
        <h3>Private roll history ({workspace.history.length}/{MAX_DICE_HISTORY})</h3>
        <button onClick={()=>setShowHistory(value=>!value)}>
          {showHistory?'Hide history':'Show history'}</button>
        {showHistory?<ul>{workspace.history.map(row=><li key={row.id}>
          <strong>{row.total}</strong> · {row.label||row.expression} · {new Date(row.at).toLocaleString()}
        </li>)}</ul>:null}
        <button disabled={busy||!workspace.history.length} onClick={()=>{
          if(window.confirm('Clear your private dice roll history?'))perform({action:'clear-history',
            confirmed:true},'Private dice history cleared.');
        }}>Clear history</button>
      </section>
    </div>
    {error?<p role="alert">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
  </section>;
}
