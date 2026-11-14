import React,{useEffect,useMemo,useRef,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {Panel} from '../components/WorkspaceUI.jsx';
import {
 RANDOM_TABLE_CATEGORIES,MAX_RANDOM_TABLE_ENTRIES,MAX_RANDOM_TABLE_HISTORY,
 MAX_RANDOM_TABLE_ROLLS,randomTableStarter
} from '../state/randomTableModel.mjs';
import '../styles/random-tables.css';

const draftTable=()=>({name:'',category:'encounter',description:'',location:'',
  threatTier:1,entries:[]});
const freshEntry=(kind='text')=>({
  id:crypto.randomUUID(),kind,weight:1,label:'',
  description:'',note:'',...(kind==='loot-link'?{lootTableId:''}:{})
});
const editable=table=>({
  name:table.name||'',category:table.category||'custom',
  description:table.description||'',location:table.location||'',
  threatTier:table.threatTier||1,
  entries:(table.entries||[]).map(row=>({...row}))
});
const clock=stamp=>stamp?.toDate?.()?.toLocaleString?.()||'';
export function GMRandomTableWorkspace({campaignId,searchTarget=null}){
  const [tables,setTables]=useState([]),[lootTables,setLootTables]=useState([]);
  const [history,setHistory]=useState([]);
  const [selectedId,setSelectedId]=useState('');
  const [draft,setDraft]=useState(draftTable);
  const [rolls,setRolls]=useState(1),[preview,setPreview]=useState(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const pendingDraft=useRef(null);
  const selected=tables.find(row=>row.id===selectedId)||null;
  useEffect(()=>{if(searchTarget?.category==='random-table'&&tables.some(x=>x.id===searchTarget.id))
    setSelectedId(searchTarget.id);},[searchTarget,tables]);
  const editableSelected=selected?.status!=='archived';
  const totalWeight=draft.entries.reduce((sum,row)=>sum+(Number(row.weight)||0),0);
  const linkedLoot=useMemo(()=>lootTables.filter(row=>row.status==='active'),[lootTables]);

  useEffect(()=>{
    setTables([]);setLootTables([]);setHistory([]);setSelectedId('');
    if(!campaignId)return undefined;
    const stops=[
      firebaseService.subscribeRandomTables(campaignId,setTables),
      firebaseService.subscribeRandomTableHistory(campaignId,setHistory),
      firebaseService.subscribeLootTables(campaignId,setLootTables)
    ];
    return()=>stops.forEach(stop=>stop?.());
  },[campaignId]);
  useEffect(()=>{
    if(pendingDraft.current){setDraft(pendingDraft.current);pendingDraft.current=null;}
    else setDraft(selected?editable(selected):draftTable());
    setPreview(null);setMessage('');setError('');
  },[selectedId,selected?.revision]);
  const patch=(key,value)=>setDraft(old=>({...old,[key]:value}));
  const patchEntry=(id,key,value)=>setDraft(old=>({
    ...old,entries:old.entries.map(row=>row.id===id?{...row,[key]:value}:row)
  }));
  const removeEntry=id=>setDraft(old=>({
    ...old,entries:old.entries.filter(row=>row.id!==id)
  }));
  const newTable=()=>{
    pendingDraft.current=null;
    setSelectedId('');setDraft(draftTable());setPreview(null);setMessage('');setError('');
  };
  const duplicate=()=>{
    if(!selected)return;
    const copy={...editable(selected),name:selected.name+' (Copy)',
      entries:selected.entries.map(row=>({...row,id:crypto.randomUUID()}))};
    pendingDraft.current=copy;
    setSelectedId('');setDraft(copy);
    setPreview(null);setMessage('Copy is ready to save as a new table.');setError('');
  };
  const addTemplate=()=>{
    if(draft.entries.length)return;
    patch('entries',randomTableStarter(draft.category,()=>crypto.randomUUID()));
    setMessage('Template added. Edit the labels and weights before saving.');
  };
  const run=async(type)=>{
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      const id=selectedId||crypto.randomUUID();
      const expectedRevision=selected?.revision||0;
      const cleanEntries=draft.entries.map(row=>({
        ...row,weight:Number(row.weight),
        ...(row.kind==='text'?{lootTableId:undefined}:{})
      }));
      // Delete optional absent keys; never send undefined to the trusted callable.
      cleanEntries.forEach(row=>{if(row.lootTableId===undefined)delete row.lootTableId;});
      const action={type,tableId:id,expectedRevision,
        ...(type==='save'?{table:{...draft,threatTier:Number(draft.threatTier),
          entries:cleanEntries}}:{}),
        ...(type==='batch'?{count:Number(rolls)}:{})};
      if(type==='batch'&&(!Number.isSafeInteger(action.count)||action.count<1||
        action.count>MAX_RANDOM_TABLE_ROLLS))
        throw Error('Choose 1–10 whole rolls.');
      const result=await firebaseService.manageRandomTable(campaignId,'gm-scope',action);
      if(!result?.ok)throw Error(result?.error||'Random table action failed.');
      if(type==='save'){
        setSelectedId(id);setMessage('Random table saved.');
      }else if(type==='archive'){
        setMessage('Table archived. Create a new table to continue rolling.');
      }else{
        setPreview(result);
        setMessage((result.rollCount||1)+' result(s) recorded in GM-private history. Nothing was automatically awarded or created.');
      }
    }catch(err){setError(err.message||'Random table action failed.');}
    finally{setBusy(false);}
  };
  const selectedHistory=history.filter(row=>!selectedId||row.tableId===selectedId);
  return <Panel title="Random Table Builder" eyebrow="Digital GM Toolkit · Phase 7.2">
    <div className="asteria-random-tables">
      <p>Build weighted random encounters, NPC prompts, world events, travel discoveries and custom tables. All rolls are GM-private previews. Use the existing Loot Tables workspace to generate or distribute treasure.</p>
      <div className="asteria-random-tables-top">
        <label>Saved random tables
          <select value={selectedId} onChange={e=>setSelectedId(e.target.value)}>
            <option value="">Create new table</option>
            {tables.map(row=><option key={row.id} value={row.id}>{row.name} ({row.status})</option>)}
          </select>
        </label>
        <button type="button" onClick={newTable} disabled={busy}>New table</button>
        <button type="button" onClick={duplicate} disabled={busy||!selected}>Duplicate selected</button>
      </div>
      <div className="asteria-random-tables-fields">
        <label>Table name<input value={draft.name} disabled={!editableSelected||busy} maxLength={100}
          onChange={e=>patch('name',e.target.value)} placeholder="e.g. Altarin mountain encounters"/></label>
        <label>Category<select value={draft.category} disabled={!editableSelected||busy}
          onChange={e=>patch('category',e.target.value)}>
          {RANDOM_TABLE_CATEGORIES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label>Location / context<input value={draft.location} maxLength={120}
          disabled={!editableSelected||busy} onChange={e=>patch('location',e.target.value)}/></label>
        <label>Threat tier (1–20)<input type="number" min="1" max="20" step="1"
          disabled={!editableSelected||busy} value={draft.threatTier}
          onChange={e=>patch('threatTier',e.target.value)}/></label>
        <label className="asteria-random-tables-full">Description<textarea rows="2" maxLength={800}
          disabled={!editableSelected||busy} value={draft.description}
          onChange={e=>patch('description',e.target.value)}/></label>
      </div>
      <div className="asteria-random-tables-section-title">
        <h3>Weighted results ({draft.entries.length}/{MAX_RANDOM_TABLE_ENTRIES})</h3>
        <span>Total weight: {totalWeight} / 10,000</span>
      </div>
      <p className="react-help">Probability = entry weight ÷ total weight. Every entry must have a positive weight (1–1,000). Choose a narrative result or reference an existing active GM Loot Table.</p>
      <div className="asteria-random-tables-buttons">
        <button type="button" disabled={busy||!editableSelected||draft.entries.length>=MAX_RANDOM_TABLE_ENTRIES}
          onClick={()=>patch('entries',[...draft.entries,freshEntry()])}>Add narrative result</button>
        <button type="button" disabled={busy||!editableSelected||draft.entries.length>=MAX_RANDOM_TABLE_ENTRIES}
          onClick={()=>patch('entries',[...draft.entries,freshEntry('loot-link')])}>Add loot reference</button>
        <button type="button" disabled={busy||!editableSelected||draft.entries.length>0}
          onClick={addTemplate}>Use category template</button>
      </div>
      <div className="asteria-random-tables-entries">
        {draft.entries.map((row,index)=><article key={row.id} className="asteria-random-tables-entry">
          <header><b>Result {index+1} · {row.kind==='loot-link'?'Loot reference':'Narrative'}</b>
            <span>{totalWeight>0&&Number(row.weight)>0?
              (Number(row.weight)/totalWeight*100).toFixed(2)+'% chance':''}</span>
            <button type="button" disabled={busy||!editableSelected}
              onClick={()=>removeEntry(row.id)}>Remove</button></header>
          <div className="asteria-random-tables-fields">
            <label>Result title<input maxLength={160} disabled={busy||!editableSelected}
              value={row.label} onChange={e=>patchEntry(row.id,'label',e.target.value)}/></label>
            <label>Relative weight<input type="number" min="1" max="1000" step="1"
              disabled={busy||!editableSelected} value={row.weight}
              onChange={e=>patchEntry(row.id,'weight',e.target.value)}/></label>
            {row.kind==='loot-link'?<label className="asteria-random-tables-full">
              Link to existing GM Loot Table<select value={row.lootTableId||''}
                disabled={busy||!editableSelected} onChange={e=>patchEntry(row.id,'lootTableId',e.target.value)}>
                <option value="">Choose a loot table</option>
                {linkedLoot.map(table=><option key={table.id} value={table.id}>{table.name}</option>)}
                {!linkedLoot.some(table=>table.id===row.lootTableId)&&row.lootTableId?
                  <option value={row.lootTableId}>{row.lootTableId} (unavailable)</option>:null}
              </select>
            </label>:null}
            <label className="asteria-random-tables-full">Description<textarea rows="2" maxLength={650}
              disabled={busy||!editableSelected} value={row.description}
              onChange={e=>patchEntry(row.id,'description',e.target.value)}/></label>
            <label className="asteria-random-tables-full">Private GM note<input maxLength={500}
              disabled={busy||!editableSelected} value={row.note}
              onChange={e=>patchEntry(row.id,'note',e.target.value)}/></label>
          </div>
        </article>)}
      </div>
      {!draft.entries.length?<p>No entries yet. Add a result or insert a starter template.</p>:null}
      <div className="asteria-random-tables-buttons">
        <button type="button" className="primary" disabled={busy||!editableSelected||!draft.name.trim()||
          !draft.entries.length} onClick={()=>run('save')}>Save random table</button>
        <button type="button" disabled={busy||!selected||selected.status!=='active'}
          onClick={()=>run('roll')}>Roll once</button>
        <label>Batch count (1–10)<input type="number" min="1" max="10" step="1" value={rolls}
          disabled={busy} onChange={e=>setRolls(e.target.value)}/></label>
        <button type="button" disabled={busy||!selected||selected.status!=='active'}
          onClick={()=>run('batch')}>Roll batch</button>
        <button type="button" disabled={busy||!selected||selected.status==='archived'}
          onClick={()=>{if(window.confirm('Archive this table? Archived tables are read-only.'))run('archive');}}>
          Archive table</button>
      </div>
      {error?<p role="alert" className="asteria-random-tables-error">{error}</p>:null}
      {message?<p role="status">{message}</p>:null}
      {preview?<section className="asteria-random-tables-preview" aria-live="polite">
        <h3>Latest roll · {preview.rollCount} result(s)</h3>
        <ol>{preview.results.map(row=><li key={row.rollNumber}>
          <strong>{row.rollNumber}. {row.label}</strong>
          <small>{row.chancePercent}% probability · {row.draw}/{row.totalWeight} weighted draw</small>
          {row.description?<p>{row.description}</p>:null}
          {row.lootTableId?<p>Existing loot table: <code>{row.lootTableId}</code>. Open GM Loot Tables to generate treasure separately.</p>:null}
          {row.note?<p>GM note: {row.note}</p>:null}
        </li>)}</ol>
      </section>:null}
      <section className="asteria-random-tables-history" aria-label="GM random table roll history">
        <h3>GM roll history ({selectedHistory.length}, latest {MAX_RANDOM_TABLE_HISTORY} records)</h3>
        <p>Stored under the campaign; never visible to players. Selecting a saved table filters this history.</p>
        <ol>{selectedHistory.map(record=><li key={record.id}>
          <strong>{record.tableName}</strong><small>{clock(record.createdAt)} · {record.rollCount} rolls</small>
          <ul>{(record.results||[]).map(row=><li key={row.rollNumber}>
            {row.rollNumber}. {row.label}{row.kind==='loot-link'?' (loot reference)':''}
          </li>)}</ul>
        </li>)}</ol>
        {!selectedHistory.length?<p>No saved rolls for this table.</p>:null}
      </section>
      <p className="react-help">Random results are prompts only. No items, monsters, NPCs or events are created automatically. The current GM Loot Tables and Party Stashes systems remain separate and unchanged.</p>
    </div>
  </Panel>;
}
