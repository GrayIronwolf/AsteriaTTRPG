import { questDetails } from './questWorkflowModel.mjs';
export const QUEST_CURRENCIES = Object.freeze([
  { key:'copper', label:'Penny (Copper)' },
  { key:'silver', label:'Mark (Silver)' },
  { key:'gold', label:'Crown (Gold)' },
  { key:'platinum_crown', label:'Platinum Crown' },
  { key:'royal_crown', label:'Royal Crown' },
  { key:'royal_platinum', label:'Royal Platinum' }
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function normalizeQuestReward(value = {}) {
  if(typeof value === 'string') {
    return { xp:0, currency:{ key:'gold', amount:0 }, items:[], notes:value.trim() };
  }
  const reward = value && typeof value === 'object' ? value : {};
  const currency = reward.currency && typeof reward.currency === 'object' ? reward.currency : {};
  const key = QUEST_CURRENCIES.some(entry => entry.key === currency.key) ? currency.key : 'gold';
  return {
    xp:Math.max(0, Math.floor(Number(reward.xp || 0))),
    currency:{ key, amount:Math.max(0, Math.floor(Number(currency.amount || 0))) },
    items:(Array.isArray(reward.items) ? reward.items : []).filter(Boolean).map(item => ({ ...clone(item), qty:Math.max(1, Math.floor(Number(item.qty ?? item.quantity ?? 1))) })),
    notes:String(reward.notes || reward.other || '').trim().slice(0, 2000)
  };
}

export function questRewardSummary(value = {}) {
  const reward = normalizeQuestReward(value);
  const rows = [];
  if(reward.xp) rows.push(`${reward.xp.toLocaleString()} XP`);
  if(reward.currency.amount) {
    const label = QUEST_CURRENCIES.find(entry => entry.key === reward.currency.key)?.label || reward.currency.key;
    rows.push(`${reward.currency.amount.toLocaleString()} ${label}`);
  }
  if(reward.items.length) rows.push(reward.items.map(item => `${Number(item.qty || 1)} x ${item.trueName || item.name || item.title || 'Item'}`).join(', '));
  if(reward.notes) rows.push(reward.notes);
  return rows.join(' | ');
}

export function questRewardClaimed(quest = {}) {
  return Boolean(quest.rewardClaimedAt || quest.rewardTransactionId || quest.rewardStatus === 'claimed');
}

export function markQuestRewardClaimed(quest = {}, transactionId, claimedAt = new Date().toISOString()) {
  if(questRewardClaimed(quest)) return { quest:clone(quest), applied:false };
  return {
    quest:{ ...clone(quest), rewardClaimedAt:claimedAt, rewardTransactionId:String(transactionId || ''), rewardStatus:'claimed' },
    applied:true
  };
}

export function normalizeAssignedQuest(quest = {}, assignment = {}) {
  const title = String(quest.title || quest.name || 'Quest').trim().slice(0, 160);
  return {
    ...questDetails(quest),
    id:String(quest.id || quest.slug || assignment.id || ''),
    title,
    name:title,
    objective:String(quest.objective || quest.description || '').slice(0, 12000),
    description:String(quest.description || quest.objective || '').slice(0, 12000),
    reward:normalizeQuestReward(quest.reward),
    status:quest.status === 'Draft' ? 'Active' : String(quest.status || 'Active'),
    assignedAt:assignment.assignedAt || new Date().toISOString(),
    assignedBy:String(assignment.assignedBy || '')
  };
}
