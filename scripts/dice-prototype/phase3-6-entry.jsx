import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DiceCustomizationStudio} from '../../src/dice/DiceCustomizationStudio.jsx';
import {AsteriaDiceTray} from '../../src/dice/AsteriaDiceTray.jsx';
import {createDiceStudioState,changeDiceStudio,undoDiceStudio,redoDiceStudio,
  applyDiceStudioLook,matchDiceTrayPalette,restoreDiceStudio} from '../../src/dice/diceStudioModel.mjs';
import {diceResult} from '../../src/state/diceRollModel.mjs';
import '../../src/styles/advanced-dice.css';

const roll=diceResult({pool:[{count:1,sides:20}],modifier:5,label:'Studio fixture'},
  ()=>20,1730000000000,'phase36-fixture');
window.phase36Metrics={officialCalls:0};
function App(){
  const [studio,setStudio]=useState(()=>createDiceStudioState());
  const [record,setRecord]=useState(null),[replay,setReplay]=useState(0);
  const [enabled,setEnabled]=useState(true),[narrow,setNarrow]=useState(false);
  const setDice=next=>setStudio(s=>changeDiceStudio(s,{dice:next}));
  const setTray=next=>setStudio(s=>changeDiceStudio(s,{tray:next}));
  return <main style={{padding:10}}>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
      <button id="server-roll" onClick={()=>{
        window.phase36Metrics.officialCalls++;
        setRecord(roll);setReplay(n=>n+1);
      }}>Simulate server-confirmed roll</button>
      <button id="resize" onClick={()=>setNarrow(n=>!n)}>Resize workspace</button>
    </div>
    <div id="dice-workspace" className="asteria-advanced-dice"
      style={{width:narrow?350:'100%',maxWidth:920}}>
      <DiceCustomizationStudio value={studio.current.dice} onChange={setDice}
        trayValue={studio.current.tray} onTrayChange={setTray}
        canUndo={studio.past.length>0} canRedo={studio.future.length>0}
        onUndo={()=>setStudio(undoDiceStudio)} onRedo={()=>setStudio(redoDiceStudio)}
        onApplyLook={id=>setStudio(s=>applyDiceStudioLook(s,id))}
        onMatch={()=>setStudio(matchDiceTrayPalette)}
        onRestore={target=>setStudio(s=>restoreDiceStudio(s,target))}/>
      <AsteriaDiceTray record={record} appearance={studio.current.dice}
        trayAppearance={studio.current.tray} onTrayAppearanceChange={setTray}
        studioManaged enabled={enabled} onToggleEnabled={setEnabled}
        canReplay={Boolean(record)} replayToken={replay}
        onReplay={()=>setReplay(n=>n+1)} onClear={()=>setRecord(null)}/>
    </div>
  </main>;
}
createRoot(document.getElementById('app')).render(<App/>);
