import React,{useEffect,useRef,useState} from 'react';
import {freeformPercent} from '../../../src/state/workspaceFreeformModel.mjs';
import {
  COMBAT_PANEL_IDS,COMBAT_PANEL_LABELS,COMBAT_TOOL_CATEGORIES,
  normalizeCombatCamera,zoomCombatCamera,fitCombatCamera,
  combatWorkspaceStorageKey,defaultCombatWorkspaceLayout,dockCombatWindow,
  editCombatWindow,normalizeCombatWorkspace,setCombatGroup
} from './combatWorkspaceLayoutModel.mjs';
import {AsteriaIcon} from '../../components/AsteriaIcons.jsx';
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
  const updateCamera=update=>{
    const current=cameraRef.current;
    const next=normalizeCombatCamera(typeof update==='function'?update(current):update);
    cameraRef.current=next;
    setCameraState({scope:storageKey,view:next});
  };
  const [maximised,setMaximised]=useState('');
  const [message,setMessage]=useState('');
  const [frontWindow,setFrontWindow]=useState('');
  const [wide,setWide]=useState(false);
  const [sidebarExpanded,setSidebarExpanded]=useState(false);
  const [selectedTools,setSelectedTools]=useState('overview');
  const root=useRef(null),canvas=useRef(null),stage=useRef(null),gesture=useRef(null);
  const toolToggleRef=useRef(null);
  const cameraRef=useRef(camera),wheelTimer=useRef(null),wheelFrame=useRef(0);
  const zoomReadout=useRef(null);
  const layout=saved;
  const panels=collectCombatPanels(children).filter(child=>
    React.isValidElement(child)&&COMBAT_PANEL_IDS.includes(child.props.id));
  const visible=panels.filter(panel=>!layout.hidden.includes(panel.props.id));
  useEffect(()=>{
    setSaved(readLayout(storageKey));
    setUndoStack([]);setRedoStack([]);
    const freshCamera=readCamera(storageKey);
    cameraRef.current=freshCamera;setCameraState({scope:storageKey,view:freshCamera});
    setMaximised('');setFrontWindow('');setMessage('');
    setSidebarExpanded(false);
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
    if(!sidebarExpanded)return undefined;
    const onKeyDown=event=>{
      if(event.key==='Escape'){
        setSidebarExpanded(false);
        toolToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown',onKeyDown);
    return ()=>document.removeEventListener('keydown',onKeyDown);
  },[sidebarExpanded]);
  // Apply only compositor-friendly transforms during pan and wheel movement.
  // Persist camera state once at the end, not once per pointer/wheel event.
  const drawCamera=value=>{
    if(stage.current)stage.current.style.transform=
      'translate3d('+value.x+'px,'+value.y+'px,0) scale('+value.scale+')';
    if(zoomReadout.current)zoomReadout.current.textContent=Math.round(value.scale*100)+'%';
  };
  useEffect(()=>{
    const viewport=canvas.current;
    if(!viewport||!wide)return;
    const wheel=event=>{
      const overWindow=Boolean(event.target.closest?.('[data-combat-panel]'));
      const zoomRequested=!overWindow||event.ctrlKey||event.metaKey;
      if(!zoomRequested){
        // Preserve scrolling inside long combat windows, but never scroll the
        // website when the internal content reaches its scroll boundary.
        for(let element=event.target;element&&element!==viewport;element=element.parentElement){
          const style=window.getComputedStyle(element);
          const canScrollY=/(auto|scroll)/.test(style.overflowY)&&
            ((event.deltaY<0&&element.scrollTop>0)||
              (event.deltaY>0&&element.scrollTop+element.clientHeight<element.scrollHeight-1));
          const canScrollX=/(auto|scroll)/.test(style.overflowX)&&
            ((event.deltaX<0&&element.scrollLeft>0)||
              (event.deltaX>0&&element.scrollLeft+element.clientWidth<element.scrollWidth-1));
          if(canScrollY||canScrollX)return;
        }
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if(!event.deltaY)return;
      const rect=viewport.getBoundingClientRect();
      cameraRef.current=zoomCombatCamera(cameraRef.current,
        cameraRef.current.scale*(event.deltaY<0?1.08:1/1.08),
        {x:event.clientX-rect.left,y:event.clientY-rect.top});
      if(!wheelFrame.current)wheelFrame.current=requestAnimationFrame(()=>{
        wheelFrame.current=0;drawCamera(cameraRef.current);
      });
      clearTimeout(wheelTimer.current);
      wheelTimer.current=setTimeout(()=>{
        setCameraState({scope:storageKey,view:cameraRef.current});
      },140);
    };
    viewport.addEventListener('wheel',wheel,{passive:false});
    return ()=>{
      viewport.removeEventListener('wheel',wheel);
      clearTimeout(wheelTimer.current);
      if(wheelFrame.current)cancelAnimationFrame(wheelFrame.current);
      wheelFrame.current=0;
    };
  },[wide,storageKey]);
  useEffect(()=>()=>{if(gesture.current?.frame)
    cancelAnimationFrame(gesture.current.frame);},[]);
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
      origin:{...cameraRef.current},latestCamera:{...cameraRef.current},frame:0};
    event.preventDefault();canvas.current?.setPointerCapture?.(event.pointerId);
  };
  const begin=(event,id,kind,edge='se')=>{
    if(!wide||maximised||gesture.current||event.isPrimary===false||event.button!==0||
      layout.canvasLocked||layout.locked.includes(id)||layout.hidden.includes(id))return;
    const width=canvas.current?.clientWidth||0,initial=layout.freeform.positions[id];
    if(!width||!initial)return;
    const ids=kind==='move'?layout.groups.find(row=>row.includes(id))||[id]:[id];
    const nodes=Object.fromEntries(ids.map(panelId=>
      [panelId,canvas.current?.querySelector('[data-combat-panel="'+panelId+'"]')]));
    if(canvas.current)canvas.current.dataset.draggingWindow=id;
    gesture.current={id,kind,edge,initial,width,scale:cameraRef.current.scale,
      pointer:event.pointerId,x:event.clientX,y:event.clientY,layout,ids,nodes,
      lastValid:layout,pending:null,frame:0};
    setFrontWindow(current=>current===id?current:id);
    for(const node of Object.values(nodes))node?.classList.add(styles.dragging);
    setMessage('');
    event.preventDefault();event.stopPropagation();
    canvas.current?.setPointerCapture?.(event.pointerId);
  };
  const proposal=(g,x,y)=>{
    const dx=Math.round((x-g.x)*1000/(g.width*g.scale));
    const dy=Math.round((y-g.y)*1000/(g.width*g.scale));
    if(g.kind==='move')return {x:g.initial.x+dx,y:g.initial.y+dy};
    const values={...g.initial};
    if(g.edge.includes('e'))values.w+=dx;
    if(g.edge.includes('w')){values.x+=dx;values.w-=dx;}
    if(g.edge.includes('s'))values.h+=dy;
    if(g.edge.includes('n')){values.y+=dy;values.h-=dy;}
    return values;
  };
  const writeRect=(node,rect)=>{
    if(!node||!rect)return;
    node.style.setProperty('--combat-x',freeformPercent(rect.x));
    node.style.setProperty('--combat-y',rect.y/10+'cqw');
    node.style.setProperty('--combat-w',freeformPercent(rect.w));
    node.style.setProperty('--combat-h',rect.h/10+'cqw');
  };
  const paintGesture=g=>{
    if(gesture.current!==g||!g.pending)return;
    if(g.kind==='pan'){
      const candidate=normalizeCombatCamera({...g.origin,
        x:g.origin.x+g.pending.x-g.x,y:g.origin.y+g.pending.y-g.y});
      g.latestCamera=candidate;
      cameraRef.current=candidate;
      drawCamera(candidate);
      return;
    }
    const candidate=editCombatWindow(g.layout,g.id,g.kind,g.pending);
    // A rejected strict-collision proposal retains the last valid frame.
    // Normal freeform mode accepts overlapping positions immediately.
    const atOrigin=Object.entries(g.pending).every(([key,value])=>
      !Number.isFinite(value)||g.initial[key]===value);
    if(candidate!==g.layout||atOrigin||g.layout.freeform.allowOverlap)
      g.lastValid=candidate;
    const positions=g.lastValid.freeform.positions;
    for(const panelId of g.ids){
      const node=g.nodes[panelId],before=g.layout.freeform.positions[panelId];
      const next=positions[panelId];
      if(!node||!before||!next)continue;
      if(g.kind==='move'){
        const dx=(next.x-before.x)*g.width/1000;
        const dy=(next.y-before.y)*g.width/1000;
        node.style.transform='translate3d('+dx+'px,'+dy+'px,0)';
      }else writeRect(node,next);
    }
  };
  const move=event=>{
    const g=gesture.current;
    if(!g||g.pointer!==event.pointerId)return;
    g.pending=g.kind==='pan'?{x:event.clientX,y:event.clientY}:
      proposal(g,event.clientX,event.clientY);
    if(!g.frame)g.frame=requestAnimationFrame(()=>{
      g.frame=0;paintGesture(g);
    });
  };
  const end=event=>{
    const g=gesture.current;
    if(!g||g.pointer!==event.pointerId)return;
    if(g.frame)cancelAnimationFrame(g.frame);
    g.frame=0;
    g.pending=g.kind==='pan'?{x:event.clientX,y:event.clientY}:
      proposal(g,event.clientX,event.clientY);
    if(event.type==='pointerup')paintGesture(g);
    gesture.current=null;
    if(canvas.current)delete canvas.current.dataset.draggingWindow;
    if(g.kind==='pan'){
      if(event.type==='pointerup')updateCamera(g.latestCamera);
      else{cameraRef.current=g.origin;drawCamera(g.origin);}
    }else{
      const selected=event.type==='pointerup'?g.lastValid:g.layout;
      for(const panelId of g.ids){
        const node=g.nodes[panelId];
        writeRect(node,selected.freeform.positions[panelId]);
        if(node){node.style.transform='';node.classList.remove(styles.dragging);}
      }
      if(selected!==g.layout)change(()=>selected);
      else if(event.type==='pointerup'&&!g.layout.freeform.allowOverlap)
        setMessage('Move blocked by the optional no-overlap setting. Enable panel overlap in Canvas options.');
    }
    try{canvas.current?.releasePointerCapture?.(event.pointerId);}catch{/* released */}
  };
  // A captured drag may finish outside the canvas or even outside its visible
  // browser rectangle. Complete it from the window-level pointer release too.
  // The gesture pointer guard makes a second call after canvas bubbling harmless.
  useEffect(()=>{
    window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',end);
    return ()=>{
      window.removeEventListener('pointerup',end);
      window.removeEventListener('pointercancel',end);
    };
  });
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
      viewport.clientWidth,Math.max(200,viewport.clientHeight-64)));
  };
  const minimize=id=>setPreference(previous=>({...previous,
    minimized:previous.minimized.includes(id)?
      previous.minimized.filter(other=>other!==id):[...previous.minimized,id]
  }));
  const hidden=layout.hidden;
  const togglePanel=id=>setPreference(previous=>({
    ...previous,
    hidden:previous.hidden.includes(id)?
      previous.hidden.filter(other=>other!==id):
      [...previous.hidden,id]
  }));
  return <section className={styles.centre} ref={root}
    aria-label="GM Combat Command Centre" data-testid="site-gm-combat-command-centre">
    <div className={styles.canvas} ref={canvas}
      data-editing={wide&&!layout.canvasLocked}
      data-layout-mode={wide?'freeform':'stacked'}
      aria-label="Combat freeform canvas"
      onPointerDown={startPan}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div ref={stage} className={styles.stage+(maximised?' '+styles.stageMaximised:'')}
        data-stage="combat-canvas-stage"
        style={{'--combat-canvas-height':boundsHeight(layout.freeform,
          visible.map(panel=>panel.props.id)),
          '--combat-pan-x':camera.x+'px','--combat-pan-y':camera.y+'px',
          '--combat-scale':camera.scale}}>
      {visible.map(panel=>{
        const id=panel.props.id,rect=layout.freeform.positions[id];
        const isMinimised=layout.minimized.includes(id),isMaximised=maximised===id;
        const isLocked=layout.locked.includes(id);
        const grouped=layout.groups.some(row=>row.includes(id));
        const label=COMBAT_PANEL_LABELS[id];
        return <article key={id} className={styles.window+
          (isMinimised?' '+styles.minimised:'')+
          (isMaximised?' '+styles.maximised:'')}
          data-combat-panel={id}
          onPointerDownCapture={()=>setFrontWindow(current=>current===id?current:id)}
          style={{zIndex:isMaximised?3000:frontWindow===id?50:1,
            '--combat-x':freeformPercent(rect.x),'--combat-y':rect.y/10+'cqw',
            '--combat-w':freeformPercent(rect.w),'--combat-h':rect.h/10+'cqw'}}>
          <header className={styles.windowBar}
            data-testid={'combat-drag-header-'+id}
            title="Drag to move; double-click to focus or restore"
            onDoubleClick={event=>{
              if(event.target.closest('button,input,select,textarea,a,summary,details,label'))return;
              setMaximised(current=>current===id?'':id);
            }}
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
                <summary aria-label={'Window options for '+label} title="Window options"><AsteriaIcon name="settings" size={17}/></summary>
                <div>
                  <label>Content size
                    <select aria-label={'Content size for '+label}
                      value={layout.contentScale[id]??1}
                      onChange={event=>setPreference(previous=>({...previous,
                        contentScale:{...previous.contentScale,[id]:Number(event.target.value)}
                      }))}>
                      <option value={0.9}>Compact (90%)</option>
                      <option value={1}>Standard (100%)</option>
                      <option value={1.15}>Comfortable (115%)</option>
                      <option value={1.3}>Large (130%)</option>
                      <option value={1.5}>Extra large (150%)</option>
                    </select>
                  </label>
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
          <div className={styles.windowContent} data-combat-scroll
            aria-hidden={isMinimised} inert={isMinimised?true:undefined}>
            <div className={styles.windowBody}
              style={{'--combat-content-scale':layout.contentScale[id]??1}}>
              {panel.props.children}
            </div>
          </div>
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
      <div className={styles.canvasActions} role="toolbar"
        aria-label="Combat canvas controls">
        <button type="button" ref={toolToggleRef} className={styles.iconButton}
          data-testid="site-combat-tools-toggle"
          aria-label={sidebarExpanded?'Close Combat Tools':'Open Combat Tools'}
          title="Combat Tools and Canvas Settings"
          aria-expanded={sidebarExpanded} aria-controls="asteria-combat-tool-list"
          onClick={()=>setSidebarExpanded(value=>!value)}>
          <AsteriaIcon name="settings" size={19}/>
        </button>
        <button type="button" className={styles.iconButton}
          aria-label="Undo canvas change" title="Undo canvas change"
          disabled={!undoStack.length} onClick={undo}>
          <AsteriaIcon name="undo" size={19}/>
        </button>
        <button type="button" className={styles.iconButton}
          data-testid="site-combat-canvas-lock"
          aria-label={layout.canvasLocked?'Unlock Canvas':'Lock Canvas'}
          title={layout.canvasLocked?'Unlock Canvas':'Lock Canvas'}
          aria-pressed={layout.canvasLocked}
          onClick={()=>setPreference(previous=>({...previous,canvasLocked:!previous.canvasLocked}))}>
          <AsteriaIcon name={layout.canvasLocked?'lock':'unlock'} size={19}/>
        </button>
        <button type="button" className={styles.iconButton}
          aria-label="Redo canvas change" title="Redo canvas change"
          disabled={!redoStack.length} onClick={redo}>
          <AsteriaIcon name="redo" size={19}/>
        </button>
        {wide?<>
          <button type="button" className={styles.iconButton}
            aria-label="Zoom into canvas" title="Zoom in"
            onClick={()=>updateCamera(current=>zoomCombatCamera(current,
              current.scale*1.2,{x:(canvas.current?.clientWidth||0)/2,
                y:(canvas.current?.clientHeight||0)/2}))}>
            <AsteriaIcon name="zoomIn" size={19}/>
          </button>
          <button type="button" className={styles.iconButton}
            aria-label="Fit Canvas" title="Fit all panels"
            data-testid="site-combat-fit-all" onClick={fitAll}>
            <AsteriaIcon name="fitCanvas" size={19}/>
          </button>
          <button type="button" className={styles.iconButton}
            aria-label="Zoom out of canvas" title="Zoom out"
            onClick={()=>updateCamera(current=>zoomCombatCamera(current,
              current.scale/1.2,{x:(canvas.current?.clientWidth||0)/2,
                y:(canvas.current?.clientHeight||0)/2}))}>
            <AsteriaIcon name="zoomOut" size={19}/>
          </button>
          <output ref={zoomReadout} aria-label="Canvas zoom"
            className={styles.zoomValue}>{Math.round(camera.scale*100)}%</output>
        </>:null}
      </div>
      {sidebarExpanded?<button type="button" className={styles.drawerBackdrop}
        aria-label="Dismiss Combat Tools" onClick={()=>setSidebarExpanded(false)}/>:null}
      <aside id="asteria-combat-tool-list" hidden={!sidebarExpanded}
        className={styles.toolSidebar} aria-label="Combat Command Centre tools">
        <header className={styles.drawerHeader}>
          <div><h4>Combat Tools</h4><span>{visible.length} of {panels.length} windows visible</span></div>
          <button type="button" className={styles.iconButton}
            aria-label="Close Combat Tools menu"
            onClick={()=>{setSidebarExpanded(false);toolToggleRef.current?.focus();}}>
            <AsteriaIcon name="close" size={19}/>
          </button>
        </header>
        <div className={styles.toolList}>
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
                  onClick={()=>togglePanel(id)}>
                  <span aria-hidden="true">{active?'☑':'☐'}</span>{COMBAT_PANEL_LABELS[id]}
                </button>;
              })}
            </div>:null}
          </section>)}
          <button type="button" className={styles.showAll}
            disabled={!hidden.length||!storageKey}
            onClick={()=>setPreference(previous=>({...previous,hidden:[]}))}>
            Show all panels ({visible.length}/{panels.length})
          </button>
          <details className={styles.drawerSettings}>
            <summary>Canvas Preferences</summary>
            <label><input type="checkbox" checked={layout.freeform.snap}
              onChange={event=>setPreference(previous=>({...previous,freeform:{
                ...previous.freeform,snap:event.target.checked}}))}/> Snap windows to grid</label>
            <label><input type="checkbox" checked={layout.freeform.allowOverlap}
              onChange={event=>setPreference(previous=>({...previous,freeform:{
                ...previous.freeform,allowOverlap:event.target.checked}}))}/> Allow window overlap</label>
            <p className={styles.sidebarHint}>
              Drag window headers to move (double-click to focus), resize from edges,
              and drag empty space to pan. Scroll over empty canvas to zoom; use Ctrl/Command
              + wheel over a window to zoom the canvas instead of its contents.
              Content size is adjustable per window. Changes save automatically.
              Canvas lock does not disable combat controls.
            </p>
          </details>
        </div>
      </aside>
      {visible.length===0?<div className={styles.empty} role="status">
        <p>No combat windows are showing. Open Combat Tools to restore them.</p>
        <button type="button" onClick={()=>setSidebarExpanded(true)}>Open Combat Tools</button>
      </div>:null}
      {message?<p className={styles.note} role="status">{message}</p>:null}
    </div>
  </section>;
}
