import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DiceAppearanceCollections} from '../../src/dice/DiceAppearanceCollections.jsx';
import {emptyDiceAppearanceLibrary,applyDiceAppearanceMutation} from '../../src/dice/diceAppearanceCollections.mjs';
import {createDiceStudioState} from '../../src/dice/diceStudioModel.mjs';
import '../../src/styles/advanced-dice.css';
window.phase37Metrics={officialCalls:0,writes:0};
function App(){
 const [library,setLibrary]=useState(()=>emptyDiceAppearanceLibrary());
 const [studio,setStudio]=useState(()=>createDiceStudioState());
 const [characterId,setCharacterId]=useState('character-12345');
 const run=async request=>{
  try{
   const updated=applyDiceAppearanceMutation(library,{
    ...request,expectedRevision:library.revision
   },1730000000000+library.revision);
   setLibrary(updated);window.phase37Metrics.writes++;
   return true;
  }catch(err){window.phase37Metrics.error=err.message;return false;}
 };
 return <main className="asteria-advanced-dice" style={{maxWidth:900}}>
  <DiceAppearanceCollections library={library} ready
   characters={[{id:'character-12345',name:'Adventurer'}]}
   characterId={characterId} onCharacterChange={setCharacterId}
   current={studio.current} onLoad={c=>setStudio(createDiceStudioState(c.dice,c.tray))}
   onAction={run}/>
  <div id="metrics" data-count={library.collections.length}
   data-default={library.defaultCollectionId||''}
   data-assigned={library.assignments[characterId]||''}/>
 </main>;
}
createRoot(document.getElementById('app')).render(<App/>);
