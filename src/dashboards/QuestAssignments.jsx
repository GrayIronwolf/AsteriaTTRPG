import React, { useState } from 'react';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { QuestObjectives } from '../components/QuestDetails.jsx';
import { questProgress, questIsClosed } from '../state/questWorkflowModel.mjs';
import { questRewardClaimed, questRewardSummary } from '../state/questRewardModel.mjs';

export function QuestAssignments({campaignId,questId,characters}) {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [notes,setNotes]=useState({});
  const rows=Object.values(characters).flatMap(character=>(Array.isArray(character.quests||character.questLog)?character.quests||character.questLog:[]).filter(quest=>quest.id===questId).map(quest=>({character,quest})));
  const review=async(character,quest,status)=>{
    setBusy(true);
    try {
      const result=await firebaseService.reviewQuest(campaignId,character.id,quest.id,status,notes[character.id]||'');
      setMessage(result?.ok?`${character.name}: ${status}.${result.rewardApplied?' Rewards delivered once.':''}`:result?.error||'The review could not be saved.');
    } catch(error){setMessage(error.message||'The review could not be saved.');} finally{setBusy(false);}
  };
  return <section className="react-quest-assignments"><h4>Player Progress</h4>{rows.length?rows.map(({character,quest})=><article key={character.id}>
    <header><b>{character.name}</b><span>{quest.status||'Active'}{questRewardClaimed(quest)?' · Reward claimed':''}</span></header>
    <QuestObjectives quest={quest}/>
    {quest.status==='Awaiting Review'?<p><b>Review reward:</b> {questRewardSummary(quest.reward)||'No XP, currency or items.'}</p>:null}
    {quest.status!=='Completed'?<><label>Response to {character.name}<input maxLength={1000} value={notes[character.id]||''} onChange={event=>setNotes(value=>({...value,[character.id]:event.target.value}))} placeholder="Feedback or reason for the outcome"/></label><div className="react-action-row">
      {(quest.status==='Awaiting Review'||(!quest.requiresGMApproval&&!questIsClosed(quest)))?<button className="primary" disabled={busy||!questProgress(quest).ready} onClick={()=>review(character,quest,'Completed')}>Approve &amp; Award</button>:null}
      {['Awaiting Review','Failed','On Hold'].includes(quest.status)?<button disabled={busy} onClick={()=>review(character,quest,'Active')}>Return to Active</button>:null}
      {!questIsClosed(quest)?<button className="danger" disabled={busy} onClick={()=>review(character,quest,'Failed')}>Mark Failed</button>:null}
    </div></>:null}
  </article>):<p className="react-help">Not assigned yet.</p>}<p role="status">{message}</p></section>;
}
