import React,{useState,useRef,useEffect} from 'react';
import {createPortal} from 'react-dom';
import {DashboardPanelFrameContext} from './WorkspaceUI.jsx';
import {trapDialogTab} from './dialogFocus.mjs';
import {dashboardKeyboardProposal} from '../state/dashboardGridModel.mjs';
import {DASHBOARD_PANEL_REGISTRY,DASHBOARD_LAYOUT_PRESETS,DASHBOARD_BACKGROUND_STYLES,
 dashboardGridRule,gridRowCount,dashboardPointerProposal,normalizeDashboardLayout,defaultDashboardLayout,
 visibleDashboardPanels,applyDashboardPreset,toggleDashboardPanel,moveDashboardGridPanel,
 resizeDashboardGridPanel,dashboardGridCandidateIsFree,lockDashboardGridPanel,autoArrangeDashboardLayout,
 dashboardPanelSizeChoices,placeDashboardGridPanel,fitDashboardGridPanel,
 dashboardViewportFromWidth,dashboardLayoutForViewport,setDashboardViewportLayout,
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
 const [moveFeedback,setMoveFeedback]=useState('');
 const [floating,setFloating]=useState(null);
 const grid=useRef(null),gesture=useRef(null);
 // A removed panel cannot remain selected or editable in the side panel.
 const activeSelected=ids.includes(selected)?selected:(ids[0]||'');
 const p=preview?.id===activeSelected?preview.rect:layout.placements[activeSelected];
 const rule=dashboardGridRule(role,activeSelected),locked=layout.lockedPositions.includes(activeSelected);
 const move=(id,x,y)=>onChange(old=>placeDashboardGridPanel(old,role,id,x,y));
 const size=(id,w,h)=>onChange(old=>fitDashboardGridPanel(old,role,id,w,h));
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
  setFloating({id,dx:0,dy:0});
  setMoveFeedback('');setSelected(id);e.stopPropagation();e.preventDefault();host.setPointerCapture?.(e.pointerId);
 };
 const drag=e=>{
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  const next=propose(g,e);
  if(next){
   setFloating({id:g.id,dx:e.clientX-g.x,dy:e.clientY-g.y});
   setPreview({id:g.id,rect:next});
   setMoveFeedback('');
  }
 };
 const end=e=>{
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  gesture.current=null;
  const next=propose(g,e);
  // A tap or an unchanged gesture must not flip the layout to custom.
  if(next && (g.kind==='resize'?(next.w!==g.rect.w||next.h!==g.rect.h):
   (next.x!==g.rect.x||next.y!==g.rect.y))){
   if(g.kind==='resize')size(g.id,next.w,next.h);else move(g.id,next.x,next.y);
   setMoveFeedback('');
  }
  setPreview(null);setFloating(null);
  try{grid.current?.releasePointerCapture?.(e.pointerId);}catch{/* already released */}
 };
 const cancel=e=>{
  const g=gesture.current;
  if(!g||g.pointer!==e.pointerId)return;
  gesture.current=null;
  setPreview(null);setFloating(null);
  try{grid.current?.releasePointerCapture?.(e.pointerId);}catch{/* pointer capture was released */}
 };
 const keyboard=(id,rect,kind,key)=>{
  if(disabled||layout.lockedPositions.includes(id))return;
  const next=dashboardKeyboardProposal(role,id,rect,kind,key);
  if(!next)return;
  setMoveFeedback('');
  if(kind==='resize')size(id,next.w,next.h);
  else move(id,next.x,next.y);
 };
 const number=(field,value)=>{
  if(!p||value===''||!Number.isInteger(Number(value)))return;
  const n=Number(value);
  const proposed=field==='w'||field==='h'
   ?dashboardPointerProposal(role,activeSelected,p,'resize',field==='w'?n-p.w:0,field==='h'?n-p.h:0)
   :{...p,x:field==='x'?n-1:p.x,y:field==='y'?n-1:p.y};
  setMoveFeedback('');
  if(field==='w'||field==='h')size(activeSelected,proposed.w,proposed.h);
  else move(activeSelected,proposed.x,proposed.y);
 };
 return <div className="react-grid-editor-content">
  <div className="react-grid-editor-scroller">
   <div className="react-grid-editor-canvas" ref={grid}
    style={{'--grid-rows':gridRowCount(layout.placements,ids)}}
    onPointerMove={drag} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel}>
    {ids.map(id=>{
      const pos=layout.placements[id];
      const item=registry(role).find(x=>x.id===id);
      if(!pos||!item)return null;
      const fixed=dashboardGridRule(role,id).fixed,lock=layout.lockedPositions.includes(id);
      return <div key={id} className={'react-grid-editor-tile'+(activeSelected===id?' selected':'')+(floating?.id===id?' dragging':'')}
       style={{gridColumn:(pos.x+1)+' / span '+pos.w,gridRow:(pos.y+1)+' / span '+pos.h,
         ...(floating?.id===id?{transform:`translate3d(${floating.dx}px,${floating.dy}px,0) scale(1.02)`}:{})}}>
       <button type="button" aria-pressed={activeSelected===id} className="react-grid-editor-tile-main"
        onPointerDown={e=>begin(e,id,'move')} onClick={()=>setSelected(id)}
        onKeyDown={e=>{
         if(!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
         e.preventDefault();
         keyboard(id,pos,'move',e.key);
        }}>
        <b>{item.label}</b><small>{pos.w}×{pos.h}{lock?' · Locked':''}</small>
       </button>
       {!fixed?<div className="react-grid-editor-size-options" role="group" aria-label={'Size '+item.label}>
        {dashboardPanelSizeChoices(role,id).map(option=><button key={option.label} type="button"
          aria-label={item.label+' '+option.label+' '+option.w+' by '+option.h}
          aria-pressed={pos.w===option.w&&pos.h===option.h}
          disabled={disabled||lock}
          onClick={()=>size(id,option.w,option.h)}>{option.label}</button>)}
       </div>:null}
      </div>;
    })}
   </div>
  </div>
  <aside className="react-grid-editor-properties">
    <p role="status" aria-live="polite" className="react-grid-editor-feedback">{moveFeedback}</p>
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
export function DashboardLayoutEditor({role,layout:source,onChange,onApply,disabled=false}){
 const layout=normalizeDashboardLayout(source,role);
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(null),[filter,setFilter]=useState('all');
 const [viewport,setViewport]=useState('desktop'),[resetConfirm,setResetConfirm]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[dismissConfirm,setDismissConfirm]=useState(false);
 const dirty=draft!==null&&JSON.stringify(draft)!==JSON.stringify(dashboardLayoutForViewport(layout,role,viewport));
 const close=()=>{if(dirty){setDismissConfirm(true);return;}setOpen(false);};
 const apply=async()=>{
  if(busy||disabled)return;
  const combined=setDashboardViewportLayout(layout,role,viewport,draft);
  if(!onApply){onChange(combined);setOpen(false);return;}
  setBusy(true);setMessage('Saving dashboard layout...');
  try{const result=await onApply(combined);
   if(result?.ok===false){setMessage(result.error||'Could not save layout.');return;}
   setMessage('Dashboard layout saved.');setOpen(false);
  }catch(error){setMessage(error?.message||'Could not save layout.');}
  finally{setBusy(false);}
 };
 const reset=()=>{setDraft(defaultDashboardLayout(role));setResetConfirm(false);};

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
  <p className="react-help">Rearrange, resize, lock or hide panels in one editor. Apply saves the arrangement for the selected screen size.</p>
  <div className="react-dashboard-layout-toolbar">
    <button type="button" className="primary" ref={openButtonRef} disabled={disabled} onClick={()=>{
      const target=dashboardViewportFromWidth(window.innerWidth);
      setViewport(target);setDraft(dashboardLayoutForViewport(layout,role,target));setMessage('');setOpen(true);
    }}>Customise Dashboard Layout</button>
  </div>
  {open?createPortal(<div className="react-grid-editor-modal" role="dialog" aria-modal="true" aria-label="Dashboard visual grid editor"
   onKeyDown={e=>{
     if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
     else if(e.key==='Tab'){
      trapDialogTab(e,dialogRef.current,document.activeElement);
      e.stopPropagation();
     }
    }}>
   <div className="react-grid-editor-dialog" ref={dialogRef}>
    <header className="react-grid-editor-header"><div><h2>Dashboard Layout Editor</h2>
     <small>12-column layout · viewport-specific settings</small></div>
     <button type="button" aria-label="Cancel layout changes" onClick={close}>×</button></header>
    <div className="react-grid-editor-viewport" role="group" aria-label="Layout screen size">
     {['desktop','tablet','mobile'].map(key=><button key={key} aria-pressed={viewport===key}
      disabled={busy} onClick={()=>{
       if(dirty){setMessage('Apply or discard changes to this screen size before switching.');return;}
       setViewport(key);setDraft(dashboardLayoutForViewport(layout,role,key));setMessage('');
      }}>{key}</button>)}
    </div>
    <p className="react-help">Drag a panel by its handle; neighbours reflow when released. Use Alt + arrow keys for keyboard movement. Choose a size within each panel.</p>
    <div className="react-grid-editor-content">
     <GridEditor role={role} layout={draft} onChange={update} disabled={disabled||busy}/>
     <aside className="react-grid-editor-library">
      <h3>Panel library</h3>
      <div className="react-dashboard-layout-filter">
       {['all','active','available'].map(value=><button type="button" key={value} aria-pressed={filter===value}
        onClick={()=>setFilter(value)}>{value==='all'?'All':value==='active'?'Added':'Available'}</button>)}
      </div>
      <div className="react-grid-editor-library-items">
       {registry(role).filter(item=>filter==='all'||(filter==='active'&&!draft.hidden.includes(item.id))||(filter==='available'&&draft.hidden.includes(item.id))).map(item=>{
        const enabled=!draft.hidden.includes(item.id);
        return <button type="button" key={item.id} className="react-grid-editor-library-item"
         aria-label={(enabled?'Remove ':'Add ')+item.label} aria-pressed={enabled} disabled={disabled||busy}
         onClick={()=>update(old=>toggleDashboardPanel(old,role,item.id,!enabled))}>
          <span>{item.label}</span><b aria-hidden="true">{enabled?'✓':'+'}</b>
         </button>;
       })}
      </div>
     </aside>
    </div>
    <footer className="react-grid-editor-footer">
     <button type="button" disabled={busy} onClick={()=>setResetConfirm(true)}>Reset Layout</button>
     <button type="button" disabled={busy} onClick={close}>Cancel</button>
     <button type="button" className="primary" disabled={disabled||busy} onClick={apply}>{busy?'Saving...':'Apply Changes'}</button>
    </footer>
    <p className="react-grid-editor-feedback" role="status" aria-live="polite">{message}</p>
    {resetConfirm?<div className="react-grid-editor-confirm" role="alertdialog" aria-modal="true" aria-label="Confirm layout reset">
      <p>Restore the default layout for {viewport}? Your current arrangement will be replaced; character and campaign data will remain intact.</p>
      <button type="button" onClick={()=>setResetConfirm(false)}>Cancel</button>
      <button type="button" onClick={reset}>Confirm Reset</button>
    </div>:null}
    {dismissConfirm?<div className="react-grid-editor-confirm" role="alertdialog" aria-modal="true" aria-label="Discard unsaved changes">
      <p>You have unapplied layout changes.</p>
      <button type="button" onClick={()=>setDismissConfirm(false)}>Continue Editing</button>
      <button type="button" onClick={()=>{setDismissConfirm(false);setOpen(false);}}>Discard Changes</button>
    </div>:null}
   </div>
  </div>,document.body):null}

 </div>;
}
export function DashboardLayoutWorkspace({role='player',layout:raw,renderPanel,title='Dashboard Panels',forcedPanels=[]}){
 // The live clock refreshes dashboard content every second. Normalize a saved
 // layout at most once per changed input, not once per panel and once more for
 // its background during every render.
 const [viewport,setViewport]=useState(()=>dashboardViewportFromWidth(typeof window==='undefined'?1200:window.innerWidth));
 useEffect(()=>{const update=()=>setViewport(dashboardViewportFromWidth(window.innerWidth));
  window.addEventListener('resize',update);return ()=>window.removeEventListener('resize',update);},[]);
 const layout=React.useMemo(()=>dashboardLayoutForViewport(raw,role,viewport),[raw,role,viewport]);
 const allowed=React.useMemo(()=>new Set(registry(role).map(item=>item.id)),[role]);
 const hidden=new Set(layout.hidden);
 const ids=[...new Set([...layout.order.filter(id=>!hidden.has(id)),...forcedPanels.filter(id=>allowed.has(id))])]
  .sort((a,b)=>viewport==='desktop'?0:(layout.placements[a]?.y??0)-(layout.placements[b]?.y??0)||
    (layout.placements[a]?.x??0)-(layout.placements[b]?.x??0));
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
