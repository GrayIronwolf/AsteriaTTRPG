import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AsteriaDiceTray} from '../../src/dice/AsteriaDiceTray.jsx';
import {defaultDiceAppearance} from '../../src/dice/diceAppearanceCatalogue.mjs';
import {diceResult} from '../../src/state/diceRollModel.mjs';
import '../../src/styles/advanced-dice.css';
const faces={4:4,6:6,8:8,10:10,12:12,20:20,100:100};
window.phase38Metrics={rollRequests:0};
function App(){
 const [record,setRecord]=useState(null),[token,setToken]=useState(0),
   [enabled,setEnabled]=useState(true),[narrow,setNarrow]=useState(false);
 const roll=sides=>{
  window.phase38Metrics.rollRequests++;
  setRecord(diceResult({pool:[{count:1,sides}],modifier:5,label:'Tower test'},
   ()=>faces[sides],1730000000000,'castle-fixture-'+String(sides).padStart(3,'0')));
  setToken(x=>x+1);
 };
 return <main className="asteria-advanced-dice" style={{width:narrow?350:'100%',maxWidth:880}}>
  <h2>Castle Tower physics feasibility sandbox (not production ready)</h2>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   {[4,6,8,10,12,20,100].map(s=><button type="button" key={s} onClick={()=>roll(s)}
    aria-label={'Test d'+s}>d{s}</button>)}
   <button id="resize" onClick={()=>setNarrow(v=>!v)}>Resize</button>
  </div>
  <AsteriaDiceTray experimentalCastleTower record={record}
   appearance={defaultDiceAppearance('dice-forged-steel')}
   enabled={enabled} onToggleEnabled={setEnabled}
   replayToken={token} canReplay={Boolean(record)}
   onReplay={()=>setToken(x=>x+1)} onClear={()=>setRecord(null)}/>
 </main>;
}
createRoot(document.getElementById('app')).render(<App/>);
