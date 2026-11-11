import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 enqueueFriendNotifications,validateFriendNotificationAction,
 listFriendNotifications,markFriendNotificationRead
} from '../functions/friendNotifications.mjs';
import {
 createFriendRequestRecord,transitionFriendRelationship
} from '../functions/friendRelationshipModel.mjs';

const now=new Date('2026-11-11T06:00:00Z');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const clone=value=>structuredClone(value);
function fixture(){
 const store=new Map();
 const readRef=ref=>({exists:store.has(ref.path),id:ref.path.split('/').at(-1),
  data:()=>clone(store.get(ref.path))});
 return {store,
  doc:path=>({path,id:path.split('/').at(-1),get:async()=>readRef({path})}),
  collection:path=>({path,
   orderBy(){return this;},limit(n){this.count=n;return this;},
   startAfter(snap){this.after=snap.id;return this;},
   async get(){
    let rows=[...store].filter(([k])=>k.startsWith(path+'/'))
     .map(([k,v])=>({id:k.split('/').at(-1),data:()=>clone(v)}))
     .sort((a,b)=>new Date(b.data().createdAt)-new Date(a.data().createdAt)||
       a.id.localeCompare(b.id));
    if(this.after){const i=rows.findIndex(x=>x.id===this.after);rows=rows.slice(i+1);}
    return {docs:rows.slice(0,this.count)};
   }
  }),
  async runTransaction(fn){
   const writes=[];
   const tx={
    get:async ref=>readRef(ref),
    create(ref,data){
     if(store.has(ref.path)||writes.some(x=>x.path===ref.path))throw Error('duplicate');
     writes.push({path:ref.path,data:clone(data),type:'create'});
    },
    update(ref,data){if(!store.has(ref.path))throw Error('missing');
     writes.push({path:ref.path,data:clone(data),type:'update'});}
   };
   const result=await fn(tx);
   for(const row of writes)
    store.set(row.path,row.type==='update'?
      {...store.get(row.path),...row.data}:row.data);
   return result;
  }
 };
}
function next(previous,actorUid,action,at=new Date(now.getTime()+1000)){
 return transitionFriendRelationship(previous,{
  actorUid,action,expectedVersion:previous.version,now:at
 });
}
async function event(db,actor,action,previous,after,at=now){
 return db.runTransaction(async tx=>
  enqueueFriendNotifications(tx,db,actor,action,previous,after,{now:at}));
}
const rows=(db,uid)=>[...db.store.entries()]
 .filter(([p])=>p.startsWith('friendNotificationInbox/'+uid+'/items/'))
 .map(([,r])=>r);

test('strict RPC envelope accepts no UIDs, paths, forged event kinds or arbitrary fields',()=>{
 assert.deepEqual(validateFriendNotificationAction({action:'list'}),
  {action:'list',cursor:null});
 assert.deepEqual(validateFriendNotificationAction({action:'mark-read',
  notificationId:'a'.repeat(64)}),{action:'mark-read',notificationId:'a'.repeat(64)});
 for(const bad of [null,[],{}, {action:'list',uid:'bob'},
  {action:'list',cursor:'../bob'},{action:'mark-read',notificationId:'not-id'},
  {action:'mark-read',notificationId:'b'.repeat(64),recipientUid:'bob'},
  {action:'send',targetAccountId:'Grayson#01448'}])
  assert.throws(()=>validateFriendNotificationAction(bad),/unavailable/);
});
test('incoming/accepted/declined/cancelled and management events are recipient-scoped',async()=>{
 const db=fixture();
 const sent=createFriendRequestRecord('alice','bob',{now});
 await event(db,'alice','send',null,sent);
 assert.equal(rows(db,'alice').length,0);
 assert.equal(rows(db,'bob')[0].kind,'incoming-request');
 const accepted=next(sent,'bob','accept');
 await event(db,'bob','accept',sent,accepted);
 assert.equal(rows(db,'alice')[0].kind,'request-accepted');
 const removed=next(accepted,'alice','remove',new Date(now.getTime()+2000));
 await event(db,'alice','remove',accepted,removed);
 assert.deepEqual(rows(db,'alice').map(x=>x.kind).sort(),
  ['friend-removed','request-accepted']);
 assert.deepEqual(rows(db,'bob').map(x=>x.kind).sort(),
  ['friend-removed','incoming-request']);
 const db2=fixture();
 const declined=next(sent,'bob','decline');
 await event(db2,'bob','decline',sent,declined);
 assert.equal(rows(db2,'alice')[0].kind,'request-declined');
 const cancelled=next(sent,'alice','cancel');
 await event(db2,'alice','cancel',sent,cancelled);
 assert.equal(rows(db2,'bob')[0].kind,'request-cancelled');
});
test('block and unblock notices are private to the acting player',async()=>{
 const db=fixture();
 const sent=createFriendRequestRecord('alice','bob',{now});
 const blocked=next(sent,'bob','block');
 await event(db,'bob','block',sent,blocked);
 assert.equal(rows(db,'bob')[0].kind,'player-blocked');
 assert.equal(rows(db,'alice').length,0);
 const unblocked=next(blocked,'bob','unblock',new Date(now.getTime()+2000));
 await event(db,'bob','unblock',blocked,unblocked);
 assert.equal(rows(db,'bob').length,2);
 assert.equal(rows(db,'alice').length,0);
 assert.ok(rows(db,'bob')[1].body.includes('cooldown'));
});
test('notification records contain no personal information, handles or relationship paths',async()=>{
 const db=fixture();
 const sent=createFriendRequestRecord('alice','bob',{now});
 await event(db,'alice','send',null,sent);
 const notice=rows(db,'bob')[0];
 assert.deepEqual(Object.keys(notice).sort(),[
  'body','createdAt','kind','notificationId','readAt','schemaVersion','title'
 ]);
 assert.equal(JSON.stringify(notice).includes('alice'),false);
 assert.equal(JSON.stringify(notice).includes('bob'),false);
 assert.equal(JSON.stringify(notice).includes(sent.pairId),false);
 assert.equal(JSON.stringify(notice).includes('#'),false);
 assert.equal(JSON.stringify(notice).includes('email'),false);
});
test('deterministic event IDs prevent duplicates; distinct revisions remain distinct',async()=>{
 const db=fixture(),sent=createFriendRequestRecord('alice','bob',{now});
 const [id]=await event(db,'alice','send',null,sent);
 await assert.rejects(event(db,'alice','send',null,sent),/duplicate/);
 assert.equal(rows(db,'bob').length,1);
 const expired=next(sent,'bob','expire',new Date(sent.expiresAtMs));
 const resent=next(expired,'alice','request',new Date(expired.nextRequestAtMs));
 const [second]=await event(db,'alice','send',expired,resent,new Date(expired.nextRequestAtMs));
 assert.notEqual(id,second);
 assert.equal(rows(db,'bob').length,2);
});
test('owner inbox list/read is bounded, exact and idempotent',async()=>{
 const db=fixture(),sent=createFriendRequestRecord('alice','bob',{now});
 await event(db,'alice','send',null,sent);
 const one=await listFriendNotifications(db,'bob');
 assert.equal(one.notifications.length,1);
 assert.equal(one.unreadShown,1);
 assert.equal(one.notifications[0].kind,'incoming-request');
 assert.equal((await listFriendNotifications(db,'alice')).notifications.length,0);
 await assert.rejects(listFriendNotifications(db,'bob',{cursor:'not-an-id'}),/unavailable/);
 await assert.rejects(listFriendNotifications(db,'alice',{cursor:one.notifications[0].notificationId}),/unavailable/);
 await assert.rejects(markFriendNotificationRead(db,'alice',one.notifications[0].notificationId),/unavailable/);
 const result=await markFriendNotificationRead(db,'bob',one.notifications[0].notificationId,{now});
 assert.equal(result.alreadyRead,false);
 const repeated=await markFriendNotificationRead(db,'bob',one.notifications[0].notificationId,{now});
 assert.equal(repeated.alreadyRead,true);
 assert.equal((await listFriendNotifications(db,'bob')).unreadShown,0);
});
test('independent server gating, existing scoped release, and Firestore deny rules',()=>{
 const source=read('functions/index.mjs');
 const block=source.slice(source.indexOf('// Phase 4.1 Friends:'),
  source.indexOf('// Phase 1.2 Friends System:'));
 assert.match(block,/asteriaFriendNotifications=onCall/);
 assert.match(block,/request.auth\\?\\.uid/);
 assert.match(block,/ASTERIA_FRIEND_NOTIFICATIONS_ENABLED!=='1'/);
 assert.doesNotMatch(block,/ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED/);
 const actions=read('functions/friendRequestActions.mjs');
 assert.match(actions,/if\\(notificationsEnabled\\)/);
 assert.match(source,/notificationsEnabled:process.env.ASTERIA_FRIEND_NOTIFICATIONS_ENABLED==='1'/);
 const rules=read('firestore.rules');
 assert.match(rules,/match \\/friendNotificationInbox\\/\\{uid\\}/);
 assert.match(rules,/match \\/items\\/\\{notificationId\\}/);
 const packageSource=read('scripts/friends-phase2-2-release-package.mjs');
 assert.match(packageSource,/functions\\/friendNotifications.mjs/);
 assert.doesNotMatch(read('index.html'),/friendNotificationsEnabled:true/);
});
