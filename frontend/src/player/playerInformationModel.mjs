import {notificationHistory} from '../../../src/state/notificationModel.mjs';
import {eventTime} from '../../../src/state/liveEventReducer.mjs';

const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,length=2000)=>typeof value==='string'?value.slice(0,length):'';
const rows=value=>Array.isArray(value)?value:[];
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

/** Public News/Events are copied from the player-readable party-workspace.
 * Do not expose the private GM workspace or any unpublished/draft properties. */
export function publishedInformation(workspace={}){
  const source=record(workspace?.information)?workspace.information:{};
  return Object.freeze(Object.entries(source).slice(0,250).flatMap(([key,item])=>{
    if(!record(item)||item.published!==true||!['news','events'].includes(item.kind))
      return [];
    const id=text(item.id||key,160),title=text(item.title||item.name,160);
    if(!ID.test(id)||!title)return [];
    return [Object.freeze({
      id,kind:item.kind,title,description:text(item.description||item.note,12000),
      scope:text(item.scope,40),location:text(item.location,160),
      source:text(item.source,160),start:text(item.start,200),end:text(item.end,200),
      status:item.kind==='events'?text(item.status,48):'',
      updatedAt:text(item.updatedAt,80)
    })];
  }));
}

/** Only the owner receives activity and read markers. Other character readers
 * (including GMs using the read-only route) receive no private activity. */
export function ownedActivityProjection(character={},owned=false){
  if(!owned)return Object.freeze({activity:Object.freeze([]),read:Object.freeze({})});
  const activity=Object.freeze(rows(character.actionLog).slice(-200).filter(record)
    .filter(entry=>typeof entry.id==='string'&&ID.test(entry.id))
    .map(entry=>Object.freeze({id:entry.id,type:text(entry.type,80),
      message:text(entry.message,2000),at:text(entry.at,80)})));
  const raw=record(character.notificationRead)?character.notificationRead:{};
  const read=Object.freeze(Object.fromEntries(Object.entries(raw).slice(0,600)
    .filter(([id,value])=>/^(event|activity):[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(id)
      &&typeof value==='boolean')));
  return Object.freeze({activity,read});
}

/** This function is shared by live and paged feeds. A user owning multiple
 * campaign characters must never see one character's notices in another tab. */
export function scopedEventProjection(events=[],ownerUid,characterId){
  if(typeof ownerUid!=='string'||typeof characterId!=='string')return Object.freeze([]);
  const seen=new Set();
  return Object.freeze(rows(events).slice(0,500).filter(record).flatMap(entry=>{
    if(entry.targetOwnerUid!==ownerUid||entry.targetCharacterId!==characterId||
      typeof entry.id!=='string'||!ID.test(entry.id)||seen.has(entry.id))return [];
    seen.add(entry.id);
    const payload=record(entry.payload)?entry.payload:{};
    const when=eventTime(entry);
    return [Object.freeze({
      id:entry.id,targetOwnerUid:ownerUid,targetCharacterId:characterId,
      type:text(entry.type,80),createdAt:when>0?new Date(when).toISOString():'',
      acknowledged:entry.acknowledged===true,
      payload:Object.freeze({
        title:text(payload.title,160),message:text(payload.message,2000),
        reason:text(payload.reason,1000),objective:text(payload.objective,1200),
        status:text(payload.status,60),activityId:text(payload.activityId,160),
        amount:Number.isFinite(Number(payload.amount))?Number(payload.amount):undefined,
        item:record(payload.item)?Object.freeze({
          name:text(payload.item.name,160),
          qty:Number.isSafeInteger(Number(payload.item.qty))?Number(payload.item.qty):1
        }):undefined
      })
    })];
  }));
}

/** Reuses the original notification merging and deduplication rules, but
 * projects text only; raw event payloads and unrelated character data stay private. */
export function playerNotificationHistory(character={},events=[],ownerUid=''){
  if(!ownerUid||!character?.id)return Object.freeze([]);
  const visible=scopedEventProjection(events,ownerUid,character.id);
  const result=notificationHistory({
    id:character.id,ownerUid,
    actionLog:rows(character.noticeActivity),
    notificationRead:record(character.notificationRead)?character.notificationRead:{}
  },visible);
  return Object.freeze(result.slice(0,600).filter(row=>
    typeof row.id==='string'&&ID.test(row.id)&&
    ['event','activity'].includes(row.source)).map(row=>Object.freeze({
      id:row.id,source:row.source,kind:text(row.kind,80),
      title:text(row.title,160),message:text(row.message,2000),
      status:text(row.status,80),at:Number.isFinite(row.at)?row.at:0,
      read:row.read===true
    })));
}

export function assertNoticeAction(source,id,read){
  if(!['event','activity'].includes(source)||typeof id!=='string'||
    !ID.test(id)||typeof read!=='boolean')
    throw Error('Choose a valid notification and read state.');
  return Object.freeze({source,id,read});
}
