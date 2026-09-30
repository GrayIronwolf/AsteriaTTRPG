import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TalentsTab} from '../../src/dashboards/ClassTalentTree.jsx';
import {buildTalentCatalog,reconcileTalentEffects,saveTalentRank,talentRank} from '../../src/state/talentModel.mjs';
import {useLearnedTalent} from '../../src/state/talentMechanics.mjs';
import {talentRankCost} from '../../src/state/liveWorkspaceModel.mjs';
import '../../src/styles/asteria-react.css';
const entries=window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX.entries;
const sample=classes=>({id:classes,ownerUid:'preview',name:'Preview Adventurer',classes:classes.split(' / '),level:50,tp:300,mp:[100,100],sp:[100,100],hp:[100,100],bp:[0,20],talents:{}});
function Preview(){
 const [character,setCharacter]=useState(sample('Bloodhunter / Paladin')),[editable,setEditable]=useState(true);
 const catalog=buildTalentCatalog(character,entries);
 const update=operation=>{try{const next=operation(character);setCharacter(reconcileTalentEffects(next,catalog,{grantIncrease:true}));return Promise.resolve({ok:true});}catch(error){return Promise.resolve({ok:false,error:error.message});}};
 window.AsteriaFirebase={purchaseTalentRank:(_c,_id,input)=>update(current=>{const t=catalog.find(t=>t.id===input.id),rank=talentRank(current,t,catalog);if(rank!==input.expectedRank)throw Error('Stale rank');return saveTalentRank({...current,tp:current.tp-talentRankCost(rank+1,t.tier)},t,rank+1,catalog);}),useCharacterTalent:(_c,_id,input,selection)=>update(current=>useLearnedTalent(current,catalog.find(t=>t.id===input.id),selection,{catalog}).character),endCharacterTalentEffect:(_c,_id,id)=>update(current=>({...current,talentEffects:current.talentEffects.map(e=>e.id===id?{...e,ended:true}:e)}))};
 return <main className="react-workspace-shell no-sidebar" style={{maxWidth:1240,margin:'auto',padding:16,boxSizing:'border-box'}}>
  <header><h1>Talent workflow preview</h1><p>Disposable local character · no campaign data is changed.</p>
   <div className="react-action-row"><label>Preview class <select aria-label="Preview class" value={character.id} onChange={e=>setCharacter(sample(e.target.value))}>{['Bloodhunter / Paladin','Artificer / Bloodhunter','Spellblade / Cleric','Spellblade','Bloodhunter','Cleric','Artificer','Fighter'].map(name=><option key={name}>{name}</option>)}</select></label>
    <label>Preview level <select aria-label="Preview level" value={character.level} onChange={e=>setCharacter({...character,level:Number(e.target.value)})}>{[1,10,20,30,40,50].map(level=><option key={level}>{level}</option>)}</select></label>
    <button onClick={()=>setEditable(!editable)}>{editable?'Pause session':'Start session'}</button></div>
  </header>
  <TalentsTab campaignId="preview" character={character} editable={editable}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
