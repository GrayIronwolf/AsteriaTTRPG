import React,{useState} from 'react';
import {
  GM_FOCUS_BUILTINS,activateBuiltinGMFocus,activateNamedGMFocus,
  saveNamedGMFocus,updateNamedGMFocus,deleteNamedGMFocus,
  leaveGMFocus,gmFocusStatus
} from '../state/gmFocusModel.mjs';
import {GM_FOCUS_LIMIT} from '../state/dashboardLayoutModel.mjs';

/**
 * A presentation-only controller. The caller owns optimistic saves and
 * rolls back if the existing private Firebase dashboard document rejects.
 */
export function GMFocusModes({layout,onCommit,disabled=false}){
  const status=gmFocusStatus(layout);
  const [name,setName]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [confirmDelete,setConfirmDelete]=useState('');
  const unavailable=disabled||busy;
  const perform=async(result,success)=>{
    if(unavailable)return;
    if(!result?.ok){setMessage(result?.error||'Could not change Focus.');return;}
    setBusy(true);setMessage('Saving GM Focus...');
    try{
      const saved=await onCommit(result.layout);
      setMessage(saved?.ok===false?(saved.error||'Could not save Focus.'):success);
      if(saved?.ok!==false)return true;
    }catch(error){setMessage(error?.message||'Could not save Focus.');}
    finally{setBusy(false);}
    return false;
  };
  const makeId=()=>{const uuid=globalThis.crypto?.randomUUID?.();
    return 'focus-'+(uuid||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));};
  const saveNew=async()=>{
    const ok=await perform(saveNamedGMFocus(layout,name,makeId()),'Saved named Focus.');
    if(ok)setName('');
  };
  return <section className="react-gm-focus" aria-label="GM Focus modes">
    <header className="react-gm-focus-header">
      <div>
        <h2>GM Focus Modes</h2>
        <p>Switch the GM Main panel arrangement for different sessions. Your normal layout can be restored at any time.</p>
      </div>
      <strong className="react-gm-focus-current">Current: {status.label}{status.changed?' (edited)':''}</strong>
    </header>
    <div className="react-gm-focus-presets" role="group" aria-label="Choose a built-in GM Focus">
      <button type="button" aria-pressed={!status.hasHome} disabled={unavailable||!status.hasHome}
        onClick={()=>perform(leaveGMFocus(layout),'Returned to your normal dashboard.')}>Normal dashboard</button>
      {GM_FOCUS_BUILTINS.map(preset=><button type="button" key={preset.id}
        aria-pressed={!status.activeId&&status.hasHome&&status.label===preset.label}
        disabled={unavailable} onClick={()=>perform(
          activateBuiltinGMFocus(layout,preset.id),preset.label+' Focus applied.')}>{preset.label}</button>)}
    </div>
    <div className="react-gm-focus-saved">
      <div className="react-gm-focus-saved-heading">
        <h3>Saved Focuses</h3><span>{status.saved.length}/{GM_FOCUS_LIMIT} saved</span>
      </div>
      <div className="react-gm-focus-list">
        {status.saved.length?status.saved.map(entry=><div key={entry.id} className="react-gm-focus-entry">
          <button type="button" className="react-gm-focus-choice"
            aria-pressed={status.activeId===entry.id} disabled={unavailable}
            onClick={()=>{setConfirmDelete('');perform(activateNamedGMFocus(layout,entry.id),'Opened '+entry.name+'.');}}>
            {entry.name}</button>
          {status.activeId===entry.id?<button type="button" disabled={unavailable||!status.changed}
            aria-label={'Update saved '+entry.name+' with current layout'}
            onClick={()=>perform(updateNamedGMFocus(layout,entry.id),'Updated '+entry.name+'.')}>Update saved</button>:null}
          {confirmDelete===entry.id?
            <span className="react-gm-focus-confirm">
              <span>Delete {entry.name}?</span>
              <button type="button" disabled={unavailable} onClick={async()=>{
                const ok=await perform(deleteNamedGMFocus(layout,entry.id),'Deleted '+entry.name+'.');
                if(ok)setConfirmDelete('');
              }}>Confirm</button>
              <button type="button" disabled={unavailable} onClick={()=>setConfirmDelete('')}>Cancel</button>
            </span>:
            <button type="button" className="react-gm-focus-delete" disabled={unavailable}
              aria-label={'Delete saved '+entry.name} onClick={()=>setConfirmDelete(entry.id)}>Delete</button>}
        </div>):<p className="react-gm-focus-empty">No named Focuses saved yet.</p>}
      </div>
      <form className="react-gm-focus-create" onSubmit={event=>{event.preventDefault();void saveNew();}}>
        <label htmlFor="reactGMFocusName">Save the current layout as a Focus
          <input type="text" id="reactGMFocusName" value={name} maxLength={48} autoComplete="off"
            disabled={unavailable||status.saved.length>=GM_FOCUS_LIMIT}
            onChange={event=>setName(event.target.value)} placeholder="Example: Siege of Vaelgard"/>
        </label>
        <button type="submit" disabled={unavailable||!name.trim()||status.saved.length>=GM_FOCUS_LIMIT}>Save Focus</button>
      </form>
    </div>
    <p className="react-gm-focus-help">Saved Focuses keep panel positions, sizes, visibility and backgrounds for desktop, tablet and mobile. Changes made in the layout editor can be applied to a named Focus using “Update saved”.</p>
    <p className="react-gm-focus-feedback" role="status" aria-live="polite">{message}</p>
  </section>;
}
