import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AsteriaDiceTray} from '../../src/dice/AsteriaDiceTray.jsx';
import {defaultDiceAppearance} from '../../src/dice/diceAppearanceCatalogue.mjs';
import {diceResult} from '../../src/state/diceRollModel.mjs';
import '../../src/styles/advanced-dice.css';
window.phase310Metrics={serverRollRequests:0};
function App(){
 const [record,setRecord]=useState(null),[token,setToken]=useState(0),
  [enabled,setEnabled]=useState(true);
 const roll=face=>{
  window.phase310Metrics.serverRollRequests++;
  setRecord(diceResult({pool:[{count:1,sides:20}],modifier:5,label:'Phase 3.10 effects'},
   ()=>face,1730000000000+face,'phase-3-10-'+String(face)));
  setToken(n=>n+1);
 };
 return <main className="asteria-advanced-dice" style={{maxWidth:980,padding:12}}>
  <h2>Phase 3.10 — Effects, Audio and Performance</h2>
  <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
   <button id="critical-success" type="button" onClick={()=>roll(20)}>Confirmed Natural 20</button>
   <button id="critical-failure" type="button" onClick={()=>roll(1)}>Confirmed Natural 1</button>
   <button id="ordinary-roll" type="button" onClick={()=>roll(10)}>Confirmed ordinary roll</button>
  </div>
  <AsteriaDiceTray record={record} enabled={enabled}
   onToggleEnabled={setEnabled}
   appearance={defaultDiceAppearance('dice-forged-steel')}
   replayToken={token} canReplay={Boolean(record)}
   onReplay={()=>setToken(n=>n+1)}
   onClear={()=>setRecord(null)}/>
 </main>;
}
createRoot(document.getElementById('app')).render(<App/>);
