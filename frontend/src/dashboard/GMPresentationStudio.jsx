import React,{useMemo,useRef,useState} from 'react';
import {
  STUDIO_PANEL_IDS,STUDIO_PANEL_LABELS,defaultStudioLayout,
  normalizeStudioLayout,studioStorageKey,editStudioLayout,
  lockStudioPanel,toggleStudioPanel,setStudioSnap
} from '../../../src/state/presentationStudioModel.mjs';
import {freeformCanvasHeight,freeformPercent}
  from '../../../src/state/workspaceFreeformModel.mjs';
import styles from './GMPresentationStudio.module.css';

function loadLayout(uid,campaignId){
  if(!uid||!campaignId||typeof window==='undefined')return defaultStudioLayout();
  try{
    const raw=window.localStorage.getItem(studioStorageKey(uid,campaignId));
    return raw?normalizeStudioLayout(JSON.parse(raw)):defaultStudioLayout();
  }catch{return defaultStudioLayout();}
}
const fingerprint=value=>JSON.stringify(value);
const maxHistory=25;

/** Layout remains a per-user, per-campaign browser preference. No scene data is stored. */
export function GMPresentationStudio({uid,campaignId,panels}){
  const [history,setHistory]=useState(()=>({items:[loadLayout(uid,campaignId)],index:0}));
  const [savedFingerprint,setSavedFingerprint]=useState(()=>
    fingerprint(loadLayout(uid,campaignId)));
  const [editing,setEditing]=useState(false);
  const [notice,setNotice]=useState('');
  const [preview,setPreview]=useState(null);
  const canvas=useRef(null),gesture=useRef(null);
  const layout=history.items[history.index];
  const current=useMemo(()=>preview?
    editStudioLayout(layout,preview.id,preview.kind,preview.values):layout,
    [layout,preview]);
  const visible=STUDIO_PANEL_IDS.filter(id=>!current.hidden.includes(id));
  const update=transform=>{
    setHistory(previous=>{
      const old=previous.items[previous.index];
      const next=normalizeStudioLayout(transform(old));
      if(fingerprint(next)===fingerprint(old))return previous;
      const items=[...previous.items.slice(0,previous.index+1),next].slice(-maxHistory);
      return {items,index:items.length-1};
    });
    setNotice('');
  };
  const save=()=>{
    if(!uid||!campaignId){setNotice('Cannot save until a verified GM account is available.');return;}
    try{
      window.localStorage.setItem(studioStorageKey(uid,campaignId),fingerprint(layout));
      setSavedFingerprint(fingerprint(layout));
      setNotice('Layout saved to this browser for this GM account and campaign.');
    }catch{setNotice('Local storage is unavailable. Layout was not saved.');}
  };
  const reset=()=>{
    update(()=>defaultStudioLayout());
    setNotice('Default layout restored in the editor. Select Save Layout to keep it.');
  };
  const undo=()=>{
    setHistory(previous=>({...previous,index:Math.max(0,previous.index-1)}));
    setNotice('');
  };
  const redo=()=>{
    setHistory(previous=>({...previous,index:Math.min(previous.items.length-1,previous.index+1)}));
    setNotice('');
  };
  const start=(event,id,kind)=>{
    if(!editing||event.button!==0||gesture.current||layout.locked.includes(id))return;
    const width=canvas.current?.getBoundingClientRect().width||0;
    if(!width||!layout.positions[id])return;
    gesture.current={id,kind,pointer:event.pointerId,rect:layout.positions[id],
      width,x:event.clientX,y:event.clientY};
    setPreview(null);setNotice('');
    event.preventDefault();event.stopPropagation();
    canvas.current?.setPointerCapture?.(event.pointerId);
  };
  const propose=(g,event)=>{
    const dx=Math.round((event.clientX-g.x)*1000/g.width);
    const dy=Math.round((event.clientY-g.y)*1000/g.width);
    return g.kind==='move'
      ?{x:g.rect.x+dx,y:g.rect.y+dy}
      :{w:g.rect.w+dx,h:g.rect.h+dy};
  };
  const pointerMove=event=>{
    const g=gesture.current;
    if(g&&g.pointer===event.pointerId)
      setPreview({id:g.id,kind:g.kind,values:propose(g,event)});
  };
  const pointerUp=event=>{
    const g=gesture.current;
    if(!g||g.pointer!==event.pointerId)return;
    gesture.current=null;setPreview(null);
    const next=editStudioLayout(layout,g.id,g.kind,propose(g,event));
    if(fingerprint(next)!==fingerprint(layout))update(()=>next);
    else setNotice('Position or size unchanged; another panel, boundary, or lock may block it.');
    try{canvas.current?.releasePointerCapture?.(event.pointerId);}catch{/* released */ }
  };
  const pointerCancel=event=>{
    if(gesture.current?.pointer!==event.pointerId)return;
    gesture.current=null;setPreview(null);
    try{canvas.current?.releasePointerCapture?.(event.pointerId);}catch{/* released */ }
  };
  const keyboard=(event,id,kind)=>{
    if(!editing||!event.altKey||!event.key.startsWith('Arrow'))return;
    const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],
      ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];
    if(!delta)return;
    event.preventDefault();
    const rect=layout.positions[id];
    const op=kind==='resize'?'resize':event.ctrlKey?'resize':'move';
    const values=op==='move'?{x:rect.x+delta[0],y:rect.y+delta[1]}:
      {w:rect.w+delta[0],h:rect.h+delta[1]};
    update(old=>editStudioLayout(old,id,op,values));
  };
  return <section className={styles.studio} data-testid="site-gm-presentation-studio">
    <header className={styles.toolbar}>
      <div><h3>GM Presentation Studio</h3>
        <p>Arrange your private controls. Only Present Scene publishes approved content.</p></div>
      <div className={styles.buttons}>
        <button type="button" aria-pressed={editing} onClick={()=>{
          setEditing(value=>!value);setPreview(null);
        }}>{editing?'Finish Customizing':'Customize Layout'}</button>
        <button type="button" onClick={save}
          disabled={fingerprint(layout)===savedFingerprint}>Save Layout</button>
        <button type="button" disabled={history.index===0} onClick={undo}>Undo</button>
        <button type="button" disabled={history.index>=history.items.length-1}
          onClick={redo}>Redo</button>
        <button type="button" onClick={reset}>Reset Layout</button>
      </div>
    </header>
    {editing?<div className={styles.settings}>
      <label><input type="checkbox" checked={layout.snap}
        onChange={e=>update(old=>setStudioSnap(old,e.target.checked))}/>
        Snap to grid</label>
      {STUDIO_PANEL_IDS.filter(id=>id!=='scene').map(id=>
        <label key={id}><input type="checkbox"
          checked={!layout.hidden.includes(id)}
          onChange={e=>{
            const next=toggleStudioPanel(layout,id,e.target.checked);
            if(fingerprint(next)===fingerprint(layout))
              setNotice('Move overlapping panels before showing this panel.');
            else update(()=>next);
          }}/>{STUDIO_PANEL_LABELS[id]}</label>)}
      <span>Drag a panel title; drag its corner to resize. Alt+arrow keys move;
        Alt+Ctrl+arrows resize. Locked panels cannot move.</span>
    </div>:null}
    <p className={styles.saved} role="status">
      {fingerprint(layout)===savedFingerprint?'Saved browser layout':'Unsaved layout changes'}
      {notice?' · '+notice:''}
    </p>
    <div className={styles.scroller}>
      <div ref={canvas} className={styles.canvas}
        data-testid="site-gm-studio-canvas"
        style={{'--studio-rows':freeformCanvasHeight({positions:current.positions},visible)}}
        onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={pointerCancel} onLostPointerCapture={pointerCancel}>
        {STUDIO_PANEL_IDS.filter(id=>!current.hidden.includes(id)).map(id=>{
          const pos=current.positions[id],locked=layout.locked.includes(id);
          return <section key={id} className={styles.panel} data-studio-panel={id}
            aria-label={STUDIO_PANEL_LABELS[id]}
            style={{left:freeformPercent(pos.x),top:pos.y/10+'cqw',
              width:freeformPercent(pos.w),height:pos.h/10+'cqw'}}>
            <div className={styles.panelHeader}>
              {editing?<button type="button" className={styles.moveHandle}
                aria-label={'Move '+STUDIO_PANEL_LABELS[id]}
                disabled={locked} onPointerDown={event=>start(event,id,'move')}
                onKeyDown={event=>keyboard(event,id,'move')}>
                {STUDIO_PANEL_LABELS[id]}</button>:
                <strong>{STUDIO_PANEL_LABELS[id]}</strong>}
              {editing?<button type="button" aria-pressed={locked}
                aria-label={(locked?'Unlock ':'Lock ')+STUDIO_PANEL_LABELS[id]}
                onClick={()=>update(old=>lockStudioPanel(old,id,!locked))}>
                {locked?'Unlock':'Lock'}</button>:null}
            </div>
            <div className={styles.panelBody}>{panels[id]}</div>
            {editing&&!locked?<button type="button" className={styles.resizeHandle}
              aria-label={'Resize '+STUDIO_PANEL_LABELS[id]}
              onPointerDown={event=>start(event,id,'resize')}
              onKeyDown={event=>keyboard(event,id,'resize')}>Resize</button>:null}
          </section>;
        })}
      </div>
    </div>
    <p className={styles.hint}>Layout preferences stay in this browser. They do not
      change player display permissions, reveal private media, or synchronize across devices.
      Use a desktop-width screen to drag panels; narrow screens stack them.</p>
  </section>;
}
