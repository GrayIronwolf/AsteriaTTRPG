import React, {useEffect, useRef, useState} from 'react';
import {Panel} from './WorkspaceUI.jsx';
import {
  DASHBOARD_PANEL_REGISTRY, DASHBOARD_LAYOUT_PRESETS, DASHBOARD_SIZE_COLUMNS, DASHBOARD_SIZE_ROWS, DASHBOARD_BACKGROUND_STYLES,
  applyDashboardPreset, dashboardSizeForColumns, defaultDashboardLayout,
  moveDashboardPanel, normalizeDashboardLayout, nudgeDashboardPanel,
  resizeDashboardPanel, toggleDashboardPanel, visibleDashboardPanels, setDashboardBackground, dashboardBackgroundForPanel
} from '../state/dashboardLayoutModel.mjs';

const SIZE_LABELS = {'3x3':'Standard — 3×3','6x3':'Long — 6×3','3x6':'Tall — 3×6','9x3':'Full Width — 9×3'};
const BACKGROUND_LABELS={obsidian:'Obsidian Stone',slate:'Stone Slate',arcane:'Arcane Mist'};
const PRESET_LABELS = {default:'Default',combat:'Combat',exploration:'Exploration',roleplaying:'Roleplaying',encounter:'Encounter'};
const PRESET_NAMES = Object.keys(PRESET_LABELS);

export function DashboardLayoutEditor({role,layout,onChange,disabled=false}) {
  const [dragged,setDragged]=useState('');
  const [filter,setFilter]=useState('all');
  const items=DASHBOARD_PANEL_REGISTRY[role==='gm'?'gm':'player'];
  const visible=new Set(visibleDashboardPanels(layout,role));
  const ordered=layout.order.map(id=>items.find(row=>row.id===id)).filter(Boolean);
  const filtered=ordered.filter(row=>filter==='all'||(filter==='active'&&visible.has(row.id))||(filter==='available'&&!visible.has(row.id)));
  return <div className="react-dashboard-layout-editor">
    <p className="react-help">Add, hide, reorder or resize your main dashboard panels. Removed panels and their data stay available in their original sections. Your resource banner and navigation are fixed.</p>
    <div className="react-dashboard-layout-presets" aria-label="Layout presets">
      {PRESET_NAMES.filter(preset=>Object.hasOwn(DASHBOARD_LAYOUT_PRESETS[role],preset)).map(preset=><button key={preset} type="button" aria-pressed={layout.preset===preset} disabled={disabled} onClick={()=>onChange(current=>applyDashboardPreset(current,role,preset))}>{PRESET_LABELS[preset]}</button>)}
    </div>
    <div className="react-dashboard-layout-filter" role="group" aria-label="Panel library filters">
      {['all','active','available'].map(value=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value==='all'?'All panels':value==='active'?'On dashboard':'Available to add'}</button>)}
    </div>
    <fieldset className="react-dashboard-background-selector">
      <legend>Background for all panels</legend>
      <label>Panel backdrop <select disabled={disabled} value={layout.backgroundStyle||'obsidian'} onChange={event=>onChange(current=>setDashboardBackground(current,role,event.target.value))}>
        {DASHBOARD_BACKGROUND_STYLES.map(style=><option key={style} value={style}>{BACKGROUND_LABELS[style]}</option>)}
      </select></label>
      <p className="react-help">Applying a background to all panels clears any individual overrides. Choose a different background below for a single panel.</p>
    </fieldset>
    <div className="react-dashboard-panel-library">
      {filtered.map((item,index)=><article key={item.id} draggable={!disabled} className={dragged===item.id?'dragging':''}
        onDragStart={event=>{setDragged(item.id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}}
        onDragEnd={()=>setDragged('')}
        onDragOver={event=>{if(!disabled)event.preventDefault();}}
        onDrop={event=>{event.preventDefault();const source=dragged||event.dataTransfer.getData('text/plain');onChange(current=>moveDashboardPanel(current,role,source,item.id));setDragged('');}}>
        <div className="react-dashboard-panel-library-name">
          <span aria-hidden="true" className="react-dashboard-drag-grip">⋮⋮</span>
          <div><b>{item.label}</b><small>{item.category}{item.optional?' · Optional':''}</small></div>
        </div>
        <div className="react-dashboard-panel-library-actions">
          <button type="button" disabled={disabled} aria-label={`${visible.has(item.id)?'Remove':'Add'} ${item.label}`} onClick={()=>onChange(current=>toggleDashboardPanel(current,role,item.id,!visible.has(item.id)))}>{visible.has(item.id)?'Remove':'Add'}</button>
          <button type="button" disabled={disabled||index===0} title="Move panel up" aria-label={`Move ${item.label} up`} onClick={()=>onChange(current=>nudgeDashboardPanel(current,role,item.id,-1))}>↑</button>
          <button type="button" disabled={disabled||index===filtered.length-1} title="Move panel down" aria-label={`Move ${item.label} down`} onClick={()=>onChange(current=>nudgeDashboardPanel(current,role,item.id,1))}>↓</button>
          <label>Size <select disabled={disabled} value={layout.sizes[item.id]} aria-label={`${item.label} size`} onChange={event=>onChange(current=>resizeDashboardPanel(current,role,item.id,event.target.value))}>{Object.keys(SIZE_LABELS).map(size=><option key={size} value={size}>{SIZE_LABELS[size]}</option>)}</select></label>
          <label>Background <select disabled={disabled} value={layout.panelBackgrounds?.[item.id]||'default'} aria-label={`${item.label} background`} onChange={event=>onChange(current=>setDashboardBackground(current,role,event.target.value,item.id))}>
            <option value="default">Use dashboard default</option>
            {DASHBOARD_BACKGROUND_STYLES.map(style=><option key={style} value={style}>{BACKGROUND_LABELS[style]}</option>)}
          </select></label>
        </div>
      </article>)}
    </div>
    {filter==='available'&&!filtered.length?<p role="status">All available panels have been added.</p>:null}
  </div>;
}

function PanelFrame({item,layout,editing,role,onChange,children}) {
  const gridRef=useRef(null);
  const resizeRef=useRef(null);
  const visible=visibleDashboardPanels(layout,role);
  const index=visible.indexOf(item.id);
  const endResize=event=>{
    const drag=resizeRef.current;
    if(!drag || drag.pointerId!==event.pointerId)return;
    resizeRef.current=null;
    const grid=gridRef.current?.parentElement;
    if(!grid || !grid.clientWidth)return;
    const cellWidth=grid.clientWidth/12;
    const size=dashboardSizeForColumns(Math.round(drag.columns+(event.clientX-drag.startX)/cellWidth));
    onChange(current=>resizeDashboardPanel(current,role,item.id,size));
  };
  return <div ref={gridRef} className="react-dashboard-custom-cell" data-panel-id={item.id}
    data-panel-size={layout.sizes[item.id]||'3x3'} data-panel-background={dashboardBackgroundForPanel(layout,role,item.id)}
    style={{'--panel-columns':DASHBOARD_SIZE_COLUMNS[layout.sizes[item.id]]||4,'--panel-rows':DASHBOARD_SIZE_ROWS[layout.sizes[item.id]]||1,'--panel-tablet-columns':(layout.sizes[item.id]==='3x3'||layout.sizes[item.id]==='3x6')?6:12}}
    onDragOver={event=>{if(editing)event.preventDefault();}}
    onDrop={event=>{if(!editing)return;event.preventDefault();const draggedId=event.dataTransfer.getData('text/plain');onChange(current=>moveDashboardPanel(current,role,draggedId,item.id));}}>
    {editing?<div className="react-dashboard-inline-tools" aria-label={`${item.label} layout controls`}>
      <span draggable="true" className="react-dashboard-inline-grip" title="Drag to move panel" aria-label={`Drag ${item.label} to reorder`}
        onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}}>⋮⋮ <b>{item.label}</b></span>
      <span className="react-dashboard-inline-actions">
        <button type="button" disabled={index===0} onClick={()=>onChange(current=>nudgeDashboardPanel(current,role,item.id,-1))} aria-label={`Move ${item.label} up`}>↑</button>
        <button type="button" disabled={index===visible.length-1} onClick={()=>onChange(current=>nudgeDashboardPanel(current,role,item.id,1))} aria-label={`Move ${item.label} down`}>↓</button>
        <button type="button" onClick={()=>onChange(current=>toggleDashboardPanel(current,role,item.id,false))} aria-label={`Remove ${item.label} from dashboard`}>×</button>
      </span>
    </div>:null}
    {children}
    {editing?<div className="react-dashboard-inline-resize">
      <label>Panel size <select value={layout.sizes[item.id]} onChange={event=>onChange(current=>resizeDashboardPanel(current,role,item.id,event.target.value))}>{Object.entries(SIZE_LABELS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
      <button type="button" className="react-dashboard-resize-handle" aria-label={`Drag to resize ${item.label}`} title="Drag horizontally to resize (or use the size menu)"
        onPointerDown={event=>{if(event.button!==0)return;resizeRef.current={pointerId:event.pointerId,startX:event.clientX,columns:DASHBOARD_SIZE_COLUMNS[layout.sizes[item.id]]||4};event.currentTarget.setPointerCapture(event.pointerId);}}
        onPointerUp={endResize} onPointerCancel={()=>{resizeRef.current=null;}}>◢</button>
    </div>:null}
  </div>;
}

export function DashboardLayoutWorkspace({role='player',layout:incoming,onSave,renderPanel,defaultContent,canEdit=true,title='Dashboard Panels',forcedPanels=[]}) {
  const incomingLayout=normalizeDashboardLayout(incoming,role);
  const [draft,setDraft]=useState(incomingLayout);
  const [lastSaved,setLastSaved]=useState(null);
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  const [libraryOpen,setLibraryOpen]=useState(false);
  const signature=JSON.stringify(incomingLayout);
  useEffect(()=>{if(lastSaved&&JSON.stringify(lastSaved)===signature)setLastSaved(null);},[signature,lastSaved]);
  const persisted=lastSaved||incomingLayout;
  const persistedSignature=JSON.stringify(persisted);
  useEffect(()=>{if(!editing)setDraft(persisted);},[persistedSignature,editing]);
  const current=editing?draft:persisted;
  const changed=JSON.stringify(draft)!==persistedSignature;
  const save=async()=>{
    if(!canEdit||busy)return;
    setBusy(true);setMessage('Saving dashboard layout...');
    try{
      const result=await onSave(draft);
      if(result?.ok===false)throw new Error(result.error||'Dashboard layout could not be saved.');
      setLastSaved(draft);
      setMessage('Dashboard layout saved.');
      setEditing(false);setLibraryOpen(false);
    }catch(error){setMessage(error?.message||'Dashboard layout could not be saved.');}
    finally{setBusy(false);}
  };
  const cancel=()=>{setDraft(persisted);setEditing(false);setLibraryOpen(false);setMessage('Unsaved changes discarded.');};
  const allowed=new Set(DASHBOARD_PANEL_REGISTRY[role==='gm'?'gm':'player'].map(item=>item.id));
  const ids=[...new Set([...visibleDashboardPanels(current,role),...forcedPanels.filter(id=>allowed.has(id))])];
  const items=DASHBOARD_PANEL_REGISTRY[role==='gm'?'gm':'player'];
  const custom=current.mode==='custom'||editing;
  return <section className="react-dashboard-layout-workspace" aria-label={title}>
    <div className="react-dashboard-layout-toolbar">
      <div><b>{title}</b><small>{custom?'Custom layout':'Original dashboard layout'} · {ids.length} panels</small></div>
      <div>
        {editing?<><button type="button" disabled={busy} onClick={cancel}>Cancel</button><button type="button" disabled={busy} onClick={()=>setLibraryOpen(value=>!value)}>{libraryOpen?'Close Panel Library':'Add / Remove Panels'}</button><button className="primary" type="button" disabled={busy||!changed} onClick={save}>{busy?'Saving...':'Save Layout'}</button></>:
          <button type="button" disabled={!canEdit} onClick={()=>{setDraft(persisted);setMessage('');setEditing(true);setLibraryOpen(true);}}>Edit Layout</button>}
      </div>
    </div>
    {editing&&libraryOpen?<Panel title="Dashboard Panel Library"><DashboardLayoutEditor role={role} layout={draft} onChange={setDraft} disabled={busy}/><div className="react-dashboard-reset-action"><button type="button" disabled={busy} onClick={()=>setDraft(defaultDashboardLayout(role))}>Restore Original Layout</button></div></Panel>:null}
    {custom?<div className="react-dashboard-custom-grid" aria-label="Customisable dashboard panels">
      {ids.map(id=>{
        const item=items.find(row=>row.id===id);
        if(!item)return null;
        return <PanelFrame key={id} item={item} layout={current} role={role} editing={editing} onChange={setDraft}>
          {renderPanel(id)}
        </PanelFrame>;
      })}
      {!ids.length?<p className="react-dashboard-no-panels">No panels added. Choose Add / Remove Panels to add a shortcut or dashboard panel.</p>:null}
    </div>:defaultContent}
    <p role="status" className="react-action-message">{message}</p>
  </section>;
}
