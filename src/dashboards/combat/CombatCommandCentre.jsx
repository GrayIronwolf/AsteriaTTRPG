import React,{useEffect,useMemo,useRef,useState} from 'react';
import {freeformCanvasHeight,freeformPercent} from '../../../src/state/workspaceFreeformModel.mjs';
import {
  COMBAT_PANEL_IDS,COMBAT_PANEL_LABELS,COMBAT_WORKSPACE_PRESET_LIMIT,
  applyCombatPreset,arrangeCombatWorkspace,combatWorkspaceStorageKey,
  defaultCombatWorkspaceLayout,dockCombatWindow,editCombatWindow,
  normalizeCombatWorkspace,removeCombatPreset,saveCombatPreset,setCombatGroup
} from './combatWorkspaceLayoutModel.mjs';
import styles from './CombatCommandCentre.module.css';

/** The descriptor leaves the actual combat controls mounted under their original service. */
export function CombatCommandPanel({children}){return children;}
const fingerprint=value=>JSON.stringify(value);
function readLayout(key){
  if(!key||typeof localStorage==='undefined')return defaultCombatWorkspaceLayout();
  try{
    const value=localStorage.getItem(key);
    return normalizeCombatWorkspace(value?JSON.parse(value):null);
  }catch{return defaultCombatWorkspaceLayout();}
}
function scopedUpdate(history,update){
  if(!history)return history;
  const next=normalizeCombatWorkspace(update(history.present));
  if(fingerprint(next)===fingerprint(history.present))return history;
  return {present:next,past:[...history.past,history.present].slice(-40),future:[]};
}

/**
 * The GM Combat Command Centre stores layout-only preferences under the GM UID
 * and campaign on this device. All gameplay writes still use the existing
 * permission-checked Firebase combat API in CombatWorkspace.
 */
export function CombatCommandCentre({uid,campaignId,children}){
  const storageKey=combatWorkspaceStorageKey(uid,campaignId);
  const [saved,setSaved]=useState(()=>readLayout(storageKey));
  const [history,setHistory]=useState(null);
  const [presetName,setPresetName]=useState('');
  const [maximised,setMaximised]=useState('');
  const [message,setMessage]=useState('');
  const [preview,setPreview]=useState(null);
  const [wide,setWide]=useState(false);
  const root=useRef(null),canvas=useRef(null),gesture=useRef(null);
  const layout=history?.present||saved,editing=Boolean(history);
  const panels=React.Children.toArray(children).filter(child=>
    React.isValidElement(child)&&COMBAT_PANEL_IDS.includes(child.props.id));
  const visible=panels.filter(panel=>!layout.hidden.includes(panel.props.id));
  useEffect(()=>{
    setSaved(readLayout(storageKey));setHistory(null);setPreview(null);
    setMaximised('');setMessage('');setPresetName('');
  },[storageKey]);
  useEffect(()=>{
    const host=root.current;
    const refresh=()=>setWide((host?.getBoundingClientRect().width||0)>=900);
    refresh();
    const observer=typeof ResizeObserver==='undefined'||!host?null:new ResizeObserver(refresh);
    observer?.observe(host);
    return ()=>observer?.disconnect();
  },[]);
  const previewLayout=useMemo(()=>preview&&editing?
    editCombatWindow(layout,preview.id,preview.kind,preview.values):layout,
  [layout,preview,editing]);
  const change=update=>{setHistory(previous=>scopedUpdate(previous,update));setMessage('');};
  const commit=next=>{
    if(!storageKey){setMessage('GM account or campaign context is unavailable.');return false;}
    const normalized=normalizeCombatWorkspace(next);
    try{
      localStorage.setItem(storageKey,JSON.stringify(normalized));
    }catch{
      setMessage('Browser storage is unavailable. Your layout has not been saved.');
      return false;
    }
    setSaved(normalized);setHistory(null);setPreview(null);
    setMessage('Combat workspace saved on this device for this GM and campaign.');
    return true;
  };
  const setPreference=update=>{
    if(editing)change(update);
    else commit(update(layout));
  };
  const begin=(event,id,kind)=>{
    if(!editing||!wide||gesture.current||event.isPrimary===false||event.button!==0||
      layout.locked.includes(id)||layout.hidden.includes(id))return;
    const width=canvas.current?.getBoundingClientRect().width||0,initial=layout.freeform.positions[id];
    if(!width||!initial)return;
    gesture.current={id,kind,initial,width,pointer:event.pointerId,
      x:event.clientX,y:event.clientY};
    setPreview(null);setMessage('');
    event.preventDefault();event.stopPropagation();
    canvas.current?.setPointerCapture?.(event.pointerId);
  };
  const proposal=(g,event)=>{
    const dx=Math.round((event.clientX-g.x)*1000/g.width);
    const dy=Math.round((event.clientY-g.y)*1000/g.width);
    return g.kind==='move'?{x:g.initial.x+dx,y:g.initial.y+dy}:
      {w:g.initial.w+dx,h:g.initial.h+dy};
  };
  const move=event=>{
    const g=gesture.current;
    if(g?.pointer===event.pointerId)
      setPreview({id:g.id,kind:g.kind,values:proposal(g,event)});
  };
  const end=event=>{
    const g=gesture.current;
    if(!g||g.pointer!==event.pointerId)return;
    gesture.current=null;
    if(event.type==='pointerup'){
      const values=proposal(g,event);
      if(editCombatWindow(layout,g.id,g.kind,values)===layout)
        setMessage('That move or resize is blocked by a lock, boundary or another panel.');
      else change(previous=>editCombatWindow(previous,g.id,g.kind,values));
    }
    setPreview(null);
    try{canvas.current?.releasePointerCapture?.(event.pointerId);}catch{/* released */}
  };
  const keyboard=(event,id)=>{
    if(!editing||!wide||!event.altKey||!event.key.startsWith('Arrow'))return;
    const deltas={ArrowLeft:[-10,0],ArrowRight:[10,0],
      ArrowUp:[0,-10],ArrowDown:[0,10]};
    const delta=deltas[event.key],rect=layout.freeform.positions[id];
    if(!delta||!rect)return;
    event.preventDefault();
    const kind=event.shiftKey?'resize':'move';
    const values=kind==='move'?{x:rect.x+delta[0],y:rect.y+delta[1]}:
      {w:rect.w+delta[0],h:rect.h+delta[1]};
    change(previous=>editCombatWindow(previous,id,kind,values));
  };
  const minimize=id=>setPreference(previous=>({...previous,
    minimized:previous.minimized.includes(id)?
      previous.minimized.filter(other=>other!==id):[...previous.minimized,id]
  }));
  const hidden=layout.hidden;
  const restore=id=>setPreference(previous=>({...previous,
    hidden:previous.hidden.filter(other=>other!==id)
  }));
  const savePreset=()=>{
    if(!presetName.trim()||!history)return;
    const id='layout-'+crypto.randomUUID();
    const next=saveCombatPreset(layout,presetName,id);
    if(next===layout){setMessage('A layout with that name exists, or the preset limit was reached.');return;}
    change(previous=>saveCombatPreset(previous,presetName,id));
    setPresetName('');
  };
  return <section className={styles.centre} ref={root}
    aria-label="GM Combat Command Centre" data-testid="site-gm-combat-command-centre">
    <header className={styles.toolbar}>
      <div>
        <h3>Combat Command Centre</h3>
        <p>Adjust window positions without changing combat state or your saved dashboard.</p>
      </div>
      <div className={styles.actions}>
        {!editing?<button type="button" disabled={!storageKey||!wide}
          data-testid="site-combat-layout-edit"
          onClick={()=>{setHistory({present:saved,past:[],future:[]});setMessage('');}}>
          Customise Combat Workspace</button>:<>
          <button type="button" onClick={()=>setHistory(previous=>previous?.past.length?{
            present:previous.past.at(-1),past:previous.past.slice(0,-1),
            future:[previous.present,...previous.future].slice(0,40)
          }:previous)} disabled={!history.past.length}>Undo</button>
          <button type="button" onClick={()=>setHistory(previous=>previous?.future.length?{
            present:previous.future[0],past:[...previous.past,previous.present].slice(-40),
            future:previous.future.slice(1)
          }:previous)} disabled={!history.future.length}>Redo</button>
          <button type="button" onClick={()=>change(arrangeCombatWorkspace)}>Auto-arrange</button>
          <button type="button" onClick={()=>{setHistory(null);setPreview(null);}}>Discard</button>
          <button type="button" data-testid="site-combat-layout-save"
            onClick={()=>commit(layout)}>Save Layout</button>
        </>}
      </div>
    </header>
    {editing?<div className={styles.editor} role="group" aria-label="Combat window preferences">
      <label><input type="checkbox" checked={layout.freeform.snap}
        onChange={event=>change(previous=>({...previous,freeform:{
          ...previous.freeform,snap:event.target.checked
        }}))}/> Snap to grid</label>
      <label><input type="checkbox" checked={layout.freeform.allowOverlap}
        onChange={event=>change(previous=>({...previous,freeform:{
          ...previous.freeform,allowOverlap:event.target.checked
        }}))}/> Allow overlap</label>
      <label>Named layout
        <input type="text" maxLength={48} placeholder="e.g. Boss Battle"
          value={presetName} onChange={event=>setPresetName(event.target.value)}/></label>
      <button type="button" onClick={savePreset} disabled={!presetName.trim()||
        layout.savedWorkspaces.length>=COMBAT_WORKSPACE_PRESET_LIMIT}>Save preset</button>
      <p>Drag a window's Move handle or resize corner. Alt+arrow moves; Alt+Shift+arrow resizes.
        Lock, dock, group or hide individual windows using Window options.</p>
    </div>:null}
    {layout.savedWorkspaces.length?<div className={styles.presets} aria-label="Combat layout presets">
      <strong>Combat layouts</strong>
      {layout.savedWorkspaces.map(item=><span key={item.id}>
        <span>{item.name}</span>
        <button type="button" disabled={editing}
          onClick={()=>commit(applyCombatPreset(layout,item.id))}>Apply</button>
        <button type="button" disabled={editing}
          aria-label={'Delete layout '+item.name}
          onClick={()=>commit(removeCombatPreset(layout,item.id))}>Delete</button>
      </span>)}
    </div>:null}
    {hidden.length?<div className={styles.hidden} aria-label="Hidden combat windows">
      <strong>Restore windows:</strong> {hidden.map(id=>
        <button type="button" key={id} onClick={()=>restore(id)}>
          {COMBAT_PANEL_LABELS[id]}</button>)}
    </div>:null}
    {!wide?<p className={styles.note}>On narrow screens, windows use a readable stacked layout.
      Open this workspace on a wide screen to move or resize them.</p>:null}
    <div className={styles.canvas} ref={canvas}
      data-editing={editing} data-layout-mode={wide?'freeform':'stacked'}
      style={{'--combat-canvas-height':freeformCanvasHeight(previewLayout.freeform,
        visible.map(panel=>panel.props.id))}}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onLostPointerCapture={end}>
      {visible.map(panel=>{
        const id=panel.props.id,rect=previewLayout.freeform.positions[id];
        const isMinimised=layout.minimized.includes(id),isMaximised=maximised===id;
        const isLocked=layout.locked.includes(id);
        const grouped=layout.groups.some(row=>row.includes(id));
        const label=COMBAT_PANEL_LABELS[id];
        return <article key={id} className={styles.window+
          (isMinimised?' '+styles.minimised:'')+
          (isMaximised?' '+styles.maximised:'')}
          data-combat-panel={id}
          style={{'--combat-x':freeformPercent(rect.x),'--combat-y':rect.y/10+'cqw',
            '--combat-w':freeformPercent(rect.w),'--combat-h':rect.h/10+'cqw'}}>
          <header className={styles.windowBar}>
            {editing?<button type="button" className={styles.moveHandle}
              disabled={isLocked} aria-label={'Move '+label}
              onPointerDown={event=>begin(event,id,'move')}
              onKeyDown={event=>keyboard(event,id)}>Move</button>:null}
            <strong>{label}{grouped?' · Grouped':''}</strong>
            <div className={styles.windowActions}>
              <button type="button" aria-label={(isMinimised?'Restore ':'Minimise ')+label}
                onClick={()=>minimize(id)}>{isMinimised?'Restore':'−'}</button>
              <button type="button" aria-label={(isMaximised?'Restore size of ':'Maximise ')+label}
                onClick={()=>setMaximised(isMaximised?'':id)}>
                {isMaximised?'Restore':'□'}</button>
              {editing?<details className={styles.options}>
                <summary aria-label={'Window options for '+label}>Options</summary>
                <div>
                  <button type="button" onClick={()=>change(previous=>({...previous,
                    locked:isLocked?previous.locked.filter(other=>other!==id):
                      [...previous.locked,id]
                  }))}>{isLocked?'Unlock window':'Lock window'}</button>
                  <button type="button" disabled={isLocked}
                    onClick={()=>change(previous=>({...previous,
                      hidden:[...previous.hidden,id]
                    }))}>Hide window</button>
                  <button type="button" disabled={isLocked}
                    onClick={()=>change(previous=>dockCombatWindow(previous,id,'left'))}>
                    Dock left</button>
                  <button type="button" disabled={isLocked}
                    onClick={()=>change(previous=>dockCombatWindow(previous,id,'right'))}>
                    Dock right</button>
                  {grouped?<button type="button"
                    onClick={()=>change(previous=>setCombatGroup(previous,id))}>
                    Ungroup window</button>:null}
                  <label>Group with
                    <select value="" disabled={isLocked}
                      onChange={event=>change(previous=>setCombatGroup(previous,id,event.target.value))}>
                      <option value="">Select window</option>
                      {COMBAT_PANEL_IDS.filter(other=>other!==id&&!hidden.includes(other))
                        .map(other=><option value={other} key={other}>{COMBAT_PANEL_LABELS[other]}</option>)}
                    </select>
                  </label>
                </div>
              </details>:null}
            </div>
          </header>
          <div className={styles.windowContent} aria-hidden={isMinimised}
            inert={isMinimised?true:undefined}>{panel.props.children}</div>
          {editing&&!isLocked&&!isMinimised&&!isMaximised?
            <button type="button" className={styles.resizeHandle}
              aria-label={'Resize '+label}
              onPointerDown={event=>begin(event,id,'resize')}
              onKeyDown={event=>keyboard(event,id)}>↘</button>:null}
        </article>;
      })}
    </div>
    {message?<p className={styles.note} role="status">{message}</p>:null}
  </section>;
}
