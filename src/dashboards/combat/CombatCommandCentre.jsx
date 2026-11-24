import React,{useEffect,useRef,useState} from 'react';
import {freeformPercent} from '../../../src/state/workspaceFreeformModel.mjs';
import {
  COMBAT_PANEL_IDS,COMBAT_PANEL_LABELS,COMBAT_TOOL_CATEGORIES,
  normalizeCombatCamera,zoomCombatCamera,fitCombatCamera,openingCombatCamera,
  combatCanvasGridStyle,combatCanvasDetailLevel,combatWindowAlignment,
  focusCombatCamera,clampCombatCamera,orderedCombatPartyIds,moveCombatPartyCard,
  combatWorkspaceStorageKey,defaultCombatWorkspaceLayout,dockCombatWindow,
  editCombatWindow,normalizeCombatWorkspace
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
 try{
   if(!key||typeof localStorage==='undefined')return null;
   const stored=localStorage.getItem(cameraStorageKey(key));
   return stored?normalizeCombatCamera(JSON.parse(stored)):null;
 }catch{return null;}
}
const DEFAULT_CAMERA=normalizeCombatCamera({scale:.5});
const boundsHeight=(freeform,visibleIds)=>Math.max(700,...visibleIds.map(id=>{
 const rect=freeform.positions[id];return rect?rect.y+rect.h+80:700;
}));

/**
 * The GM Combat Command Centre stores layout-only preferences under the GM UID
 * and campaign on this device. All gameplay writes still use the existing
 * permission-checked Firebase combat API in CombatWorkspace.
 */
export function CombatCommandCentre({uid,campaignId,children,canvasConfig=null,
  layoutValue=null,onSaveLayout=null,canvasScopeId='',canEditCanvas=true,
  forcedPanelIds=[],suppressedPanelIds=[]}){
  const gmCanvas=Boolean(canvasConfig);
  const playerCanvas=canvasConfig?.kind==='player';
  const canvasRole=playerCanvas?'Player':'GM';
  const panelIds=canvasConfig?.ids||COMBAT_PANEL_IDS;
  const panelLabels=canvasConfig?.labels||COMBAT_PANEL_LABELS;
  const toolCategories=canvasConfig?.categories||COMBAT_TOOL_CATEGORIES;
  const validKey=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(value);
  const storageKey=gmCanvas?
    (validKey(uid)&&validKey(campaignId)&&(!playerCanvas||validKey(canvasScopeId))?
      (playerCanvas?'asteria:player-main-canvas:v1:':'asteria:gm-main-canvas:v1:')+
        uid+':'+campaignId+(playerCanvas?':'+canvasScopeId:''):null):
    combatWorkspaceStorageKey(uid,campaignId);
  const normalizeLayout=value=>normalizeCombatWorkspace(value,canvasConfig||undefined);
  const [saved,setSaved]=useState(()=>
    gmCanvas?normalizeLayout(layoutValue):readLayout(storageKey));
  const [undoStack,setUndoStack]=useState([]);
  const [redoStack,setRedoStack]=useState([]);
  const [cameraState,setCameraState]=useState(()=>({scope:storageKey,view:readCamera(storageKey)||DEFAULT_CAMERA}));
  const camera=cameraState.scope===storageKey?cameraState.view:DEFAULT_CAMERA;
  const updateCamera=update=>{
    const current=cameraRef.current;
    const candidate=normalizeCombatCamera(typeof update==='function'?update(current):update);
    const viewport=canvas.current;
    const next=viewport&&viewport.clientWidth>=700?
      clampCombatCamera(candidate,saved,
        panelIds.filter(id=>!saved.hidden.includes(id)),
        viewport.clientWidth,Math.max(200,viewport.clientHeight-64)):candidate;
    cameraRef.current=next;
    drawCamera(next);
    setCameraState({scope:storageKey,view:next});
  };
  const [focused,setFocused]=useState(null);
  const [message,setMessage]=useState('');
  const [frontWindow,setFrontWindow]=useState('');
  const [windowSearch,setWindowSearch]=useState('');
  const [wide,setWide]=useState(false);
  const [sidebarExpanded,setSidebarExpanded]=useState(false);
  const [selectedTools,setSelectedTools]=useState(
    playerCanvas?canvasConfig.categories[0]?.id||'character':gmCanvas?'core':'overview');
  const root=useRef(null),canvas=useRef(null),stage=useRef(null),gesture=useRef(null);
  const toolToggleRef=useRef(null);
  const cameraRef=useRef(camera),openingCameraPending=useRef(!readCamera(storageKey));
  const wheelTimer=useRef(null),wheelFrame=useRef(0);
  const zoomReadout=useRef(null),spaceHeld=useRef(false),focusTimer=useRef(null);
  const lastTitlePress=useRef(null);
  const layout=saved;
  const panels=collectCombatPanels(children).filter(child=>
    React.isValidElement(child)&&panelIds.includes(child.props.id));
  const forced=new Set(forcedPanelIds.filter(id=>panelIds.includes(id)));
  const suppressed=new Set(suppressedPanelIds.filter(id=>panelIds.includes(id)));
  const visible=panels.filter(panel=>!suppressed.has(panel.props.id)&&
    (!layout.hidden.includes(panel.props.id)||forced.has(panel.props.id)));
  useEffect(()=>{
    setSaved(gmCanvas?normalizeLayout(layoutValue):readLayout(storageKey));
    setUndoStack([]);setRedoStack([]);
    const storedCamera=readCamera(storageKey);
    openingCameraPending.current=!storedCamera;
    const freshCamera=storedCamera||DEFAULT_CAMERA;
    cameraRef.current=freshCamera;setCameraState({scope:storageKey,view:freshCamera});
    setFocused(null);setFrontWindow('');setMessage('');
    setSidebarExpanded(false);
  },[storageKey]);
  useEffect(()=>{
    if(!gmCanvas||!layoutValue)return;
    const incoming=normalizeLayout(layoutValue);
    setSaved(current=>fingerprint(current)===fingerprint(incoming)?current:incoming);
  },[layoutValue,storageKey]);
  useEffect(()=>{
    const host=root.current,viewport=canvas.current;
    const refresh=()=>setWide((viewport?.clientWidth||host?.clientWidth||0)>=700);
    refresh();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(refresh);
    if(host)observer?.observe(host);
    if(viewport)observer?.observe(viewport);
    return ()=>observer?.disconnect();
  },[]);
  // All three workspaces use the same viewport-filling canvas. Measure the
  // content area after the live dashboard header and navigation, rather than
  // assuming the same fixed header height for GM, Player and Combat pages.
  useEffect(()=>{
    const host=root.current,viewport=canvas.current;
    const page=host?.closest('#reactDashboard');
    const scrollArea=host?.closest('#mainContent');
    // Keep the compact stacked view and embedded GM inspection modals intact.
    if(!host||!viewport||!page||!scrollArea||host.closest('.react-modal'))return;
    let frame=0;
    const fit=()=>{
      frame=0;
      const scrollRect=scrollArea.getBoundingClientRect();
      const viewportRect=viewport.getBoundingClientRect();
      // Measure in one coordinate space. The former viewport-top + scrollTop
      // mix left an unintended gap below the GM/Player/Combat canvases.
      const contentTop=viewportRect.top-scrollRect.top+scrollArea.scrollTop;
      const height=Math.max(380,Math.floor(scrollArea.clientHeight-contentTop-2));
      const parentRect=host.parentElement?.getBoundingClientRect();
      const expandHorizontally=window.innerWidth>=900&&
        (host.parentElement?.clientWidth||0)>=700;
      // Expand into page gutters, not into player combat sidebars or dialogs.
      const left=expandHorizontally&&parentRect
        ?Math.min(36,Math.max(0,parentRect.left-scrollRect.left)):0;
      const right=expandHorizontally&&parentRect
        ?Math.min(36,Math.max(0,scrollRect.right-parentRect.right)):0;
      host.style.setProperty('--combat-edge-left',left+'px');
      host.style.setProperty('--combat-edge-right',right+'px');
      viewport.style.setProperty('--combat-viewport-height',height+'px');
    };
    const schedule=()=>{
      if(frame)window.cancelAnimationFrame(frame);
      frame=window.requestAnimationFrame(fit);
    };
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
    observer?.observe(scrollArea);
    observer?.observe(page);
    const shell=host.closest('.react-workspace-main');
    if(shell)observer?.observe(shell);
    window.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('resize',schedule);
    schedule();
    return ()=>{
      if(frame)window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize',schedule);
      window.visualViewport?.removeEventListener('resize',schedule);
    };
  },[]);
  useEffect(()=>{
    if(!wide)return;
    const viewport=canvas.current;
    if(!viewport)return;
    if(openingCameraPending.current){
      openingCameraPending.current=false;
      updateCamera(openingCombatCamera(layout,
        visible.map(panel=>panel.props.id),viewport.clientWidth));
      return;
    }
    const next=clampCombatCamera(cameraRef.current,layout,
      visible.map(panel=>panel.props.id),viewport.clientWidth,
      Math.max(200,viewport.clientHeight-64));
    if(JSON.stringify(next)!==JSON.stringify(cameraRef.current))updateCamera(next);
  },[wide,storageKey]);
  useEffect(()=>{
    const onDown=event=>{
      if(event.code==='Space'&&!/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName||'')&&!event.target?.isContentEditable){
        spaceHeld.current=true;
      }
    };
    const onUp=event=>{if(event.code==='Space')spaceHeld.current=false;};
    const clear=()=>{spaceHeld.current=false;};
    window.addEventListener('keydown',onDown);
    window.addEventListener('keyup',onUp);
    window.addEventListener('blur',clear);
    return ()=>{window.removeEventListener('keydown',onDown);
      window.removeEventListener('keyup',onUp);window.removeEventListener('blur',clear);};
  },[]);
  useEffect(()=>{
    if(openingCameraPending.current||cameraState.scope!==storageKey||!storageKey)return;
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
      'translate3d('+Math.round(value.x*100)/100+'px,'+
        Math.round(value.y*100)/100+'px,0) scale('+value.scale+')';
    const viewport=canvas.current;
    if(viewport){
      const grid=combatCanvasGridStyle(value,layout.gridSize);
      for(const [key,entry] of Object.entries(grid))
        viewport.style.setProperty(key,key==='--combat-grid-opacity'&&!layout.gridVisible?'0':entry);
      viewport.dataset.detailLevel=combatCanvasDetailLevel(value,layout.detailMode);
    }
    if(zoomReadout.current)zoomReadout.current.textContent=Math.round(value.scale*100)+'%';
  };
  const animateCamera=()=>{
    const node=stage.current,viewport=canvas.current;
    if(!node||!layout.smoothAnimations||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    clearTimeout(focusTimer.current);
    node.classList.add(styles.cameraFocus);
    viewport?.classList.add(styles.cameraFocus);
    focusTimer.current=setTimeout(()=>{
      node.classList.remove(styles.cameraFocus);
      viewport?.classList.remove(styles.cameraFocus);
    },280);
  };
  const focusWindow=id=>{
    const viewport=canvas.current;
    if(!viewport||!wide||!layout.focusMode)return;
    animateCamera();
    if(focused?.id===id){
      updateCamera(focused.previous);
      setFocused(null);
      return;
    }
    const previous=focused?.previous||{...cameraRef.current};
    setFocused({id,previous});
    updateCamera(focusCombatCamera(layout,id,viewport.clientWidth,
      Math.max(200,viewport.clientHeight-64)));
    setFrontWindow(id);
  };
  useEffect(()=>{
    const viewport=canvas.current;
    if(!viewport||!wide)return;
    const wheel=event=>{
      const overWindow=Boolean(event.target.closest?.('[data-combat-panel]'));
      stage.current?.classList.remove(styles.cameraFocus);
      canvas.current?.classList.remove(styles.cameraFocus);
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
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?
        viewport.clientHeight:1);
      const factor=Math.exp(-Math.max(-140,Math.min(140,delta))*.0015);
      const requested=zoomCombatCamera(cameraRef.current,
        cameraRef.current.scale*factor,
        layout.zoomTowardCursor?
          {x:event.clientX-rect.left,y:event.clientY-rect.top-60}:
          {x:viewport.clientWidth/2,y:(viewport.clientHeight-60)/2});
      cameraRef.current=clampCombatCamera(requested,layout,
        visible.map(panel=>panel.props.id),viewport.clientWidth,
        Math.max(200,viewport.clientHeight-64));
      if(!wheelFrame.current)wheelFrame.current=requestAnimationFrame(()=>{
        wheelFrame.current=0;drawCamera(cameraRef.current);
      });
      clearTimeout(wheelTimer.current);
      wheelTimer.current=setTimeout(()=>{
        setCameraState({scope:storageKey,view:cameraRef.current});
      },140);
    };
    viewport.addEventListener('wheel',wheel,{passive:false,capture:true});
    return ()=>{
      viewport.removeEventListener('wheel',wheel,{capture:true});
      clearTimeout(wheelTimer.current);
      if(wheelFrame.current)cancelAnimationFrame(wheelFrame.current);
      wheelFrame.current=0;
    };
  },[wide,storageKey,layout]);
  useEffect(()=>()=>{clearTimeout(focusTimer.current);if(gesture.current?.frame)
    cancelAnimationFrame(gesture.current.frame);},[]);
  /** Gameplay state never enters the local geometry/history store. */
  const commit=(next,announce=false)=>{
    if(!canEditCanvas){setMessage('This dashboard can be customised only by its owner.');return false;}
    if(!storageKey){setMessage('Dashboard account or character context is unavailable.');return false;}
    const normalized=normalizeLayout(next);
    if(gmCanvas){
      if(typeof onSaveLayout!=='function'){
        setMessage(canvasRole+' dashboard layout storage is not connected.');return false;
      }
      const previous=saved;
      setSaved(normalized);
      setMessage('');
      Promise.resolve().then(()=>onSaveLayout(normalized)).then(result=>{
        if(result?.ok===false){
          setMessage(result.error||canvasRole+' dashboard layout could not be saved.');
          setSaved(current=>fingerprint(current)===fingerprint(normalized)?previous:current);
        }else if(announce)setMessage(canvasRole+' dashboard canvas saved.');
      }).catch(error=>{
        setMessage(error?.message||canvasRole+' dashboard layout could not be saved.');
        setSaved(current=>fingerprint(current)===fingerprint(normalized)?previous:current);
      });
      return true;
    }
    try{localStorage.setItem(storageKey,JSON.stringify(normalized));}
    catch{setMessage('Browser storage is unavailable. Layout changes have not been saved.');return false;}
    setSaved(normalized);
    setMessage(announce?'Canvas layout saved on this device.':'');
    return true;
  };
  const change=update=>{
    if(!canEditCanvas)return;
    const next=normalizeLayout(update(layout));
    if(fingerprint(next)===fingerprint(layout))return;
    if(commit(next)){
      setUndoStack(previous=>[...previous,layout].slice(-40));
      setRedoStack([]);
    }
  };
  const setPreference=change;
  const [alignmentLines,setAlignmentLines]=useState([]);
  const undo=()=>{
    if(!canEditCanvas||!undoStack.length)return;
    const previous=undoStack[undoStack.length-1];
    if(commit(previous)){setUndoStack(undoStack.slice(0,-1));setRedoStack(rows=>[layout,...rows].slice(0,40));}
  };
  const redo=()=>{
    if(!canEditCanvas||!redoStack.length)return;
    const next=redoStack[0];
    if(commit(next)){setRedoStack(redoStack.slice(1));setUndoStack(rows=>[...rows,layout].slice(-40));}
  };
  const startPan=event=>{
    const middle=event.button===1,space=spaceHeld.current&&event.button===0;
    if(!wide||gesture.current||event.isPrimary===false||
       (!middle&&!space&&(event.button!==0||
         (event.target!==canvas.current&&event.target!==stage.current))))return;
    stage.current?.classList.remove(styles.cameraFocus);
    canvas.current?.classList.remove(styles.cameraFocus);
    if(middle||space)setFocused(null);
    gesture.current={kind:'pan',pointer:event.pointerId,x:event.clientX,y:event.clientY,
      origin:{...cameraRef.current},latestCamera:{...cameraRef.current},frame:0};
    event.preventDefault();canvas.current?.setPointerCapture?.(event.pointerId);
  };
  const begin=(event,id,kind,edge='se')=>{
    if(!wide||gesture.current||spaceHeld.current||event.isPrimary===false||event.button!==0||
      !canEditCanvas||layout.canvasLocked||layout.locked.includes(id)||
     (layout.hidden.includes(id)&&!forced.has(id)))return;
    const width=canvas.current?.clientWidth||0,initial=layout.freeform.positions[id];
    if(!width||!initial)return;
    const ids=kind==='move'?layout.groups.find(row=>row.includes(id))||[id]:[id];
    const nodes=Object.fromEntries(ids.map(panelId=>
      [panelId,canvas.current?.querySelector('[data-combat-panel="'+panelId+'"]')]));
    setAlignmentLines([]);
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
    if(g.kind==='move'){
      const position={x:g.initial.x+dx,y:g.initial.y+dy};
      return g.layout.magneticSnap?combatWindowAlignment(g.layout,g.id,position,{
        snap:true,strength:g.layout.snapStrength}).position:position;
    }
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
      const viewport=canvas.current;
      const candidate=clampCombatCamera({...g.origin,
        x:g.origin.x+g.pending.x-g.x,y:g.origin.y+g.pending.y-g.y},
        layout,visible.map(panel=>panel.props.id),
        viewport?.clientWidth||1000,Math.max(200,(viewport?.clientHeight||700)-64));
      g.latestCamera=candidate;
      cameraRef.current=candidate;
      drawCamera(candidate);
      return;
    }
    const candidate=editCombatWindow(g.layout,g.id,g.kind,g.pending,canvasConfig||undefined);
    if(g.kind==='move'&&g.layout.alignmentGuides){
      const guides=combatWindowAlignment(g.layout,g.id,g.pending,{
        strength:g.layout.snapStrength}).guides;
      setAlignmentLines(previous=>JSON.stringify(previous)===JSON.stringify(guides)?previous:guides);
    }
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
    const press=lastTitlePress.current;
    if(press&&(Math.abs(event.clientX-press.x)>6||
      Math.abs(event.clientY-press.y)>6))lastTitlePress.current=null;
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
    setAlignmentLines([]);
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
    if(!layout.keyboardShortcuts||!canEditCanvas||!wide||layout.canvasLocked||!event.altKey||
      !event.key.startsWith('Arrow'))return;
    const deltas={ArrowLeft:[-10,0],ArrowRight:[10,0],
      ArrowUp:[0,-10],ArrowDown:[0,10]};
    const delta=deltas[event.key],rect=layout.freeform.positions[id];
    if(!delta||!rect)return;
    event.preventDefault();
    const kind=event.shiftKey?'resize':'move';
    const values=kind==='move'?{x:rect.x+delta[0],y:rect.y+delta[1]}:
      {w:rect.w+delta[0],h:rect.h+delta[1]};
    change(previous=>editCombatWindow(previous,id,kind,values,canvasConfig||undefined));
  };
  useEffect(()=>{
    if(!focused)return;
    if(layout.hidden.includes(focused.id))setFocused(null);
  },[layout.hidden,focused]);
  const fitAll=()=>{
    const viewport=canvas.current;
    if(!viewport||!wide)return;
    setFocused(null);
    animateCamera();
    updateCamera(fitCombatCamera(layout,visible.map(panel=>panel.props.id),
      viewport.clientWidth,Math.max(200,viewport.clientHeight-64)));
  };
  const openingView=()=>{
    const viewport=canvas.current;
    if(!viewport||!wide)return;
    setFocused(null);
    animateCamera();
    updateCamera(openingCombatCamera(layout,
      visible.map(panel=>panel.props.id),viewport.clientWidth));
  };
  const minimize=id=>setPreference(previous=>({...previous,
    minimized:previous.minimized.includes(id)?
      previous.minimized.filter(other=>other!==id):[...previous.minimized,id]
  }));
  const hidden=layout.hidden;
  const togglePanel=id=>{
    if(suppressed.has(id))return;
    setPreference(previous=>({
    ...previous,
    hidden:previous.hidden.includes(id)?
      previous.hidden.filter(other=>other!==id):
      [...previous.hidden,id]
    }));
  };
  const gridStyle=combatCanvasGridStyle(camera,layout.gridSize);
  const detailLevel=combatCanvasDetailLevel(camera,layout.detailMode);
  const minimapRects=visible.map(panel=>({
    id:panel.props.id,rect:layout.freeform.positions[panel.props.id]
  })).filter(item=>item.rect);
  const miniBounds=minimapRects.reduce((bounds,item)=>({
    minX:Math.min(bounds.minX,item.rect.x),
    minY:Math.min(bounds.minY,item.rect.y),
    maxX:Math.max(bounds.maxX,item.rect.x+item.rect.w),
    maxY:Math.max(bounds.maxY,item.rect.y+item.rect.h)
  }),{minX:0,minY:0,maxX:1000,maxY:600});
  const miniWidth=Math.max(1,miniBounds.maxX-miniBounds.minX);
  const miniHeight=Math.max(1,miniBounds.maxY-miniBounds.minY);
  return <section className={styles.centre} ref={root}
    aria-label={playerCanvas?'Player Main Dashboard Canvas':
      gmCanvas?'GM Main Dashboard Canvas':'GM Combat Command Centre'}
    data-testid={playerCanvas?'site-player-main-canvas':
      gmCanvas?'site-gm-main-canvas':'site-gm-combat-command-centre'}>
    <div className={styles.canvas} ref={canvas}
      style={{...gridStyle,'--combat-grid-opacity':layout.gridVisible?gridStyle['--combat-grid-opacity']:'0'}}
      data-detail-level={detailLevel}
      data-detail-mode={layout.detailMode}
      data-background={layout.canvasBackground}
      data-motion={layout.smoothAnimations?'on':'off'}
      data-reduce-effects={layout.reduceOffscreenEffects?'on':'off'}
      data-editing={wide&&canEditCanvas&&!layout.canvasLocked}
      data-layout-mode={wide?'freeform':'stacked'}
      aria-label={playerCanvas?'Player dashboard freeform canvas':
        gmCanvas?'GM dashboard freeform canvas':'Combat freeform canvas'}
      onPointerDown={startPan}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onAuxClick={event=>{if(event.button===1)event.preventDefault();}}>
      <div ref={stage} className={styles.stage}
        data-stage="combat-canvas-stage"
        style={{'--combat-canvas-height':boundsHeight(layout.freeform,
          visible.map(panel=>panel.props.id)),
          '--combat-pan-x':camera.x+'px','--combat-pan-y':camera.y+'px',
          '--combat-scale':camera.scale}}>
      {visible.map(panel=>{
        const id=panel.props.id,rect=layout.freeform.positions[id];
        const isMinimised=layout.minimized.includes(id),isFocused=focused?.id===id;
        const isLocked=layout.locked.includes(id);
        const label=panelLabels[id]||id;
        return <article key={id} className={styles.window+
          (isMinimised?' '+styles.minimised:'')+
          (isFocused?' '+styles.focused:'')}
          data-combat-panel={id} data-canvas-window={id}
          data-window-label={label}
          onPointerDownCapture={()=>setFrontWindow(current=>current===id?current:id)}
          style={{zIndex:frontWindow===id?50:1,
            '--combat-x':freeformPercent(rect.x),'--combat-y':rect.y/10+'cqw',
            '--combat-w':freeformPercent(rect.w),'--combat-h':rect.h/10+'cqw'}}>
          <header className={styles.windowBar}
            data-testid={'combat-drag-header-'+id}
            title="Drag to move; double-click to focus or return"
            onPointerDown={event=>{
              if(event.target.closest('button,input,select,textarea,a,summary,details,label'))return;
              const previous=lastTitlePress.current;
              const doublePress=previous?.id===id&&
                event.timeStamp-previous.time<380&&
                Math.abs(event.clientX-previous.x)<8&&
                Math.abs(event.clientY-previous.y)<8;
              lastTitlePress.current=doublePress?null:{
                id,time:event.timeStamp,x:event.clientX,y:event.clientY};
              if(doublePress){
                event.preventDefault();event.stopPropagation();
                focusWindow(id);
                return;
              }
              begin(event,id,'move');
            }}>
            <strong tabIndex={wide&&canEditCanvas&&!isLocked&&!layout.canvasLocked?0:undefined}
              role="button" aria-label={'Move '+label}
              aria-disabled={!canEditCanvas||isLocked||layout.canvasLocked}
              onKeyDown={event=>keyboard(event,id)}>
              {label}
            </strong>
            <div className={styles.windowActions}>
              <button type="button" aria-label={(isMinimised?'Restore ':'Minimise ')+label}
                disabled={!canEditCanvas} onClick={()=>minimize(id)}>{isMinimised?'Restore':'−'}</button>
              <button type="button" aria-label={(isFocused?'Return from ':'Focus on ')+label}
                onClick={()=>focusWindow(id)}>{isFocused?'↩':'□'}</button>
              <details className={styles.options}>
                <summary aria-label={'Window options for '+label} title="Window options"><AsteriaIcon name="settings" size={17}/></summary>
                <div>
                  <label>Content size
                    <select aria-label={'Content size for '+label}
                      value={layout.contentScale[id]??1} disabled={!canEditCanvas}
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
                  <button type="button" disabled={!canEditCanvas}
                    onClick={()=>change(previous=>({...previous,
                    locked:isLocked?previous.locked.filter(other=>other!==id):
                      [...previous.locked,id]
                  }))}>{isLocked?'Unlock window':'Lock window'}</button>
                  <button type="button" disabled={!canEditCanvas||isLocked}
                    onClick={()=>change(previous=>({...previous,
                      hidden:[...previous.hidden,id]
                    }))}>Hide window</button>
                  <button type="button" disabled={!canEditCanvas||isLocked}
                    onClick={()=>change(previous=>dockCombatWindow(previous,id,'left',canvasConfig||undefined))}>
                    Dock left</button>
                  <button type="button" disabled={!canEditCanvas||isLocked}
                    onClick={()=>change(previous=>dockCombatWindow(previous,id,'right',canvasConfig||undefined))}>
                    Dock right</button>

                </div>
              </details>
            </div>
          </header>
          <div className={styles.windowContent} data-combat-scroll
            aria-hidden={isMinimised||(layout.detailMode==='adaptive'&&camera.scale<.26)}
            inert={isMinimised||(layout.detailMode==='adaptive'&&camera.scale<.26)?true:undefined}>
            <div className={styles.windowBody}
              style={{'--combat-content-scale':layout.contentScale[id]??1}}>
              {typeof panel.props.children==='function'?
                panel.props.children({
                  order:layout.partyCardOrder,
                  onReorder:(from,to,ids)=>change(previous=>({
                    ...previous,partyCardOrder:moveCombatPartyCard(
                      orderedCombatPartyIds(ids,previous.partyCardOrder),from,to)
                  }))
                }):panel.props.children}
            </div>
          </div>
          {wide&&canEditCanvas&&!layout.canvasLocked&&!isLocked&&!isMinimised?
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
      {wide&&alignmentLines.length>0?<div className={styles.alignmentOverlay}
        aria-hidden="true">{alignmentLines.map(line=><i key={line.axis}
          className={line.axis==='x'?styles.alignmentVertical:styles.alignmentHorizontal}
          style={line.axis==='x'?{
            left:'calc('+line.line/10+'cqw * '+camera.scale+' + '+camera.x+'px)'
          }:{
            top:'calc('+line.line/10+'cqw * '+camera.scale+' + '+(camera.y+60)+'px)'
          }}/>)}</div>:null}
      <div className={styles.canvasActions} role="toolbar"
        aria-label={playerCanvas?'Player dashboard canvas controls':
          gmCanvas?'GM dashboard canvas controls':'Combat canvas controls'}>
        <button type="button" ref={toolToggleRef} className={styles.iconButton}
          data-testid="site-combat-tools-toggle"
          aria-label={sidebarExpanded?
            (gmCanvas?'Close Dashboard Windows':'Close Combat Tools'):
            (gmCanvas?'Open Dashboard Windows':'Open Combat Tools')}
          title={gmCanvas?'Dashboard Windows and Canvas Settings':
            'Combat Tools and Canvas Settings'}
          aria-expanded={sidebarExpanded} aria-controls="asteria-combat-tool-list"
          onClick={()=>setSidebarExpanded(value=>!value)}>
          <AsteriaIcon name="settings" size={19}/>
        </button>
        <button type="button" className={styles.iconButton}
          aria-label="Undo canvas change" title="Undo canvas change"
          disabled={!canEditCanvas||!undoStack.length} onClick={undo}>
          <AsteriaIcon name="undo" size={19}/>
        </button>
        <button type="button" className={styles.iconButton}
          data-testid="site-combat-canvas-lock"
          aria-label={!canEditCanvas?'Read-only Canvas':layout.canvasLocked?'Unlock Canvas':'Lock Canvas'}
          title={!canEditCanvas?'Read-only Canvas':layout.canvasLocked?'Unlock Canvas':'Lock Canvas'}
          aria-pressed={layout.canvasLocked} disabled={!canEditCanvas}
          onClick={()=>setPreference(previous=>({...previous,canvasLocked:!previous.canvasLocked}))}>
          <AsteriaIcon name={layout.canvasLocked?'lock':'unlock'} size={19}/>
        </button>
        <button type="button" className={styles.iconButton}
          aria-label="Redo canvas change" title="Redo canvas change"
          disabled={!canEditCanvas||!redoStack.length} onClick={redo}>
          <AsteriaIcon name="redo" size={19}/>
        </button>
        {wide?<>
          <button type="button" className={styles.iconButton}
            aria-label="Zoom into canvas" title="Zoom in"
            onClick={()=>updateCamera(current=>zoomCombatCamera(current,
              current.scale*1.2,{x:(canvas.current?.clientWidth||0)/2,
                y:((canvas.current?.clientHeight||0)-60)/2}))}>
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
                y:((canvas.current?.clientHeight||0)-60)/2}))}>
            <AsteriaIcon name="zoomOut" size={19}/>
          </button>
          <output ref={zoomReadout} aria-label="Canvas zoom"
            className={styles.zoomValue}>{Math.round(camera.scale*100)}%</output>
        </>:null}
      </div>
      {wide&&layout.minimapVisible?<div className={styles.canvasMinimap}
        aria-label="Canvas overview minimap">
        <div className={styles.minimapTitle}>Canvas overview</div>
        <svg viewBox="0 0 200 120" role="img" aria-label="Visible window positions">
          {minimapRects.map(item=><rect key={item.id}
            x={((item.rect.x-miniBounds.minX)/miniWidth)*196+2}
            y={((item.rect.y-miniBounds.minY)/miniHeight)*116+2}
            width={Math.max(2,item.rect.w/miniWidth*196)}
            height={Math.max(2,item.rect.h/miniHeight*116)}
            rx="2" fill={frontWindow===item.id?'#b5dff1':'#54748a'}
            stroke="#b9d3e3" strokeWidth=".6"/>)}
        </svg>
        <button type="button" onClick={fitAll}>Fit all windows</button>
      </div>:null}
      {wide&&layout.windowSwitcher?<nav className={styles.navigationSwitcher}
        aria-label="Canvas window switcher">
        <input type="search" aria-label="Search canvas windows"
          placeholder="Find a window" value={windowSearch}
          onChange={event=>setWindowSearch(event.target.value)}/>
        <div>{visible.filter(panel=>(panelLabels[panel.props.id]||panel.props.id)
          .toLowerCase().includes(windowSearch.trim().toLowerCase()))
          .map(panel=><button type="button" key={panel.props.id}
            onClick={()=>{setFrontWindow(panel.props.id);focusWindow(panel.props.id);}}>
            {panelLabels[panel.props.id]||panel.props.id}
          </button>)}</div>
      </nav>:null}
      {gmCanvas?<div className={styles.manageActions} role="toolbar"
        aria-label={canvasRole+' dashboard window management'}>
        <button type="button" className={styles.iconButton}
          data-testid={playerCanvas?'player-canvas-add-window':'gm-canvas-add-window'}
          title={'Add or remove '+canvasRole+' dashboard windows'}
          aria-label={'Add or remove '+canvasRole+' dashboard windows'}
          disabled={!canEditCanvas}
          aria-expanded={sidebarExpanded}
          onClick={()=>{setSelectedTools(toolCategories[0]?.id||'overview');setSidebarExpanded(true);}}>
          <AsteriaIcon name="plus" size={20}/>
        </button>
      </div>:null}
      {sidebarExpanded?<button type="button" className={styles.drawerBackdrop}
        aria-label={gmCanvas?'Dismiss Dashboard Windows':'Dismiss Combat Tools'}
        onClick={()=>setSidebarExpanded(false)}/>:null}
      <aside id="asteria-combat-tool-list" hidden={!sidebarExpanded}
        className={styles.toolSidebar} aria-label={playerCanvas?'Player Dashboard Window Library':
          gmCanvas?'GM Dashboard Window Library':'Combat Command Centre tools'}>
        <header className={styles.drawerHeader}>
          <div><h4>{playerCanvas?'Player Dashboard Windows':
            gmCanvas?'GM Dashboard Windows':'Combat Tools'}</h4>
            <span>{visible.length} of {panels.length} windows visible</span></div>
          <button type="button" className={styles.iconButton}
            aria-label={gmCanvas?'Close Dashboard Windows menu':'Close Combat Tools menu'}
            onClick={()=>{setSidebarExpanded(false);toolToggleRef.current?.focus();}}>
            <AsteriaIcon name="close" size={19}/>
          </button>
        </header>
        <div className={styles.toolList}>
          {toolCategories.map(group=><section key={group.id}>
            <button type="button" className={styles.toolGroup}
              aria-expanded={selectedTools===group.id}
              onClick={()=>setSelectedTools(current=>current===group.id?'':group.id)}>
              {group.label}<span aria-hidden="true">{selectedTools===group.id?'−':'+'}</span>
            </button>
            {selectedTools===group.id?<div className={styles.toolItems}>
              {group.panels.map(id=>{
                const active=!hidden.includes(id)||forced.has(id);
                return <button type="button" key={id} className={styles.toolItem}
                  aria-pressed={active&&!suppressed.has(id)}
                  title={suppressed.has(id)?'Hidden by Player Information Settings':undefined}
                  disabled={!canEditCanvas||suppressed.has(id)||forced.has(id)||
                  (active&&visible.length<=1)}
                  onClick={()=>togglePanel(id)}>
                  <span aria-hidden="true">{active?'☑':'☐'}</span>{panelLabels[id]||id}
                </button>;
              })}
            </div>:null}
          </section>)}
          <button type="button" className={styles.showAll}
            disabled={!canEditCanvas||!hidden.length||!storageKey}
            onClick={()=>setPreference(previous=>({...previous,hidden:[]}))}>
            Show all panels ({visible.length}/{panels.length})
          </button>
          <details className={styles.drawerSettings}>
            <summary>Canvas Preferences</summary>
            {wide?<button type="button" className={styles.openingView}
              aria-label="Show readable opening view at 50 percent"
              onClick={openingView}>Opening view (50%)</button>:null}
            <label><input type="checkbox" checked={layout.gridVisible}
               disabled={!canEditCanvas}
              onChange={event=>setPreference(previous=>({...previous,
                gridVisible:event.target.checked}))}/> Show infinite dot grid</label>
            <label>Window zoom display
              <select aria-label="Canvas window zoom display"
                disabled={!canEditCanvas} value={layout.detailMode}
                onChange={event=>setPreference(previous=>({...previous,detailMode:event.target.value}))}>
                <option value="adaptive">Adaptive previews</option>
                <option value="proportional">Proportional at every zoom</option>
              </select>
            </label>
            <fieldset className={styles.appearanceGroup}>
              <legend>Navigation</legend>
              <label><input type="checkbox" checked={layout.windowSwitcher}
                disabled={!canEditCanvas}
                onChange={event=>setPreference(previous=>({...previous,
                  windowSwitcher:event.target.checked}))}/> Window switcher and search</label>
              <label><input type="checkbox" checked={layout.focusMode}
                disabled={!canEditCanvas}
                onChange={event=>setPreference(previous=>({...previous,
                  focusMode:event.target.checked}))}/> Window focus mode</label>
              <label><input type="checkbox" checked={layout.zoomTowardCursor}
                disabled={!canEditCanvas}
                onChange={event=>setPreference(previous=>({...previous,
                  zoomTowardCursor:event.target.checked}))}/> Zoom toward cursor</label>
              <label><input type="checkbox" checked={layout.keyboardShortcuts}
                disabled={!canEditCanvas}
                onChange={event=>setPreference(previous=>({...previous,
                  keyboardShortcuts:event.target.checked}))}/> Keyboard shortcuts</label>
            </fieldset>
            <fieldset className={styles.appearanceGroup}>
              <legend>Advanced</legend>
              <label><input type="checkbox" checked={layout.minimapVisible}
                disabled={!canEditCanvas}
                onChange={event=>setPreference(previous=>({...previous,
                  minimapVisible:event.target.checked}))}/> Show canvas minimap</label>
              <label><input type="checkbox" checked={layout.reduceOffscreenEffects}
                disabled={!canEditCanvas}
                onChange={event=>setPreference(previous=>({...previous,
                  reduceOffscreenEffects:event.target.checked}))}/> Reduce off-screen window effects</label>
              <button type="button" className={styles.openingView}
                disabled={!wide} onClick={fitAll}>Recover off-screen windows (Fit All)</button>
            </fieldset>
            <fieldset className={styles.appearanceGroup}>
              <legend>Appearance</legend>
              <label>Grid spacing
                <select aria-label="Canvas grid spacing"
                  disabled={!canEditCanvas} value={layout.gridSize}
                  onChange={event=>setPreference(previous=>({...previous,
                    gridSize:Number(event.target.value)}))}>
                  <option value={16}>Small (16)</option>
                  <option value={26}>Standard (26)</option>
                  <option value={40}>Large (40)</option>
                </select>
              </label>
              <label>Canvas background
                <select aria-label="Canvas background"
                  disabled={!canEditCanvas} value={layout.canvasBackground}
                  onChange={event=>setPreference(previous=>({...previous,
                    canvasBackground:event.target.value}))}>
                  <option value="midnight">Midnight blue-grey</option>
                  <option value="obsidian">Obsidian Stone</option>
                  <option value="slate">Stone Slate</option>
                </select>
              </label>
              <label><input type="checkbox" checked={layout.smoothAnimations}
                disabled={!canEditCanvas}
                onChange={event=>setPreference(previous=>({...previous,
                  smoothAnimations:event.target.checked}))}/> Smooth canvas animations</label>
              <button type="button" className={styles.openingView}
                disabled={!canEditCanvas}
                onClick={()=>setPreference(previous=>({...previous,
                  gridVisible:true,gridSize:26,canvasBackground:'midnight',
                  smoothAnimations:true,detailMode:'adaptive'}))}>
                Reset appearance only
              </button>
            </fieldset>
            <p className={styles.sidebarHint}>Initial guide: 100 columns by 60 rows.
              The dot grid continues as you pan. At 50% zoom, approximately
              40 dot rows are visible on a typical desktop viewport.</p>
            <fieldset className={styles.appearanceGroup}>
              <legend>Window Management</legend>
              <label><input type="checkbox" checked={layout.alignmentGuides}
                disabled={!canEditCanvas}
                onChange={event=>setPreference(previous=>({...previous,
                  alignmentGuides:event.target.checked}))}/> Show alignment guides</label>
              <label><input type="checkbox" checked={layout.magneticSnap}
                disabled={!canEditCanvas}
                onChange={event=>setPreference(previous=>({...previous,
                  magneticSnap:event.target.checked}))}/> Magnetic window snapping</label>
              <label>Snapping strength
                <select aria-label="Window snapping strength" value={layout.snapStrength}
                  disabled={!canEditCanvas||!layout.magneticSnap}
                  onChange={event=>setPreference(previous=>({...previous,
                    snapStrength:event.target.value}))}>
                  <option value="gentle">Gentle</option>
                  <option value="medium">Medium</option>
                  <option value="strong">Strong</option>
                </select>
              </label>
            </fieldset>
            <label><input type="checkbox" checked={layout.freeform.snap}
               disabled={!canEditCanvas}
              onChange={event=>setPreference(previous=>({...previous,freeform:{
                ...previous.freeform,snap:event.target.checked}}))}/> Snap windows to grid</label>
            <label><input type="checkbox" checked={layout.freeform.allowOverlap}
               disabled={!canEditCanvas}
              onChange={event=>setPreference(previous=>({...previous,freeform:{
                ...previous.freeform,allowOverlap:event.target.checked}}))}/> Allow window overlap</label>
            <p className={styles.sidebarHint}>
              Drag window headers to move, double-click to focus, or drag empty space to pan.
              Middle-drag or Space + drag to pan across windows. Scroll empty canvas
              to zoom, or Ctrl/Command + wheel over window content. The Fit All button
              recovers every window without rearranging it. Content size is adjustable
              per window and changes save automatically.
              Canvas lock does not disable {gmCanvas?'dashboard':'combat'} controls.
            </p>
          </details>
        </div>
      </aside>
      {visible.length===0?<div className={styles.empty} role="status">
        <p>No {gmCanvas?'dashboard':'combat'} windows are showing. Open the window library to restore them.</p>
        <button type="button" onClick={()=>setSidebarExpanded(true)}>Open Window Library</button>
      </div>:null}
      {message?<p className={styles.note} role="status">{message}</p>:null}
    </div>
  </section>;
}

/** Shared window engine. The dedicated combat wrapper remains the same component. */
export const CanvasWorkspace=CombatCommandCentre;
