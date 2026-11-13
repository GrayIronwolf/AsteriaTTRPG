import React,{useEffect,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {Panel,EmptyState} from '../components/WorkspaceUI.jsx';

const draftTable=()=>({name:'',description:'',location:'',threatTier:1,status:'active',entries:[]});
const numeric=(value,min,max)=>Number.isSafeInteger(Number(value))&&String(value).trim()!==''&&Number(value)>=min&&Number(value)<=max;
const newEntry=kind=>({id:'entry-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
  kind,weight:1,note:'',...(kind==='item'?{name:'',definitionId:'',minQuantity:1,maxQuantity:1}:
    kind==='currency'?{minCopper:0,maxCopper:100}:{})});

export function GMLootTableWorkspace({campaignId}){
  const [tables,setTables]=useState([]);
  const [selectedId,setSelectedId]=useState('');
  const [draft,setDraft]=useState(draftTable);
  const [preview,setPreview]=useState(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const selected=tables.find(row=>row.id===selectedId)||null;
  useEffect(()=>{
    if(!campaignId)return;
    return firebaseService.subscribeLootTables(campaignId,setTables);
  },[campaignId]);
  useEffect(()=>{
    setDraft(selected?{
      name:selected.name||'',description:selected.description||'',
      location:selected.location||'',threatTier:selected.threatTier||1,
      status:selected.status||'active',entries:(selected.entries||[]).map(row=>({...row}))
    }:draftTable());
    setPreview(null);
  },[selectedId,selected?.revision]);
  const updateEntry=(id,field,value)=>{
    setDraft(table=>({...table,entries:table.entries.map(row=>
      row.id===id?{...row,[field]:value}:row)}));
  };
  const act=async(type)=>{
    if(busy)return;
    setBusy(true);setMessage('');
    try{
      const id=selectedId||'loot-table-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
      const entries=draft.entries.map(row=>{
        const cast={...row,weight:Number(row.weight)};
        for(const key of ['minQuantity','maxQuantity','minCopper','maxCopper'])
          if(key in cast)cast[key]=Number(cast[key]);
        return cast;
      });
      const response=await firebaseService.manageLootTable(campaignId,'gm-scope',{
        type,tableId:id,expectedRevision:selected?.revision||0,
        ...(type==='save'?{table:{...draft,threatTier:Number(draft.threatTier),entries}}:{})
      });
      if(!response?.ok)throw Error(response?.error||'Loot-table action failed.');
      setMessage(type==='preview'?'GM roll preview generated.':
        type==='generate'?(response.generated?'Hidden treasure generated. Reveal it in Party Stashes & Treasure when ready.':'The roll found nothing; no treasure drop was created.'):
        type==='archive'?'Loot table archived.':'Loot table saved.');
      if(type==='preview'||type==='generate')setPreview(response.roll);
      if(type==='save')setSelectedId(id);
    }catch(error){setMessage(error.message||'Loot-table action failed.');}
    finally{setBusy(false);}
  };
  const field=(label,key,max=160)=><label>{label}<input maxLength={max}
    value={draft[key]} onChange={event=>setDraft(v=>({...v,[key]:event.target.value}))}/></label>;
  const input=(row,key,label,{min=0,max=1000000}={})=>
    <label>{label}<input type="number" min={min} max={max} step="1"
      value={row[key]} onChange={event=>updateEntry(row.id,key,event.target.value)}/></label>;
  return <Panel title="GM Loot Tables" eyebrow="Private weighted tables and non-delivering roll previews">
    <p>Preview rolls never create treasure. Generate Hidden Treasure creates a GM-only draft in the existing Party Stashes & Treasure manager; only the GM can reveal it, and players must claim or receive it through the existing secure workflow.</p>
    <div className="react-form-grid">
      <label>Saved table<select value={selectedId} onChange={event=>setSelectedId(event.target.value)}>
        <option value="">Create new table</option>
        {tables.map(row=><option key={row.id} value={row.id}>{row.name} ({row.status})</option>)}
      </select></label>
      {field('Table name','name',100)}
      {field('Description','description',800)}
      {field('Location or encounter','location',120)}
      <label>Threat tier<input type="number" min="1" max="20" step="1"
        value={draft.threatTier} onChange={event=>setDraft(v=>({...v,threatTier:event.target.value}))}/></label>
    </div>
    <h4>Weighted entries</h4>
    <p>Each weight controls relative probability, not a percentage. Total weight must be 10,000 or less.</p>
    <div className="react-action-row">
      {['item','currency','nothing'].map(kind=>
        <button key={kind} type="button" disabled={busy||draft.entries.length>=40}
          onClick={()=>setDraft(v=>({...v,entries:[...v.entries,newEntry(kind)]}))}>Add {kind}</button>)}
    </div>
    <div className="react-record-list compact">
      {draft.entries.map(row=><article key={row.id}>
        <div className="react-record-heading"><b>{row.kind==='nothing'?'Nothing found':
          row.kind==='currency'?'Copper drop':'Item drop'}</b>
          <button type="button" className="danger" disabled={busy}
            onClick={()=>setDraft(v=>({...v,entries:v.entries.filter(entry=>entry.id!==row.id)}))}>Remove</button></div>
        <div className="react-form-grid">
          {input(row,'weight','Weight',{min:1,max:1000})}
          {row.kind==='item'?<>
            <label>Item name<input maxLength="160" value={row.name}
              onChange={event=>updateEntry(row.id,'name',event.target.value)}/></label>
            <label>Definition ID (optional)<input maxLength="160" value={row.definitionId}
              onChange={event=>updateEntry(row.id,'definitionId',event.target.value)}/></label>
            {input(row,'minQuantity','Minimum quantity',{min:1})}
            {input(row,'maxQuantity','Maximum quantity',{min:1})}
          </>:null}
          {row.kind==='currency'?<>
            {input(row,'minCopper','Minimum copper',{max:1000000000})}
            {input(row,'maxCopper','Maximum copper',{max:1000000000})}
          </>:null}
          <label>GM note<input maxLength="500" value={row.note}
            onChange={event=>updateEntry(row.id,'note',event.target.value)}/></label>
        </div>
      </article>)}
      {!draft.entries.length?<EmptyState title="No table entries">Add at least one weighted entry before saving.</EmptyState>:null}
    </div>
    <p><b>Total weight:</b> {draft.entries.reduce((sum,row)=>sum+(numeric(row.weight,1,1000)?Number(row.weight):0),0).toLocaleString()}</p>
    <div className="react-action-row">
      <button type="button" className="primary" disabled={busy||!draft.entries.length||!draft.name.trim()}
        onClick={()=>act('save')}>Save Loot Table</button>
      <button type="button" disabled={busy||!selected||selected.status!=='active'}
        onClick={()=>act('preview')}>Roll Preview</button>
      <button type="button" disabled={busy||!selected||selected.status!=='active'}
        onClick={()=>act('generate')}>Generate Hidden Treasure</button>
      <button type="button" className="danger" disabled={busy||!selected||selected.status==='archived'}
        onClick={()=>act('archive')}>Archive</button>
    </div>
    {preview?<section className="react-action-message" role="status">
      <h4>Latest GM roll</h4>
      <p>{preview.kind==='item'?preview.item.quantity+' × '+preview.item.name:
        preview.kind==='currency'?preview.currencyCopper.toLocaleString()+' copper':'Nothing found'}</p>
      <small>Table weight {preview.weight}/{preview.totalWeight}. Generated drops stay hidden until revealed in Party Stashes & Treasure.</small>
    </section>:null}
    {message?<p className="react-action-message" role="status">{message}</p>:null}
  </Panel>;
}
