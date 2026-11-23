import React,{useEffect,useRef,useState} from 'react';
import {matchesAsteriaDicePreview,prepareAsteriaDicePreview} from './openDiceAdapter.mjs';

const messages={
  loading:'Preparing the 3D dice tray…',
  ready:'Your next server-confirmed roll will appear here.',
  rolling:'Rolling the confirmed dice faces…',
  settled:'3D dice settled. The recorded Firebase result is authoritative.',
  mismatch:'The visible dice did not match the recorded result. Showing the official result only.',
  unavailable:'3D rendering is unavailable. Your recorded dice result remains valid.',
  unsupported:'This device cannot display WebGL dice. Use the recorded result instead.',
  paused:'3D dice are turned off. Your digital rolls still work.',
  oversized:'This dice pool is too large for the 3D tray. The complete server roll is shown in the result.'
};

function webGLAvailable(){
  if(typeof document==='undefined')return false;
  try{
    const canvas=document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2')||canvas.getContext('webgl'));
  }catch{return false;}
}

/**
 * Reusable visual-only component. Its engine can be replaced later without
 * changing the dice model, server, presets, check workflow or roll history.
 */
export function AsteriaDiceTray({record,enabled=true}){
  const containerRef=useRef(null),engineRef=useRef(null);
  const [ready,setReady]=useState(false),[status,setStatus]=useState('loading');

  useEffect(()=>{
    if(!enabled){setReady(false);setStatus('paused');return undefined;}
    if(!webGLAvailable()){setReady(false);setStatus('unsupported');return undefined;}
    let cancelled=false;
    setReady(false);
    setStatus('loading');
    import('open-dice-dnd').then(({DiceRoller})=>{
      if(cancelled)return;
      try{
        const instance=new DiceRoller({
          container:containerRef.current,
          pixelRatio:1,
          powerPreference:'default'
        });
        if(cancelled){instance.destroy();return;}
        engineRef.current=instance;
        setReady(true);
        setStatus('ready');
      }catch{
        if(!cancelled){setReady(false);setStatus('unavailable');}
      }
    }).catch(()=>{
      if(!cancelled){setReady(false);setStatus('unavailable');}
    });
    return ()=>{
      cancelled=true;
      const instance=engineRef.current;
      engineRef.current=null;
      if(instance)instance.destroy();
    };
  },[enabled]);

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
    catch{setStatus('unavailable');Promise.resolve(engine.reset()).catch(()=>{});return undefined;}
    if(prepared.mode==='text'){
      setStatus('oversized');
      Promise.resolve(engine.reset()).catch(()=>{});
      return undefined;
    }
    let cancelled=false;
    setStatus('rolling');
    Promise.resolve(engine.roll(prepared.dice)).then(()=>{
      if(cancelled)return;
      const matches=matchesAsteriaDicePreview(prepared,engine.getCurrentResults());
      setStatus(matches?'settled':'mismatch');
      if(!matches)Promise.resolve(engine.reset()).catch(()=>{});
    }).catch(()=>{
      if(!cancelled)setStatus('unavailable');
    });
    return ()=>{cancelled=true;};
  },[record,ready,enabled]);

  return <section className="asteria-advanced-dice-tray" aria-label="3D dice tray">
    <div className="asteria-advanced-dice-tray-heading">
      <h3>3D dice tray</h3><span>Visual replay · official server result</span>
    </div>
    <div className="asteria-advanced-dice-scene" ref={containerRef} aria-hidden="true"/>
    <p className="asteria-advanced-dice-tray-status" role="status">{messages[status]}</p>
    {record?.results?.some(group=>group.sides===10||group.sides===100)?
      <small className="asteria-advanced-dice-tray-note">
        On the physical dice, d10 zero means 10 and percentile double-zero means 100.
      </small>:null}
  </section>;
}
