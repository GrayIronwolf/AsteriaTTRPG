import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 nextFriendNotificationAccessQuota,chargeFriendNotificationAccess
} from '../functions/friendNotificationThrottle.mjs';
import {
 createFriendRequestRecord,transitionFriendRelationship
} from '../functions/friendRelationshipModel.mjs';
import {
 enqueueFriendNotifications,listFriendNotifications,markFriendNotificationRead
} from '../functions/friendNotifications.mjs';

const now=new Date('2026-11-11T06:30:00.000Z');
const after=ms=>new Date(now.getTime()+ms);
const clone=x=>structuredClone(x);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function fakeDb(){
 const store=new Map();
 const db={
  store,
  doc:path=>({path,id:path.split('/').at(-1),async get(){
   return {exists:store.has(path),id:path.split('/').at(-1),data:()=>clone(store.get(path))};
  }}),
  collection:path=>({
   path,query:true,
   orderBy(field,dir){
    this.order=(this.order||[]).concat([[field,dir]]);
    return this;
   },
   limit(n){this.max=n;return this;},
   startAfter(snap){this.after=snap.id;return this;},
   async get(){
    let items=[...store.entries()]
      .filter(([key])=>key.startsWith(path+'/'))
      .map(([key,value])=>({
       id:key.slice(path.length+1),data:()=>clone(value)
      }));
    items.sort((a,b)=>{
      const d=new Date(b.data().createdAt)-new Date(a.data().createdAt);
      return d||b.id.localeCompare(a.id);
    });
    if(this.after!==undefined){
      const i=items.findIndex(x=>x.id===this.after);
      if(i<0)throw Error('Missing cursor');
      items=items.slice(i+1);
    }
    return {docs:items.slice(0,this.max)};
   }
  }),
  async runTransaction(callback){
   const writes=[];
   const tx={
    get:async ref=>({exists:store.has(ref.path),
      data:()=>clone(store.get(ref.path))}),
    set(ref,data){writes.push(['set',ref.path,clone(data)]);},
    create(ref,data){
     if(store.has(ref.path)||writes.some(([,p])=>p===ref.path))
       throw Error('Already exists');
     writes.push(['create',ref.path,clone(data)]);
    },
    update(ref,data){
     if(!store.has(ref.path))throw Error('Missing record');
     writes.push(['update',ref.path,clone(data)]);
    }
   };
   const result=await callback(tx);
   for(const [kind,path,data] of writes){
    store.set(path,kind==='update'?{...store.get(path),...data}:data);
   }
   return result;
  }
 };
 return db;
}
test('recipient quota is bounded, reset by window and independent between actions',()=>{
 let record=null;
 for(let i=0;i<120;i++)record=nextFriendNotificationAccessQuota(record,'alice','list',{now});
 assert.equal(record.listCount,120);
 assert.equal(record.readCount,0);
 assert.throws(()=>nextFriendNotificationAccessQuota(record,'alice','list',{now}),/rate limit/);
 for(let i=0;i<180;i++)record=nextFriendNotificationAccessQuota(record,'alice','mark-read',{now});
 assert.equal(record.readCount,180);
 assert.throws(()=>nextFriendNotificationAccessQuota(record,'alice','mark-read',{now}),/rate limit/);
 const reset=nextFriendNotificationAccessQuota(record,'alice','list',{now:after(600000)});
 assert.equal(reset.listCount,1);
 assert.equal(reset.readCount,0);
});
test('quota rejects forged UID, malformed records, clocks and unexpected actions',()=>{
 const good=nextFriendNotificationAccessQuota(null,'alice','list',{now});
 for(const broken of [{...good,uid:'bob'}, {...good,listCount:121},
  {...good,readCount:-1},{...good,version:3},
  {...good,updatedAtMs:now.getTime()+1},
  {...good,secret:'test'}]){
   assert.throws(()=>nextFriendNotificationAccessQuota(broken,'alice','list',{now}));
 }
 assert.throws(()=>nextFriendNotificationAccessQuota(null,'../alice','list',{now}));
 assert.throws(()=>nextFriendNotificationAccessQuota(null,'alice','create',{now}));
});
test('authenticated read quotas have private per-recipient Firestore paths',async()=>{
 const db=fakeDb();
 await chargeFriendNotificationAccess(db,'alice','list',{now});
 await chargeFriendNotificationAccess(db,'alice','mark-read',{now});
 await chargeFriendNotificationAccess(db,'bob','list',{now});
 assert.equal(db.store.get('friendNotificationAccessThrottle/alice').listCount,1);
 assert.equal(db.store.get('friendNotificationAccessThrottle/alice').readCount,1);
 assert.equal(db.store.get('friendNotificationAccessThrottle/bob').listCount,1);
 assert.equal(db.store.get('friendNotificationAccessThrottle/bob').readCount,0);
});
test('same-time notices have deterministic stable descending document-ID pagination',async()=>{
 const db=fakeDb();
 for(let i=0;i<54;i++){
  const pair=createFriendRequestRecord('alice','target'+i,{now});
  await db.runTransaction(async tx=>{
   enqueueFriendNotifications(tx,db,'alice','send',null,pair,{now});
  });
 }
 const seen=new Set();
 let cursor=null,total=0;
 for(let iteration=0;iteration<4;iteration++){
  const page=await listFriendNotifications(db,'target0',{cursor});
  // Distinct recipients are private and cannot be combined in one list.
  if(iteration===0)assert.equal(page.notifications.length,1);
  break;
 }
 // Fill one account inbox with distinct canonical pair revisions.
 for(let i=0;i<54;i++){
  const pair=createFriendRequestRecord('other'+i,'bob',{now});
  await db.runTransaction(async tx=>{
   enqueueFriendNotifications(tx,db,'other'+i,'send',null,pair,{now});
  });
 }
 const first=await listFriendNotifications(db,'bob');
 assert.equal(first.notifications.length,25);
 assert.equal(first.unreadShown,25);
 const second=await listFriendNotifications(db,'bob',{cursor:first.nextCursor});
 assert.equal(second.notifications.length,25);
 const third=await listFriendNotifications(db,'bob',{cursor:second.nextCursor});
 assert.equal(third.notifications.length,4);
 for(const page of [first,second,third]){
  for(const item of page.notifications){
   assert.equal(seen.has(item.notificationId),false);
   seen.add(item.notificationId);total++;
  }
 }
 assert.equal(total,54);
 assert.equal(third.nextCursor,null);
});
test('stale and wrong-recipient cursor, idempotent read, duplicate create failure',async()=>{
 const db=fakeDb(),pair=createFriendRequestRecord('alice','bob',{now});
 const emit=()=>db.runTransaction(async tx=>enqueueFriendNotifications(
  tx,db,'alice','send',null,pair,{now}));
 await emit();
 await assert.rejects(emit(),/Already exists/);
 const first=await listFriendNotifications(db,'bob');
 const id=first.notifications[0].notificationId;
 await assert.rejects(listFriendNotifications(db,'alice',{cursor:id}),/unavailable/);
 await assert.rejects(listFriendNotifications(db,'bob',{cursor:'a'.repeat(64)}),/unavailable/);
 await assert.rejects(markFriendNotificationRead(db,'alice',id,{now}),/unavailable/);
 assert.equal((await markFriendNotificationRead(db,'bob',id,{now})).alreadyRead,false);
 assert.equal((await markFriendNotificationRead(db,'bob',id,{now})).alreadyRead,true);
});
test('expiry re-request is the only permitted two-revision notification transition',async()=>{
 const db=fakeDb();
 const old=createFriendRequestRecord('alice','bob',{now});
 const expired=transitionFriendRelationship(old,{actorUid:'alice',
  action:'expire',expectedVersion:1,now:new Date(old.expiresAtMs)});
 const reissued=transitionFriendRelationship(expired,{actorUid:'alice',
  action:'request',expectedVersion:2,now:new Date(expired.nextRequestAtMs)});
 assert.equal(reissued.version,3);
 await db.runTransaction(async tx=>{
  enqueueFriendNotifications(tx,db,'alice','send',old,reissued,
   {now:new Date(expired.nextRequestAtMs)});
 });
 assert.equal((await listFriendNotifications(db,'bob')).notifications.length,1);
 const invalid={...reissued,version:10};
 await assert.rejects(db.runTransaction(async tx=>{
  enqueueFriendNotifications(tx,db,'alice','send',old,invalid,
    {now:new Date(expired.nextRequestAtMs)});
 }),/unavailable/);
});
test('source guards preserve independent social notification feature gates',()=>{
 const callable=read('functions/index.mjs');
 const block=callable.slice(callable.indexOf('// Phase 4.1 Friends:'),
  callable.indexOf('// Phase 2.2 Friends:'));
 assert.match(block,/chargeFriendNotificationAccess/);
 assert.match(block,/ASTERIA_FRIEND_NOTIFICATIONS_ENABLED!=='1'/);
 assert.doesNotMatch(block,/ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED/);
 const rules=read('firestore.rules');
 assert.match(rules,/match \/friendNotificationAccessThrottle\/\{uid\}/);
 assert.match(read('index.html'),/friendNotificationsEnabled:false/);
});
