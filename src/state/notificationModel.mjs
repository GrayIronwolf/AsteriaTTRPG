import {eventTime} from './liveEventReducer.mjs';
export function notificationHistory(character={},events=[]) {
  const owned=[...new Map(events.filter(e=>e.targetCharacterId===character.id && e.targetOwnerUid===character.ownerUid).map(e=>[e.id,e])).values()];
  const archived=new Set(owned.map(e=>e.payload?.activityId).filter(Boolean));
  const records=[...owned.map(e=>({id:e.id,source:'event',kind:e.type,title:e.payload?.title || (e.type || 'Notification').replaceAll('-',' '),message:e.payload?.message || e.payload?.reason || e.payload?.objective || (e.payload?.item?`${e.payload.item.name} ×${e.payload.item.qty || 1}`:e.payload?.amount!==undefined?`${e.payload.amount} XP`:''),status:e.payload?.status || '',at:eventTime(e),read:character.notificationRead?.[`event:${e.id}`] ?? character.notificationRead?.[`activity:${e.payload?.activityId}`] ?? Boolean(e.acknowledged)})),
  ...(character.actionLog || []).filter(row=>!archived.has(row.id)).map(row=>({id:row.id,source:'activity',kind:row.type,title:(row.type || 'Activity').replaceAll('-',' '),message:row.message || '',at:Date.parse(row.at) || 0,read:character.notificationRead?.[`activity:${row.id}`]===true}))];
  return records.sort((a,b)=>b.at-a.at);
}
