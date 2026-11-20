import React,{useEffect,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import styles from './GMQuestManagement.module.css';

function exportNotes(notes,campaignId){
  const data={privateNotes:notes.privateNotes||'',sessionLogs:Array.isArray(notes.sessionLogs)?notes.sessionLogs:[]};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  try{
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download='asteria-gm-session-logs-'+campaignId+'.json';
    document.body.append(anchor);anchor.click();anchor.remove();
  }finally{URL.revokeObjectURL(url);}
}
export function GMNotesManagement({api,campaignId,workspace={},session={}}){
  const notes=workspace.notes||{};
  const [privateNotes,setPrivateNotes]=useState(notes.privateNotes||'');
  const [logTitle,setLogTitle]=useState(''),[logBody,setLogBody]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{setPrivateNotes(notes.privateNotes||'');},[campaignId,notes.privateNotes]);
  const run=async(action,success,after)=>{
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{await action();setMessage(success);after?.();}
    catch(e){setError(e?.message||'GM notes could not be saved.');}
    finally{setBusy(false);}
  };
  const logs=Array.isArray(notes.sessionLogs)?notes.sessionLogs:[];
  return <section className={styles.shell} data-testid="site-gm-notes-management">
    <SurfacePanel className={styles.panel} as="section">
      <header className={styles.head}><div><h2>Private GM Notes</h2>
        <BodyText muted>Campaign preparation and hidden details are visible only to campaign GMs.</BodyText>
      </div></header>
      {error?<p role="alert" className={styles.notice}>{error}</p>:null}
      {message?<p role="status" className={styles.notice}>{message}</p>:null}
      <label>Campaign Notes<textarea rows={16} maxLength={20000} value={privateNotes}
        onChange={e=>setPrivateNotes(e.target.value)}
        placeholder="Private preparation, NPC motives, outcomes, and session notes…"/></label>
      <div className={styles.actions}>
        <button type="button" disabled={busy||privateNotes===String(notes.privateNotes||'')}
          onClick={()=>run(()=>api.saveGMNotes(campaignId,privateNotes,notes.privateNotes||''),
            'Private GM notes saved.')}>Save Notes</button>
        <button type="button" disabled={busy} onClick={()=>exportNotes(notes,campaignId)}>
          Export Notes &amp; Logs (JSON)</button>
      </div>
      {privateNotes!==String(notes.privateNotes||'')?
        <small>Unsaved changes. Saving detects edits made in another tab.</small>:null}
    </SurfacePanel>
    <SurfacePanel className={styles.panel} as="section">
      <header className={styles.head}><div><h2>Session Log</h2>
        <BodyText muted>Private preparation, recaps and the previous campaign session history.</BodyText>
      </div><strong>Session: {session.status||'idle'}</strong></header>
      <label>Log Title<input maxLength={120} value={logTitle}
        onChange={e=>setLogTitle(e.target.value)}/></label>
      <label>Session Summary<textarea rows={6} maxLength={16000} value={logBody}
        onChange={e=>setLogBody(e.target.value)}/></label>
      <div className={styles.actions}>
        <button type="button" disabled={busy||!logTitle.trim()||!logBody.trim()}
          onClick={()=>run(()=>api.addGMSessionLog(campaignId,{
            title:logTitle,body:logBody,sessionId:session.id,
            sessionStatus:session.status}), 'Session log saved.',
          ()=>{setLogTitle('');setLogBody('');})}>Add Log Entry</button>
      </div>
      <div className={styles.ledger}>{logs.map(row=><article className={styles.record}
        key={row.id}>
        <header className={styles.head}><h3>{row.title}</h3>
          <small>{row.createdAt?new Date(row.createdAt).toLocaleString():''}</small></header>
        <p>{row.body||''}</p>
        <small>{row.sessionStatus||''}{row.sessionId?' · '+row.sessionId:''}</small>
        <div className={styles.actions}>
          <button type="button" disabled={busy}
            onClick={()=>{if(window.confirm('Delete the session log '+row.title+'?'))
              run(()=>api.removeGMSessionLog(campaignId,row.id,row.createdAt||''),
                'Session log deleted.');}}>Delete Log</button>
        </div>
      </article>)}</div>
      {!logs.length?<BodyText muted>No session logs have been saved.</BodyText>:null}
    </SurfacePanel>
  </section>;
}
