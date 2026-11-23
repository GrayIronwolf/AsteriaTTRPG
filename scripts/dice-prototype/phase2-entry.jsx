import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AsteriaDiceTray} from '../../src/dice/AsteriaDiceTray.jsx';
import {diceResult} from '../../src/state/diceRollModel.mjs';
import '../../src/styles/advanced-dice.css';

window.phase2Metrics={serverActions:0,replays:0};
const rollRecord=diceResult({pool:[{count:1,sides:20}],modifier:5,label:'Test roll'},
  ()=>17,1730000000000,'phase2-fixture');
function App(){
  const [record,setRecord]=useState(null),[latest,setLatest]=useState(null);
  const [enabled,setEnabled]=useState(true),[replay,setReplay]=useState(0);
  const [width,setWidth]=useState(880);
  const replayLast=()=>{
    if(!latest)return;
    setRecord(latest);
    setReplay(n=>n+1);
    window.phase2Metrics.replays++;
  };
  return <main style={{padding:12}}>
    <div id="fixture-controls" style={{display:'flex',gap:10,marginBottom:12}}>
      <button id="fixture-roll" onClick={()=>{
        window.phase2Metrics.serverActions++;
        setRecord(rollRecord);setLatest(rollRecord);setReplay(n=>n+1);
      }}>Set confirmed roll</button>
      <button id="fixture-narrow" onClick={()=>setWidth(370)}>Resize canvas window</button>
      <button id="fixture-wide" onClick={()=>setWidth(880)}>Restore canvas window</button>
    </div>
    <div id="fixture-panel" className="asteria-advanced-dice" style={{maxWidth:width,width:'100%'}}>
      <AsteriaDiceTray record={record} enabled={enabled} replayToken={replay}
        canReplay={Boolean(latest)} onToggleEnabled={setEnabled}
        onReplay={replayLast} onClear={()=>setRecord(null)}/>
    </div>
  </main>;
}
createRoot(document.getElementById('app')).render(<App/>);
