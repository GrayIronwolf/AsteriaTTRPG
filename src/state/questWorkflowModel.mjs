const text = (value, limit = 500) => String(value ?? '').trim().slice(0, limit);
export const QUEST_STATUSES = ['Active', 'On Hold', 'Awaiting Review', 'Completed', 'Failed'];
export const questIsClosed = quest => ['Completed', 'Failed'].includes(quest.status);
export function questObjectives(quest = {}) {
  const seen = new Set();
  return (Array.isArray(quest.objectives) ? quest.objectives : []).slice(0, 20).map((value, index) => {
    const row = typeof value === 'string' ? {text:value} : value || {};
    let id = /^[\w-]{1,100}$/.test(row.id || '') ? row.id : `objective-${index}`;
    if(seen.has(id)) {
      id = `objective-${index}`;
      while(seen.has(id)) id += '-copy';
    }
    seen.add(id);
    return {id, text:text(row.text || row.label || row.title), target:Number.isSafeInteger(Number(row.target)) && Number(row.target)>0 ? Math.min(1000000,Number(row.target)) : 1, optional:row.optional === true};
  }).filter(row => row.text);
}
export function questDetails(quest = {}) {
  return {questGiver:text(quest.questGiver,160), location:text(quest.location,160), category:text(quest.category || 'Side Quest',80), deadline:text(quest.deadline), successOutcome:text(quest.successOutcome,2000), failureConsequences:text(quest.failureConsequences,2000), objectives:questObjectives(quest), requiresGMApproval:quest.requiresGMApproval === true};
}
export function objectiveProgress(quest, objective) {
  const value = Number(quest.progress?.[objective.id] || 0);
  return Number.isSafeInteger(value) ? Math.max(0, Math.min(objective.target, value)) : 0;
}
export function questProgress(quest) {
  const required = questObjectives(quest).filter(row => !row.optional);
  const completed = required.filter(row => objectiveProgress(quest,row) === row.target).length;
  return {completed, total:required.length, ready:completed === required.length};
}
export function mergeQuestAssignment(previous, next) {
  if(!previous) return {...next, progress:{}, tracked:false};
  // Updating the definition is not a new reward entitlement or a status reset.
  const merged = {...previous, ...next, status:previous.status || 'Active', tracked:previous.tracked === true,
    assignedAt:previous.assignedAt || next.assignedAt, progress:{}, history:previous.history || [],
    submittedAt:previous.submittedAt || null, reviewedAt:previous.reviewedAt || null, reviewedBy:previous.reviewedBy || '', resolutionNote:previous.resolutionNote || '',
    rewardClaimedAt:previous.rewardClaimedAt || null, rewardTransactionId:previous.rewardTransactionId || '', rewardStatus:previous.rewardStatus || ''};
  for(const row of questObjectives(next)) merged.progress[row.id] = objectiveProgress(previous,row);
  if(merged.status === 'Awaiting Review' && !questProgress(merged).ready) merged.status = 'Active';
  return merged;
}
export function changeQuestProgress(quest, patch) {
  if(!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid quest update.');
  const keys=Object.keys(patch);
  if(keys.length===1 && keys[0]==='tracked' && typeof patch.tracked==='boolean') return {...quest,tracked:patch.tracked};
  if(keys.length!==2 || !keys.includes('objectiveId') || !keys.includes('current')) throw new Error('Only objective progress or tracking can be changed.');
  if(questIsClosed(quest) || quest.status==='Awaiting Review') throw new Error('This quest is not open for progress changes.');
  const objective=questObjectives(quest).find(row=>row.id===patch.objectiveId);
  if(!objective || !Number.isSafeInteger(patch.current) || patch.current<0 || patch.current>objective.target) throw new Error('Enter progress within the objective target.');
  return {...quest,progress:{...(quest.progress || {}),[objective.id]:patch.current}};
}
export function changeQuestStatus(quest, status, {gm=false, uid='', note='', at=new Date().toISOString()} = {}) {
  if(!QUEST_STATUSES.includes(status)) throw new Error('Invalid quest status.');
  if(!gm && quest.requiresGMApproval && ['Completed','Failed'].includes(status)) throw new Error('The GM must review this quest.');
  if(status===quest.status) return {...quest};
  if(quest.status==='Completed') throw new Error('Completed quests stay in the history. Duplicate the quest for a new adventure.');
  if(!gm) {
    if(quest.status==='Failed') throw new Error('Ask the GM to reopen this quest.');
    if(status==='Awaiting Review' && !quest.requiresGMApproval) throw new Error('This quest does not require GM review.');
  }
  if(['Completed','Awaiting Review'].includes(status) && !questProgress(quest).ready) throw new Error('Finish the required objectives first.');
  if(gm && status==='Completed' && quest.requiresGMApproval && quest.status!=='Awaiting Review') throw new Error('The player must submit the quest for review first.');
  const next={...quest,status,history:[...(Array.isArray(quest.history)?quest.history:[]),{status,by:uid,at,note:text(note,1000)}].slice(-30)};
  if(status==='Awaiting Review') next.submittedAt=at;
  if(gm) Object.assign(next,{reviewedAt:at,reviewedBy:uid,resolutionNote:text(note,1000)});
  return next;
}
