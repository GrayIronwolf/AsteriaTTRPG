import React,{useEffect,useMemo,useRef,useState} from 'react';
import {
  DASHBOARD_PANEL_REGISTRY,dashboardLayoutForViewport,dashboardViewportFromWidth,
  gridRowCount,visibleDashboardPanels
} from '../../../src/state/dashboardLayoutModel.mjs';
import {editFreeformWorkspace,freeformCanvasHeight,freeformPercent} from '../../../src/state/workspaceFreeformModel.mjs';
import styles from './DashboardLayoutWorkspace.module.css';

export function DashboardLayoutWorkspace({
  role='player',layout,renderPanel,title='Dashboard panels',editing=false,onLayoutChange=null
}){
  const workspaceRef=useRef(null),canvasRef=useRef(null),gesture=useRef(null);
  const [dragPreview,setDragPreview]=useState(null);
  const [windowState,setWindowState]=useState({minimized:[],maximized:''});
  const [editMessage,setEditMessage]=useState('');
  const [viewport,setViewport]=useState(()=>
    dashboardViewportFromWidth(typeof window==='undefined'?1200:window.innerWidth));
  useEffect(()=>{
    // The original dashboard selects saved layouts using available workspace
    // width, not window width: GM sidebars can make a wide screen narrow.
    const host=workspaceRef.current;
    const refresh=()=>{
      const width=host?.getBoundingClientRect().width||window.innerWidth;
      setViewport(dashboardViewportFromWidth(width));
    };
    refresh();
    const observer=typeof ResizeObserver==='undefined'||!host
      ?null:new ResizeObserver(refresh);
    observer?.observe(host);
    window.addEventListener('resize',refresh);
    return ()=>{observer?.disconnect();window.removeEventListener('resize',refresh);};
  },[]);
  const view=useMemo(()=>dashboardLayoutForViewport(layout,role,viewport),[layout,role,viewport]);
  const registry=DASHBOARD_PANEL_REGISTRY[role==='gm'?'gm':'player'];
  const names=new Map(registry.map(item=>[item.id,item.label]));
  const ids=visibleDashboardPanels(view,role);
  const freeform=view.freeform?.enabled===true && viewport==='desktop';
  const editable=editing&&freeform&&typeof onLayoutChange==='function';
  const displayFreeform=useMemo(()=>{
    if(!editable||!dragPreview)return view.freeform;
    return editFreeformWorkspace(view.freeform,dragPreview.id,dragPreview.kind,
      dragPreview.values,{locked:view.lockedPositions,hidden:view.hidden});
  },[editable,dragPreview,view]);
  const beginGesture=(event,id,kind)=>{
    if(!editable||gesture.current||event.isPrimary===false||event.button!==0||
      view.lockedPositions.includes(id))return;
    const width=canvasRef.current?.getBoundingClientRect().width||0;
    const initial=view.freeform?.positions[id];
    if(!width||!initial)return;
    gesture.current={id,kind,pointer:event.pointerId,initial,
      startX:event.clientX,startY:event.clientY,width};
    event.stopPropagation();event.preventDefault();
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    setEditMessage('');
  };
  const proposed=(g,event)=>{
    const dx=Math.round((event.clientX-g.startX)*1000/g.width);
    const dy=Math.round((event.clientY-g.startY)*1000/g.width);
    return g.kind==='move'?{x:g.initial.x+dx,y:g.initial.y+dy}:
      {w:g.initial.w+dx,h:g.initial.h+dy};
  };
  const pointerMove=event=>{
    const g=gesture.current;
    if(g?.pointer===event.pointerId)setDragPreview({id:g.id,kind:g.kind,values:proposed(g,event)});
  };
  const pointerEnd=event=>{
    const g=gesture.current;
    if(!g||g.pointer!==event.pointerId)return;
    gesture.current=null;
    if(event.type!=='pointercancel'&&event.type!=='lostpointercapture'){
      const values=proposed(g,event);
      const applied=editFreeformWorkspace(view.freeform,g.id,g.kind,values,
        {locked:view.lockedPositions,hidden:view.hidden});
      if(applied!==view.freeform)onLayoutChange('desktop',previous=>({
        ...previous,freeform:editFreeformWorkspace(previous.freeform,g.id,g.kind,values,
          {locked:previous.lockedPositions,hidden:previous.hidden})
      }));
      else setEditMessage('This move or resize is blocked. Unlock panels or enable overlap to allow it.');
    }
    setDragPreview(null);
    try{canvasRef.current?.releasePointerCapture?.(event.pointerId);}catch{/* already released */}
  };
  const keyboardEdit=(event,id)=>{
    if(!editable||!event.altKey||!event.key.startsWith('Arrow'))return;
    const rect=view.freeform?.positions[id];
    const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];
    if(!rect||!delta)return;
    event.preventDefault();
    const kind=event.shiftKey?'resize':'move';
    const values=kind==='move'?{x:rect.x+delta[0],y:rect.y+delta[1]}:
      {w:rect.w+delta[0],h:rect.h+delta[1]};
    onLayoutChange('desktop',previous=>({...previous,
      freeform:editFreeformWorkspace(previous.freeform,id,kind,values,
        {locked:previous.lockedPositions,hidden:previous.hidden})
    }));
  };
  const toggleMinimize=id=>setWindowState(state=>({
    minimized:state.minimized.includes(id)?
      state.minimized.filter(name=>name!==id):[...state.minimized,id],
    maximized:state.maximized===id?'':state.maximized
  }));
  const toggleMaximize=id=>setWindowState(state=>({
    ...state,maximized:state.maximized===id?'':id,
    minimized:state.minimized.filter(name=>name!==id)
  }));
  // Physical grid order should match keyboard and reading order even when
  // desktop-size browsers contain a narrow, stacked dashboard workspace.
  const ordered=ids.slice().sort((a,b)=>
    (view.placements[a]?.y||0)-(view.placements[b]?.y||0)||
    (view.placements[a]?.x||0)-(view.placements[b]?.x||0));
  if(!ordered.length)return <section className={styles.empty} ref={workspaceRef} aria-label={title}>
    No dashboard panels are visible. Open the Dashboard Layout Editor to enable panels.
  </section>;
  return <section className={styles.workspace} ref={workspaceRef} aria-label={title}
    data-testid={'site-'+role+'-layout-workspace'}>
    <div ref={canvasRef} onPointerMove={pointerMove} onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
      className={styles.grid+(freeform?' '+styles.freeformGrid:'')+(editing?' '+styles.editing:'')}
      data-dashboard-viewport={viewport} data-layout-mode={freeform?'freeform':'grid'}
      style={{'--layout-rows':gridRowCount(view.placements,ids),
        ...(freeform?{'--freeform-height':freeformCanvasHeight(view.freeform,ids)}:{})}}>
      {ordered.map(id=>{
        const pos=view.placements[id];
        if(!pos)return null;
        const rect=freeform?displayFreeform.positions[id]:null;
        const minimized=windowState.minimized.includes(id);
        const maximized=windowState.maximized===id;
        const geometry=rect||pos;
        const frame=geometry.h>geometry.w*1.4?'tall':geometry.w>=geometry.h*2.5?'ultrawide':geometry.w>=geometry.h*1.45?'wide':'square';
        return <article key={id} className={styles.tile+
            (minimized?' '+styles.minimized:'')+(maximized?' '+styles.maximized:'')}
          data-panel-id={id} data-panel-size={`${pos.w}x${pos.h}`} data-frame-family={frame}
          data-panel-background={view.panelBackgrounds[id]||view.backgroundStyle}
          style={{
            ...(freeform&&rect?{
              '--freeform-x':freeformPercent(rect.x),'--freeform-y':rect.y/10+'cqw',
              '--freeform-w':freeformPercent(rect.w),'--freeform-h':rect.h/10+'cqw'
            }:{gridColumn:(pos.x+1)+' / span '+pos.w,
              gridRow:(pos.y+1)+' / span '+pos.h})
          }}>
          <div className={styles.panelActions}>
            {editable?<button type="button" className={styles.dragHandle}
              disabled={view.lockedPositions.includes(id)}
              aria-label={'Move '+names.get(id)} title="Drag to move; Alt+arrows move; Alt+Shift+arrows resize"
              onPointerDown={event=>beginGesture(event,id,'move')}
              onKeyDown={event=>keyboardEdit(event,id)}>Move</button>:null}
            <button type="button" onClick={()=>toggleMinimize(id)}
              aria-label={(minimized?'Restore ':'Minimise ')+names.get(id)}
              aria-expanded={!minimized}>{minimized?'Restore':'−'}</button>
            <button type="button" onClick={()=>toggleMaximize(id)}
              aria-label={(maximized?'Restore size of ':'Maximise ')+names.get(id)}>
              {maximized?'Restore':'□'}</button>
          </div>
          <h3 className={styles.title}><span>{names.get(id)||'Dashboard Panel'}</span></h3>
          <div className={styles.content} aria-hidden={minimized} inert={minimized?true:undefined}>{renderPanel(id)}</div>
          {editable&&!minimized&&!maximized?<button type="button" className={styles.resizeHandle}
            aria-label={'Resize '+names.get(id)} title="Drag to resize this panel"
            disabled={view.lockedPositions.includes(id)}
            onPointerDown={event=>beginGesture(event,id,'resize')}
            onKeyDown={event=>keyboardEdit(event,id)}>↘</button>:null}
        </article>;
      })}
    </div>
    {editing&&!freeform?<p className={styles.editNote} role="status">
      Freeform rearranging is available on desktop. Tablet and mobile use the preserved responsive layout.
    </p>:null}
    {editMessage?<p className={styles.editNote} role="status">{editMessage}</p>:null}
  </section>;
}
