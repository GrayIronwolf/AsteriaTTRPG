import {
  QUEST_STATUSES,questIsClosed,questObjectives,questProgress,
  objectiveProgress,questType
} from '../../../src/state/questWorkflowModel.mjs';
import {questRewardClaimed,questRewardSummary} from '../../../src/state/questRewardModel.mjs';

const text=(value,max=1000)=>typeof value==='string'?value.slice(0,max):'';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const QUEST_ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

/** Project the existing character quest state without changing server rules.
 * Every identifier corresponds to the ID or index accepted by mutateQuest.
 */
export function playerQuestProjection(character={}){
  const entries=Array.isArray(character.quests)?character.quests:
    Array.isArray(character.questLog)?character.questLog:[];
  return Object.freeze(entries.slice(0,120).map((raw,index)=>{
    const source=typeof raw==='string'?{name:raw}:object(raw)?raw:null;
    if(!source)return null;
    const rawId=String(source.id||source.slug||index);
    if(!QUEST_ID.test(rawId))return null;
    const title=text(source.title||source.name||'Quest',160);
    const status=QUEST_STATUSES.includes(source.status)?source.status:'Active';
    const objectives=questObjectives(source).map(objective=>Object.freeze({
      ...objective,current:objectiveProgress(source,objective)
    }));
    const progress=Object.freeze(Object.fromEntries(objectives.map(row=>[row.id,row.current])));
    const original={...source,status};
    const completion=questProgress(original);
    const history=Object.freeze((Array.isArray(source.history)?source.history:[])
      .slice(-30).filter(object).map(entry=>Object.freeze({
        status:text(entry.status,48),at:text(entry.at,80),
        note:text(entry.note,1000),by:text(entry.by,160)
      })));
    const result={
      id:rawId,name:title,title,description:text(source.description||source.objective,6000),
      questGiver:text(source.questGiver,160),location:text(source.location,160),
      category:text(source.category||questType(source),80),
      type:text(questType(source),80),deadline:text(source.deadline,80),
      successOutcome:text(source.successOutcome,1500),
      failureConsequences:text(source.failureConsequences,1500),
      resolutionNote:text(source.resolutionNote,1000),
      status,tracked:source.tracked===true,
      requiresGMApproval:source.requiresGMApproval===true,
      objectives:Object.freeze(objectives),progress,
      completed:completion.completed,total:completion.total,ready:completion.ready,
      closed:questIsClosed(original),rewardText:questRewardSummary(source.reward),
      rewardClaimed:questRewardClaimed(source),
      assignedAt:text(source.assignedAt,80),
      submittedAt:text(source.submittedAt,80),
      reviewedAt:text(source.reviewedAt,80),history
    };
    return Object.freeze(result);
  }).filter(Boolean));
}

/** Client-side validation mirrors server enums; the server still authorises
 * every transition, objective and single-use reward in a transaction.
 */
export function validatePlayerQuestAction(questId,kind,value){
  if(typeof questId!=='string'||!QUEST_ID.test(questId))
    throw Error('Select a valid assigned quest.');
  if(kind==='status'){
    if(!QUEST_STATUSES.includes(value)||value==='Pending'||value==='Expired')
      throw Error('Choose a permitted quest status.');
    return Object.freeze({questId,status:value});
  }
  if(kind==='progress'){
    if(!object(value))throw Error('Choose a valid quest progress change.');
    if(Object.keys(value).length===1&&typeof value.tracked==='boolean')
      return Object.freeze({questId,patch:{tracked:value.tracked}});
    if(Object.keys(value).length!==2||typeof value.objectiveId!=='string'||
      !/^[\w-]{1,100}$/.test(value.objectiveId)||
      !Number.isSafeInteger(value.current)||value.current<0||value.current>1000000)
      throw Error('Choose valid objective progress.');
    return Object.freeze({questId,patch:{objectiveId:value.objectiveId,current:value.current}});
  }
  throw Error('Unsupported quest action.');
}
