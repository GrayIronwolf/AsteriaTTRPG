import React,{useEffect,useMemo,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {
  GM_WORLD_STATE_FIELDS,GM_WORLD_COLLECTIONS,GM_WORLD_MAX_ROWS,
  gmWorldStateDraft,gmWorldStateFingerprint,gmWorldCollectionDraft,gmWorldCollectionRows
} from '../digitalGM/gmWorldSystemsModel.mjs';
import styles from './GMNpcToolkit.module.css';

const groups=[{id:'state',label:'World State'},...GM_WORLD_COLLECTIONS.map(g=>({id:g.id,label:g.label}))];
export function GMWorldSystemsWorkspace({api,campaignId,onNavigate}){
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState('');
  const [tab,setTab]=useState('state'),[query,setQuery]=useState('');
  const [draft,setDraft]=useState(null),[editing,setEditing]=useState(null),
    [stateDraft,setStateDraft]=useState(null),[stateExpected,setStateExpected]=useState('');
  const [deleting,setDeleting]=useState(''),[busy,setBusy]=useState(false),
    [message,setMessage]=useState(''),[actionError,setActionError]=useState('');
  const enabled=api?.availability?.().enabled===true;
  useEffect(()=>{
    let active=true;
    setSnapshot(null);setError('');setDraft(null);setEditing(null);
    setStateDraft(null);setStateExpected('');setTab('state');setQuery('');
    if(!enabled){setError('The secured World Systems service is unavailable.');return undefined;}
    const close=api.watchGM(campaignId,'world',data=>{
      if(active){setSnapshot(data);setError('');}
    },e=>{if(active){setSnapshot(null);setError(e?.message||'World data unavailable.');}});
    return ()=>{active=false;close();};
  },[api,campaignId,enabled]);
  const world=snapshot?.world||{};
  const selected=GM_WORLD_COLLECTIONS.find(entry=>entry.id===tab)||null;
  const rows=useMemo(()=>gmWorldCollectionRows(world,tab,query),[world,tab,query]);
  const editState=()=>{
    setStateDraft(gmWorldStateDraft(world));
    setStateExpected(gmWorldStateFingerprint(world));
    setEditing(null);setDraft(null);setActionError('');setMessage('');
  };
  const newEntry=()=>{
    if(!selected)return;
    setEditing({id:'',expectedUpdatedAt:'',category:tab});
    setDraft(gmWorldCollectionDraft(tab));setStateDraft(null);
    setActionError('');setMessage('');
  };
  const editEntry=row=>{
    if(!row.id||row.id.startsWith('legacy-')){
      setActionError('This legacy entry requires a stable identifier before editing.');
      return;
    }
    setEditing({id:row.id,expectedUpdatedAt:row.updatedAt||'',category:tab});
    setDraft(gmWorldCollectionDraft(tab,row));setStateDraft(null);
    setActionError('');setMessage('');
  };
  const run=async(op,success,after)=>{
    if(busy)return false;
    setBusy(true);setActionError('');setMessage('');
    try{
      await api.world(campaignId,op);
      setMessage(success);after?.();return true;
    }catch(e){setActionError(e?.message||'World update failed.');return false;}
    finally{setBusy(false);}
  };
  const saveState=event=>{
    event.preventDefault();
    if(!stateDraft)return;
    run({type:'world-state-save',entry:stateDraft,expectedState:stateExpected},
      'Living world state saved.',()=>setStateDraft(null));
  };
  const saveEntry=event=>{
    event.preventDefault();if(!editing||!selected)return;
    run({type:'world-entry-save',category:tab,id:editing.id||'world-'+crypto.randomUUID(),
      entry:draft,expectedUpdatedAt:editing.expectedUpdatedAt},
      'World record saved.',()=>{setDraft(null);setEditing(null);});
  };
  const deleteEntry=row=>{
    run({type:'world-entry-delete',category:tab,id:row.id,
      expectedUpdatedAt:row.updatedAt||''},
      'World record deleted.',()=>{setDeleting('');setEditing(null);setDraft(null);});
  };
  return <SurfacePanel as="section" className={styles.shell}
    data-testid="site-gm-world-systems-restored">
    <header className={styles.head}><div><h2>Living World Systems</h2>
      <BodyText muted>Maintain world conditions, factions, regions, settlements, timeline, discoveries and private GM knowledge in the existing campaign workspace.</BodyText>
    </div></header>
    {error?<p role="alert">{error}</p>:null}
    {actionError?<p role="alert">{actionError}</p>:null}
    {message?<p role="status">{message}</p>:null}
    {!snapshot&&!error?<p role="status">Verifying GM membership and loading your world…</p>:null}
    {snapshot?<div className={styles.form}>
      <div className={styles.actions} role="group" aria-label="World record categories">
        {groups.map(item=><button type="button" key={item.id} aria-pressed={tab===item.id}
          disabled={busy} onClick={()=>{setTab(item.id);setEditing(null);setDraft(null);
            setStateDraft(null);setDeleting('');setQuery('');}}>{item.label}</button>)}
      </div>
      {tab==='state'?<section className={styles.subpanel}>
        <header className={styles.head}><div><h3>World State</h3>
          <p>Current campaign-wide narrative conditions; changes do not automatically affect game mechanics or player knowledge.</p>
        </div><button type="button" disabled={busy} onClick={editState}>Edit World State</button></header>
        {stateDraft?<form className={styles.form} onSubmit={saveState}>
          <div className={styles.fields}>{GM_WORLD_STATE_FIELDS.map(field=>
            <label key={field.id}>{field.label}
              {field.multiline?<textarea rows={5} maxLength={field.max} disabled={busy}
                value={stateDraft[field.id]}
                onChange={e=>setStateDraft(s=>({...s,[field.id]:e.target.value}))}/>:
                <input type={field.numeric?'number':'text'} maxLength={field.max}
                  min={field.min} step={field.numeric?1:undefined} disabled={busy}
                  value={stateDraft[field.id]}
                  onChange={e=>setStateDraft(s=>({...s,[field.id]:e.target.value}))}/>}
            </label>)}</div>
          <div className={styles.actions}>
            <button type="submit" disabled={busy}>Save World State</button>
            <button type="button" disabled={busy} onClick={()=>setStateDraft(null)}>Discard Changes</button>
          </div>
        </form>:<dl className={styles.records}>{GM_WORLD_STATE_FIELDS.map(field=>
          <div className={styles.record} key={field.id}>
            <dt><strong>{field.label}</strong></dt>
            <dd>{String(world[field.id]??'—')}</dd>
          </div>)}</dl>}
      </section>:<section className={styles.subpanel}>
        <header className={styles.head}><div><h3>{selected?.label||'World Records'}</h3>
          <p>Records are private to campaign GMs. NPC and creature editing remains in the dedicated NPC Library.</p>
        </div>
          <button type="button" disabled={busy||((world[tab]||[]).length>=GM_WORLD_MAX_ROWS)}
            onClick={newEntry}>Add {selected?.label||'Record'}</button>
        </header>
        <label className={styles.field}>Search {selected?.label}
          <input type="search" maxLength={100} value={query}
            onChange={e=>setQuery(e.target.value)}/></label>
        {editing&&draft?<form className={styles.form} onSubmit={saveEntry}>
          <h4>{editing.id?'Edit':'Create'} World Record</h4>
          <div className={styles.fields}>{selected.fields.map(field=>
            <label key={field.id}>{field.label}
              {field.max>800?<textarea rows={3} maxLength={field.max}
                value={draft[field.id]} disabled={busy}
                onChange={e=>setDraft(s=>({...s,[field.id]:e.target.value}))}/>:
                <input type={field.numeric?'number':'text'} step={field.numeric?1:undefined}
                  min={field.numeric&&field.id!=='score'?0:undefined}
                  maxLength={field.max||undefined} disabled={busy}
                  value={draft[field.id]} onChange={e=>setDraft(s=>({...s,[field.id]:e.target.value}))}/>}
            </label>)}</div>
          <div className={styles.actions}>
            <button type="submit" disabled={busy}>Save World Record</button>
            <button type="button" disabled={busy}
              onClick={()=>{setEditing(null);setDraft(null);}}>Discard Changes</button>
          </div>
        </form>:null}
        <p role="status">{rows.length} matching records</p>
        <div className={styles.records}>{rows.map((row,index)=><article
          className={styles.record} key={row.id||'legacy-'+index}>
          <strong>{row.name||row.title||'Unnamed world record'}</strong>
          {selected.fields.map(f=>row[f.id]!==undefined&&row[f.id]!==''?
            <p key={f.id}><strong>{f.label}:</strong> {String(row[f.id])}</p>:null)}
          <div className={styles.actions}>
            <button type="button" disabled={busy||!row.id||row.id.startsWith('legacy-')}
              onClick={()=>editEntry(row)}>Edit</button>
            {deleting===row.id?<><strong>Delete this world record?</strong>
              <button type="button" disabled={busy} onClick={()=>deleteEntry(row)}>Confirm Delete</button>
              <button type="button" disabled={busy} onClick={()=>setDeleting('')}>Cancel</button>
            </>:<button type="button" disabled={busy||!row.id||row.id.startsWith('legacy-')}
              onClick={()=>setDeleting(row.id)}>Delete</button>}
          </div>
        </article>)}</div>
        {!rows.length?<p>No world records match this category or search.</p>:null}
      </section>}
      <div className={styles.actions}>
        <button type="button" onClick={()=>onNavigate?.('bestiary')}>NPC &amp; Creature Library</button>
        <button type="button" onClick={()=>onNavigate?.('world-atlas')}>World Atlas</button>
        <button type="button" onClick={()=>onNavigate?.('asteria-calendar')}>Asteria Calendar</button>
        <button type="button" onClick={()=>onNavigate?.('weather-environment')}>Weather Generator</button>
      </div>
    </div>:null}
  </SurfacePanel>;
}
