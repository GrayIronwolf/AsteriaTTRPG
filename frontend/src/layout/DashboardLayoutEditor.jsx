import React,{useMemo,useRef,useState} from 'react';
import {
  DASHBOARD_PANEL_REGISTRY,DASHBOARD_LAYOUT_PRESETS,DASHBOARD_BACKGROUND_STYLES,
  DASHBOARD_VIEWPORTS,dashboardLayoutForViewport,dashboardViewportFromWidth,
  gridRowCount,visibleDashboardPanels,applyDashboardPreset,toggleDashboardPanel,
  lockDashboardGridPanel,autoArrangeDashboardLayout,placeDashboardGridPanel,
  fitDashboardGridPanel,dashboardPanelSizeChoices,dashboardPointerProposal,
  dashboardGridRule,setDashboardBackground,defaultDashboardLayout
} from '../../../src/state/dashboardLayoutModel.mjs';
import {dashboardKeyboardProposal} from '../../../src/state/dashboardGridModel.mjs';
import {
  createLayoutHistory,undoLayoutHistory,redoLayoutHistory,
  updateViewportHistory,layoutFingerprint
} from './layoutHistoryModel.mjs';
import styles from './DashboardLayoutEditor.module.css';

const BACKGROUNDS={obsidian:'Obsidian Stone',slate:'Stone Slate',arcane:'Arcane Mist'};

function GridCanvas({role,layout,selected,onSelect,onChange,disabled}){
  const ids=visibleDashboardPanels(layout,role);
  const items=DASHBOARD_PANEL_REGISTRY[role];
  const names=new Map(items.map(row=>[row.id,row.label]));
  const host=useRef(null),gesture=useRef(null);
  const [preview,setPreview]=useState(null);
  const [feedback,setFeedback]=useState('');
  const view=useMemo(()=>{
    if(!preview)return layout;
    return preview.kind==='resize'
      ?fitDashboardGridPanel(layout,role,preview.id,preview.rect.w,preview.rect.h)
      :placeDashboardGridPanel(layout,role,preview.id,preview.rect.x,preview.rect.y);
  },[layout,role,preview]);
  const begin=(event,id,kind)=>{
    if(disabled||gesture.current||event.isPrimary===false||event.button!==0||
      layout.lockedPositions.includes(id))return;
    const panel=layout.placements[id],node=host.current;
    if(!panel||!node)return;
    const style=window.getComputedStyle(node),bounds=node.getBoundingClientRect();
    const columnGap=parseFloat(style.columnGap)||0,rowGap=parseFloat(style.rowGap)||0;
    const width=(bounds.width-11*columnGap)/12;
    const row=parseFloat(style.gridAutoRows)||54;
    gesture.current={id,kind,pointer:event.pointerId,
      left:event.clientX,top:event.clientY,rect:panel,
      stepX:width+columnGap,stepY:row+rowGap};
    onSelect(id);setPreview(null);setFeedback('');
    event.stopPropagation();event.preventDefault();
    node.setPointerCapture?.(event.pointerId);
  };
  const propose=(gesture,event)=>dashboardPointerProposal(role,gesture.id,gesture.rect,gesture.kind,
    (event.clientX-gesture.left)/gesture.stepX,(event.clientY-gesture.top)/gesture.stepY);
  const move=event=>{
    const current=gesture.current;if(!current||current.pointer!==event.pointerId)return;
    const rect=propose(current,event);
    if(rect)setPreview({id:current.id,kind:current.kind,rect});
  };
  const end=event=>{
    const current=gesture.current;if(!current||current.pointer!==event.pointerId)return;
    gesture.current=null;
    const rect=propose(current,event);
    if(rect){
      const next=current.kind==='resize'
        ?fitDashboardGridPanel(layout,role,current.id,rect.w,rect.h)
        :placeDashboardGridPanel(layout,role,current.id,rect.x,rect.y);
      const changed=JSON.stringify(next.placements)!==JSON.stringify(layout.placements);
      if(changed)onChange(()=>next);
      else if(JSON.stringify(rect)!==JSON.stringify(current.rect))
        setFeedback('That position or size is blocked by another locked panel.');
    }
    setPreview(null);
    try{host.current?.releasePointerCapture?.(event.pointerId);}catch{/* already released */}
  };
  const cancel=event=>{
    if(gesture.current?.pointer!==event.pointerId)return;
    gesture.current=null;setPreview(null);
    try{host.current?.releasePointerCapture?.(event.pointerId);}catch{/* already released */}
  };
  const keyboard=(id,kind,key)=>{
    const rect=layout.placements[id];
    if(disabled||!rect||layout.lockedPositions.includes(id))return;
    const next=dashboardKeyboardProposal(role,id,rect,kind,key);
    if(!next)return;
    onChange(previous=>kind==='resize'
      ?fitDashboardGridPanel(previous,role,id,next.w,next.h)
      :placeDashboardGridPanel(previous,role,id,next.x,next.y));
  };
  return <div className={styles.canvasRegion}>
    <p className={styles.hint}>Drag a panel to snap it onto the 12-column grid.
      Hold Alt and use arrow keys to move; Alt+Shift+arrows resize. Locked panels stay in place.</p>
    <div className={styles.scroller}>
      <div className={styles.canvas} ref={host} data-testid="site-layout-canvas"
        style={{'--canvas-rows':gridRowCount(view.placements,ids)}}
        onPointerMove={move} onPointerUp={end}
        onPointerCancel={cancel} onLostPointerCapture={cancel}>
        {ids.map(id=>{
          const pos=view.placements[id];if(!pos)return null;
          const locked=layout.lockedPositions.includes(id);
          const rule=dashboardGridRule(role,id);
          return <div key={id} className={styles.tile+(selected===id?' '+styles.selected:'')}
            data-layout-tile={id}
            style={{gridColumn:(pos.x+1)+' / span '+pos.w,
              gridRow:(pos.y+1)+' / span '+pos.h}}>
            <button type="button" className={styles.moveHandle}
              aria-label={'Move '+names.get(id)} aria-pressed={selected===id}
              disabled={disabled} onPointerDown={event=>begin(event,id,'move')}
              onKeyDown={event=>{
                if(!event.altKey||!event.key.startsWith('Arrow'))return;
                event.preventDefault();keyboard(id,event.shiftKey?'resize':'move',event.key);
              }} onClick={()=>onSelect(id)}>
              <strong>{names.get(id)}</strong><small>{pos.w}×{pos.h} cells</small>
            </button>
            <div className={styles.tileActions}>
              <button type="button" disabled={disabled}
                aria-label={(locked?'Unlock ':'Lock ')+names.get(id)}
                aria-pressed={locked} onClick={()=>onChange(previous=>
                  lockDashboardGridPanel(previous,role,id,!locked))}>
                {locked?'Locked':'Lock'}
              </button>
              {!rule?.fixed?<button type="button" className={styles.resizeHandle}
                disabled={disabled||locked} aria-label={'Drag to resize '+names.get(id)}
                onPointerDown={event=>begin(event,id,'resize')}>Resize</button>:null}
            </div>
          </div>;
        })}
      </div>
    </div>
    {!ids.length?<p role="status">No visible panels. Enable one in the Panel Library below.</p>:null}
    {feedback?<p role="status">{feedback}</p>:null}
  </div>;
}
export function DashboardLayoutEditor({
  role='player',layout:source,onSave,onClose,disabled=false
}){
  const [history,setHistory]=useState(()=>createLayoutHistory(source,role));
  const [viewport,setViewport]=useState(()=>
    dashboardViewportFromWidth(typeof window==='undefined'?1200:window.innerWidth));
  const original=useRef(source);
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [confirm,setConfirm]=useState('');
  const current=history.present;
  const baseline=layoutFingerprint(original.current,role);
  const remote=layoutFingerprint(source,role)!==baseline;
  const blocked=disabled||busy||remote;
  const dirty=layoutFingerprint(current,role)!==baseline;
  const view=useMemo(()=>dashboardLayoutForViewport(current,role,viewport),[current,role,viewport]);
  const visible=visibleDashboardPanels(view,role);
  const chosen=visible.includes(selected)?selected:(visible[0]||'');
  const item=DASHBOARD_PANEL_REGISTRY[role].find(x=>x.id===chosen);
  const position=view.placements[chosen];
  const locked=Boolean(chosen&&view.lockedPositions.includes(chosen));
  const change=callback=>setHistory(previous=>updateViewportHistory(previous,role,viewport,callback));
  const save=async()=>{
    if(blocked||!dirty)return;
    setBusy(true);setMessage('');
    try{
      const result=await onSave(current,original.current);
      if(result?.ok===false)throw Error(result.error||'Layout could not be saved.');
      setMessage('Dashboard layout saved.');
      onClose?.();
    }catch(error){setMessage(error?.message||'Layout could not be saved.');}
    finally{setBusy(false);}
  };
  const cancel=()=>{
    if(busy)return;
    if(dirty){setConfirm('discard');return;}
    onClose?.();
  };
  const reset=()=>{
    change(previous=>{
      const defaults=defaultDashboardLayout(role);
      return {...defaults,
        ...(role==='gm'?{
          ...(previous.focusModes?{focusModes:previous.focusModes}:{}),
          ...(previous.focusHome?{focusHome:previous.focusHome}:{})
        }:{}),
        ...(previous.viewportLayouts?{viewportLayouts:previous.viewportLayouts}:{})};
    });
    setConfirm('');
    setMessage('Default arrangement selected. Save to keep this change.');
  };
  const reload=()=>{
    original.current=source;
    setHistory(createLayoutHistory(source,role));
    setMessage('Latest saved layout loaded.');setConfirm('');
  };
  return <section className={styles.editor} data-testid="site-layout-editor"
    aria-label="Dashboard Layout Editor">
    <header className={styles.header}>
      <div><h2>Dashboard Layout Editor</h2>
        <p>Move, resize, lock and arrange the existing dashboard panels.
          Your changes only affect layout, never game data.</p></div>
      <button type="button" onClick={cancel} disabled={busy}>Close editor</button>
    </header>
    {remote?<div role="alert" className={styles.warning}>This layout changed in another session.
      Reload the saved layout before applying more changes.
      <button type="button" onClick={reload} disabled={busy}>Reload saved layout</button>
    </div>:null}
    <div className={styles.toolbar}>
      <div className={styles.viewport} role="group" aria-label="Screen size layout">
        {DASHBOARD_VIEWPORTS.map(key=><button key={key} type="button"
          aria-pressed={viewport===key} disabled={busy}
          onClick={()=>{setViewport(key);setSelected('');setMessage('');}}>
          {key[0].toUpperCase()+key.slice(1)}</button>)}
      </div>
      <div className={styles.history}>
        <button type="button" data-testid="site-layout-undo" disabled={blocked||!history.past.length}
          onClick={()=>{setHistory(undoLayoutHistory);setMessage('');}}>Undo</button>
        <button type="button" data-testid="site-layout-redo" disabled={blocked||!history.future.length}
          onClick={()=>{setHistory(redoLayoutHistory);setMessage('');}}>Redo</button>
        <button type="button" disabled={blocked}
          onClick={()=>setConfirm('reset')}>Reset {viewport}</button>
      </div>
    </div>
    <GridCanvas key={role+':'+viewport} role={role} layout={view} selected={chosen}
      onSelect={setSelected} disabled={blocked}
      onChange={callback=>change(callback)} />
    <div className={styles.controls}>
      <section className={styles.controlPanel} aria-label="Selected panel settings">
        <h3>Selected Panel</h3>
        {!item||!position?<p>Choose a visible panel on the grid.</p>:<>
          <strong>{item.label}</strong>
          <p>{item.category} · {position.w}×{position.h} grid cells</p>
          <label>Panel background
            <select value={view.panelBackgrounds?.[chosen]||'default'} disabled={disabled||busy}
              onChange={e=>change(previous=>
                setDashboardBackground(previous,role,e.target.value,chosen))}>
              <option value="default">Use dashboard background</option>
              {DASHBOARD_BACKGROUND_STYLES.map(id=><option key={id} value={id}>{BACKGROUNDS[id]}</option>)}
            </select>
          </label>
          <button type="button" disabled={disabled||busy}
            aria-pressed={locked} onClick={()=>change(previous=>
              lockDashboardGridPanel(previous,role,chosen,!locked))}>
            {locked?'Unlock position':'Lock position'}</button>
          <div className={styles.sizeRow} role="group" aria-label={'Resize '+item.label}>
            {dashboardPanelSizeChoices(role,chosen).map(opt=><button type="button" key={opt.label}
              aria-pressed={position.w===opt.w&&position.h===opt.h}
              disabled={blocked||locked}
              onClick={()=>change(previous=>
                fitDashboardGridPanel(previous,role,chosen,opt.w,opt.h))}>{opt.label}</button>)}
          </div>
          <p className={styles.hint}>Position locks prevent movement and resizing until unlocked.</p>
        </>}
      </section>
      <section className={styles.controlPanel} aria-label="Panel Library">
        <h3>Panel Library</h3>
        <div className={styles.library}>
          {DASHBOARD_PANEL_REGISTRY[role].map(record=><label key={record.id}>
            <input type="checkbox" checked={!view.hidden.includes(record.id)}
              disabled={disabled||busy} onChange={event=>change(previous=>
                toggleDashboardPanel(previous,role,record.id,event.target.checked))}/>
            <span>{record.label}</span>
          </label>)}
        </div>
      </section>
      <section className={styles.controlPanel} aria-label="Layout presets and background">
        <h3>Layout Presets</h3>
        <div className={styles.sizeRow}>
          {Object.keys(DASHBOARD_LAYOUT_PRESETS[role]).map(preset=>
            <button key={preset} type="button" disabled={disabled||busy}
              onClick={()=>change(previous=>applyDashboardPreset(previous,role,preset))}>
              {preset}</button>)}
          <button type="button" disabled={disabled||busy}
            onClick={()=>change(previous=>autoArrangeDashboardLayout(previous,role))}>
            Auto Arrange</button>
        </div>
        <label>Dashboard background
          <select value={view.backgroundStyle} disabled={disabled||busy}
            onChange={e=>change(previous=>setDashboardBackground(previous,role,e.target.value))}>
            {DASHBOARD_BACKGROUND_STYLES.map(id=><option key={id} value={id}>{BACKGROUNDS[id]}</option>)}
          </select>
        </label>
      </section>
    </div>
    {confirm?<div className={styles.confirm} role="alertdialog" aria-label="Confirm dashboard change">
      <p>{confirm==='reset'
        ?'Reset only the selected screen-size arrangement? Character and campaign data are not affected.'
        :'Discard your unsaved dashboard arrangement?'}</p>
      <div><button type="button" onClick={()=>setConfirm('')}>Keep editing</button>
        <button type="button" data-testid="site-layout-confirm"
          onClick={confirm==='reset'?reset:()=>onClose?.()}>
          {confirm==='reset'?'Reset layout':'Discard changes'}</button></div>
    </div>:null}
    <footer className={styles.footer}>
      <span role="status" aria-live="polite">{message||(
        dirty?'Unsaved layout changes.':'Layout matches the saved version.')}</span>
      <div>
        <button type="button" onClick={cancel} disabled={busy}>Cancel</button>
        <button type="button" className={styles.primary} data-testid="site-layout-save"
          disabled={blocked||!dirty} onClick={save}>
          {busy?'Saving…':'Save Layout'}</button>
      </div>
    </footer>
  </section>;
}
