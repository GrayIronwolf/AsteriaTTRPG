import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FRIEND_RELATIONSHIP_POLICY,friendPairId,friendRelationshipPath,
 createFriendRequestRecord,assertFriendRelationship,transitionFriendRelationship,
 nextFriendRequestIssueQuota
} from '../functions/friendRelationshipModel.mjs';

const day=24*60*60*1000;
const start=new Date('2026-11-11T02:00:00.000Z');
const at=offset=>new Date(start.getTime()+offset);
const move=(record,actorUid,action,offset)=>transitionFriendRelationship(
 record,{actorUid,action,expectedVersion:record.version,now:at(offset)}
);
test('a single stable collision-free pair document exists independent of order or username',()=>{
 assert.equal(friendPairId('bob','alice'),friendPairId('alice','bob'));
 assert.equal(friendRelationshipPath('alice','bob'),'friendRelationships/alice~bob');
 assert.notEqual(friendPairId('abc','def'),friendPairId('ab','cdef'));
 for(const pair of [['alice','alice'],['','bob'],['uid~fake','bob'],['alice',null]])
   assert.throws(()=>friendPairId(...pair),/two different/);
});
test('record schema is minimal, versioned, ordered, canonical and never stores profile data',()=>{
 const item=createFriendRequestRecord('bob','alice',{now:start});
 assert.equal(item.pairId,'alice~bob');
 assert.deepEqual(item.participantUids,['alice','bob']);
 assert.equal(item.schemaVersion,1);
 assert.equal(item.expiresAtMs,item.requestedAtMs+14*day);
 assert.equal(item.status,'pending');
 assert.equal(item.version,1);
 assert.equal(assertFriendRelationship(item),true);
 for(const privateField of ['email','username','accountId','avatar','campaignId','token','displayName'])
   assert.equal(privateField in item,false,privateField);
});
test('acceptance is recipient-only; requester can cancel; neither may self-friend',()=>{
 const incoming=createFriendRequestRecord('alice','bob',{now:start});
 assert.throws(()=>move(incoming,'alice','accept',1000),/unavailable/);
 assert.throws(()=>move(incoming,'outsider','accept',1000),/unavailable/);
 const accepted=move(incoming,'bob','accept',1000);
 assert.equal(accepted.status,'accepted');
 assert.equal(accepted.expiresAtMs,null);
 assert.equal(accepted.version,2);
 assert.throws(()=>move(accepted,'bob','accept',2000),/unavailable/);
 const cancelled=move(incoming,'alice','cancel',1000);
 assert.equal(cancelled.status,'cancelled');
 assert.throws(()=>move(incoming,'bob','cancel',1000),/unavailable/);
 assert.throws(()=>createFriendRequestRecord('alice','alice',{now:start}),/two different/);
});
test('pending requests expire exactly after 14 days and cannot be accepted or declined after expiry',()=>{
 const incoming=createFriendRequestRecord('alice','bob',{now:start});
 assert.equal(move(incoming,'bob','accept',14*day-1).status,'accepted');
 assert.throws(()=>move(incoming,'bob','accept',14*day),/unavailable/);
 assert.throws(()=>move(incoming,'bob','decline',14*day),/unavailable/);
 const expired=move(incoming,'alice','expire',14*day);
 assert.equal(expired.status,'expired');
 assert.equal(expired.expiresAtMs,null);
 assert.equal(expired.nextRequestAtMs,14*day+7*day);
 assert.throws(()=>move(incoming,'alice','expire',14*day-1),/unavailable/);
});
test('decline/cancel/remove enforce 7-day retry; re-request may reverse direction only after cooldown',()=>{
 const initial=createFriendRequestRecord('alice','bob',{now:start});
 for(const ended of [
   move(initial,'bob','decline',1000),
   move(initial,'alice','cancel',1000),
   move(move(initial,'bob','accept',1000),'alice','remove',2000)
 ]){
   assert.equal(ended.nextRequestAtMs,ended.updatedAtMs+7*day);
   assert.throws(()=>move(ended,'bob','request',ended.updatedAtMs-start.getTime()+7*day-1),/unavailable/);
   const retried=move(ended,'bob','request',ended.updatedAtMs-start.getTime()+7*day);
   assert.equal(retried.status,'pending');
   assert.equal(retried.requesterUid,'bob');
   assert.equal(retried.recipientUid,'alice');
   assert.equal(retried.pairId,initial.pairId);
   assert.equal(retried.requestCount,2);
 }
});
test('both accounts can block independently; unblocking never restores friendship',()=>{
 const initial=createFriendRequestRecord('alice','bob',{now:start});
 const friend=move(initial,'bob','accept',1);
 const blocked=move(friend,'alice','block',2);
 assert.deepEqual(blocked.blockedByUids,['alice']);
 assert.throws(()=>move(blocked,'bob','request',3),/unavailable/);
 assert.throws(()=>move(blocked,'bob','accept',3),/unavailable/);
 const both=move(blocked,'bob','block',3);
 assert.deepEqual(both.blockedByUids,['alice','bob']);
 const still=move(both,'alice','unblock',4);
 assert.equal(still.status,'blocked');
 assert.deepEqual(still.blockedByUids,['bob']);
 assert.throws(()=>move(still,'alice','request',5),/unavailable/);
 const cleared=move(still,'bob','unblock',6);
 assert.equal(cleared.status,'removed');
 assert.deepEqual(cleared.blockedByUids,[]);
 assert.equal(cleared.nextRequestAtMs,cleared.updatedAtMs+7*day);
 assert.throws(()=>move(cleared,'alice','request',7),/unavailable/);
 assert.throws(()=>move(both,'outsider','unblock',4),/unavailable/);
 assert.throws(()=>move(blocked,'bob','unblock',3),/unavailable/);
});
test('invalid state, tampering and stale/forged versions fail closed',()=>{
 const first=createFriendRequestRecord('alice','bob',{now:start});
 for(const patch of [
  {pairId:'bob~alice'},{schemaVersion:2},{requesterUid:'eve'},
  {participantUids:['bob','alice']},{status:'other'},{accountId:'Some#12345'},
  {blockedByUids:['eve']},{status:'blocked'}, {expiresAtMs:0},
  {version:0},{requestCount:-1},{updatedAtMs:first.requestedAtMs-1}
 ]) assert.throws(()=>assertFriendRelationship({...first,...patch}),/reconciliation/);
 assert.throws(()=>transitionFriendRelationship(first,{
  actorUid:'bob',action:'accept',expectedVersion:0,now:at(1)
 }),/changed/);
 assert.throws(()=>move(first,'bob','accept',-1),/timestamp/);
 assert.throws(()=>move(first,'bob','admin-approve',2),/unavailable/);
});
test('sender quota permits exactly 10 issues in 24 hours, resets after window and fails closed on corruption',()=>{
 assert.equal(FRIEND_RELATIONSHIP_POLICY.maxIssuesPerDay,10);
 let quota=null;
 for(let i=0;i<10;i++)
   quota=nextFriendRequestIssueQuota(quota,'alice',{now:at(i)});
 assert.equal(quota.issued,10);
 assert.throws(()=>nextFriendRequestIssueQuota(quota,'alice',{now:at(11)}),/limit/);
 assert.throws(()=>nextFriendRequestIssueQuota(quota,'bob',{now:at(11)}),/reconciliation/);
 assert.throws(()=>nextFriendRequestIssueQuota({...quota,issued:0},'alice',{now:at(11)}),/reconciliation/);
 assert.throws(()=>nextFriendRequestIssueQuota({...quota,secret:'leak'},'alice',{now:at(11)}),/reconciliation/);
 const reset=nextFriendRequestIssueQuota(quota,'alice',{now:at(day)});
 assert.equal(reset.issued,1);
 assert.equal(reset.windowStartMs,start.getTime()+day);
});
test('Phase 2.1 cannot create server callable, website feature flag, campaign membership or live request action',()=>{
 const mod=readFileSync(new URL('../functions/friendRelationshipModel.mjs',import.meta.url),'utf8');
 const entry=readFileSync(new URL('../functions/index.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.doesNotMatch(mod,/firebase-admin|runTransaction|\\.set\\(|\\.create\\(|httpsCallable|onCall\\(|campaigns\\//);
 assert.doesNotMatch(entry,/asteriaFriendRequest=onCall|asteriaFriendRelationship=onCall/);
 assert.doesNotMatch(html,/friendRequestsEnabled:true|friendRelationshipsEnabled:true/);
});
