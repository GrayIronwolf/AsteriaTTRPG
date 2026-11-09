import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueCampaignNotification,notifyVerifiedEmailRecipient,
  listCampaignNotifications,markCampaignNotificationRead
} from '../functions/campaignNotifications.mjs';
import {campaignJoinRequest} from '../functions/campaignJoinRequests.mjs';
import {reviewCampaignJoinRequest} from '../functions/campaignJoinApproval.mjs';

const now=new Date('2026-11-09T09:00:00.000Z');
const clone=x=>structuredClone(x);
function fixture(){
  const store=new Map([['campaigns/c',{
    id:'c',name:'The Frost Throne',ownerUid:'gm',
    membershipSchemaVersion:2,ucn:'123456789012',
    joinPolicy:{joinRequestsOpen:true},partySize:10
  }]]);
  const read=ref=>{
    if(ref.query){
      let rows=[...store.entries()].filter(([name])=>
        name.startsWith(ref.path+'/')&&!name.slice(ref.path.length+1).includes('/'))
        .map(([name,data])=>({id:name.slice(ref.path.length+1),
          data:()=>clone(data),ref:{path:name}}));
      rows.sort((a,b)=>new Date(b.data().createdAt)-new Date(a.data().createdAt)||
        a.id.localeCompare(b.id));
      if(ref.cursor)rows=rows.slice(rows.findIndex(row=>row.id===ref.cursor)+1);
      return {docs:rows.slice(0,ref.limitSize??rows.length)};
    }
    return {exists:store.has(ref.path),data:()=>clone(store.get(ref.path))};
  };
  const db={store,
    doc:path=>({path,get:async()=>read({path})}),
    collection:path=>({
      path,query:true,
      orderBy(){return this;},
      limit(limitSize){return {...this,limitSize};},
      startAfter(snap){return {...this,cursor:snap.data().notificationId};},
      async get(){return read(this);}
    }),
    async runTransaction(callback){
      const writes=[];
      const tx={
        get:async ref=>read(ref),
        create(ref,data){
          if(store.has(ref.path)||writes.some(x=>x[1]===ref.path))
            throw Error('Duplicate notification');
          writes.push(['create',ref.path,clone(data)]);
        },
        set(ref,data){writes.push(['set',ref.path,clone(data)]);},
        update(ref,data){
          if(!store.has(ref.path))throw Error('Missing document');
          writes.push(['update',ref.path,clone(data)]);
        }
      };
      const result=await callback(tx);
      for(const [method,path,data] of writes)
        store.set(path,method==='update'?{...store.get(path),...data}:data);
      return result;
    }
  };
  return db;
}
const notices=(db,uid)=>[...db.store.entries()]
  .filter(([path])=>path.startsWith('campaignNotificationInbox/'+uid+'/items/'))
  .map(([,data])=>data);

test('disabled-by-default join request does not create notifications',async()=>{
  const db=fixture();
  const result=await campaignJoinRequest(db,'alice',{
    action:'submit',campaignId:'c',ucn:'123456789012'
  },{now});
  assert.equal(result.status,'pending');
  assert.equal(notices(db,'gm').length,0);
  assert.equal(notices(db,'alice').length,0);
});
test('new join requests notify GM but never grant membership or expose private data',async()=>{
  const db=fixture(),root=clone(db.store.get('campaigns/c'));
  const request=await campaignJoinRequest(db,'alice',{
    action:'submit',campaignId:'c',ucn:'123456789012'
  },{now,notificationsEnabled:true});
  assert.equal(request.status,'pending');
  const entries=notices(db,'gm');
  assert.equal(entries.length,1);
  assert.equal(entries[0].kind,'join-request');
  assert.match(entries[0].body,/The Frost Throne/);
  assert.equal(entries[0].readAt,null);
  assert.equal(notices(db,'alice').length,0);
  assert.equal(db.store.has('campaigns/c/members/alice'),false);
  assert.deepEqual(db.store.get('campaigns/c'),root);
  const retry=await campaignJoinRequest(db,'alice',{
    action:'submit',campaignId:'c',ucn:'123456789012'
  },{now,notificationsEnabled:true});
  assert.equal(retry.alreadyExists,true);
  assert.equal(notices(db,'gm').length,1);
});
test('approval writes exactly one recipient notice and preserves player role',async()=>{
  const db=fixture();
  await campaignJoinRequest(db,'alice',{
    action:'submit',campaignId:'c',ucn:'123456789012'
  },{now,notificationsEnabled:true});
  const response=await reviewCampaignJoinRequest(db,'gm',{
    campaignId:'c',requestUid:'alice',decision:'approve',expectedRevision:1
  },{now,notificationsEnabled:true});
  assert.equal(response.status,'approved');
  assert.equal(notices(db,'alice').length,1);
  assert.equal(notices(db,'alice')[0].kind,'join-approved');
  assert.equal(db.store.get('campaigns/c/members/alice').role,'player');
  const replay=await reviewCampaignJoinRequest(db,'gm',{
    campaignId:'c',requestUid:'alice',decision:'approve',expectedRevision:1
  },{now,notificationsEnabled:true});
  assert.equal(replay.alreadyReviewed,true);
  assert.equal(notices(db,'alice').length,1);
});
test('declines never grant access and recipient sees a private decision alert',async()=>{
  const db=fixture();
  await campaignJoinRequest(db,'alice',{
    action:'submit',campaignId:'c',ucn:'123456789012'
  },{now,notificationsEnabled:true});
  await reviewCampaignJoinRequest(db,'gm',{
    campaignId:'c',requestUid:'alice',decision:'decline',expectedRevision:1
  },{now,notificationsEnabled:true});
  assert.equal(notices(db,'alice')[0].kind,'join-declined');
  assert.equal(db.store.has('campaigns/c/members/alice'),false);
});
test('account-only pagination and unread counts never leak another inbox',async()=>{
  const db=fixture();
  for(let i=0;i<27;i++){
    await db.runTransaction(async tx=>{
      enqueueCampaignNotification(tx,db,'alice',{
        campaignId:'c',campaignName:'Frosthold',
        kind:'join-request',eventKey:'join-request:c:user-'+String(i).padStart(2,'0')
      },new Date(now.getTime()+i*1000));
    });
  }
  await db.runTransaction(async tx=>{
    enqueueCampaignNotification(tx,db,'bob',{
      campaignId:'c',campaignName:'Other Campaign',
      kind:'join-approved',eventKey:'join-decision:c:bob'
    },now);
  });
  const first=await listCampaignNotifications(db,'alice');
  assert.equal(first.notifications.length,25);
  assert.equal(first.unreadShown,25);
  assert.match(first.nextCursor,/^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(first).includes('Other Campaign'),false);
  const second=await listCampaignNotifications(db,'alice',{cursor:first.nextCursor});
  assert.equal(second.notifications.length,2);
  assert.equal(second.nextCursor,null);
  const all=new Set([...first.notifications,...second.notifications].map(x=>x.notificationId));
  assert.equal(all.size,27);
  assert.equal((await listCampaignNotifications(db,'bob')).notifications.length,1);
});
test('recipient-scoped read actions are idempotent and cannot target foreign IDs',async()=>{
  const db=fixture();
  const result=await notifyVerifiedEmailRecipient(db,'alice',{
    campaignId:'c',campaignName:'Frosthold',inviteId:'a'.repeat(64)
  },now);
  assert.equal(result.alreadyExists,false);
  const second=await notifyVerifiedEmailRecipient(db,'alice',{
    campaignId:'c',campaignName:'Frosthold',inviteId:'a'.repeat(64)
  },now);
  assert.equal(second.alreadyExists,true);
  const id=result.notificationId;
  const read=await markCampaignNotificationRead(db,'alice',id,{now});
  assert.equal(read.alreadyRead,false);
  assert.equal((await markCampaignNotificationRead(db,'alice',id,{now})).alreadyRead,true);
  assert.equal((await listCampaignNotifications(db,'alice')).unreadShown,0);
  await assert.rejects(markCampaignNotificationRead(db,'bob',id,{now}),/not found/);
  assert.equal(notices(db,'bob').length,0);
});
test('notification records never store invitation credentials or email addresses',async()=>{
  const db=fixture(),inviteId='b'.repeat(64);
  await notifyVerifiedEmailRecipient(db,'alice',{
    campaignId:'c',campaignName:'Frosthold',inviteId
  },now);
  const row=notices(db,'alice')[0];
  assert.equal(row.kind,'email-invitation');
  for(const field of ['token','tokenDigest','recipientEmail','inviteId','email']){
    assert.equal(row[field],undefined);
  }
  assert.equal(JSON.stringify(row).includes(inviteId),false);
  assert.match(row.body,/verified email/);
});
test('invalid IDs, malformed event keys and control characters fail closed',async()=>{
  const db=fixture();
  await assert.rejects(listCampaignNotifications(db,'../../bad'),/Sign in/);
  await assert.rejects(markCampaignNotificationRead(db,'alice','not-a-valid-id'),/Invalid notification/);
  assert.throws(()=>enqueueCampaignNotification({create(){}},db,'alice',{
    campaignId:'c',campaignName:'Frosthold',
    kind:'secret',eventKey:'join-request:c:alice'
  },now),/Invalid/);
  assert.throws(()=>enqueueCampaignNotification({create(){}},db,'alice',{
    campaignId:'c',campaignName:'Frosthold',
    kind:'join-request',eventKey:'bad'
  },now),/Invalid/);
});
