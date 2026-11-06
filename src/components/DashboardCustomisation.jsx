import React,{useState,useRef} from 'react';
import {DashboardPanelFrameContext} from './WorkspaceUI.jsx';
import {trapDialogTab} from './dialogFocus.mjs';
import {dashboardKeyboardProposal} from '../state/dashboardGridModel.mjs';
import {DASHBOARD_PANEL_REGISTRY,DASHBOARD_LAYOUT_PRESETS,DASHBOARD_BACKGROUND_STYLES,
 dashboardGridRule,gridRowCount,dashboardPointerProposal,normalizeDashboardLayout,defaultDashboardLayout,
 visibleDashboardPanels,applyDashboardPreset,toggleDashboardPanel,moveDashboardGridPanel,
 resizeDashboardGridPanel,lockDashboardGridPanel,autoArrangeDashboardLayout,
 setDashboardBackground} from '../state/dashboardLayoutModel.mjs';
const labels={obsidian:'Obsidian Stone',slate:'Stone Slate',arcane:'Arcane Mist'};
const registry=role=>DASHBOARD_PANEL_REGISTRY[role==='gm'?'gm':'player'];
function BackgroundSelector({id,role,layout,onChange,disabled}){
 return <label>Background <select disabled={disabled} aria-label={id+' background'}
 value={id?(layout.panelBackgrounds?.[id]||'default'):layout.backgroundStyle}
 onChange={e=>onChange(old=>setDashboardBackground(old,role,e.target.value,id))}>
 {id?<option value="default">Use dashboard default</option>:null}
 {DASHBOARD_BACKGROUND_STYLES.map(key=><option value={key} key={key}>{labels[key]}</option>)}
 </select></label>;
}
function GridEditor({role,layout,onChange,disabled}){
 const ids=visibleDashboardPanels(layout,role);
 const [selected,setSelected]=useState(ids[0]||''),[preview,setPreview]=useState(null);
 const grid=useRef(null),gesture=useRef(null);
 // A removed panel cannot remain selected or editable in the side panel.
 const activeSelected=ids.includes(selected)?selected:(ids[0]||'');
 const p=preview?.id===activeSelected?preview.rect:layout.placements[activeSelected];
 const rule=dashboardGridRule(role,activeSelected),locked=layout.lockedPositions.includes(activeSelected);
 const move=(id,x,y)=>onChange(old=>moveDashboardGridPanel(old,role,id,x,y));
 const size=(id,w,h)=>onChange(old=>resizeDashboardGridPanel(old,role,id,w,h));
 const propose=(g,e)=>dashboardPointerProposal(role,g.id,g.rect,g.kind,
  (e.clientX-g.x)/g.step,(e.clientY-g.y)/g.step);
 const begin=(e,id,kind)=>{
  if(disabled||gesture.current||e.isPrimary===false||e.button!==0||layout.lockedPositions.includes(id))return;
  const rect=layout.placements[id],host=grid.current;if(!rect||!host)return;
  const {width}=host.getBoundingClientRect();
  // The editor's 12 columns are separated by gaps; include each gap in
  // the drag step so finger movement accurately tracks grid squares.
  const gap=parseFloat(window.getComputedStyle(host).columnGap)||0;
  const step=(width+gap)/12;
  if(!step)return;
  gesture.current={id,kind,pointer:e.pointerId,x:e.clientX,y:e.clientY,rect,step};
  setSelected(id);e.stopPropagation();e.preventDefault();host.setPointerCapture?.(e.pointerId);
 };
 const drag=e=>{
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  const next=propose(g,e);
  if(next)setPreview({id:g.id,rect:next});
 };
 const end=e=>{
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  gesture.current=null;
  const next=propose(g,e);
  // A tap or an unchanged gesture must not flip the layout to custom.
  if(next && (g.kind==='resize'?(next.w!==g.rect.w||next.h!==g.rect.h):
   (next.x!==g.rect.x||next.y!==g.rect.y))){
   if(g.kind==='resize')size(g.id,next.w,next.h);else move(g.id,next.x,next.y);
  }
  setPreview(null);
  try{grid.current?.releasePointerCapture?.(e.pointerId);}catch{/* already released */}
 };
 const cancel=e=>{
  const g=gesture.current;
  if(!g||g.pointer!==e.pointerId)return;
  gesture.current=null;
  setPreview(null);
  try{grid.current?.releasePointerCapture?.(e.pointerId);}catch{/* pointer capture was released */}
 };
 const keyboard=(id,rect,kind,key)=>{
  if(disabled||layout.lockedPositions.includes(id))return;
  const next=dashboardKeyboardProposal(role,id,rect,kind,key);
  if(!next)return;
  if(kind==='resize')size(id,next.w,next.h);
  else move(id,next.x,next.y);
 };
 const number=(field,value)=>{
  if(!p||value===''||!Number.isInteger(Number(value)))return;
  const n=Number(value);
  if(field==='w')size(activeSelected,n,p.h);
  if(field==='h')size(activeSelected,p.w,n);
  if(field==='x')move(activeSelected,n-1,p.y);
  if(field==='y')move(activeSelected,p.x,n-1);
 };
 return <div className="react-grid-editor-content">
  <div className="react-grid-editor-scroller">
   <div className="react-grid-editor-canvas" ref={grid}
    style={{'--grid-rows':gridRowCount(layout.placements,ids)}}
    onPointerMove={drag} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel}>
    {ids.map(id=>{
      const pos=preview?.id===id?preview.rect:layout.placements[id];
      const item=registry(role).find(x=>x.id===id);
      if(!pos||!item)return null;
      const fixed=dashboardGridRule(role,id).fixed,lock=layout.lockedPositions.includes(id);
      return <div key={id} className={'react-grid-editor-tile'+(activeSelected===id?' selected':'')}
       style={{gridColumn:(pos.x+1)+' / span '+pos.w,gridRow:(pos.y+1)+' / span '+pos.h}}>
       <button type="button" aria-pressed={activeSelected===id} className="react-grid-editor-tile-main"
        onPointerDown={e=>begin(e,id,'move')} onClick={()=>setSelected(id)}
        onKeyDown={e=>{
         if(!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
         e.preventDefault();
         keyboard(id,pos,'move',e.key);
        }}>
        <b>{item.label}</b><small>{pos.w}×{pos.h}{lock?' · Locked':''}</small>
       </button>
       {!fixed&&!lock?<button className="react-grid-editor-tile-resize" type="button"
        aria-label={'Resize '+item.label+' (Alt + arrow keys)'} disabled={disabled}
        onPointerDown={e=>begin(e,id,'resize')} onKeyDown={e=>{
         if(!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
         e.preventDefault();
         keyboard(id,pos,'resize',e.key);
        }}>◢</button>:null}
      </div>;
    })}
   </div>
  </div>
  <aside className="react-grid-editor-properties">
   <h3>Selected panel</h3>
   {p&&rule?<React.Fragment>
    <b>{registry(role).find(x=>x.id===activeSelected)?.label}</b>
    {['w','h','x','y'].map(key=><label key={key}>{({w:'Width',h:'Height',x:'Column',y:'Row'})[key]}
      <input type="number" aria-label={'Panel '+({w:'width',h:'height',x:'column',y:'row'})[key]}
       value={key==='x'||key==='y'?p[key]+1:p[key]} min={key==='w'?(rule.portrait?3:rule.minW):key==='h'?rule.minH:1}
       max={key==='w'?rule.maxW:key==='h'?rule.maxH:key==='x'?13-p.w:601-p.h}
       disabled={disabled||locked||(rule.fixed&&(key==='w'||key==='h'))}
       onChange={e=>number(key,e.target.value)}/></label>)}
    <small>Minimum {rule.minW}×{rule.minH}; maximum {rule.maxW}×{rule.maxH}.
     {rule.portrait?' Optional 3×6 portrait mode.':''}</small>
    <button type="button" disabled={disabled} onClick={()=>onChange(old=>lockDashboardGridPanel(old,role,activeSelected,!locked))}>
      {locked?'Unlock Position':'Lock Position'}</button>
    <button type="button" disabled={disabled} onClick={()=>onChange(old=>toggleDashboardPanel(old,role,activeSelected,false))}>Remove Panel</button>
    <BackgroundSelector id={activeSelected} layout={layout} role={role} onChange={onChange} disabled={disabled}/>
   </React.Fragment>:<p>Select a panel.</p>}
  </aside>
 </div>;
}
export function DashboardLayoutEditor({role,layout:source,onChange,disabled=false}){
 const layout=normalizeDashboardLayout(source,role);
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(null),[filter,setFilter]=useState('all');
 const openButtonRef=useRef(null),dialogRef=useRef(null),wasOpenRef=useRef(false);
 React.useEffect(()=>{
  if(open){
   wasOpenRef.current=true;
   dialogRef.current?.querySelector('button')?.focus();
  }else if(wasOpenRef.current){
   openButtonRef.current?.focus();
   wasOpenRef.current=false;
  }
 },[open]);
 const visible=new Set(visibleDashboardPanels(layout,role));
 const update=change=>setDraft(old=>typeof change==='function'?change(old):change);
 return <div className="react-dashboard-layout-editor">
  <p className="react-help">Move and resize panels freely on a 12-column square grid. All panels obey their individual minimum and maximum sizes.</p>
  <div className="react-dashboard-layout-presets">
   {Object.keys(DASHBOARD_LAYOUT_PRESETS[role]).map(preset=><button key={preset} type="button"
    aria-pressed={layout.preset===preset} disabled={disabled}
    onClick={()=>onChange(old=>applyDashboardPreset(old,role,preset))}>{preset}</button>)}
  </div>
  <div className="react-dashboard-layout-toolbar">
   <button type="button" className="primary" ref={openButtonRef} disabled={disabled} onClick={()=>{setDraft(layout);setOpen(true);}}>Open Visual Grid Editor</button>
   <button type="button" disabled={disabled} onClick={()=>onChange(old=>autoArrangeDashboardLayout(old,role))}>Auto Arrange</button>
   <button type="button" disabled={disabled} onClick={()=>onChange(defaultDashboardLayout(role))}>Reset Layout</button>
  </div>
  <fieldset className="react-dashboard-background-selector">
   <legend>Background for all panels</legend>
   <BackgroundSelector role={role} layout={layout} disabled={disabled} onChange={onChange}/>
  </fieldset>
  <div className="react-dashboard-layout-filter">
   {['all','active','available'].map(value=><button type="button" key={value} aria-pressed={filter===value}
    onClick={()=>setFilter(value)}>{value==='all'?'All panels':value==='active'?'On dashboard':'Available to add'}</button>)}
  </div>
  <div className="react-dashboard-panel-library">
   {registry(role).filter(item=>filter==='all'||(filter==='active'&&visible.has(item.id))||(filter==='available'&&!visible.has(item.id))).map(item=>{
    const p=layout.placements[item.id];
    return <article key={item.id}>
     <div className="react-dashboard-panel-library-name"><div><b>{item.label}</b>
      <small>{item.category}{p?' · '+p.w+'×'+p.h:''}{item.optional?' · Optional':''}</small></div></div>
     <div className="react-dashboard-panel-library-actions">
      <button type="button" disabled={disabled} aria-label={(visible.has(item.id)?'Remove ':'Add ')+item.label}
       onClick={()=>onChange(old=>toggleDashboardPanel(old,role,item.id,!visible.has(item.id)))}>
       {visible.has(item.id)?'Remove':'Add'}</button>
      <BackgroundSelector id={item.id} role={role} layout={layout} onChange={onChange} disabled={disabled}/>
     </div>
    </article>;
   })}
  </div>
  {open?<div className="react-grid-editor-modal" role="dialog" aria-modal="true" aria-label="Dashboard visual grid editor"
   onKeyDown={e=>{
     if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);}
     else if(e.key==='Tab'){
      trapDialogTab(e,dialogRef.current,document.activeElement);
      e.stopPropagation();
     }
    }}>
   <div className="react-grid-editor-dialog" ref={dialogRef}>
    <header className="react-grid-editor-header"><div><h2>Dashboard Layout Editor</h2>
     <small>12 columns · 30 starting rows · flexible sizes</small></div>
     <button type="button" aria-label="Cancel layout changes" onClick={()=>setOpen(false)}>×</button></header>
    <p className="react-help">Drag a panel or its lower-right resize grip. With a keyboard, select a panel and press Alt + arrows to move it, or focus the resize grip and press Alt + arrows to resize. Numeric fields also work. Overlaps are prevented.</p>
    <GridEditor role={role} layout={draft} onChange={update} disabled={disabled}/>
    <footer className="react-grid-editor-footer">
     <button type="button" onClick={()=>setOpen(false)}>Cancel</button>
     <button type="button" className="primary" disabled={disabled} onClick={()=>{onChange(draft);setOpen(false);}}>Apply Layout to Settings</button>
    </footer>
   </div>
  </div>:null}
  <p className="react-help">After applying the grid layout, select Save Dashboard Settings to save it to your account.</p>
 </div>;
}
export function DashboardLayoutWorkspace({role='player',layout:raw,renderPanel,title='Dashboard Panels',forcedPanels=[]}){
 // The live clock refreshes dashboard content every second. Normalize a saved
 // layout at most once per changed input, not once per panel and once more for
 // its background during every render.
 const layout=React.useMemo(()=>normalizeDashboardLayout(raw,role),[raw,role]);
 const allowed=React.useMemo(()=>new Set(registry(role).map(item=>item.id)),[role]);
 const hidden=new Set(layout.hidden);
 const ids=[...new Set([...layout.order.filter(id=>!hidden.has(id)),...forcedPanels.filter(id=>allowed.has(id))])];
 return <section className="react-dashboard-layout-workspace" aria-label={title}>
  <div className="react-dashboard-custom-grid react-dashboard-freeform-grid" aria-label="Dashboard panels"
   style={{'--grid-rows':gridRowCount(layout.placements,ids)}}>
   {ids.map(id=>{
    const p=layout.placements[id];if(!p)return null;
    const frame=p.h>p.w*1.4?'tall':p.w>=p.h*2.5?'ultrawide':p.w>=p.h*1.45?'wide':'square';
    return <div key={id} className="react-dashboard-custom-cell" data-panel-id={id}
     data-panel-size={p.w+'x'+p.h} data-frame-family={frame}
     data-panel-background={layout.panelBackgrounds[id]||layout.backgroundStyle}
     style={{'--panel-col':p.x+1,'--panel-row':p.y+1,'--panel-w':p.w,'--panel-h':p.h}}>
     <DashboardPanelFrameContext.Provider value={true}>{renderPanel(id)}</DashboardPanelFrameContext.Provider>
    </div>;
   })}
  </div>
 </section>;
}
