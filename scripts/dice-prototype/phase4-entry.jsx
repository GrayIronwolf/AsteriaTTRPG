import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdvancedDiceWorkspace} from '../../src/dashboards/AdvancedDiceWorkspace.jsx';
import {diceResult} from '../../src/state/diceRollModel.mjs';
const state={presets:[],history:[]};
const subscribers=new Set();
const emit=()=>{for(const callback of subscribers)callback({...state});};
window.phase4Metrics={serverRollRequests:0,appearanceCalls:0,unwantedNetworkCalls:0};
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
