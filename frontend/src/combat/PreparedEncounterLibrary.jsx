import React,{useEffect,useState} from 'react';
import {customEnemy,libraryEnemy} from './combatModel.mjs';
import {
  validatePreparedEncounterInput,normalizePreparedEnemy,
  PREPARED_ENCOUNTER_MAX_ENEMIES,PREPARED_ENCOUNTER_MAX_PLANS
} from '../../../src/state/preparedEncounterModel.mjs';
import styles from './PreparedEncounterLibrary.module.css';

const blank={name:'',notes:'',mapId:'',enemies:[]};
const enemyBlank={name:'',type:'Creature',hp:'20',sp:'',mp:'',xpReward:'0',ac:'',initiative:''};
const draftFrom=plan=>plan?{
  name:plan.name,notes:plan.notes||'',mapId:plan.mapId||'',
  enemies:plan.enemies.map(row=>({...row}))
}:({...blank,enemies:[]});
const displayHP=row=>Array.isArray(row.hp)?row.hp[1]:row.hp||0;

/** GM-specific private template storage via the existing combat adapter. */
export function PreparedEncounterLibrary({
  api,campaignId,combat,plans=[],maps=[],library=[],onLoaded
}){
  const [editId,setEditId]=useState(''),[revision,setRevision]=useState(0);
  const [draft,setDraft]=useState(draftFrom(null)),[enemy,setEnemy]=useState(enemyBlank);
  const [sourceId,setSourceId]=useState(''),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{
    setEditId('');setRevision(0);setDraft(draftFrom(null));
    setError('');setMessage('');
  },[campaignId]);
  const reset=()=>{
    setEditId('');setRevision(0);setDraft(draftFrom(null));setError('');
  };
  const loadEditor=plan=>{
    setEditId(plan.id);setRevision(plan.revision);setDraft(draftFrom(plan));
    setError('');setMessage('');
  };
  const addEnemy=row=>{
    setDraft(previous=>({...previous,
      enemies:previous.enemies.length>=PREPARED_ENCOUNTER_MAX_ENEMIES?
        previous.enemies:[...previous.enemies,row]
    }));
  };
  const addCustom=()=>{
    try{
      const values={...enemy};
      for(const key of ['hp','sp','mp','xpReward','ac','initiative'])
        if(values[key]!=='')values[key]=Number(values[key]);
      const next=customEnemy(values,'enemy-draft');
      const clean=normalizePreparedEnemy(next);
      if(!clean)throw Error('Invalid enemy statistics.');
      addEnemy(clean);setEnemy(enemyBlank);setError('');
    }catch(failure){setError(failure.message);}
  };
  const addSource=()=>{
    try{
      const source=library.find(row=>row.id===sourceId);
      if(!source)throw Error('Choose a campaign creature or NPC.');
      const next=libraryEnemy({...source,id:source.sourceId},'enemy-source');
      const clean=normalizePreparedEnemy(next);
      if(!clean)throw Error('Source has no usable HP.');
      addEnemy(clean);setError('');
    }catch(failure){setError(failure.message);}
  };
  const run=async(action,plan)=>{
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      if(action==='save'){
        const payload=validatePreparedEncounterInput(draft);
        const id=editId||'prepared-'+crypto.randomUUID();
        await api.savePrepared(campaignId,{id,...payload},revision);
        reset();setMessage('Prepared encounter saved to this campaign.');
      }else if(action==='delete'){
        if(!window.confirm('Delete this prepared encounter? This does not change live combat.'))return;
        await api.deletePrepared(campaignId,plan,plan.revision);
        if(editId===plan.id)reset();
        setMessage('Prepared encounter deleted.');
      }else if(action==='load'){
        if(combat?.isActive||combat?.status==='active')
          throw Error('End active combat before loading another encounter.');
        if(!window.confirm('Load '+plan.name+'? This replaces staged enemies but keeps linked players.'))return;
        await api.loadPrepared(campaignId,plan.id,combat.revision);
        setMessage('Prepared encounter loaded into the Combat Command Centre.');
        onLoaded?.(plan);
      }
    }catch(failure){setError(failure?.message||'The encounter could not be updated.');}
    finally{setBusy(false);}
  };
  const canEdit=!combat?.isActive&&combat?.sessionEditable!==false;
  return <section className={styles.library} data-testid="site-prepared-encounter-library">
    <header className={styles.top}>
      <div><h3>Prepared Encounters</h3>
        <p>Build encounters before your session. Saved privately for the campaign GM.</p></div>
      <button type="button" disabled={busy} onClick={reset}>New Encounter</button>
    </header>
    <div className={styles.saved} aria-label="Saved prepared encounters">
      <strong>Encounter Library ({plans.length}/{PREPARED_ENCOUNTER_MAX_PLANS})</strong>
      {plans.length?plans.map(plan=><article key={plan.id}>
        <div><strong>{plan.name}</strong>
          <small>{plan.enemies.length} enemies · {maps.find(m=>m.id===plan.mapId)?.name||'No map'}
            {' · '}Revision {plan.revision}</small></div>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={()=>loadEditor(plan)}>Edit</button>
          <button type="button" disabled={busy||!canEdit}
            onClick={()=>run('load',plan)}>Load into Combat</button>
          <button type="button" disabled={busy}
            onClick={()=>run('delete',plan)}>Delete</button>
        </div>
      </article>):<p>No prepared encounters saved yet.</p>}
    </div>
    <div className={styles.editor}>
      <h4>{editId?'Edit Prepared Encounter':'Create Prepared Encounter'}</h4>
      <label>Encounter Name<input value={draft.name} maxLength={100}
        onChange={event=>setDraft(row=>({...row,name:event.target.value}))}
        placeholder="e.g. The Frostbound Ambush"/></label>
      <label>GM Notes<textarea value={draft.notes} maxLength={1200} rows={3}
        onChange={event=>setDraft(row=>({...row,notes:event.target.value}))}
        placeholder="Location, tactics, objectives and reminders"/></label>
      <label>Battle Map<select value={draft.mapId}
        onChange={event=>setDraft(row=>({...row,mapId:event.target.value}))}>
        <option value="">No map selected</option>
        {maps.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}
      </select></label>
      <p>Map selection is retained as an encounter reference. Live map binding remains a separate secured GM action.</p>
      <div className={styles.entries}>
        <h4>Enemy Roster ({draft.enemies.length}/{PREPARED_ENCOUNTER_MAX_ENEMIES})</h4>
        {draft.enemies.map((row,index)=><div key={index}>
          <span>{index+1}. {row.name} · HP {displayHP(row)}</span>
          <button type="button" disabled={busy} aria-label={'Remove '+row.name+' '+(index+1)}
            onClick={()=>setDraft(previous=>({...previous,
              enemies:previous.enemies.filter((_,i)=>i!==index)}))}>Remove</button>
        </div>)}
      </div>
      <div className={styles.source}>
        <label>Existing Creature or NPC<select value={sourceId}
          onChange={event=>setSourceId(event.target.value)}>
          <option value="">Select a saved campaign source</option>
          {library.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        <button type="button" disabled={busy||!sourceId||
          draft.enemies.length>=PREPARED_ENCOUNTER_MAX_ENEMIES}
          onClick={addSource}>Add Source</button>
      </div>
      <fieldset className={styles.custom}>
        <legend>Custom Enemy</legend>
        <label>Name<input maxLength={120} value={enemy.name}
          onChange={event=>setEnemy(previous=>({...previous,name:event.target.value}))}/></label>
        <label>Type<select value={enemy.type}
          onChange={event=>setEnemy(previous=>({...previous,type:event.target.value}))}>
          <option>Creature</option><option>NPC</option>
        </select></label>
        {['hp','sp','mp','xpReward','ac','initiative'].map(key=><label key={key}>
          {key.toUpperCase()}<input type="number"
            value={enemy[key]} min={key==='hp'?1:0}
            onChange={event=>setEnemy(previous=>({...previous,[key]:event.target.value}))}/>
        </label>)}
        <button type="button" disabled={busy||!enemy.name.trim()||
          draft.enemies.length>=PREPARED_ENCOUNTER_MAX_ENEMIES}
          onClick={addCustom}>Add Custom Enemy</button>
      </fieldset>
      <div className={styles.actions}>
        <button type="button" disabled={busy||!draft.name.trim()||!draft.enemies.length||
          (!editId&&plans.length>=PREPARED_ENCOUNTER_MAX_PLANS)}
          data-testid="site-prepared-encounter-save"
          onClick={()=>run('save')}>{busy?'Saving…':'Save Encounter'}</button>
        <button type="button" disabled={busy} onClick={reset}>Discard Draft</button>
      </div>
    </div>
    {message?<p role="status">{message}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
