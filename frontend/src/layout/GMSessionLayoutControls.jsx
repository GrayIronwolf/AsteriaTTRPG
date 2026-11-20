import React,{useRef,useState} from 'react';
import {GM_FOCUS_BUILTINS,activateBuiltinGMFocus,activateNamedGMFocus,
  saveNamedGMFocus,deleteNamedGMFocus,updateNamedGMFocus,leaveGMFocus,
  gmFocusStatus} from '../../../src/state/gmFocusModel.mjs';
import {GM_FOCUS_LIMIT} from '../../../src/state/dashboardLayoutModel.mjs';
import {
  createGMLayoutBackup,parseGMLayoutBackup,previewGMLayoutBackup,GM_LAYOUT_BACKUP_MAX_BYTES
} from '../../../src/state/gmLayoutBackupModel.mjs';
import styles from './GMSessionLayoutControls.module.css';

export function GMSessionLayoutControls({layout,onCommit,disabled=false}){
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),
    [message,setMessage]=useState(''),[error,setError]=useState(''),
    [imported,setImported]=useState(null),[fileName,setFileName]=useState(''),
    [deleteId,setDeleteId]=useState('');
  const input=useRef(null);
  const status=gmFocusStatus(layout),preview=previewGMLayoutBackup(layout);
  const blocked=busy||disabled;
  const save=async(result,success)=>{
    if(blocked)return false;
    if(!result?.ok){setError(result?.error||'Invalid GM layout change.');return false;}
    setBusy(true);setMessage('');setError('');
    try{
      const stored=await onCommit(result.layout);
      if(stored?.ok===false)throw Error(stored.error||'Layout was not saved.');
      setMessage(success);return true;
    }catch(e){setError(e?.message||'GM layout was not saved.');return false;}
    finally{setBusy(false);}
  };
  const add=async()=>{
    const id='focus-'+crypto.randomUUID();
    if(await save(saveNamedGMFocus(layout,name,id),'Saved GM Focus mode.'))setName('');
  };
  const choose=async e=>{
    const file=e.target.files?.[0];e.target.value='';
    setImported(null);setFileName('');setMessage('');setError('');
    if(!file)return;
    if(file.size>GM_LAYOUT_BACKUP_MAX_BYTES){
      setError('Layout backup exceeds the 512 KB limit.');return;
    }
    try{
      const parsed=parseGMLayoutBackup(await file.text());
      if(!parsed.ok)throw Error(parsed.error);
      setImported(parsed);setFileName(file.name);
    }catch(err){setError(err?.message||'Unable to read layout backup.');}
  };
  const download=()=>{
    if(blocked)return;
    try{
      const blob=new Blob([createGMLayoutBackup(layout)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='asteria-gm-layout-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(a);a.click();a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setError('');setMessage('Downloaded your current GM layout backup.');
    }catch(e){setError(e?.message||'Unable to export layout.');}
  };
  return <section className={styles.shell} data-testid="site-gm-focus-backup"
    aria-label="GM Focus Modes and Layout Backup">
    <div className={styles.heading}><div>
      <h2>GM Focus Modes</h2>
      <p>Switch panel arrangements for different GM tasks. Focuses preserve the original normal layout, saved device layouts and panel settings.</p>
    </div><strong>Current: {status.label}{status.changed?' (edited)':''}</strong></div>
    <div className={styles.actions}>
      <button type="button" disabled={blocked||!status.hasHome}
        onClick={()=>save(leaveGMFocus(layout),'Returned to normal dashboard.')}>Normal Dashboard</button>
      {GM_FOCUS_BUILTINS.map(mode=><button type="button" key={mode.id}
        disabled={blocked} onClick={()=>save(activateBuiltinGMFocus(layout,mode.id),
          mode.label+' Focus applied.')}>{mode.label}</button>)}
    </div>
    <div className={styles.form}>
      <h3>Saved Focuses ({status.saved.length}/{GM_FOCUS_LIMIT})</h3>
      <div className={styles.actions}>
        <label>Focus Name<input maxLength={48} value={name} disabled={blocked}
          onChange={e=>setName(e.target.value)}/></label>
        <button type="button" disabled={blocked||!name.trim()||status.saved.length>=GM_FOCUS_LIMIT}
          onClick={add}>Save Current Layout As Focus</button>
      </div>
      {status.saved.map(entry=><div className={styles.saved} key={entry.id}>
        <strong>{entry.name}</strong>
        <div className={styles.actions}>
          <button type="button" disabled={blocked}
            onClick={()=>save(activateNamedGMFocus(layout,entry.id),'Focus applied.')}>Apply</button>
          <button type="button" disabled={blocked}
            onClick={()=>save(updateNamedGMFocus(layout,entry.id),'Focus updated.')}>Update Snapshot</button>
          {deleteId===entry.id?<><button type="button" disabled={blocked}
            onClick={async()=>{if(await save(deleteNamedGMFocus(layout,entry.id),
              'Saved Focus deleted.'))setDeleteId('');}}>Confirm Delete</button>
            <button type="button" onClick={()=>setDeleteId('')}>Cancel</button></>:
            <button type="button" disabled={blocked} onClick={()=>setDeleteId(entry.id)}>Delete</button>}
        </div>
      </div>)}
    </div>
    <div className={styles.form}>
      <h3>Dashboard Layout Backup &amp; Restore</h3>
      <p>Backup contains GM panel arrangement and saved Focuses only. It excludes character records, campaign secrets and account credentials.</p>
      <p>{preview.visiblePanels} visible panels · {preview.namedFocuses} named Focuses · {preview.savedViewports} device layouts</p>
      <div className={styles.actions}>
        <button type="button" disabled={blocked} onClick={download}>Download Layout Backup</button>
        <button type="button" disabled={blocked}
          onClick={()=>input.current?.click()}>Choose Backup to Restore</button>
        <input type="file" ref={input} hidden accept=".json,application/json"
          aria-label="GM layout JSON backup" onChange={choose} disabled={blocked}/>
      </div>
      {imported?<div className={styles.form} role="group" aria-label="Confirm GM layout restore">
        <strong>Replace this GM layout with {fileName}?</strong>
        <p>{imported.preview.visiblePanels} visible panels · {imported.preview.namedFocuses} saved Focuses. Only this GM account's current campaign layout will change.</p>
        <div className={styles.actions}>
          <button type="button" disabled={blocked} onClick={async()=>{
            if(await save(imported,'GM layout restored from backup.'))setImported(null);
          }}>Confirm Restore</button>
          <button type="button" disabled={blocked}
            onClick={()=>{setImported(null);setFileName('');}}>Cancel</button>
        </div>
      </div>:null}
    </div>
    {error?<p role="alert">{error}</p>:null}
    {message?<p role="status">{message}</p>:null}
  </section>;
}
