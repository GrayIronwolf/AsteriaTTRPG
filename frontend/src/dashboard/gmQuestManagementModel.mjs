import {questDetails,mergeQuestAssignment} from '../../../src/state/questWorkflowModel.mjs';
import {normalizeAssignedQuest,normalizeQuestReward} from '../../../src/state/questRewardModel.mjs';

export const GM_QUEST_STATUSES=Object.freeze(['Draft','Active','Completed','Failed','Archived']);
export const GM_QUEST_VISIBILITIES=Object.freeze(['Party','GM Only']);
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=500)=>String(value??'').trim().slice(0,max);
const list=value=>Array.isArray(value)?value:[];

export function blankGMQuest(){
  return {id:'',title:'',objective:'',status:'Draft',visibility:'Party',
    questGiver:'',location:'',questType:'Side Quest',deadline:'',
    offerRequired:false,successOutcome:'',failureConsequences:'',gmNotes:'',
    objectives:[],requiresGMApproval:true,
    reward:{xp:'',currency:{key:'gold',amount:''},items:[],notes:''}};
}
export function editGMQuest(quest){
  const reward=normalizeQuestReward(quest?.reward);
  return {...blankGMQuest(),...quest,...questDetails(quest),gmNotes:String(quest?.gmNotes||''),
    reward:{...reward,xp:reward.xp?String(reward.xp):'',
      currency:{...reward.currency,amount:reward.currency.amount?String(reward.currency.amount):''}}};
}
export function whole(value,{min=0,max=1000000000,optional=false}={}){
  const input=String(value??'').trim();
  if(optional&&!input)return 0;
  if(!/^\d{1,12}$/.test(input))throw Error('Enter a whole number.');
  const result=Number(input);
  if(!Number.isSafeInteger(result)||result<min||result>max)
    throw Error('Enter a whole number between '+min+' and '+max+'.');
  return result;
}
export function addGMQuestObjective(draft,{text:description,target='1',optional=false,id}){
  const objective=text(description,500);
  if(!objective)throw Error('Enter an objective.');
  if(list(draft.objectives).length>=20)throw Error('A quest can have up to 20 objectives.');
  if(!/^[\w-]{1,100}$/.test(String(id||'')))throw Error('Invalid objective identifier.');
  return {...draft,objectives:[...list(draft.objectives),{
    id,text:objective,target:whole(target||'1',{min:1,max:1000000}),optional:optional===true
  }]};
}
export function validateGMQuest(draft,{id,now}={}){
  if(!isObject(draft))throw Error('Invalid quest.');
  const title=text(draft.title,160);
  if(!title)throw Error('Enter a quest title.');
  if(String(draft.title).trim().length>160)throw Error('Quest title is too long.');
  if(!GM_QUEST_STATUSES.includes(draft.status))throw Error('Choose a valid quest status.');
  if(!GM_QUEST_VISIBILITIES.includes(draft.visibility))throw Error('Choose a valid quest visibility.');
  if(!/^[\w-]{1,100}$/.test(String(id||draft.id||'')))throw Error('Invalid quest identifier.');
  if(String(draft.objective||'').length>12000)throw Error('Quest objective is too long.');
  if(String(draft.gmNotes||'').length>5000)throw Error('GM notes are too long.');
  if(list(draft.objectives).length>20)throw Error('Too many quest objectives.');
  for(const row of list(draft.objectives)){
    if(!text(row?.text,500)||String(row?.text||'').length>500)
      throw Error('Each quest objective needs text of at most 500 characters.');
    whole(row?.target,{min:1,max:1000000});
  }
  const rewardInput=isObject(draft.reward)?draft.reward:{};
  const currency=isObject(rewardInput.currency)?rewardInput.currency:{};
  const xp=whole(rewardInput.xp,{max:1000000000,optional:true});
  const amount=whole(currency.amount,{max:1000000000,optional:true});
  if(list(rewardInput.items).length>20)throw Error('A quest reward can contain at most 20 items.');
  const items=list(rewardInput.items).map(item=>{
    if(!isObject(item)||!text(item.name||item.title||item.trueName,160))
      throw Error('Each reward item needs a name.');
    const qty=whole(item.qty??item.quantity??1,{min:1,max:1000000});
    return {...item,qty};
  });
  if(String(rewardInput.notes||'').length>2000)throw Error('Reward notes are too long.');
  const reward=normalizeQuestReward({...rewardInput,xp,
    currency:{...currency,amount},items});
  const details=questDetails(draft);
  return {...draft,...details,id:id||draft.id,title,
    objective:String(draft.objective||''),gmNotes:String(draft.gmNotes||''),
    status:draft.status,visibility:draft.visibility,
    reward,updatedAt:now||new Date().toISOString()};
}
export function updateGMQuestList(quests,draft,{expectedUpdatedAt='',newId,now}={}){
  const existing=list(quests).find(row=>row.id===draft?.id);
  if(draft?.id&&!existing)throw Error('This quest was removed. Reload the list.');
  if(existing&&String(existing.updatedAt||'')!==String(expectedUpdatedAt||''))
    throw Error('This quest changed in another tab. Reopen it before saving.');
  if(!existing&&list(quests).length>=150)throw Error('Campaign quest limit reached.');
  const id=existing?.id||newId;
  const saved=validateGMQuest(draft,{id,now});
  const next=existing?list(quests).map(row=>row.id===id?{...row,...saved}:row):[saved,...list(quests)];
  if(JSON.stringify(next).length>650000)throw Error('Campaign quest data is too large.');
  return {quests:next,saved};
}
export function archiveGMQuestList(quests,id,expectedUpdatedAt='',now=new Date().toISOString()){
  const existing=list(quests).find(row=>row.id===id);
  if(!existing)throw Error('Quest no longer exists.');
  if(String(existing.updatedAt||'')!==String(expectedUpdatedAt||''))
    throw Error('Quest changed in another tab. Reload before archiving.');
  return list(quests).map(row=>row.id===id?{...row,status:'Archived',updatedAt:now}:row);
}
export function assignGMQuest(quest,previous,{assignedBy,assignedAt}={}){
  if(!quest||quest.visibility!=='Party'||['Draft','Archived','Completed','Failed'].includes(quest.status))
    throw Error('Publish an active, party-visible quest before assigning it.');
  const safe=normalizeAssignedQuest(quest,{
    assignedAt:assignedAt||new Date().toISOString(),assignedBy:assignedBy||''});
  // normalizeAssignedQuest is an explicit public definition whitelist.
  // Never copy gmNotes, hidden campaign data, or player identity fields.
  return mergeQuestAssignment(previous,safe);
}
export function gmQuestReviews(party,questId){
  return list(party).flatMap(character=>list(character.quests).filter(row=>
    row.id===questId).map(row=>({characterId:character.id,characterName:character.name,
    ...row})));
}
export function campaignDetailsDraft(campaign,workspace={}){
  const details=isObject(workspace.campaign)?workspace.campaign:{};
  return {name:campaign?.name||'',description:details.synopsis??campaign?.description??'',
    location:details.location??campaign?.location??'',
    playerLimit:String(details.playerLimit??campaign?.playerLimit??campaign?.partySize??6)};
}
export function validateCampaignDetails(draft){
  if(!isObject(draft))throw Error('Invalid campaign settings.');
  const name=text(draft.name,160);
  if(!name)throw Error('Enter a campaign name.');
  if(String(draft.name||'').trim().length>160)throw Error('Campaign name is too long.');
  const description=String(draft.description||'').trim();
  if(description.length>20000)throw Error('Campaign synopsis is too long.');
  const location=String(draft.location||'').trim();
  if(location.length>300)throw Error('Campaign location is too long.');
  return {name,description,location,
    playerLimit:whole(draft.playerLimit,{min:1,max:50})};
}
