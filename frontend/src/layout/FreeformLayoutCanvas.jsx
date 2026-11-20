import React,{useMemo,useRef,useState} from 'react';
import {
  editFreeformWorkspace,freeformCanvasHeight,freeformPercent
} from '../../../src/state/workspaceFreeformModel.mjs';
import {visibleDashboardPanels} from '../../../src/state/dashboardLayoutModel.mjs';
import styles from './FreeformLayoutCanvas.module.css';

/** Opt-in direct-manipulation editor. Never mounts gameplay widgets while dragging. */
export function FreeformLayoutCanvas({role,layout,selected,onSelect,onChange,disabled=false}){
  const ids=visibleDashboardPanels(layout,role);
  const names=new Map(ids.map(id=>[id,id.replace(/([a-z])([A-Z])/g,'$1 $2')]));
  const canvas=useRef(null),gesture=useRef(null);
  const [preview,setPreview]=useState(null),[message,setMessage]=useState('');
  const state=layout.freeform;
  const draft=useMemo(()=>{
    if(!preview)return state;
    return editFreeformWorkspace(state,preview.id,preview.kind,preview.values,{
      locked:layout.lockedPositions,hidden:layout.hidden
    });
  },[state,preview,layout.lockedPositions,layout.hidden]);
  if(!state?.enabled)return null;
  const begin=(event,id,kind)=>{
    if(disabled||event.button!==0||gesture.current||layout.lockedPositions.includes(id))return;
    const width=canvas.current?.getBoundingClientRect().width||0;
    if(!width)return;
    const rect=state.positions[id];
    gesture.current={id,kind,pointer:event.pointerId,initial:rect,
      startX:event.clientX,startY:event.clientY,width};
    onSelect(id);setPreview(null);setMessage('');
    event.preventDefault();event.stopPropagation();
    canvas.current?.setPointerCapture?.(event.pointerId);
  };
  const proposal=(current,event)=>{
    const dx=Math.round((event.clientX-current.startX)*1000/current.width);
    const dy=Math.round((event.clientY-current.startY)*1000/current.width);
    return current.kind==='move'
      ?{x:current.initial.x+dx,y:current.initial.y+dy}
      :{w:current.initial.w+dx,h:current.initial.h+dy};
  };
  const move=event=>{
    const current=gesture.current;
    if(!current||current.pointer!==event.pointerId)return;
    setPreview({id:current.id,kind:current.kind,values:proposal(current,event)});
  };
  const end=event=>{
    const current=gesture.current;
    if(!current||current.pointer!==event.pointerId)return;
    gesture.current=null;
    const values=proposal(current,event);
    const changed=editFreeformWorkspace(state,current.id,current.kind,values,{
      locked:layout.lockedPositions,hidden:layout.hidden
    });
    if(changed!==state){
      onChange(previous=>({...previous,freeform:editFreeformWorkspace(previous.freeform,
        current.id,current.kind,values,{locked:previous.lockedPositions,hidden:previous.hidden})}));
    }else if(JSON.stringify(values)!==JSON.stringify(current.initial)){
      setMessage('Move or size blocked by workspace bounds, another panel, or a position lock.');
    }
    setPreview(null);
    try{canvas.current?.releasePointerCapture?.(event.pointerId);}catch{/* released */ }
  };
  const cancel=event=>{
    if(gesture.current?.pointer!==event.pointerId)return;
    gesture.current=null;setPreview(null);
    try{canvas.current?.releasePointerCapture?.(event.pointerId);}catch{/* released */ }
  };
  const keyboard=(event,id)=>{
    if(!event.altKey||!event.key.startsWith('Arrow')||disabled)return;
    event.preventDefault();
    const rect=state.positions[id],increment=event.shiftKey?10:10;
    const d={ArrowRight:[increment,0],ArrowLeft:[-increment,0],
      ArrowDown:[0,increment],ArrowUp:[0,-increment]}[event.key];
    if(!rect||!d)return;
    const kind=event.ctrlKey?'resize':'move';
    const values=kind==='move'?{x:rect.x+d[0],y:rect.y+d[1]}:
      {w:rect.w+d[0],h:rect.h+d[1]};
    onChange(previous=>({...previous,freeform:editFreeformWorkspace(previous.freeform,id,
      kind,values,{locked:previous.lockedPositions,hidden:previous.hidden})}));
  };
  return <section className={styles.region} aria-label="Freeform dashboard layout editor">
    <p className={styles.hint}>Drag each panel by its title; use the corner handle to resize.
      Hold Alt and use arrow keys to move; Alt+Ctrl+arrows resize.
      Panels are kept apart unless Allow overlap is enabled.</p>
    <div className={styles.scroller}>
      <div className={styles.canvas} ref={canvas}
        data-testid="site-freeform-layout-canvas"
        style={{'--freeform-height':freeformCanvasHeight(draft,ids)}}
        onPointerMove={move} onPointerUp={end}
        onPointerCancel={cancel} onLostPointerCapture={cancel}>
        {ids.map(id=>{
          const rect=draft.positions[id];if(!rect)return null;
          const locked=layout.lockedPositions.includes(id);
          return <article key={id}
            className={styles.tile+(selected===id?' '+styles.selected:'')}
            data-freeform-panel={id}
            style={{left:freeformPercent(rect.x),top:rect.y/10+'cqw',
              width:freeformPercent(rect.w),height:rect.h/10+'cqw'}}>
            <button type="button" className={styles.move}
              aria-label={'Move '+names.get(id)} aria-pressed={selected===id}
              disabled={disabled||locked}
              onPointerDown={event=>begin(event,id,'move')}
              onKeyDown={event=>keyboard(event,id)}
              onClick={()=>onSelect(id)}>
              <strong>{names.get(id)}</strong>
              <small>{Math.round(rect.w/10)}% × {Math.round(rect.h/10)}% of width</small>
            </button>
            {!locked?<button type="button" className={styles.resize}
              aria-label={'Resize '+names.get(id)}
              disabled={disabled}
              onPointerDown={event=>begin(event,id,'resize')}
              onKeyDown={event=>keyboard(event,id)}>↘</button>:null}
          </article>;
        })}
      </div>
    </div>
    {message?<p role="status">{message}</p>:null}
  </section>;
}
