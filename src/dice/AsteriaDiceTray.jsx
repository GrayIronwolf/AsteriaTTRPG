import React,{useEffect,useId,useRef,useState} from 'react';
import {matchesAsteriaDicePreview,prepareAsteriaDicePreview} from './openDiceAdapter.mjs';
import {prepareCoreDesigns,releaseCoreDesigns} from './coreDiceRegistry.mjs';
import {defaultDiceAppearance,validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {createWatcherEyeRig,applyWatcherGelShell} from './watcherEyeRig.mjs';
import {watcherVisualQuality,watcherReactionForRecord} from './watcherDiceDesign.mjs';
import {defaultDiceTrayAppearance,validateDiceTrayAppearance,getDiceTrayFamily} from './diceTrayCatalogue.mjs';
import {attachDiceTray} from './diceTrayScene.mjs';
import {attachDiceTower} from './diceTowerScene.mjs';
import {defaultDiceTowerAppearance,getDiceTowerFamily,
 TOWER_MAX_VISIBLE_DICE} from './diceTowerCatalogue.mjs';
import {DiceTrayStudio} from './DiceTrayStudio.jsx';

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
  appearance=null,trayAppearance:controlledTrayAppearance=null,
  onTrayAppearanceChange=null,studioManaged=false,
  experimentalCastleTower=false,experimentalTowerAppearance=null
}){
  const containerRef=useRef(null),engineRef=useRef(null);
  const [ready,setReady]=useState(false),[status,setStatus]=useState('loading');
  const [localTrayAppearance,setLocalTrayAppearance]=useState(()=>defaultDiceTrayAppearance());
  const trayAppearance=controlledTrayAppearance||localTrayAppearance;
  // Explicit test-only tower props. No dashboard or Firebase setting enables them.
  const activeTowerAppearance=experimentalTowerAppearance||
    (experimentalCastleTower?defaultDiceTowerAppearance('tower-castle'):null);
  const towerId=activeTowerAppearance?.designId||'off';
  const towerSignature=activeTowerAppearance?JSON.stringify(activeTowerAppearance):'off';
  const towerActive=Boolean(activeTowerAppearance);
  // Tower impact material is implemented through the existing single
  // physical tray audio adapter; no competing sound engine.
  const physicalTrayAppearance=towerActive?
    {...trayAppearance,sound:activeTowerAppearance.sound}:trayAppearance;

  const [trayStudioOpen,setTrayStudioOpen]=useState(false);
  const [cameraAngle,setCameraAngle]=useState(0);
  const [cameraTilt,setCameraTilt]=useState(false);
  const [cameraZoom,setCameraZoom]=useState(1);
  const trayAppearanceRef=useRef(physicalTrayAppearance);
  const trayRef=useRef(null),towerRef=useRef(null);
  const rollingRef=useRef(false);
  const deferredTrayRef=useRef(null);
  useEffect(()=>{trayAppearanceRef.current=physicalTrayAppearance;},[physicalTrayAppearance]);
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
        const tray=attachDiceTray(instance,trayAppearanceRef.current);
        trayRef.current=tray;
        if(activeTowerAppearance){
          try{towerRef.current=attachDiceTower(instance,tray.outline,activeTowerAppearance);}
          catch(error){
            if(containerRef.current)containerRef.current.dataset.towerError=String(error?.message||error).slice(0,200);
            throw error;
          }
        }
        if(containerRef.current)containerRef.current.dataset.trayShape=tray.outline.shape;
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
      towerRef.current?.dispose();towerRef.current=null;
      trayRef.current?.dispose();
      trayRef.current=null;
      engineRef.current=null;
      if(instance)instance.destroy();
      if(registryRef.current){
        import('open-dice-dnd').then(api=>releaseCoreDesigns(api,registryRef.current))
          .catch(()=>{});
        registryRef.current=null;
      }
    };
  },[enabled,towerSignature]);

  // Visual orbit and zoom are camera-only. Die physics and face values do
  // not know these controls exist; wheel and touch do not change rolls.
  useEffect(()=>{
    const engine=engineRef.current;
    if(!ready||!engine?.camera)return;
    const camera=engine.camera;
    const radius=cameraTilt?12:0;
    camera.position.set(Math.sin(cameraAngle)*radius,
      cameraTilt?32:30,Math.cos(cameraAngle)*radius);
    camera.up.set(0,0,-1);
    camera.lookAt(0,0,0);
    camera.zoom=cameraZoom;camera.updateProjectionMatrix();
    if(!engine.isAnimating)engine.renderer?.render(engine.scene,camera);
  },[ready,cameraAngle,cameraTilt,cameraZoom]);
  // Reconfigure the same Open Dice scene and physical boundaries. Changes
  // during active rolls are deferred so physics prediction/replay sees one world.
  useEffect(()=>{
    const engine=engineRef.current;
    if(!ready||!enabled||!engine)return;
    const config=validateDiceTrayAppearance(physicalTrayAppearance);
    if(rollingRef.current){
      deferredTrayRef.current=config;return;
    }
    if(!trayRef.current||JSON.stringify(trayRef.current.config)===JSON.stringify(config))return;
    try{
      towerRef.current?.dispose();towerRef.current=null;
      trayRef.current.dispose();
      trayRef.current=attachDiceTray(engine,config);
      if(activeTowerAppearance)towerRef.current=attachDiceTower(engine,trayRef.current.outline,activeTowerAppearance);
      if(containerRef.current)containerRef.current.dataset.trayShape=trayRef.current.outline.shape;
    }catch{
      setStatus('unavailable');
    }
  },[ready,enabled,physicalTrayAppearance,towerSignature]);
  const changeTrayConfig=config=>{
    const checked=validateDiceTrayAppearance(config);
    if(onTrayAppearanceChange)onTrayAppearanceChange(checked);
    else setLocalTrayAppearance(checked);
  };

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
      rollingRef.current=false;
      if(towerActive){
        // Open Dice reset fades the previous bodies asynchronously. A new
        // tower prediction must not see those as live dice, or the worker's
        // recording may never replay. Keep input controls disabled until
        // the old physics bodies have actually been released.
        let obsolete=false;
        setStatus('loading');
        Promise.resolve(engine.reset()).then(()=>{
          if(!obsolete)setStatus('ready');
        }).catch(()=>{
          if(!obsolete)setStatus('unavailable');
        });
        return ()=>{obsolete=true;};
      }
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
    if(prepared.mode==='text'||towerActive&&prepared.meshCount>TOWER_MAX_VISIBLE_DICE){
      setStatus('oversized');
      Promise.resolve(engine.reset()).catch(()=>{});
      return undefined;
    }
    let diceToRoll=prepared.dice;
    try{
      // Register a private, replaceable PBR set per mounted workspace and die
      // type. Only the current display uses it. Server values are unchanged.
      validateDiceAppearance(appearanceRef.current||defaultDiceAppearance());
      // The public registration API is lazily imported in the render effect.
      // This avoids putting Open Dice into the main application bundle.
      // Phase 3.4 allows Watcher alongside core and Familiar appearances.
    }catch{
      setStatus('unavailable');return undefined;
    }
    let cancelled=false;
    rollingRef.current=true;
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
      rollingRef.current=false;
      const next=deferredTrayRef.current;
      deferredTrayRef.current=null;
      const towerEvidence=towerRef.current?.getEvidence();
      if(containerRef.current&&towerActive){
        containerRef.current.dataset.towerExited=String(towerEvidence?.exited??0);
        containerRef.current.dataset.towerExitComplete=String(towerEvidence?.exitComplete===true);
        containerRef.current.dataset.towerSteps=String(towerEvidence?.steps??0);
        containerRef.current.dataset.towerAttempts=String(towerRef.current?.getAttempts?.()??0);
        containerRef.current.dataset.towerLastEnd=JSON.stringify(
          towerEvidence?.rest?.map(r=>r.ends)||[]).slice(0,500);
        containerRef.current.dataset.towerBaffles=JSON.stringify({
          upper:towerEvidence?.upper||0,middle:towerEvidence?.middle||0,
          lower:towerEvidence?.lower||0
        });
      }
      if(next&&trayRef.current){
        towerRef.current?.dispose();towerRef.current=null;
        trayRef.current.dispose();
        trayRef.current=attachDiceTray(engine,next);
        if(activeTowerAppearance)towerRef.current=attachDiceTower(engine,trayRef.current.outline,activeTowerAppearance);
        if(containerRef.current)containerRef.current.dataset.trayShape=trayRef.current.outline.shape;
      }
      const observed=engine.getCurrentResults();
      const match=matchesAsteriaDicePreview(prepared,observed);
      if(containerRef.current&&towerActive){
        containerRef.current.dataset.towerFaceMatch=String(match);
        containerRef.current.dataset.towerObserved=JSON.stringify(observed).slice(0,1000);
      }
      const physical=!towerActive||towerEvidence?.exitComplete===true;
      setStatus(match&&physical?'settled':'mismatch');
      if(!match||!physical)Promise.resolve(engine.reset()).catch(()=>{});
    }).catch(error=>{
      if(cancelled)return;
      rollingRef.current=false;
      if(containerRef.current)containerRef.current.dataset.watcherError=
        String(error?.message||error||'Unknown render failure').slice(0,200);
      setStatus('unavailable');
    });
    return ()=>{
      cancelled=true;
      rollingRef.current=false;
      if(watcherFrameRef.current)cancelAnimationFrame(watcherFrameRef.current);
      watcherFrameRef.current=0;
      for(const rig of watcherRigsRef.current.values())rig.dispose();
      watcherRigsRef.current.clear();
    };
  },[record,ready,enabled,replayToken,stableId,towerId]);

  const canControl=enabled&&ready&&status!=='rolling';
  const renderFallback=!enabled||['unavailable','unsupported','oversized','mismatch'].includes(status);
  const selectedTray=getDiceTrayFamily(trayAppearance.designId);
  return <section className="asteria-advanced-dice-tray" data-tray-size={trayAppearance.size}
    data-roll-state={status} data-tower-mode={towerActive?towerId+'-prototype':'off'} aria-label="3D dice tray">
    <header className="asteria-advanced-dice-tray-heading">
      <div className="asteria-advanced-dice-tray-title">
        <span className="asteria-advanced-dice-crystal" aria-hidden="true"/>
        <div><h3>{selectedTray?.name||'Dice Table'}</h3><small>{towerActive?(getDiceTowerFamily(towerId)?.name||'Dice Tower')+' — experimental physical prototype':'Realistic 3D dice tray'}</small></div>
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
        <select value={trayAppearance.size} onChange={event=>
          changeTrayConfig({...trayAppearance,size:event.target.value})}
          aria-label="Dice tray size">
          <option value="compact">Compact</option>
          <option value="standard">Standard</option>
          <option value="expanded">Expanded</option>
        </select>
      </label>
      {!studioManaged?<button type="button" className="asteria-tray-edit-toggle" aria-expanded={trayStudioOpen}
        onClick={()=>setTrayStudioOpen(value=>!value)}>
        {trayStudioOpen?'Close tray studio':'Customise tray'}
      </button>:<span className="asteria-tray-studio-managed">Edit tray in the studio above</span>}
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
    {!studioManaged&&trayStudioOpen?<DiceTrayStudio value={trayAppearance}
      onChange={changeTrayConfig} rolling={status==='rolling'}/>:null}
    {towerActive?<p className="asteria-tower-warning" role="note">
      Experimental 3D tower physics. Visual designs and physical exit paths require
      final stress testing and owner approval before release. The official result is unchanged.
    </p>:null}
    <div className="asteria-advanced-dice-stage">
      <div className="asteria-advanced-dice-scene" ref={containerRef} aria-hidden="true"/>
      <div className="asteria-tray-view-controls" role="group" aria-label="3D tray camera controls">
        <button type="button" aria-label="Rotate tray left" onClick={()=>{setCameraTilt(true);setCameraAngle(v=>v-.28);}}>↶</button>
        <button type="button" aria-label="Rotate tray right" onClick={()=>{setCameraTilt(true);setCameraAngle(v=>v+.28);}}>↷</button>
        <button type="button" aria-label="Zoom tray in" onClick={()=>setCameraZoom(v=>Math.min(1.65,v+.1))}>+</button>
        <button type="button" aria-label="Zoom tray out" onClick={()=>setCameraZoom(v=>Math.max(.7,v-.1))}>−</button>
        <button type="button" aria-label="Reset tray camera" onClick={()=>{
          setCameraAngle(0);setCameraTilt(false);setCameraZoom(1);}}>Top</button>
      </div>
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
