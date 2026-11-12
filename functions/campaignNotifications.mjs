import {createHash} from 'node:crypto';

// Phase 7.3. Server-owned, recipient-scoped notification inbox.
// Firestore browser rules deny ALL reads and writes. Client access is through
// a separate authenticated, disabled-by-default callable, never a public query.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const NOTICE_ID=/^[a-f0-9]{64}$/;
const EVENT=/^[A-Za-z0-9_:.-]{8,250}$/;
const PAGE_SIZE=25;
const KINDS=new Set([
  'join-request','join-approved','join-declined','email-invitation',
  'friend-invitation'
]);
const validId=x=>typeof x==='string'&&ID.test(x);
const when=x=>{
  const value=x?.toDate?.()||x;
  const date=value instanceof Date?value:new Date(value);
  return Number.isFinite(date.getTime())?date:null;
};
const cleanName=value=>{
  const text=typeof value==='string'?value.trim():'';
  if(!text||text.length>120||[...text].some(c=>c.charCodeAt(0)<32||
    c.charCodeAt(0)===127))return 'Campaign';
  return text;
};
function assertIdentity(recipientUid,{campaignId,kind,eventKey}){
  if(!validId(recipientUid)||!validId(campaignId)||
    !KINDS.has(kind)||typeof eventKey!=='string'||!EVENT.test(eventKey))
    throw Error('Invalid campaign notification details.');
}
function notificationId(uid,eventKey){
  return createHash('sha256')
    .update('asteria-campaign-notification-v1\0'+uid+'\0'+eventKey)
    .digest('hex');
}
function message(kind,name){
  if(kind==='join-request')return {
    title:'New campaign join request',
    body:'A player requested to join '+name+'. Review the request in Campaign Forge.'
  };
  if(kind==='join-approved')return {
    title:'Campaign request approved',
    body:'Your request to join '+name+' was approved. Open your campaigns to continue.'
  };
  if(kind==='join-declined')return {
    title:'Campaign request declined',
    body:'Your request to join '+name+' was declined by a GM.'
  };
  if(kind==='friend-invitation')return {
    title:'New campaign invitation',
    body:'You have been invited to '+name+'. Open this notice to request joining the campaign; GM approval is required.'
  };
  return {
    title:'Asteria campaign email invitation',
    body:'An invitation to '+name+' was submitted to your verified email address. Check your email for your private link; GM approval is still required.'
  };
}
function path(uid){return 'campaignNotificationInbox/'+uid+'/items';}
function assertRecord(value,uid,id){
  if(!value||typeof value!=='object'||value.recipientUid!==uid||
    value.notificationId!==id||!NOTICE_ID.test(id)||
    !validId(value.campaignId)||!KINDS.has(value.kind)||
    typeof value.title!=='string'||value.title.length>150||
    typeof value.body!=='string'||value.body.length>500||
    (value.kind==='friend-invitation'&&!NOTICE_ID.test(value.inviteId))||
    !when(value.createdAt)||
    (value.readAt!==null&&value.readAt!==undefined&&!when(value.readAt)))
    throw Error('Campaign notification record requires reconciliation.');
}
function summary(row,uid){
  const data=row.data();
  assertRecord(data,uid,row.id);
  return {
    notificationId:row.id,campaignId:data.campaignId,kind:data.kind,
    ...(data.kind==='friend-invitation'?{inviteId:data.inviteId}:{}),
    title:data.title,body:data.body,
    createdAt:when(data.createdAt).toISOString(),
    readAt:when(data.readAt)?.toISOString()||null
  };
}

/**
 * Call ONLY from a trusted Firestore transaction, after the underlying join
 * request/decision has been authenticated and validated. No extra reads and
 * no access changes. Deterministic IDs prevent duplicate event records.
 */
export function enqueueCampaignNotification(tx,db,recipientUid,{
  campaignId,campaignName,kind,eventKey,inviteId=null
},now=new Date()){
  if(kind==='friend-invitation'){
    if(!NOTICE_ID.test(inviteId)||
       eventKey!=='friend-invitation:'+campaignId+':'+inviteId)
      throw Error('Invalid campaign invitation notice.');
  }else if(inviteId!==null)throw Error('Unexpected invitation reference.');
  assertIdentity(recipientUid,{campaignId,kind,eventKey});
  const date=when(now);
  if(!date)throw Error('Invalid campaign notification time.');
  const id=notificationId(recipientUid,eventKey);
  const msg=message(kind,cleanName(campaignName));
  tx.create(db.doc(path(recipientUid)+'/'+id),{
    notificationId:id,recipientUid,campaignId,kind,
    ...(kind==='friend-invitation'?{inviteId}:{}),
    title:msg.title,body:msg.body,createdAt:date,readAt:null
  });
  return id;
}

/**
 * Best effort for email *submission accepted* events. Does not send email
 * and cannot convert a notification into an invitation credential. Recipient
 * UID MUST be verified with Firebase Admin Auth for that exact email first.
 */
export async function notifyVerifiedEmailRecipient(db,recipientUid,{
  campaignId,campaignName,inviteId
},now=new Date()){
  if(!NOTICE_ID.test(inviteId))throw Error('Invalid invitation reference.');
  const eventKey='email-invitation:'+campaignId+':'+inviteId;
  assertIdentity(recipientUid,{campaignId,kind:'email-invitation',eventKey});
  const id=notificationId(recipientUid,eventKey);
  return db.runTransaction(async tx=>{
    const ref=db.doc(path(recipientUid)+'/'+id);
    const existing=await tx.get(ref);
    if(existing.exists){
      assertRecord(existing.data(),recipientUid,id);
      return {notificationId:id,alreadyExists:true};
    }
    enqueueCampaignNotification(tx,db,recipientUid,{
      campaignId,campaignName,kind:'email-invitation',eventKey
    },now);
    return {notificationId:id,alreadyExists:false};
  });
}

/**
 * Proof that this exact authenticated UID has a server-authored in-app notice
 * for this exact account-bound invitation. The browser supplies only the
 * campaign/invite IDs; no bearer token or email is stored in the inbox.
 * Recheck in the acceptance transaction, not only in a preview.
 */
export async function assertFriendInvitationNotice(db,recipientUid,{
  campaignId,inviteId
},tx=null){
  if(!validId(recipientUid)||!validId(campaignId)||!NOTICE_ID.test(inviteId))
    throw Error('Campaign invitation unavailable.');
  const eventKey='friend-invitation:'+campaignId+':'+inviteId;
  const id=notificationId(recipientUid,eventKey);
  const ref=db.doc(path(recipientUid)+'/'+id);
  const snap=tx?await tx.get(ref):await ref.get();
  if(!snap?.exists)throw Error('Campaign invitation unavailable.');
  const value=snap.data();
  try{assertRecord(value,recipientUid,id);}catch{throw Error('Campaign invitation unavailable.');}
  if(value.kind!=='friend-invitation'||value.campaignId!==campaignId||
     value.inviteId!==inviteId)
    throw Error('Campaign invitation unavailable.');
  return true;
}

export async function listCampaignNotifications(db,recipientUid,{cursor=null}={}){
  if(!validId(recipientUid)||(cursor!==null&&
    (typeof cursor!=='string'||!NOTICE_ID.test(cursor))))
    throw Error('Sign in to view your campaign notifications.');
  let query=db.collection(path(recipientUid))
    .orderBy('createdAt','desc').limit(PAGE_SIZE+1);
  if(cursor){
    const snap=await db.doc(path(recipientUid)+'/'+cursor).get();
    if(!snap.exists)throw Error('Notification cursor is no longer valid.');
    assertRecord(snap.data(),recipientUid,cursor);
    query=query.startAfter(snap);
  }
  const results=await query.get(),page=results.docs.slice(0,PAGE_SIZE);
  return {
    notifications:page.map(row=>summary(row,recipientUid)),
    unreadShown:page.filter(row=>row.data().readAt==null).length,
    nextCursor:results.docs.length>PAGE_SIZE?page[page.length-1].id:null
  };
}

export async function markCampaignNotificationRead(db,recipientUid,notificationId,{
  now=new Date()
}={}){
  if(!validId(recipientUid)||!NOTICE_ID.test(notificationId))
    throw Error('Invalid notification.');
  const date=when(now);
  if(!date)throw Error('Invalid notification time.');
  return db.runTransaction(async tx=>{
    const ref=db.doc(path(recipientUid)+'/'+notificationId);
    const snap=await tx.get(ref);
    if(!snap.exists)throw Error('Notification not found.');
    const item=snap.data();
    assertRecord(item,recipientUid,notificationId);
    if(item.readAt!=null)
      return {notificationId,readAt:when(item.readAt).toISOString(),
        alreadyRead:true};
    tx.update(ref,{readAt:date});
    return {notificationId,readAt:date.toISOString(),alreadyRead:false};
  });
}
