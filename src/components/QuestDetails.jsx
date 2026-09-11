import React, { useState } from 'react';
import { ManualNumberInput } from './ManualNumberInput.jsx';
import { isManualNumber } from '../state/manualNumber.mjs';
import { objectiveProgress, questObjectives, questProgress } from '../state/questWorkflowModel.mjs';

export function QuestDetails({quest}) {
  return <div className="react-quest-details">
    <dl>{[['Quest giver',quest.questGiver],['Location',quest.location],['Category',quest.category],['In-world deadline',quest.deadline]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {quest.successOutcome?<p><b>On success:</b> {quest.successOutcome}</p>:null}
    {quest.failureConsequences?<p><b>Failure consequences:</b> {quest.failureConsequences}</p>:null}
    {quest.resolutionNote?<p><b>GM response:</b> {quest.resolutionNote}</p>:null}
  </div>;
}
function ObjectiveControl({quest,objective,editable,busy,onProgress}) {
  const current=objectiveProgress(quest,objective);
  const [draft,setDraft]=useState('');
  return <li>
    <span>{objective.text}{objective.optional?<small> (optional)</small>:null}<b>{current} / {objective.target}</b></span>
    {editable && objective.target===1?<input type="checkbox" aria-label={objective.text} disabled={busy} checked={current===1} onChange={event=>onProgress({objectiveId:objective.id,current:event.target.checked?1:0})}/>:null}
    {editable && objective.target>1?<div className="react-objective-update"><ManualNumberInput aria-label={`Progress for ${objective.text}`} min="0" max={objective.target} disabled={busy} value={draft} onChange={event=>setDraft(event.target.value)}/><button disabled={busy||!isManualNumber(draft,{min:0,max:objective.target})} onClick={async()=>{const result=await onProgress({objectiveId:objective.id,current:Number(draft)});if(result?.ok)setDraft('');}}>Save Progress</button></div>:null}
  </li>;
}
export function QuestObjectives({quest,editable=false,busy=false,onProgress}) {
  const objectives=questObjectives(quest);const progress=questProgress(quest);
  return objectives.length?<section className="react-quest-objectives"><h4>Objectives <small>{progress.completed}/{progress.total} required complete</small></h4><ul>{objectives.map(objective=><ObjectiveControl key={`${quest.id}-${objective.id}`} {...{quest,objective,editable,busy,onProgress}}/>)}</ul></section>:null;
}
