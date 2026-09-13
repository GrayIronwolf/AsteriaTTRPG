import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TalentsTab} from '../../src/dashboards/ClassTalentTree.jsx';
import {buildTalentCatalog,reconcileTalentEffects,saveTalentRank,talentRank} from '../../src/state/talentModel.mjs';
import {useLearnedTalent} from '../../src/state/talentMechanics.mjs';
import {talentRankCost} from '../../src/state/liveWorkspaceModel.mjs';
import '../../src/styles/asteria-react.css';
const entries=window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX.entries;
const sample=klass=>({id:klass,ownerUid:'preview',name:'Preview Adventurer',classInfo:{classes:[{title:klass}]},level:50,tp:100,mp:[100,100],sp:[100,100],hp:[100,100],bp:[0,20],talents:{}});
function Preview(){
 const [character,setCharacter]=useState(sample('Spellblade')),[editable,setEditable]=useState(true),[mobile,setMobile]=useState(false);
 const catalog=buildTalentCatalog(character,entries);
 const update=operation=>{try{const next=operation(character);setCharacter(reconcileTalentEffects(next,catalog,{grantIncrease:true}));return Promise.resolve({ok:true});}catch(error){return Promise.resolve({ok:false,error:error.message});}};
 window.AsteriaFirebase={purchaseTalentRank:(_c,_id,input)=>update(current=>{const t=catalog.find(t=>t.id===input.id),rank=talentRank(current,t,catalog);if(rank!==input.expectedRank)throw Error('Stale rank');return saveTalentRank({...current,tp:current.tp-talentRankCost(rank+1,t.tier)},t,rank+1,catalog);}),useCharacterTalent:(_c,_id,input,selection)=>update(current=>useLearnedTalent(current,catalog.find(t=>t.id===input.id),selection,{catalog}).character),endCharacterTalentEffect:(_c,_id,id)=>update(current=>({...current,talentEffects:current.talentEffects.map(e=>e.id===id?{...e,ended:true}:e)}))};
 return <main className="react-workspace-shell" style={{maxWidth:1120,margin:'auto',padding:20}}><h1>Talent workflow preview</h1><p>Disposable local character · no campaign data is changed.</p><label>Preview class <select onChange={e=>setCharacter(sample(e.target.value))}><option>Spellblade</option><option>Bloodhunter</option><option>Cleric</option><option>Artificer</option><option>Fighter</option></select></label><button onClick={()=>setEditable(!editable)}>{editable?'Pause session':'Start session'}</button><button onClick={()=>setMobile(!mobile)}>Toggle mobile preview</button><p role="status">MP {character.mp.join(' / ')} · HP {character.hp.join(' / ')} · SP {character.sp.join(' / ')} · BP {character.bp.join(' / ')}</p>{mobile?<iframe title="Mobile talent tree" src="/scripts/fixtures/talent-preview.html" style={{width:390,maxWidth:'100%',height:800,border:'1px solid #62748a'}}/>:<TalentsTab campaignId="preview" character={character} editable={editable}/>}</main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
