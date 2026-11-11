// Phase 4.3: private, server-only abuse controls for social notification reads.
// This quota is independent of campaign notification and friend-request quotas.
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const WINDOW_MS=10*60*1000;
const LIMITS=Object.freeze({list:120,'mark-read':180});
const keys='listCount,readCount,uid,updatedAtMs,version,windowStartMs';
const unavailable=()=>new Error('Friend notification unavailable.');
const validMs=value=>Number.isSafeInteger(value)&&value>=0;
const validUid=value=>typeof value==='string'&&UID.test(value);

export function nextFriendNotificationAccessQuota(previous,uid,action,{
  now=new Date()
}={}){
  if(!validUid(uid)||!Object.hasOwn(LIMITS,action)||
     !(now instanceof Date)||!validMs(now.getTime()))throw unavailable();
  const time=now.getTime();
  if(previous!==null&&previous!==undefined){
    if(!previous||typeof previous!=='object'||Array.isArray(previous)||
       Object.keys(previous).sort().join(',')!==keys||
       previous.version!==1||previous.uid!==uid||
       !validMs(previous.windowStartMs)||!validMs(previous.updatedAtMs)||
       previous.windowStartMs>previous.updatedAtMs||
       previous.updatedAtMs>time||
       !Number.isSafeInteger(previous.listCount)||
       previous.listCount<0||previous.listCount>LIMITS.list||
       !Number.isSafeInteger(previous.readCount)||
       previous.readCount<0||previous.readCount>LIMITS['mark-read'])
      throw unavailable();
  }
  const active=previous&&time-previous.windowStartMs<WINDOW_MS;
  const next={
    version:1,uid,windowStartMs:active?previous.windowStartMs:time,
    updatedAtMs:time,listCount:active?previous.listCount:0,
    readCount:active?previous.readCount:0
  };
  const field=action==='list'?'listCount':'readCount';
  if(next[field]>=LIMITS[action])
    throw new Error('Friend notification rate limit reached.');
  next[field]++;
  return next;
}

export async function chargeFriendNotificationAccess(db,recipientUid,action,{
  now=new Date()
}={}){
  if(typeof db?.doc!=='function'||typeof db?.runTransaction!=='function'||
     !validUid(recipientUid)||!Object.hasOwn(LIMITS,action))throw unavailable();
  const ref=db.doc('friendNotificationAccessThrottle/'+recipientUid);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const next=nextFriendNotificationAccessQuota(snap.exists?snap.data():null,
      recipientUid,action,{now});
    tx.set(ref,next);
    return undefined;
  });
}
