import React,{useEffect,useMemo,useRef,useState} from 'react';
import {freeformPercent} from '../../../src/state/workspaceFreeformModel.mjs';
import {
  COMBAT_PANEL_IDS,COMBAT_PANEL_LABELS,COMBAT_TOOL_CATEGORIES,COMBAT_WORKSPACE_PRESET_LIMIT,
  COMBAT_WORKSPACE_MODES,applyCombatWorkspaceMode,resetCombatWorkspace,
  normalizeCombatCamera,zoomCombatCamera,fitCombatCamera,
  applyCombatPreset,arrangeCombatWorkspace,combatWorkspaceStorageKey,
  defaultCombatWorkspaceLayout,dockCombatWindow,editCombatWindow,
  normalizeCombatWorkspace,removeCombatPreset,saveCombatPreset,setCombatGroup
} from './combatWorkspaceLayoutModel.mjs';
import styles from './CombatCommandCentre.module.css';

/** The descriptor leaves the actual combat controls mounted under their original service. */
export function CombatCommandPanel({children}){return children;}
const fingerprint=value=>JSON.stringify(value);
/** React fragments are grouping only; window descriptors stay independent. */
function collectCombatPanels(children){
  return React.Children.toArray(children).flatMap(child=>
    React.isValidElement(child)&&child.type===React.Fragment
      ?collectCombatPanels(child.props.children):[child]);
}
function readLayout(key){
  if(!key||typeof localStorage==='undefined')return defaultCombatWorkspaceLayout();
  try{
    const value=localStorage.getItem(key);
    return normalizeCombatWorkspace(value?JSON.parse(value):null);
  }catch{return defaultCombatWorkspaceLayout();}
}
const cameraStorageKey=key=>key?key+':camera':null;
function readCamera(key){
 try{return normalizeCombatCamera(JSON.parse(localStorage.getItem(cameraStorageKey(key))||'null'));}
 catch{return normalizeCombatCamera({});}
}
const boundsHeight=(freeform,visibleIds)=>Math.max(700,...visibleIds.map(id=>{
 const rect=freeform.positions[id];return rect?rect.y+rect.h+80:700;
}));

/**
 * The GM Combat Command Centre stores layout-only preferences under the GM UID
 * and campaign on this device. All gameplay writes still use the existing
 * permission-checked Firebase combat API in CombatWorkspace.
 */
export function CombatCommandCentre({uid,campaignId,children}){
  const storageKey=combatWorkspaceStorageKey(uid,campaignId);
  const [saved,setSaved]=useState(()=>readLayout(storageKey));
  const [undoStack,setUndoStack]=useState([]);
  const [redoStack,setRedoStack]=useState([]);
  const [cameraState,setCameraState]=useState(()=>({scope:storageKey,view:readCamera(storageKey)}));
  const camera=cameraState.scope===storageKey?cameraState.view:normalizeCombatCamera({});
  const updateCamera=update=>setCameraState(previous=>{
    const current=previous.scope===storageKey?previous.view:readCamera(storageKey);
    return {scope:storageKey,view:normalizeCombatCamera(
      typeof update==='function'?update(current):update)};
  });
  const [presetName,setPresetName]=useState('');
  const [maximised,setMaximised]=useState('');
  const [message,setMessage]=useState('');
  const [confirmReset,setConfirmReset]=useState(false);
  const [preview,setPreview]=useState(null);
  const [wide,setWide]=useState(false);
  const [sidebarExpanded,setSidebarExpanded]=useState(()=>
    typeof window!=='undefined'&&window.innerWidth>=800);
  const [selectedTools,setSelectedTools]=useState('overview');
  const root=useRef(null),canvas=useRef(null),stage=useRef(null),gesture=useRef(null);
  const layout=saved;
  const panels=collectCombatPanels(children).filter(child=>
    React.isValidElement(child)&&COMBAT_PANEL_IDS.includes(child.props.id));
  const visible=panels.filter(panel=>!layout.hidden.includes(panel.props.id));
  useEffect(()=>{
    setSaved(readLayout(storageKey));setPreview(null);
    setUndoStack([]);setRedoStack([]);setCameraState({scope:storageKey,view:readCamera(storageKey)});
    setMaximised('');setMessage('');setPresetName('');setConfirmReset(false);
  },[storageKey]);
  useEffect(()=>{
    const host=root.current,viewport=canvas.current;
    const refresh=()=>setWide((viewport?.clientWidth||host?.clientWidth||0)>=700);
    refresh();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(refresh);
    if(host)observer?.observe(host);
    if(viewport)observer?.observe(viewport);
    return ()=>observer?.disconnect();
  },[]);
  useEffect(()=>{
    if(cameraState.scope!==storageKey||!storageKey)return;
    const timeout=setTimeout(()=>{
      try{localStorage.setItem(cameraStorageKey(storageKey),JSON.stringify(cameraState.view));}
      catch{/* The canvas remains usable without browser persistence. */}
    },180);
    return ()=>clearTimeout(timeout);
  },[cameraState,storageKey]);
  useEffect(()=>{
    const viewport=canvas.current;
    if(!viewport||!wide)return;
    const wheel=event=>{
      if(event.target.closest?.('[data-combat-panel]'))return;
      event.preventDefault();
      const rect=viewport.getBoundingClientRect();
      updateCamera(current=>zoomCombatCamera(current,
        current.scale*(event.deltaY<0?1.12:1/1.12),
        {x:event.clientX-rect.left,y:event.clientY-rect.top}));
    };
    viewport.addEventListener('wheel',wheel,{passive:false});
    return ()=>viewport.removeEventListener('wheel',wheel);
  },[wide,storageKey]);
  const previewLayout=useMemo(()=>preview&&wide?
    editCombatWindow(layout,preview.id,preview.kind,preview.values):layout,
    [layout,preview,wide]);
  /** Gameplay state never enters the local geometry/history store. */
  const commit=(next,announce=false)=>{
    if(!storageKey){setMessage('GM account or campaign context is unavailable.');return false;}
    const normalized=normalizeCombatWorkspace(next);
    try{localStorage.setItem(storageKey,JSON.stringify(normalized));}
    catch{setMessage('Browser storage is unavailable. Layout changes have not been saved.');return false;}
    setSaved(normalized);
    setMessage(announce?'Canvas layout saved on this device.':'');
    return true;
  };
  const change=update=>{
    const next=normalizeCombatWorkspace(update(layout));
    if(fingerprint(next)===fingerprint(layout))return;
    if(commit(next)){
      setUndoStack(previous=>[...previous,layout].slice(-40));
      setRedoStack([]);
    }
  };
  const setPreference=change;
  const undo=()=>{
    if(!undoStack.length)return;
    const previous=undoStack[undoStack.length-1];
    if(commit(previous)){setUndoStack(undoStack.slice(0,-1));setRedoStack(rows=>[layout,...rows].slice(0,40));}
  };
  const redo=()=>{
    if(!redoStack.length)return;
    const next=redoStack[0];
    if(commit(next)){setRedoStack(redoStack.slice(1));setUndoStack(rows=>[...rows,layout].slice(-40));}
  };
  const startPan=event=>{
    if(!wide||gesture.current||event.button!==0||event.isPrimary===false||
       (event.target!==canvas.current&&event.target!==stage.current))return;
    gesture.current={kind:'pan',pointer:event.pointerId,x:event.clientX,y:event.clientY,
      origin:camera};
    event.preventDefault();canvas.current?.setPointerCapture?.(event.pointerId);
  };
  const begin=(event,id,kind,edge='se')=>{
    if(!wide||gesture.current||event.isPrimary===false||event.button!==0||
      layout.canvasLocked||layout.locked.includes(id)||layout.hidden.includes(id))return;
    const width=canvas.current?.clientWidth||0,initial=layout.freeform.positions[id];
    if(!width||!initial)return;
    gesture.current={id,kind,edge,initial,width,scale:camera.scale,
      pointer:event.pointerId,x:event.clientX,y:event.clientY};
    setPreview(null);setMessage('');
    event.preventDefault();event.stopPropagation();
    canvas.current?.setPointerCapture?.(event.pointerId);
  };
  const proposal=(g,event)=>{
    const dx=Math.round((event.clientX-g.x)*1000/(g.width*g.scale));
    const dy=Math.round((event.clientY-g.y)*1000/(g.width*g.scale));
    if(g.kind==='move')return {x:g.initial.x+dx,y:g.initial.y+dy};
    const values={...g.initial};
    if(g.edge.includes('e'))values.w+=dx;
    if(g.edge.includes('w')){values.x+=dx;values.w-=dx;}
    if(g.edge.includes('s'))values.h+=dy;
    if(g.edge.includes('n')){values.y+=dy;values.h-=dy;}
    return values;
  };
  const move=event=>{
    const g=gesture.current;
    if(!g||g.pointer!==event.pointerId)return;
    if(g.kind==='pan'){
      updateCamera({...g.origin,x:g.origin.x+event.clientX-g.x,
        y:g.origin.y+event.clientY-g.y});
    }else setPreview({id:g.id,kind:g.kind,values:proposal(g,event)});
  };
  const end=event=>{
    const g=gesture.current;
    if(!g||g.pointer!==event.pointerId)return;
    gesture.current=null;
    if(g.kind!=='pan'&&event.type==='pointerup'){
      const values=proposal(g,event);
      if(editCombatWindow(layout,g.id,g.kind,values)===layout)
        setMessage('That move or resize is blocked by a lock, boundary or another panel.');
      else change(previous=>editCombatWindow(previous,g.id,g.kind,values));
    }
    setPreview(null);
    try{canvas.current?.releasePointerCapture?.(event.pointerId);}catch{/* released */}
  };
  const keyboard=(event,id)=>{
    if(!wide||layout.canvasLocked||!event.altKey||!event.key.startsWith('Arrow'))return;
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
  const fitAll=()=>{
    const viewport=canvas.current;
    if(!viewport||!wide)return;
    updateCamera(fitCombatCamera(layout,visible.map(panel=>panel.props.id),
      viewport.clientWidth,viewport.clientHeight));
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
    if(!presetName.trim())return;
    const id='layout-'+crypto.randomUUID();
    const next=saveCombatPreset(layout,presetName,id);
    if(next===layout){setMessage('A layout with that name exists, or the preset limit was reached.');return;}
    change(previous=>saveCombatPreset(previous,presetName,id));
    setPresetName('');
  };
  return <section className={styles.centre} ref={root}
    aria-label="GM Combat Command Centre" data-testid="site-gm-combat-command-centre">

    <div className={styles.workArea}>
      <aside className={styles.toolSidebar} aria-label="Combat Command Centre tools">
        <button type="button" className={styles.sidebarToggle}
          aria-expanded={sidebarExpanded} aria-controls="asteria-combat-tool-list"
          onClick={()=>setSidebarExpanded(value=>!value)}>
          {sidebarExpanded?'Collapse Combat Tools':'Show Combat Tools'}
        </button>
        {sidebarExpanded?<div id="asteria-combat-tool-list" className={styles.toolList}>
          {COMBAT_TOOL_CATEGORIES.map(group=><section key={group.id}>
            <button type="button" className={styles.toolGroup}
              aria-expanded={selectedTools===group.id}
              onClick={()=>setSelectedTools(current=>current===group.id?'':group.id)}>
              {group.label}<span aria-hidden="true">{selectedTools===group.id?'−':'+'}</span>
            </button>
            {selectedTools===group.id?<div className={styles.toolItems}>
              {group.panels.map(id=>{
                const active=!hidden.includes(id);
                return <button type="button" key={id} className={styles.toolItem}
                  aria-pressed={active} disabled={active&&visible.length<=1}
                  onClick={()=>setPreference(previous=>({
                    ...previous,hidden:active?
                      [...previous.hidden,id]:
                      previous.hidden.filter(other=>other!==id)
                  }))}>
                  <span aria-hidden="true">{active?'☑':'☐'}</span>{COMBAT_PANEL_LABELS[id]}
                </button>;
              })}
            </div>:null}
          </section>)}
          <div className={styles.quickActions}>
            <button type="button" disabled={!hidden.length||!storageKey}
              onClick={()=>setPreference(previous=>({...previous,hidden:[]}))}>
              Show all panels ({visible.length}/{panels.length})
            </button>
          </div>
          <button type="button" className={styles.toolGroup}
            onClick={()=>document.getElementById('combat-canvas-presets')?.scrollIntoView({
              behavior:'smooth',block:'nearest'})}>
            Saved Layouts
          </button>
          <p className={styles.sidebarHint}>Drag any window header to move it. Resize using its edges. Drag empty canvas space to pan; layout changes save automatically.</p>
        </div>:null}
      </aside>
      <div className={styles.mainWorkspace}>
    <header className={styles.toolbar}>
      <div>
        <h3>Combat Command Centre</h3>
        <p>Adjust window positions without changing combat state or your saved dashboard.</p>
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={!undoStack.length} onClick={undo}
          aria-label="Undo canvas change">Undo</button>
        <button type="button" disabled={!redoStack.length} onClick={redo}
          aria-label="Redo canvas change">Redo</button>
        <button type="button" disabled={layout.canvasLocked}
          onClick={()=>change(arrangeCombatWorkspace)}>Auto-arrange</button>
        <button type="button" aria-pressed={layout.canvasLocked}
          onClick={()=>setPreference(previous=>({...previous,canvasLocked:!previous.canvasLocked}))}>
          {layout.canvasLocked?'Unlock Canvas':'Lock Canvas'}
        </button>
      </div>
    </header>
    <div className={styles.modeBar} role="group" aria-label="Combat workspace quick layouts">
      <strong>Quick layouts</strong>
      {COMBAT_WORKSPACE_MODES.map(mode=>
        <button type="button" key={mode.id} disabled={!storageKey}
          onClick={()=>setPreference(previous=>applyCombatWorkspaceMode(previous,mode.id))}>
          {mode.label}
        </button>)}
      <button type="button" disabled={!hidden.length||!storageKey}
        onClick={()=>setPreference(previous=>({...previous,hidden:[]}))}>
        Show all {panels.length} panels
      </button>
      <button type="button" onClick={fitAll} disabled={!wide}
        data-testid="site-combat-fit-all">Fit all</button>
      <button type="button" onClick={()=>updateCamera(current=>zoomCombatCamera(current,
        current.scale/1.2,{x:(canvas.current?.clientWidth||0)/2,
          y:(canvas.current?.clientHeight||0)/2}))} disabled={!wide}
        aria-label="Zoom out of canvas">−</button>
      <output aria-label="Canvas zoom" className={styles.zoomValue}>
        {Math.round(camera.scale*100)}%
      </output>
      <button type="button" onClick={()=>updateCamera(current=>zoomCombatCamera(current,
        current.scale*1.2,{x:(canvas.current?.clientWidth||0)/2,
          y:(canvas.current?.clientHeight||0)/2}))} disabled={!wide}
        aria-label="Zoom into canvas">+</button>
      <button type="button" onClick={()=>updateCamera(normalizeCombatCamera({}))}
        disabled={!wide}>Reset view</button>
      <button type="button" disabled={!storageKey} onClick={()=>setConfirmReset(true)}>
        Reset layout
      </button>
    </div>
    {confirmReset?<div className={styles.confirmReset}
      role="group" aria-label="Confirm combat layout reset">
      <p>Reset positions, sizes, locks and visibility to the default arrangement?
        Named saved layouts are kept. This does not change combat or encounter data.</p>
      <button type="button" onClick={()=>{
        setPreference(previous=>resetCombatWorkspace(previous));setConfirmReset(false);
      }}>Confirm reset</button>
      <button type="button" onClick={()=>setConfirmReset(false)}>Cancel</button>
    </div>:null}
    <details className={styles.canvasSettings}>
      <summary>Canvas options &amp; saved layouts</summary>
      <div className={styles.editor} role="group" aria-label="Combat canvas preferences">
        <label><input type="checkbox" checked={layout.freeform.snap}
          onChange={event=>setPreference(previous=>({...previous,freeform:{
            ...previous.freeform,snap:event.target.checked}}))}/> Snap panel edges</label>
        <label><input type="checkbox" checked={layout.freeform.allowOverlap}
          onChange={event=>setPreference(previous=>({...previous,freeform:{
            ...previous.freeform,allowOverlap:event.target.checked}}))}/> Allow panel overlap</label>
        <label>Layout name
          <input type="text" maxLength={48} placeholder="e.g. Boss Battle"
            value={presetName} onChange={event=>setPresetName(event.target.value)}/></label>
        <button type="button" onClick={savePreset}
          disabled={!presetName.trim()||
            layout.savedWorkspaces.length>=COMBAT_WORKSPACE_PRESET_LIMIT}>Save layout preset</button>
        <p>Drag panel headers directly to move, and edges or corners to resize.
          Alt+arrow moves a focused panel; Alt+Shift+arrow resizes.
          Pan the empty canvas by dragging it, or use the zoom buttons.</p>
      </div>
    </details>
    {layout.savedWorkspaces.length?<div id="combat-canvas-presets" className={styles.presets} aria-label="Combat layout presets">
      <strong>Combat layouts</strong>
      {layout.savedWorkspaces.map(item=><span key={item.id}>
        <span>{item.name}</span>
        <button type="button" onClick={()=>change(previous=>applyCombatPreset(previous,item.id))}>Apply</button>
        <button type="button" aria-label={'Delete layout '+item.name}
          onClick={()=>change(previous=>removeCombatPreset(previous,item.id))}>Delete</button>
      </span>)}
    </div>:null}
    {hidden.length?<div className={styles.hidden} aria-label="Hidden combat windows">
      <strong>Restore windows:</strong> {hidden.map(id=>
        <button type="button" key={id} onClick={()=>restore(id)}>
          {COMBAT_PANEL_LABELS[id]}</button>)}
    </div>:null}
    {visible.length===0?<div className={styles.empty} role="status">
      <p>All combat windows are hidden. Restore the systems without changing combat data.</p>
      <button type="button" onClick={()=>setPreference(previous=>({...previous,hidden:[]}))}>
        Show all panels
      </button>
    </div>:null}
    {!wide?<p className={styles.note}>On narrow screens combat tools stack vertically for
      readable controls. The freeform canvas and pan/zoom controls are available on wider screens.</p>:null}
    <div className={styles.canvas} ref={canvas}
      data-editing={wide&&!layout.canvasLocked}
      data-layout-mode={wide?'freeform':'stacked'}
      aria-label="Combat freeform canvas"
      onPointerDown={startPan}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onLostPointerCapture={end}>
      <div ref={stage} className={styles.stage+(maximised?' '+styles.stageMaximised:'')}
        data-stage="combat-canvas-stage"
        style={{'--combat-canvas-height':boundsHeight(previewLayout.freeform,
          visible.map(panel=>panel.props.id)),
          '--combat-pan-x':camera.x+'px','--combat-pan-y':camera.y+'px',
          '--combat-scale':camera.scale}}>
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
          <header className={styles.windowBar}
            data-testid={'combat-drag-header-'+id}
            onPointerDown={event=>{
              if(event.target.closest('button,input,select,textarea,a,summary,details,label'))return;
              begin(event,id,'move');
            }}>
            <strong tabIndex={wide&&!isLocked&&!layout.canvasLocked?0:undefined}
              role="button" aria-label={'Move '+label}
              aria-disabled={isLocked||layout.canvasLocked}
              onKeyDown={event=>keyboard(event,id)}>
              {label}{grouped?' · Grouped':''}
            </strong>
            <div className={styles.windowActions}>
              <button type="button" aria-label={(isMinimised?'Restore ':'Minimise ')+label}
                onClick={()=>minimize(id)}>{isMinimised?'Restore':'−'}</button>
              <button type="button" aria-label={(isMaximised?'Restore size of ':'Maximise ')+label}
                onClick={()=>setMaximised(isMaximised?'':id)}>
                {isMaximised?'Restore':'□'}</button>
              <details className={styles.options}>
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
              </details>
            </div>
          </header>
          <div className={styles.windowContent} aria-hidden={isMinimised}
            inert={isMinimised?true:undefined}>{panel.props.children}</div>
          {wide&&!layout.canvasLocked&&!isLocked&&!isMinimised&&!isMaximised?
            ['n','e','s','w','ne','nw','se','sw'].map(edge=>
              <button type="button" key={edge}
                className={styles.resizeHandle}
                data-resize-edge={edge}
                aria-label={'Resize '+label+' '+edge}
                onPointerDown={event=>begin(event,id,'resize',edge)}
                onKeyDown={event=>keyboard(event,id)}>
                <span aria-hidden="true">{edge==='se'?'↘':''}</span>
              </button>):null}
        </article>;
      })}
      </div>
    </div>
    {message?<p className={styles.note} role="status">{message}</p>:null}
      </div>
    </div>
  </section>;
}
