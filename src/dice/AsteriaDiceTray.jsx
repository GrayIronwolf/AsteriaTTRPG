import React,{useEffect,useId,useRef,useState} from 'react';
import {matchesAsteriaDicePreview,prepareAsteriaDicePreview} from './openDiceAdapter.mjs';
import {prepareCoreDesigns,releaseCoreDesigns} from './coreDiceRegistry.mjs';
import {defaultDiceAppearance,validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {createWatcherEyeRig,applyWatcherGelShell} from './watcherEyeRig.mjs';
import {watcherVisualQuality,watcherReactionForRecord} from './watcherDiceDesign.mjs';

const messages={
  loading:'Preparing the 3D dice table…',
  ready:'Choose Roll digital dice to throw your next confirmed result.',
  rolling:'The 3D dice are rolling. The official result is already recorded.',
  settled:'Dice settled. The result shown is the official Firebase roll.',
  mismatch:'The visual faces disagreed with the saved roll. The display has been cleared; the official result is unchanged.',
  unavailable:'3D rendering could not start. Your recorded result is still available.',
  unsupported:'WebGL dice are unavailable on this device. Recorded results still work.',
  paused:'3D animation is off. Digital dice still roll normally.',
  oversized:'This roll exceeds the 3D display limit. Its full recorded result remains available.'
};

function webGLAvailable(){
  if(typeof document==='undefined')return false;
  try{
    const probe=document.createElement('canvas');
    const context=probe.getContext('webgl2')||probe.getContext('webgl');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  }catch{return false;}
}

/**
 * Visual-only dice table. Asteria's Firebase server and diceRollModel remain
 * authoritative. Keep all engine-specific operations inside this component.
 */
export function AsteriaDiceTray({
  record,enabled=true,onToggleEnabled,onReplay,onClear,canReplay=false,replayToken=0,
  appearance=null
}){
  const containerRef=useRef(null),engineRef=useRef(null);
  const [ready,setReady]=useState(false),[status,setStatus]=useState('loading');
  const [traySize,setTraySize]=useState('standard');
  const stableId=useId().replace(/[^a-z0-9]/gi,'').toLowerCase();
  const appearanceRef=useRef(appearance);
  const registryRef=useRef(null);
  const watcherRigsRef=useRef(new Map());
  const watcherFrameRef=useRef(0);
  const watcherPointerRef=useRef(null);
  useEffect(()=>{appearanceRef.current=appearance;},[appearance]);
  useEffect(()=>{
    const node=containerRef.current;
    if(!node)return undefined;
    const move=event=>{
      const rect=node.getBoundingClientRect();
      watcherPointerRef.current={
        x:(event.clientX-rect.left)/Math.max(1,rect.width)*2-1,
        y:(event.clientY-rect.top)/Math.max(1,rect.height)*2-1
      };
    };
    const leave=()=>{watcherPointerRef.current=null;};
    node.addEventListener('pointermove',move,{passive:true});
    node.addEventListener('pointerleave',leave);
    return ()=>{
      node.removeEventListener('pointermove',move);
      node.removeEventListener('pointerleave',leave);
    };
  },[]);

  useEffect(()=>{
    if(!enabled){setReady(false);setStatus('paused');return undefined;}
    if(!webGLAvailable()){setReady(false);setStatus('unsupported');return undefined;}
    let cancelled=false;
    setReady(false);setStatus('loading');
    import('open-dice-dnd').then(({DiceRoller})=>{
      if(cancelled)return;
      try{
        const instance=new DiceRoller({
          container:containerRef.current,
          pixelRatio:1,
          powerPreference:'default',
          throwSpeed:14,
          throwSpin:17
        });
        if(cancelled){instance.destroy();return;}
        engineRef.current=instance;
        setReady(true);setStatus('ready');
      }catch{
        if(!cancelled){setReady(false);setStatus('unavailable');}
      }
    }).catch(()=>{
      if(!cancelled){setReady(false);setStatus('unavailable');}
    });
    return ()=>{
      cancelled=true;
      if(watcherFrameRef.current)cancelAnimationFrame(watcherFrameRef.current);
      watcherFrameRef.current=0;
      for(const rig of watcherRigsRef.current.values())rig.dispose();
      watcherRigsRef.current.clear();
      const instance=engineRef.current;
      engineRef.current=null;
      if(instance)instance.destroy();
      if(registryRef.current){
        import('open-dice-dnd').then(api=>releaseCoreDesigns(api,registryRef.current))
          .catch(()=>{});
        registryRef.current=null;
      }
    };
  },[enabled]);

  // Dashboard canvas windows resize without resizing the browser window.
  // Open Dice 1.13.0 only listens to window resize; its pinned internal
  // resize method is contained here, never in Asteria gameplay code.
  useEffect(()=>{
    const node=containerRef.current;
    if(!ready||!enabled||!node||typeof ResizeObserver==='undefined')return undefined;
    let frame=0;
    const observer=new ResizeObserver(()=>{
      if(frame)cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        frame=0;
        if(node.clientWidth>0&&node.clientHeight>0)
          engineRef.current?._handleResize?.();
      });
    });
    observer.observe(node);
    return ()=>{
      observer.disconnect();
      if(frame)cancelAnimationFrame(frame);
    };
  },[ready,enabled]);

  useEffect(()=>{
    if(!enabled||!ready||!engineRef.current)return undefined;
    const engine=engineRef.current;
    if(!record){
      setStatus('ready');
      Promise.resolve(engine.reset()).catch(()=>{});
      return undefined;
    }
    let prepared;
    try{prepared=prepareAsteriaDicePreview(record);}
    catch{
      setStatus('unavailable');
      Promise.resolve(engine.reset()).catch(()=>{});
      return undefined;
    }
    if(prepared.mode==='text'){
      setStatus('oversized');
      Promise.resolve(engine.reset()).catch(()=>{});
      return undefined;
    }
    let diceToRoll=prepared.dice;
    try{
      // Register a private, replaceable PBR set per mounted workspace and die
      // type. Only the current display uses it. Server values are unchanged.
      const current=appearanceRef.current?
        validateDiceAppearance(appearanceRef.current):defaultDiceAppearance();
      // The public registration API is lazily imported in the render effect.
      // This avoids putting Open Dice into the main application bundle.
      if(current.familyId==='dice-watcher')throw Error('Watcher Dice are reserved for Phase 3.4.');
    }catch{
      setStatus('unavailable');return undefined;
    }
    let cancelled=false;
    setStatus('rolling');
    const run=async()=>{
      const api=await import('open-dice-dnd');
      if(cancelled)return;
      const current=appearanceRef.current?
        validateDiceAppearance(appearanceRef.current):defaultDiceAppearance();
      const ids=prepareCoreDesigns(api,current,stableId);
      registryRef.current=ids;
      diceToRoll=prepared.dice.map(row=>({...row,set:ids[row.dice]}));
      if(current.familyId==='dice-familiar'){
        const sources=[...new Set(Object.values(ids).map(id=>
          api.getDiceSet(id)?.body?.image?.src).filter(Boolean))];
        await engine.decalRegistry.preload(sources);
        if(!sources.length||!sources.every(src=>engine.decalRegistry.get(src)))
          throw Error('Familiar Dice artwork could not be loaded.');
        if(cancelled)return;
      }
      if(current.familyId==='dice-watcher'){
        const THREE=await import('three');
        if(cancelled)return;
        if(watcherFrameRef.current)cancelAnimationFrame(watcherFrameRef.current);
        for(const rig of watcherRigsRef.current.values())rig.dispose();
        watcherRigsRef.current.clear();
        const q=watcherVisualQuality({
          reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
          mobile:window.matchMedia?.('(max-width: 650px)').matches,
          deviceMemory:navigator.deviceMemory||null,
          visibleDice:prepared.dice.length
        });
        const reaction=watcherReactionForRecord(record);
        const initial=performance.now();
        const tick=()=>{
          if(cancelled)return;
          // The engine spawns each visual mesh after prediction; the eye is
          // parented then, not inserted into the physics world.
          const dice=engine.dice||[];
          for(const die of dice.slice(0,q.eyeLimit)){
            if(!die.mesh||watcherRigsRef.current.has(die.mesh))continue;
            applyWatcherGelShell(die.mesh,current,q);
            const rig=createWatcherEyeRig(THREE,current,q);
            die.mesh.add(rig.group);
            watcherRigsRef.current.set(die.mesh,rig);
          }
          const t=(performance.now()-initial)/1000;
          for(const rig of watcherRigsRef.current.values())
            rig.update(t,{rolling:Boolean(engine.isAnimating),
              pointer:watcherPointerRef.current,
              reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
              reaction});
          // Render idle blinks; while the dice tumble the engine already
          // owns rendering and cannot be replaced without moving physics.
          if(!engine.isAnimating&&watcherRigsRef.current.size)
            engine.renderer?.render(engine.scene,engine.camera);
          watcherFrameRef.current=requestAnimationFrame(tick);
        };
        watcherFrameRef.current=requestAnimationFrame(tick);
      }else{
        if(watcherFrameRef.current)cancelAnimationFrame(watcherFrameRef.current);
        watcherFrameRef.current=0;
        for(const rig of watcherRigsRef.current.values())rig.dispose();
        watcherRigsRef.current.clear();
      }
      await engine.roll(diceToRoll);
    };
    Promise.resolve(run()).then(()=>{
      if(cancelled)return;
      const match=matchesAsteriaDicePreview(prepared,engine.getCurrentResults());
      setStatus(match?'settled':'mismatch');
      if(!match)Promise.resolve(engine.reset()).catch(()=>{});
    }).catch(()=>{if(!cancelled)setStatus('unavailable');});
    return ()=>{
      cancelled=true;
      if(watcherFrameRef.current)cancelAnimationFrame(watcherFrameRef.current);
      watcherFrameRef.current=0;
      for(const rig of watcherRigsRef.current.values())rig.dispose();
      watcherRigsRef.current.clear();
    };
  },[record,ready,enabled,replayToken,stableId]);

  const canControl=enabled&&ready&&status!=='rolling';
  const renderFallback=!enabled||['unavailable','unsupported','oversized','mismatch'].includes(status);
  return <section className="asteria-advanced-dice-tray" data-tray-size={traySize}
    data-roll-state={status} aria-label="3D dice tray">
    <header className="asteria-advanced-dice-tray-heading">
      <div className="asteria-advanced-dice-tray-title">
        <span className="asteria-advanced-dice-crystal" aria-hidden="true"/>
        <div><h3>Dice Table</h3><small>3D roll animation</small></div>
      </div>
      <span className="asteria-advanced-dice-trust">Server-verified results</span>
    </header>
    <div className="asteria-advanced-dice-toolbar">
      <label className="asteria-advanced-dice-motion-control">
        <input type="checkbox" checked={enabled}
          onChange={event=>onToggleEnabled?.(event.target.checked)}/>
        Animate in 3D
      </label>
      <label className="asteria-advanced-dice-size-control">
        Tray size
        <select value={traySize} onChange={event=>setTraySize(event.target.value)}
          aria-label="Dice tray size">
          <option value="compact">Compact</option>
          <option value="standard">Standard</option>
          <option value="expanded">Expanded</option>
        </select>
      </label>
      <div className="asteria-advanced-dice-tray-actions">
        <button type="button" onClick={onReplay}
          disabled={!canControl||!canReplay}
          title="Animate the last saved roll again; this does not roll new dice">
          Replay last roll
        </button>
        <button type="button" onClick={onClear}
          disabled={!canControl||!record}
          title="Remove the visible dice without deleting roll history">
          Clear tray
        </button>
      </div>
    </div>
    <div className="asteria-advanced-dice-stage">
      <div className="asteria-advanced-dice-scene" ref={containerRef} aria-hidden="true"/>
      {!record&&enabled&&status==='ready'?<div className="asteria-advanced-dice-placeholder"
        aria-hidden="true">
        <span className="asteria-advanced-dice-placeholder-mark">D20</span>
        <strong>Ready to roll</strong>
        <small>Choose dice and roll from the builder below</small>
      </div>:null}
      {renderFallback?<div className="asteria-advanced-dice-fallback">
        <strong>{record?'Official result preserved':'Dice animation unavailable'}</strong>
        <span>{messages[status]}</span>
      </div>:null}
      {status==='rolling'?<div className="asteria-advanced-dice-stage-label" aria-hidden="true">Rolling…</div>:null}
    </div>
    <footer className="asteria-advanced-dice-tray-footer">
      <p className="asteria-advanced-dice-tray-status" role="status">{messages[status]}</p>
      {record?<div className="asteria-advanced-dice-official">
        <span>Official total</span><strong>{record.total}</strong>
      </div>:<small className="asteria-advanced-dice-tray-empty">No dice on the table</small>}
    </footer>
    {record?.results?.some(group=>group.sides===10||group.sides===100)?
      <small className="asteria-advanced-dice-tray-note">
        A zero on d10 means 10; double-zero percentile dice mean 100.
      </small>:null}
  </section>;
}
