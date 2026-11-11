// Phase 4.1: private social notification events. No client Firestore access.
// Only trusted friend relationship transactions may create notices. In particular,
// never persist counterpart handles, Firebase UIDs, pair IDs or block identities
// in notification documents. The recipient UID is used only in the private path.
import {createHash} from 'node:crypto';
import {assertFriendRelationship} from './friendRelationshipModel.mjs';

const UID=/^[A-Za-z0-9_-]{1,128}$/;
const NOTICE_ID=/^[a-f0-9]{64}$/;
const PAGE_SIZE=25;
const KINDS=Object.freeze({
  'incoming-request':{
    title:'New friend request',
    body:'You received a friend request. Open Friends to review it.'
  },
  'request-accepted':{
    title:'Friend request accepted',
    body:'Your friend request was accepted. Open Friends to see your list.'
  },
  'request-declined':{
    title:'Friend request declined',
    body:'A friend request was declined. Open Friends to review requests.'
  },
  'request-cancelled':{
    title:'Friend request cancelled',
    body:'An incoming friend request was cancelled. Open Friends to review requests.'
  },
  'friend-removed':{
    title:'Friendship ended',
    body:'A friendship ended. Open Friends to review your list.'
  },
  'player-blocked':{
    title:'Player blocked',
    body:'You blocked a player. Blocking ends any friendship or pending request.'
  },
  'player-unblocked':{
    title:'Player unblocked',
    body:'You unblocked a player. This does not restore a friendship; the reconnection cooldown still applies.'
  }
});
const validUid=uid=>typeof uid==='string'&&UID.test(uid);
const validDate=value=>{
  const candidate=value?.toDate?.()||value;
  const date=candidate instanceof Date?candidate:new Date(candidate);
  return Number.isFinite(date.getTime())?date:null;
};
const inbox=uid=>'friendNotificationInbox/'+uid+'/items';
function fail(){throw Error('Friend notification unavailable.');}
function notificationId(uid,pairId,version,kind){
  return createHash('sha256')
    .update('asteria-friend-notification-v1\0'+uid+'\0'+pairId+'\0'+version+'\0'+kind)
    .digest('hex');
}
function assertNotice(row,uid,id){
  if(!validUid(uid)||!NOTICE_ID.test(id)||!row||typeof row!=='object'||
     Array.isArray(row)||Object.keys(row).sort().join(',')!==
       'body,createdAt,kind,notificationId,readAt,schemaVersion,title'||
     row.schemaVersion!==1||row.notificationId!==id||
     !Object.hasOwn(KINDS,row.kind)||
     row.title!==KINDS[row.kind].title||row.body!==KINDS[row.kind].body||
     !validDate(row.createdAt)||
     (row.readAt!==null&&!validDate(row.readAt)))fail();
}
function summary(snapshot,uid){
  const row=snapshot.data();
  assertNotice(row,uid,snapshot.id);
  return {
    notificationId:snapshot.id,kind:row.kind,title:row.title,body:row.body,
    createdAt:validDate(row.createdAt).toISOString(),
    readAt:row.readAt===null?null:validDate(row.readAt).toISOString()
  };
}

/**
 * Called after the authenticated actor and target are revalidated inside the
 * SAME transaction that writes the canonical relationship. Firestore create()
 * plus the pair revision and a hash of the recipient keeps retries idempotent.
 * Blocking/unblocking never notifies the other participant or exposes who
 * blocked whom. Removal notices are neutral and sent to both parties.
 */
export function enqueueFriendNotifications(tx,db,actorUid,action,previous,next,{
  now=new Date()
}={}){
  if(!validUid(actorUid)||!tx||typeof tx.create!=='function'||
     typeof db?.doc!=='function'||!validDate(now))fail();
  assertFriendRelationship(next);
  if(previous!==null){
    assertFriendRelationship(previous);
    if(next.pairId!==previous.pairId||next.version<=previous.version)fail();
  }
  if(!next.participantUids.includes(actorUid))fail();
  const recipient=next.participantUids.find(uid=>uid!==actorUid);
  let recipients,kind;
  switch(action){
    case 'send':
      if(next.status!=='pending'||next.requesterUid!==actorUid||
        (previous&&previous.status==='pending'&&
          previous.expiresAtMs>now.getTime()))fail();
      kind='incoming-request';recipients=[next.recipientUid];break;
    case 'accept':
      if(previous?.status!=='pending'||next.status!=='accepted'||
         next.recipientUid!==actorUid)fail();
      kind='request-accepted';recipients=[next.requesterUid];break;
    case 'decline':
      if(previous?.status!=='pending'||next.status!=='declined'||
         next.recipientUid!==actorUid)fail();
      kind='request-declined';recipients=[next.requesterUid];break;
    case 'cancel':
      if(previous?.status!=='pending'||next.status!=='cancelled'||
         next.requesterUid!==actorUid)fail();
      kind='request-cancelled';recipients=[next.recipientUid];break;
    case 'remove':
      if(previous?.status!=='accepted'||next.status!=='removed')fail();
      kind='friend-removed';recipients=[actorUid,recipient];break;
    case 'block':
      if(next.status!=='blocked'||!next.blockedByUids.includes(actorUid)||
         previous?.blockedByUids.includes(actorUid))fail();
      kind='player-blocked';recipients=[actorUid];break;
    case 'unblock':
      if(previous?.status!=='blocked'||!previous.blockedByUids.includes(actorUid)||
         next.blockedByUids.includes(actorUid))fail();
      kind='player-unblocked';recipients=[actorUid];break;
    default:fail();
  }
  const date=validDate(now);
  return recipients.map(uid=>{
    if(!validUid(uid)||!next.participantUids.includes(uid))fail();
    const id=notificationId(uid,next.pairId,next.version,kind);
    tx.create(db.doc(inbox(uid)+'/'+id),{
      schemaVersion:1,notificationId:id,kind,
      title:KINDS[kind].title,body:KINDS[kind].body,
      createdAt:date,readAt:null
    });
    return id;
  });
}

/** A strict, authenticated-only request envelope: no caller-controlled UID. */
export function validateFriendNotificationAction(data){
  if(!data||typeof data!=='object'||Array.isArray(data))fail();
  const keys=Object.keys(data).sort().join(',');
  if(data.action==='list'&&
     (keys==='action'||keys==='action,cursor')&&
     (data.cursor===undefined||data.cursor===null||
      (typeof data.cursor==='string'&&NOTICE_ID.test(data.cursor))))
    return {action:'list',cursor:data.cursor??null};
  if(data.action==='mark-read'&&keys==='action,notificationId'&&
     typeof data.notificationId==='string'&&NOTICE_ID.test(data.notificationId))
    return {action:'mark-read',notificationId:data.notificationId};
  fail();
}

/** UID supplied exclusively by verified Firebase onCall context. */
export async function listFriendNotifications(db,recipientUid,{cursor=null}={}){
  if(!validUid(recipientUid)||
     (cursor!==null&&(typeof cursor!=='string'||!NOTICE_ID.test(cursor)))||
     typeof db?.doc!=='function'||typeof db?.collection!=='function')fail();
  let query=db.collection(inbox(recipientUid))
    .orderBy('createdAt','desc').limit(PAGE_SIZE+1);
  if(cursor!==null){
    const snap=await db.doc(inbox(recipientUid)+'/'+cursor).get();
    if(!snap.exists)fail();
    assertNotice(snap.data(),recipientUid,cursor);
    query=query.startAfter(snap);
  }
  const result=await query.get(),page=result.docs.slice(0,PAGE_SIZE);
  return {
    notifications:page.map(item=>summary(item,recipientUid)),
    unreadShown:page.filter(item=>item.data().readAt===null).length,
    nextCursor:result.docs.length>PAGE_SIZE?page[page.length-1].id:null
  };
}
export async function markFriendNotificationRead(db,recipientUid,notificationId,{
  now=new Date()
}={}){
  if(!validUid(recipientUid)||typeof notificationId!=='string'||
     !NOTICE_ID.test(notificationId)||typeof db?.runTransaction!=='function'||
     !validDate(now))fail();
  return db.runTransaction(async tx=>{
    const ref=db.doc(inbox(recipientUid)+'/'+notificationId);
    const snap=await tx.get(ref);
    if(!snap.exists)fail();
    const record=snap.data();
    assertNotice(record,recipientUid,notificationId);
    if(record.readAt!==null)return {
      notificationId,readAt:validDate(record.readAt).toISOString(),
      alreadyRead:true
    };
    tx.update(ref,{readAt:validDate(now)});
    return {
      notificationId,readAt:validDate(now).toISOString(),alreadyRead:false
    };
  });
}
