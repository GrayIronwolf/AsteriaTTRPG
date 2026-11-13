import React,{useRef,useState} from 'react';
import {
  createGMLayoutBackup,parseGMLayoutBackup,
  GM_LAYOUT_BACKUP_MAX_BYTES,previewGMLayoutBackup
} from '../state/gmLayoutBackupModel.mjs';

/** Explicit, GM-only backup and restore UI. Import is never applied on selection. */
export function GMLayoutBackup({layout,onRestore,disabled=false}){
  const inputRef=useRef(null);
  const [candidate,setCandidate]=useState(null);
  const [sourceName,setSourceName]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const blocked=disabled||busy;
  const current=previewGMLayoutBackup(layout);
  const download=()=>{
    if(blocked)return;
    try{
      const text=createGMLayoutBackup(layout);
      const blob=new Blob([text],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download='asteria-gm-layout-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage('Downloaded a backup of your current GM layout and saved Focuses.');
    }catch(error){setMessage(error?.message||'Could not export GM layout.');}
  };
  const choose=async event=>{
    const file=event.target.files?.[0];
    event.target.value='';
    setCandidate(null);setSourceName('');setMessage('');
    if(!file)return;
    if(file.size>GM_LAYOUT_BACKUP_MAX_BYTES){
      setMessage('Layout backup is too large (maximum 512 KB).');return;
    }
    try{
      const result=parseGMLayoutBackup(await file.text());
      if(!result.ok){setMessage(result.error);return;}
      setCandidate(result);setSourceName(file.name);
      setMessage('Backup validated. Review the details, then confirm to replace this dashboard layout.');
    }catch(error){setMessage(error?.message||'Could not read layout backup.');}
  };
  const restore=async()=>{
    if(blocked||!candidate)return;
    setBusy(true);setMessage('Restoring GM dashboard layout...');
    try{
      const result=await onRestore(candidate.layout);
      if(result?.ok===false){setMessage(result.error||'Could not restore GM layout.');return;}
      setCandidate(null);setSourceName('');
      setMessage('GM dashboard layout restored and saved to your account.');
    }catch(error){setMessage(error?.message||'Could not restore GM dashboard layout.');}
    finally{setBusy(false);}
  };
  return <section className="react-gm-layout-backup" aria-label="GM Dashboard layout backup and restore">
    <h3>Dashboard Layout Backup &amp; Restore</h3>
    <p>Export only your GM dashboard panels and saved Focus modes as a JSON file. Character and campaign data are never included.</p>
    <p className="react-gm-layout-backup-summary">Current: {current.visiblePanels} visible panels · {current.namedFocuses} saved Focuses · {current.savedViewports} saved device layouts</p>
    <div className="react-gm-layout-backup-actions">
      <button type="button" disabled={blocked} onClick={download}>Download Layout Backup</button>
      <button type="button" disabled={blocked} onClick={()=>inputRef.current?.click()}>Choose Backup to Restore</button>
      <input ref={inputRef} type="file" accept=".json,application/json" hidden
        aria-label="Choose a GM dashboard layout JSON file" disabled={blocked} onChange={choose}/>
    </div>
    {candidate?<div className="react-gm-layout-backup-confirm" role="group" aria-label="Confirm layout restore">
      <strong>Replace current GM layout with “{sourceName}”?</strong>
      <p>Imported: {candidate.preview.visiblePanels} visible panels · {candidate.preview.namedFocuses} saved Focuses · {candidate.preview.savedViewports} device layouts.</p>
      <p>This replaces your current panel arrangement and saved Focus library in this campaign. Download a backup first if you need to keep the existing layout. It does not affect gameplay or player data.</p>
      <div>
        <button type="button" className="primary" disabled={blocked} onClick={restore}>{busy?'Restoring...':'Confirm Restore'}</button>
        <button type="button" disabled={blocked} onClick={()=>{setCandidate(null);setSourceName('');setMessage('Restore cancelled.');}}>Cancel</button>
      </div>
    </div>:null}
    <p role="status" aria-live="polite" className="react-gm-layout-backup-message">{message}</p>
  </section>;
}
