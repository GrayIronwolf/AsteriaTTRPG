import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AsteriaDiceTray} from '../../src/dice/AsteriaDiceTray.jsx';
import {DiceTowerStudio} from '../../src/dice/DiceTowerStudio.jsx';
import {defaultDiceTowerAppearance} from '../../src/dice/diceTowerCatalogue.mjs';
import {defaultDiceTrayAppearance} from '../../src/dice/diceTrayCatalogue.mjs';
import {defaultDiceAppearance} from '../../src/dice/diceAppearanceCatalogue.mjs';
import {diceResult} from '../../src/state/diceRollModel.mjs';
import '../../src/styles/advanced-dice.css';
window.phase39Metrics={officialRollRequests:0,towerEdits:0};
function App(){
 const [tower,setTower]=useState(()=>defaultDiceTowerAppearance('tower-dragon'));
 const [active,setActive]=useState(null),[replay,setReplay]=useState(0),
  [enabled,setEnabled]=useState(true),[compact,setCompact]=useState(false),
  [sides,setSides]=useState(20);
 const update=next=>{setTower(next);setActive(null);window.phase39Metrics.towerEdits++;};
 const roll=()=>{
  window.phase39Metrics.officialRollRequests++;
  const record=diceResult({pool:[{count:1,sides}],modifier:5,label:'Phase 3.9 tower'},
   ()=>sides,1730000000000,'phase39-'+window.phase39Metrics.officialRollRequests);
  setActive(record);setReplay(n=>n+1);
 };
 return <main className="asteria-advanced-dice" style={{maxWidth:920,
  width:compact?350:'100%',padding:12}}>
  <h2>Phase 3.9 — Experimental Physical Dice Towers</h2>
  <DiceTowerStudio value={tower} onChange={update}/>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <label>Test dice<select aria-label="Test dice type" value={sides}
    onChange={e=>setSides(Number(e.target.value))}>
    {[4,6,8,10,12,20,100].map(d=><option key={d} value={d}>d{d}</option>)}
   </select></label>
   <button id="server-roll" type="button" onClick={roll}>Simulate confirmed server roll</button>
   <button id="resize" type="button" onClick={()=>setCompact(x=>!x)}>Resize workspace</button>
  </div>
  <AsteriaDiceTray key={tower.designId+':'+tower.variation}
   experimentalTowerAppearance={tower}
   trayAppearance={defaultDiceTrayAppearance(tower.pairedTray)}
   appearance={defaultDiceAppearance('dice-forged-steel')}
   enabled={enabled} onToggleEnabled={setEnabled}
   replayToken={replay} record={active} canReplay={Boolean(active)}
   onReplay={()=>setReplay(n=>n+1)} onClear={()=>setActive(null)}/>
 </main>;
}
createRoot(document.querySelector('#app')).render(<App/>);
