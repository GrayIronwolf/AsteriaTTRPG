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
import {DiceEffectsControls} from './DiceEffectsControls.jsx';
import {DiceOutcomeEffects} from './DiceOutcomeEffects.jsx';
import {DICE_SIDES} from '../state/diceRollModel.mjs';
import {createDiceGesture,sampleDiceGesture,releaseDiceGesture,fitDieInsideTray,
  trayPointerRay,projectTrayPoint} from './diceTrayInteraction.mjs';
import {holdTrayDie,moveHeldDie,releaseHeldDie,startHandRoll,trackDiceRest,
  cancelPendingDiceRoll,handRollGroup} from './diceTrayPhysics.mjs';
import {defaultDicePresentation,deviceDicePresentation,validateDicePresentation,
 diceGraphicsProfile,diceSoundAppearance,PRESENTATION_STORAGE_KEY}
 from './dicePresentationModel.mjs';

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
  experimentalCastleTower=false,experimentalTowerAppearance=null,
  presentationPreferences=null,onPresentationPreferencesChange=null,
  windowMode=false,windowSettings=null,onRollDie=null,onLifecycleStatus=null,
  interactionDisabled=false,handThrow=null
}){
  const containerRef=useRef(null),engineRef=useRef(null);
  const physicalTrayMemoRef=useRef(null);
  const [localPresentation,setLocalPresentation]=useState(()=>{
    try{return deviceDicePresentation(window.localStorage.getItem(PRESENTATION_STORAGE_KEY));}
    catch{return defaultDicePresentation();}
  });
  const [effectsOpen,setEffectsOpen]=useState(false);
  const [systemReducedMotion,setSystemReducedMotion]=useState(()=>Boolean(
    typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  useEffect(()=>{
    const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if(!media)return undefined;
    const handle=()=>setSystemReducedMotion(media.matches);
    media.addEventListener?.('change',handle);
    return ()=>media.removeEventListener?.('change',handle);
  },[]);
  const presentation=validateDicePresentation(presentationPreferences||localPresentation);
  const setPresentation=next=>{
    const checked=validateDicePresentation(next);
    if(onPresentationPreferencesChange)onPresentationPreferencesChange(checked);
    else setLocalPresentation(checked);
  };
  useEffect(()=>{
    try{window.localStorage.setItem(PRESENTATION_STORAGE_KEY,JSON.stringify(presentation));}
    catch{ /* Browsers may forbid storage; session controls remain functional. */ }
  },[presentation]);
  const graphics=diceGraphicsProfile(presentation,{
    systemReducedMotion,viewportWidth:typeof window!=='undefined'?window.innerWidth:1000,
    deviceMemory:typeof navigator!=='undefined'?navigator.deviceMemory:null,
    hardwareConcurrency:typeof navigator!=='undefined'?navigator.hardwareConcurrency:null
  });
  const effectiveEnabled=enabled&&!graphics.reducedMotion;
  const [ready,setReady]=useState(false),[engineStatus,setEngineStatus]=useState('loading');
  const [preview,setPreview]=useState(null);
  const status=!effectiveEnabled?'paused':!ready?engineStatus:
    preview&&preview.record===record&&preview.replayToken===replayToken?preview.status:
      record?'rolling':'loading';
  const lifecycleRef=useRef(onLifecycleStatus);
  useEffect(()=>{lifecycleRef.current=onLifecycleStatus;},[onLifecycleStatus]);
  useEffect(()=>{lifecycleRef.current?.(status,replayToken,record?.id);},
    [status,replayToken,record?.id]);
  const [localTrayAppearance,setLocalTrayAppearance]=useState(()=>defaultDiceTrayAppearance());
  const trayAppearance=controlledTrayAppearance||localTrayAppearance;
  // The optional tower shares this tray's physics world.
  const activeTowerAppearance=experimentalTowerAppearance||
    (experimentalCastleTower?defaultDiceTowerAppearance('tower-castle'):null);
  const towerId=activeTowerAppearance?.designId||'off';
  const towerSignature=activeTowerAppearance?JSON.stringify(activeTowerAppearance):'off';
  const towerActive=Boolean(activeTowerAppearance);
  // Reuse the same validated tray configuration object until its actual
  // values change. Creating a fresh object on every status render previously
  // deferred an identical tray rebuild during an active tower throw.
  const presentationSound=diceSoundAppearance(trayAppearance,presentation,
    towerActive?activeTowerAppearance:null);
  const physicalTraySignature=JSON.stringify(presentationSound);
  if(physicalTrayMemoRef.current?.signature!==physicalTraySignature){
    physicalTrayMemoRef.current={signature:physicalTraySignature,
      value:presentationSound};
  }
  const physicalTrayAppearance=physicalTrayMemoRef.current.value;

  const [trayStudioOpen,setTrayStudioOpen]=useState(false);
  const [cameraAngle,setCameraAngle]=useState(0);
  const [cameraTilt,setCameraTilt]=useState(false);
  const [cameraZoom,setCameraZoom]=useState(1);
  const [cameraPan,setCameraPan]=useState({x:0,z:0});
  const [pointerMode,setPointerMode]=useState(null);
  const pointerFrameRef=useRef(0);
  const touchPointsRef=useRef(new Map());
  const pinchRef=useRef(null);
  const pointerRef=useRef(null);
  const windowPreset=windowSettings?.cameraPreset||'classic';
  const [sceneInteractionNotice,setSceneInteractionNotice]=useState('');
  const renderIdle=()=>{
    const engine=engineRef.current;
    if(engine&&!engine.isAnimating)engine.renderer?.render(engine.scene,engine.camera);
  };
  const renderPointer=()=>{
    if(pointerFrameRef.current)return;
    pointerFrameRef.current=requestAnimationFrame(()=>{
      pointerFrameRef.current=0;
      renderIdle();
    });
  };
  const releaseCapture=id=>{
    const node=containerRef.current;
    try{if(node?.hasPointerCapture?.(id))node.releasePointerCapture(id);}
    catch{/* The browser ended the pointer session. */}
  };
  const clearInteraction=()=>{
    const pointer=pointerRef.current;
    const captures=[...touchPointsRef.current.keys()];
    if(pointer) captures.push(pointer.id);
    pointerRef.current=null;
    touchPointsRef.current.clear();
    pinchRef.current=null;
    releaseHeldDie(pointer?.hold,true);
    if(pointer?.hold)renderIdle();
    setPointerMode(null);
    for(const id of new Set(captures))releaseCapture(id);
  };
  const trayAppearanceRef=useRef(physicalTrayAppearance);
  const trayRef=useRef(null),towerRef=useRef(null);
  const rollingRef=useRef(false);
  const resetRef=useRef(null);
  const resetTable=engine=>{
    if(resetRef.current?.engine===engine)return resetRef.current.promise;
    const reset={engine,promise:engine.reset().finally(()=>{
      if(resetRef.current===reset)resetRef.current=null;
    })};
    resetRef.current=reset;
    return reset.promise;
  };
  const deferredTrayRef=useRef(null);
  useEffect(()=>{trayAppearanceRef.current=physicalTrayAppearance;},[physicalTrayAppearance]);
  const stableId=useId().replace(/[^a-z0-9]/gi,'').toLowerCase();
  const appearanceRef=useRef(appearance);
  const registryRef=useRef(null);
  const watcherRigsRef=useRef(new Map());
  const watcherFrameRef=useRef(0);
  const discardWatcherRigs=keep=>{
    for(const [mesh,{rig}] of watcherRigsRef.current){
      if(keep?.has(mesh))continue;
      rig.dispose();
      watcherRigsRef.current.delete(mesh);
    }
  };
  const watcherPointerRef=useRef(null);
  useEffect(()=>{
    window.addEventListener('blur',clearInteraction);
    return ()=>window.removeEventListener('blur',clearInteraction);
  },[]);
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
    if(!effectiveEnabled){setReady(false);return undefined;}
    if(!webGLAvailable()){setReady(false);setEngineStatus('unsupported');return undefined;}
    let cancelled=false;
    setReady(false);setEngineStatus('loading');
    import('open-dice-dnd').then(({DiceRoller})=>{
      if(cancelled)return;
      try{
        const instance=new DiceRoller({
          container:containerRef.current,
          pixelRatio:graphics.pixelRatio,
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
        setReady(true);
      }catch{
        if(!cancelled){setReady(false);setEngineStatus('unavailable');}
      }
    }).catch(()=>{
      if(!cancelled){setReady(false);setEngineStatus('unavailable');}
    });
    return ()=>{
      cancelled=true;
      clearInteraction();
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current=0;
      if(watcherFrameRef.current)cancelAnimationFrame(watcherFrameRef.current);
      watcherFrameRef.current=0;
      discardWatcherRigs();
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
  },[effectiveEnabled,towerSignature,graphics.pixelRatio]);

  // A subtle cosmetic camera follow on new official rolls; no physics mutation.
  useEffect(()=>{
    if(!windowMode||!windowSettings?.cinematicFollow||!record?.id)return;
    setCameraTilt(true);
    setCameraAngle(angle=>angle+.08);
  },[record?.id,windowMode,windowSettings?.cinematicFollow]);
  // Visual orbit and zoom are camera-only. Die physics and face values do
  // not know these controls exist; wheel and touch do not change rolls.
  useEffect(()=>{
    const engine=engineRef.current;
    if(!ready||!engine?.camera)return;
    const camera=engine.camera;
    const cinematic=windowMode&&windowPreset==='cinematic';
    const overhead=windowMode&&windowPreset==='top-down';
    const radius=overhead?0:cinematic?17:cameraTilt?12:9;
    camera.position.set(cameraPan.x+Math.sin(cameraAngle)*radius,
      overhead?31:cinematic?20:cameraTilt?32:28,
      cameraPan.z+Math.cos(cameraAngle)*radius);
    camera.up.set(0,0,-1);
    camera.lookAt(cameraPan.x,0,cameraPan.z);
    camera.zoom=cameraZoom;camera.updateProjectionMatrix();
    if(!engine.isAnimating)engine.renderer?.render(engine.scene,camera);
  },[ready,cameraAngle,cameraTilt,cameraZoom,cameraPan,windowMode,windowPreset]);
  // Reconfigure the same Open Dice scene and physical boundaries. Changes
  // during active rolls are deferred so physics prediction/replay sees one world.
  useEffect(()=>{
    const engine=engineRef.current;
    if(!ready||!effectiveEnabled||!engine)return;
    const config=validateDiceTrayAppearance(physicalTrayAppearance);
    if(rollingRef.current){
      deferredTrayRef.current=config;return;
    }
    if(!trayRef.current)return;
    const previous=trayRef.current.config;
    if(JSON.stringify(previous)===JSON.stringify(config))return;
    // Sound/volume are audio-only settings and must not rebuild Cannon bodies.
    if(Object.keys(config).every(key=>key==='sound'||key==='soundVolume'||
      config[key]===previous[key])){
      trayRef.current.updateSound(config);
      trayRef.current.config=config;
      return;
    }
    try{
      clearInteraction();
      towerRef.current?.dispose();towerRef.current=null;
      trayRef.current.dispose();
      trayRef.current=attachDiceTray(engine,config);
      if(activeTowerAppearance)towerRef.current=attachDiceTower(engine,trayRef.current.outline,activeTowerAppearance);
      if(containerRef.current)containerRef.current.dataset.trayShape=trayRef.current.outline.shape;
    }catch{
      setReady(false);setEngineStatus('unavailable');
    }
  },[ready,effectiveEnabled,physicalTrayAppearance,towerSignature]);
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
    if(!ready||!effectiveEnabled||!node||typeof ResizeObserver==='undefined')return undefined;
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
    // Watch the actual dashboard stage as well; external panel-size changes
    // can leave Open Dice's inline canvas dimensions from the previous layout.
    if(node.parentElement)observer.observe(node.parentElement);
    return ()=>{
      observer.disconnect();
      if(frame)cancelAnimationFrame(frame);
    };
  },[ready,effectiveEnabled]);

  useEffect(()=>{
    if(!effectiveEnabled||!ready||!engineRef.current)return undefined;
    const engine=engineRef.current;
    clearInteraction();
    const setStatus=status=>setPreview({record,replayToken,status});
    if(!record){
      discardWatcherRigs();
      rollingRef.current=false;
      // Open Dice reset keeps visible dice physically active for a 500 ms fade.
      // Never offer Ready until those bodies have left the Cannon world:
      // a quick second normal-tray roll must not accidentally use live mode.
      let obsolete=false;
      setStatus('loading');
      resetTable(engine).then(()=>{
        if(!obsolete)setStatus('ready');
      }).catch(()=>{
        if(!obsolete)setStatus('unavailable');
      });
      return ()=>{obsolete=true;};
    }
    let prepared;
    try{prepared=prepareAsteriaDicePreview(record);}
    catch{
      discardWatcherRigs();
      setStatus('unavailable');
      resetTable(engine).catch(()=>{});
      return undefined;
    }
    if(prepared.mode==='text'||towerActive&&prepared.meshCount>TOWER_MAX_VISIBLE_DICE){
      discardWatcherRigs();
      setStatus('oversized');
      resetTable(engine).catch(()=>{});
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
    let cancelled=false,completed=false;
    const controller=new AbortController();
    const hand=handThrow&&prepared.dice.length===1&&
      prepared.dice[0].dice===handThrow.die.type&&engine.dice.includes(handThrow.die)?handThrow:null;
    const guidedTower=towerActive&&!hand;
    rollingRef.current=true;
    setStatus('rolling');
    const run=async()=>{
      const reset=resetRef.current;
      if(reset?.engine===engine)await reset.promise;
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
      const oldMeshes=new Set(engine.dice.map(die=>die.mesh));
      const picked=hand?handRollGroup(engine.dice,hand.die):[];
      const retained=new Set(hand?engine.dice.filter(die=>!picked.includes(die)).map(die=>die.mesh):[]);
      discardWatcherRigs(retained);
      const THREE=current.familyId==='dice-watcher'?await import('three'):null;
      if(cancelled)return;
      if(THREE||watcherRigsRef.current.size){
        const measured=watcherVisualQuality({
          reducedMotion:graphics.reducedMotion,
          mobile:graphics.tier!=='high',
          deviceMemory:navigator.deviceMemory||null,
          visibleDice:prepared.meshCount+retained.size
        });
        const q={...measured,eyeLimit:Math.min(measured.eyeLimit,graphics.watcherLimit)};
        const reaction=watcherReactionForRecord(record);
        const tick=()=>{
          if(cancelled)return;
          const meshes=engine.dice.map(die=>die.mesh);
          const fresh=THREE?meshes.filter(mesh=>!oldMeshes.has(mesh)).slice(0,q.eyeLimit):[];
          const existing=meshes.filter(mesh=>retained.has(mesh)&&watcherRigsRef.current.has(mesh));
          // A hand throw keeps each bystander's look. Give the newly rolled
          // dice priority within the device's existing eye-rendering limit.
          discardWatcherRigs(new Set([...fresh,...existing].slice(0,graphics.watcherLimit)));
          const now=performance.now();
          for(const mesh of fresh){
            if(watcherRigsRef.current.has(mesh))continue;
            applyWatcherGelShell(mesh,current,q);
            const rig=createWatcherEyeRig(THREE,current,q);
            mesh.add(rig.group);
            watcherRigsRef.current.set(mesh,{rig,reaction,started:now});
          }
          for(const item of watcherRigsRef.current.values())
            item.rig.update((now-item.started)/1000,{
              rolling:Boolean(engine.isAnimating),pointer:watcherPointerRef.current,
              reducedMotion:graphics.reducedMotion,reaction:item.reaction});
          if(!engine.isAnimating&&watcherRigsRef.current.size)
            engine.renderer?.render(engine.scene,engine.camera);
          watcherFrameRef.current=requestAnimationFrame(tick);
        };
        watcherFrameRef.current=requestAnimationFrame(tick);
      }
      const play=async launch=>{
        const handRoll=launch?startHandRoll(engine,diceToRoll,launch,
          trayRef.current.outline,towerRef.current,controller.signal):null;
        try{
          const rest=trackDiceRest(engine,prepared.meshCount+(handRoll?.retainedCount??0),
            controller.signal);
          const playRecording=async()=>{
            if(handRoll)await handRoll.completion;
            else await engine.roll(diceToRoll);
          };
          // A stalled native batch may stay unresolved. A bounded rest
          // failure can still retry, and a rejected prediction surfaces early.
          const settled=await Promise.race([rest,playRecording().then(()=>rest)]);
          if(!settled||cancelled)return null;
          return handRoll?handRoll.results():engine.getCurrentResults();
        }finally{
          handRoll?.dispose();
        }
      };
      let observed=await play(hand);
      // A tower's genuine replay may occasionally settle on a different
      // physical face than the server-authorised target. Retry the VISUAL
      // throw with the same immutable server result, never another callable
      // roll, and never fake the physical exit or visible face.
      if(guidedTower){
        let retries=0;
        while(!cancelled&&retries<3){
          if(matchesAsteriaDicePreview(prepared,observed)&&
            towerRef.current?.getEvidence()?.exitComplete===true)break;
          retries++;
          await resetTable(engine);
          if(cancelled)return;
          observed=await play(null);
        }
        if(containerRef.current)containerRef.current.dataset.towerVisualRetries=String(retries);
      }
      return observed;
    };
    Promise.resolve(run()).then(observed=>{
      if(cancelled)return;
      completed=true;
      rollingRef.current=false;
      const next=deferredTrayRef.current;
      deferredTrayRef.current=null;
      const towerEvidence=towerRef.current?.getEvidence();
      if(containerRef.current&&guidedTower){
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
      const match=matchesAsteriaDicePreview(prepared,observed);
      if(containerRef.current){
        containerRef.current.dataset.visualFaceMatch=String(match);
        containerRef.current.dataset.visualFaces=JSON.stringify(observed).slice(0,1000);
      }
      if(containerRef.current&&guidedTower){
        containerRef.current.dataset.towerFaceMatch=String(match);
        containerRef.current.dataset.towerObserved=JSON.stringify(observed).slice(0,1000);
      }
      const physical=!guidedTower||towerEvidence?.exitComplete===true;
      setStatus(match&&physical?'settled':'mismatch');
      if(!match||!physical){
        discardWatcherRigs();
        resetTable(engine).catch(()=>{});
      }
    }).catch(error=>{
      if(cancelled)return;
      completed=true;
      controller.abort();
      if(watcherFrameRef.current)cancelAnimationFrame(watcherFrameRef.current);
      watcherFrameRef.current=0;
      discardWatcherRigs();
      rollingRef.current=false;
      if(containerRef.current)containerRef.current.dataset.watcherError=
        String(error?.message||error||'Unknown render failure').slice(0,200);
      setStatus('unavailable');
    });
    return ()=>{
      cancelled=true;
      if(!completed)cancelPendingDiceRoll(engine);
      controller.abort();
      rollingRef.current=false;
      if(watcherFrameRef.current)cancelAnimationFrame(watcherFrameRef.current);
      watcherFrameRef.current=0;

    };
  },[record,ready,effectiveEnabled,replayToken,stableId,towerId,handThrow]);

  const canControl=effectiveEnabled&&ready&&status!=='rolling';
  const canInteract=windowMode&&canControl&&status==='settled'&&
    !interactionDisabled&&!engineRef.current?.isAnimating;
  const pointerRay=event=>{
    const engine=engineRef.current;
    const bounds=engine?.renderer?.domElement.getBoundingClientRect();
    return trayPointerRay(engine?.camera,bounds,event);
  };
  const pickDie=ray=>{
    const dice=engineRef.current?.dice||[];
    const owners=new Map(dice.map(die=>[die.mesh,die]));
    const hit=ray?.intersectObjects([...owners.keys()],true)[0];
    for(let mesh=hit?.object;mesh;mesh=mesh.parent){
      if(owners.has(mesh))return owners.get(mesh);
    }
    return null;
  };
  const capture=id=>{
    try{containerRef.current?.setPointerCapture?.(id);}catch{/* Pointer already released. */}
  };
  const touchDistance=()=>{
    const [a,b]=touchPointsRef.current.values();
    return b?Math.hypot(a.x-b.x,a.y-b.y):null;
  };
  const zoomCamera=transform=>setCameraZoom(value=>Math.max(.65,Math.min(1.9,transform(value))));
  const pointerDown=event=>{
    if(!windowMode||!effectiveEnabled||!ready)return;
    const touch=event.pointerType==='touch';
    const current=pointerRef.current;
    if(current&&(!touch||!current.touch)||!touch&&touchPointsRef.current.size)return;
    if(!touch&&![0,1,2].includes(event.button))return;
    const {pointerId:id,clientX:x,clientY:y,button,timeStamp:time}=event;
    event.preventDefault();
    capture(id);
    if(touch){
      touchPointsRef.current.set(id,{x,y});
      if(touchPointsRef.current.size>1){
        releaseHeldDie(current?.hold,true);
        pointerRef.current=null;
        pinchRef.current={distance:touchDistance()};
        setPointerMode('pinch');
        renderPointer();
        return;
      }
    }
    const ray=(touch||button===0)&&canInteract?pointerRay(event):null;
    const die=pickDie(ray);
    if(die){
      const hold=holdTrayDie(die);
      const planeY=die.body.position.y;
      const point=projectTrayPoint(ray,planeY);
      pointerRef.current={id,touch,hold,planeY,
        offsetX:die.body.position.x-(point?.x??die.body.position.x),
        offsetZ:die.body.position.z-(point?.z??die.body.position.z),
        gesture:createDiceGesture({x,y,time,point})};
      setPointerMode('die');
      setSceneInteractionNotice('');
      renderPointer();
      return;
    }
    pointerRef.current={id,touch,button,x,y};
    setPointerMode('camera');
  };
  const updateHeldPointer=(pointer,event)=>{
    const {clientX:x,clientY:y,timeStamp:time}=event;
    const point=projectTrayPoint(pointerRay(event),pointer.planeY);
    sampleDiceGesture(pointer.gesture,{x,y,time,point});
    if(!point||!pointer.gesture.dragged)return;
    const outline=trayRef.current?.outline;
    const margin=pointer.hold.die.body.boundingRadius+(outline?.thickness??0)/2+.015;
    const placement=fitDieInsideTray({
      x:point.x+pointer.offsetX,z:point.z+pointer.offsetZ
    },outline,margin);
    if(!placement)return;
    const otherBodies=engineRef.current.dice.map(die=>die.body);
    moveHeldDie(pointer.hold,placement,[...otherBodies,...(towerRef.current?.colliders||[])]);
    renderPointer();
  };
  const pointerMove=event=>{
    const {pointerId:id,clientX:x,clientY:y}=event;
    const touches=touchPointsRef.current;
    if(touches.has(id))touches.set(id,{x,y});
    const pinch=pinchRef.current;
    if(pinch){
      if(!touches.has(id))return;
      const distance=touchDistance();
      if(pinch.distance>0&&distance>0){
        const ratio=distance/pinch.distance;
        zoomCamera(value=>value*ratio);
      }
      pinch.distance=distance;
      return;
    }
    const pointer=pointerRef.current;
    if(pointer?.id!==id)return;
    if(pointer.hold){
      if(!pointer.touch&&event.buttons!==1){
        finishPointer(event,true);
        return;
      }
      if(canInteract)updateHeldPointer(pointer,event);
      return;
    }
    const dx=x-pointer.x,dy=y-pointer.y;
    if(pointer.button===1){
      setCameraPan(value=>({x:Math.max(-5,Math.min(5,value.x-dx*.012)),
        z:Math.max(-5,Math.min(5,value.z+dy*.012))}));
    }else{
      setCameraAngle(value=>value-dx*.008);
      setCameraTilt(true);
    }
    pointer.x=x;pointer.y=y;
  };
  const finishPointer=(event,cancelled=false)=>{
    const id=event.pointerId;
    const touches=touchPointsRef.current;
    if(touches.delete(id)&&pinchRef.current){
      pinchRef.current.distance=touchDistance();
      if(!touches.size){pinchRef.current=null;setPointerMode(null);}
      releaseCapture(id);
      return;
    }
    const pointer=pointerRef.current;
    if(pointer?.id!==id)return;
    pointerRef.current=null;
    setPointerMode(null);
    releaseCapture(id);
    if(!pointer.hold)return;
    const canRelease=!cancelled&&canInteract&&(pointer.touch||event.button===0);
    if(canRelease)updateHeldPointer(pointer,event);
    const motion=canRelease?releaseDiceGesture(pointer.gesture,windowSettings?.interactionSpeed):null;
    const {die}=pointer.hold;
    const hand=motion?.kind==='throw'?{
      position:die.body.position.clone(),quaternion:die.body.quaternion.clone(),
      grabbedIsFirst:die.isFirst,die,vx:motion.vx,vz:motion.vz
    }:null;
    releaseHeldDie(pointer.hold,!canRelease);
    renderPointer();
    if(!motion)return;
    const sides=Number(die.type.slice(1));
    if((hand||motion.kind==='tap')&&DICE_SIDES.includes(sides)&&onRollDie){
      onRollDie(sides,hand);
    }else if(pointer.hold.moved){
      setSceneInteractionNotice('Die repositioned.');
    }
  };
  useEffect(()=>{
    if(!interactionDisabled||!pointerRef.current?.hold)return;
    clearInteraction();
  },[interactionDisabled]);
  useEffect(()=>{
    const node=containerRef.current;
    if(!windowMode||!node)return undefined;
    const onWheel=event=>{
      event.preventDefault();
      if(pointerRef.current?.hold||pinchRef.current)return;
      zoomCamera(value=>value+(event.deltaY>0?-.065:.065));
    };
    node.addEventListener('wheel',onWheel,{passive:false});
    return ()=>node.removeEventListener('wheel',onWheel);
  },[windowMode]);
  const adjustCamera=change=>{
    if(!pointerRef.current?.hold&&!pinchRef.current)change();
  };

  const renderFallback=!effectiveEnabled||['unavailable','unsupported','oversized','mismatch'].includes(status);
  const selectedTray=getDiceTrayFamily(trayAppearance.designId);
  return <section className="asteria-advanced-dice-tray" data-tray-size={trayAppearance.size}
    data-roll-state={status} data-tower-mode={towerActive?towerId+'-prototype':'off'}
    data-graphics-tier={graphics.tier} data-reduced-motion={graphics.reducedMotion}
    aria-label="3D dice tray">
    {!windowMode?<header className="asteria-advanced-dice-tray-heading">
      <div className="asteria-advanced-dice-tray-title">
        <span className="asteria-advanced-dice-crystal" aria-hidden="true"/>
        <div><h3>{selectedTray?.name||'Dice Table'}</h3><small>{towerActive?(getDiceTowerFamily(towerId)?.name||'Dice Tower')+' — experimental physical prototype':'Realistic 3D dice tray'}</small></div>
      </div>
      <span className="asteria-advanced-dice-trust">Server-verified results</span>
    </header>:null}
    {!windowMode?<div className="asteria-advanced-dice-toolbar">
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
    </div>:null}
    {!studioManaged&&trayStudioOpen?<DiceTrayStudio value={trayAppearance}
      onChange={changeTrayConfig} rolling={status==='rolling'}/>:null}
    {!windowMode?<button type="button" className="asteria-dice-fx-toggle"
      aria-expanded={effectsOpen} onClick={()=>setEffectsOpen(x=>!x)}>
      {effectsOpen?'Close effects and performance':'Effects & performance'}
    </button>:null}
    {!windowMode&&effectsOpen?<DiceEffectsControls value={presentation} onChange={setPresentation}
      profile={graphics}/>:null}
    {towerActive?<p className="asteria-tower-warning" role="note">
      Experimental 3D tower physics. Visual designs and physical exit paths require
      final stress testing and owner approval before release. The official result is unchanged.
    </p>:null}
    <div className="asteria-advanced-dice-stage">
      <div className="asteria-advanced-dice-scene" ref={containerRef} aria-hidden="true"
        data-interaction-mode={windowMode?'grab-and-camera':'disabled'}
        onPointerDown={pointerDown} onPointerMove={pointerMove}
        data-pointer-mode={pointerMode||'idle'}
        onPointerUp={event=>finishPointer(event)}
        onPointerCancel={event=>finishPointer(event,true)}
        onLostPointerCapture={event=>finishPointer(event,true)}
        onContextMenu={event=>windowMode&&event.preventDefault()}
        style={{cursor:pointerMode?'grabbing':windowMode?'grab':'default',
          touchAction:windowMode?'none':'auto'}}/>
      {status==='settled'?<DiceOutcomeEffects record={record} preferences={presentation}
        profile={graphics} replayToken={replayToken}/>:null}
      <div className="asteria-tray-view-controls" role="group" aria-label="3D tray camera controls">
        <button type="button" aria-label="Rotate tray left" onClick={()=>adjustCamera(()=>{setCameraTilt(true);setCameraAngle(v=>v-.28);})}>↶</button>
        <button type="button" aria-label="Rotate tray right" onClick={()=>adjustCamera(()=>{setCameraTilt(true);setCameraAngle(v=>v+.28);})}>↷</button>
        <button type="button" aria-label="Zoom tray in" onClick={()=>adjustCamera(()=>setCameraZoom(v=>Math.min(1.65,v+.1)))}>+</button>
        <button type="button" aria-label="Zoom tray out" onClick={()=>adjustCamera(()=>setCameraZoom(v=>Math.max(.7,v-.1)))}>−</button>
        <button type="button" aria-label="Reset tray camera" onClick={()=>adjustCamera(()=>{
          setCameraAngle(0);setCameraTilt(false);setCameraZoom(1);
          setCameraPan({x:0,z:0});})}>Top</button>
      </div>
      {!windowMode&&!record&&enabled&&status==='ready'?<div className="asteria-advanced-dice-placeholder"
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
    {windowMode&&sceneInteractionNotice?<span className="asteria-dice-window-interaction-status" role="status">{sceneInteractionNotice}</span>:null}
    {!windowMode?<footer className="asteria-advanced-dice-tray-footer">
      <p className="asteria-advanced-dice-tray-status" role="status">{messages[status]}</p>
      {record?<div className="asteria-advanced-dice-official">
        <span>Official total</span><strong>{record.total}</strong>
      </div>:<small className="asteria-advanced-dice-tray-empty">No dice on the table</small>}
    </footer>:null}
    {record?.results?.some(group=>group.sides===10||group.sides===100)?
      <small className="asteria-advanced-dice-tray-note">
        A zero on d10 means 10; double-zero percentile dice mean 100.
      </small>:null}
  </section>;
}
