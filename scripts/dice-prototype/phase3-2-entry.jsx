import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CoreDicePicker} from '../../src/dice/CoreDicePicker.jsx';
import {AsteriaDiceTray} from '../../src/dice/AsteriaDiceTray.jsx';
import {defaultDiceAppearance} from '../../src/dice/diceAppearanceCatalogue.mjs';
import {diceResult} from '../../src/state/diceRollModel.mjs';
import '../../src/styles/advanced-dice.css';
const record=diceResult({pool:[{count:1,sides:20}],modifier:5,label:'Phase 3.2'},
  ()=>20,1730000000000,'phase32-fixture');
window.phase32Metrics={officialCalls:0};
function App(){
  const [appearance,setAppearance]=useState(()=>defaultDiceAppearance('dice-forged-steel'));
  const [active,setActive]=useState(null),[replay,setReplay]=useState(0);
  const [enabled,setEnabled]=useState(true),[narrow,setNarrow]=useState(false);
  return <main style={{padding:10}}>
    <div style={{marginBottom:10,display:'flex',gap:8,flexWrap:'wrap'}}>
      <button id="server-roll" onClick={()=>{window.phase32Metrics.officialCalls++;
        setActive(record);setReplay(n=>n+1);}}>Simulate server-confirmed roll</button>
      <button id="resize" onClick={()=>setNarrow(v=>!v)}>Resize workspace</button>
    </div>
    <div className="asteria-advanced-dice" id="dice-workspace"
      style={{width:narrow?350:'100%',maxWidth:900}}>
      <CoreDicePicker value={appearance} onChange={setAppearance}/>
      <AsteriaDiceTray record={active} enabled={enabled} replayToken={replay}
        appearance={appearance} onToggleEnabled={setEnabled}
        canReplay={Boolean(active)} onReplay={()=>setReplay(n=>n+1)}
        onClear={()=>setActive(null)}/>
    </div>
  </main>;
}
createRoot(document.getElementById('app')).render(<App/>);
