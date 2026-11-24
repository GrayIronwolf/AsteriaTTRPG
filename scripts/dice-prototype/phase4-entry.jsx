import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdvancedDiceWorkspace} from '../../src/dashboards/AdvancedDiceWorkspace.jsx';
import {diceResult} from '../../src/state/diceRollModel.mjs';
const state={presets:[],history:[]};
const subscribers=new Set();
const emit=()=>{for(const callback of subscribers)callback({...state});};
window.phase4Metrics={serverRollRequests:0,appearanceCalls:0,unwantedNetworkCalls:0};
if(new URLSearchParams(location.search).has('physical')){
 const {DiceRoller}=await import('open-dice-dnd');
 const probe=window.phase52={engine:null,recordings:[],completions:[],requests:[],input:[],delay:350};
 for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture']){
  document.addEventListener(type,event=>{
   probe.input.push([event.type,event.pointerId,event.clientX,event.clientY,event.timeStamp,
    event.target.closest?.('.asteria-advanced-dice-scene')?.dataset.pointerMode]);
   if(probe.input.length>30)probe.input.shift();
  },true);
 }
 const init=DiceRoller.prototype._initScene;
 const replay=DiceRoller.prototype._startReplay;
 DiceRoller.prototype._initScene=function(){
  init.call(this);
  // Keep the screen projection and Cannon steps, with a smaller draw buffer for software Chromium.
  this.renderer.shadowMap.enabled=false;
  this._applyPixelRatio=()=>{
   this.renderer.setPixelRatio(.5);
   this.renderer.setSize(this.width,this.height);
  };
  this._applyPixelRatio();
  probe.engine=this;
  this.onRollComplete=()=>probe.completions.push({
   resultVisible:Boolean(document.querySelector('[data-result-visible="true"]')),
   playing:Boolean(this._replay)
  });
 };
 DiceRoller.prototype._startReplay=function(recording,dice){
  probe.recordings.push({
   ids:dice.map(die=>die.body.id),
   first:dice.map((_,i)=>Array.from(recording.states.slice(i*14,i*14+14))),
   last:dice.map((_,i)=>Array.from(recording.states.slice(
    (recording.steps-1)*recording.bodies*14+i*14,
    (recording.steps-1)*recording.bodies*14+(i+1)*14))),
   impacts:recording.events.length/3
  });
  return replay.call(this,recording,dice);
 };
}
window.AsteriaFirebase={
 isReady:()=>true,
 getUser:()=>({uid:'asteriaPhase4Test'}),
 subscribeDiceWorkspace(onChange){
  subscribers.add(onChange);onChange({...state});
  return ()=>subscribers.delete(onChange);
 },
 subscribeDiceAppearanceLibrary(onChange){
  onChange({});return ()=>{};
 },
 subscribeOwnedDiceCharacters(onChange){
  onChange([{id:'character-12345',name:'Asteria test character'}]);return ()=>{};
 },
 async advancedDiceAction(request){
  if(request.action==='roll'){
   window.phase4Metrics.serverRollRequests++;
   if(window.phase52){
    window.phase52.requests.push(request.pool);
    await new Promise(resolve=>setTimeout(resolve,window.phase52.delay));
   }
   const row=diceResult({
    pool:request.pool,modifier:request.modifier,label:request.label
   },sides=>sides===20?17:Math.min(3,sides),
    Date.now(),request.requestId);
   state.history=[row,...state.history].slice(0,80);
   emit();return {ok:true,roll:row};
  }
  if(request.action==='save-preset'){
   const item=request.preset,index=state.presets.findIndex(row=>row.id===item.id);
   if(index<0)state.presets=[item,...state.presets];
   else state.presets=state.presets.map(row=>row.id===item.id?item:row);
   emit();return {ok:true};
  }
  if(request.action==='delete-preset'){
   state.presets=state.presets.filter(row=>row.id!==request.presetId);
   emit();return {ok:true};
  }
  if(request.action==='clear-history'){
   state.history=[];emit();return {ok:true};
  }
  if(request.action.startsWith('appearance-')){
   window.phase4Metrics.appearanceCalls++;
   return {ok:false,error:'Appearance persistence requires test Firebase backend.'};
  }
  throw Error('Unsupported action');
 }
};
createRoot(document.getElementById('app')).render(<main style={{
 width:'min(100%,1100px)',height:'700px',margin:'0 auto'
}}><AdvancedDiceWorkspace role="gm"/></main>);
