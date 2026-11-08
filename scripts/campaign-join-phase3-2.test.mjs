import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignJoinRequest} from '../functions/campaignJoinRequests.mjs';

const code='000000000789';
function fixture(campaign={ownerUid:'gm',membershipSchemaVersion:2,ucn:code,name:'Asteria'}) {
  const store=new Map([['campaigns/c',campaign]]);
  const db={
    store,
    doc(path){return {path};},
    async runTransaction(callback){
      const writes=[];
      const tx={
        async get(ref){const exists=store.has(ref.path);return {exists,data:()=>structuredClone(store.get(ref.path))};},
        create(ref,data){
          if(store.has(ref.path)) throw new Error('already exists');
          writes.push([ref.path,structuredClone(data)]);
        },
        set(ref,data){writes.push([ref.path,structuredClone(data)]);}
      };
      const result=await callback(tx);
      for(const [path,data] of writes) store.set(path,data);
      return result;
    }
  };
  return db;
}
const submit=(db,uid='alice',characterId=null,other={})=>
  campaignJoinRequest(db,uid,{action:'submit',campaignId:'c',ucn:code,characterId},other);
const status=(db,uid='alice')=>campaignJoinRequest(db,uid,{action:'status',campaignId:'c',ucn:code});

test('request can be viewed without creating membership or joining any campaign',async()=>{
  const db=fixture();
  assert.deepEqual(await status(db),{campaignId:'c',status:'none',requestedCharacterId:null,alreadyExists:false});
  assert.equal(db.store.size,1);
});
test('one user creates one pending request and duplicate submission is idempotent',async()=>{
  const db=fixture();
  const first=await submit(db);
  assert.deepEqual(first,{campaignId:'c',status:'pending',requestedCharacterId:null,alreadyExists:false});
  const again=await submit(db);
  assert.equal(again.alreadyExists,true);
  assert.equal(again.status,'pending');
  assert.equal(db.store.get('campaigns/c/joinRequests/alice').revision,1);
  assert.equal(db.store.get('campaignJoinRequestThrottle/alice').created,1);
  assert.deepEqual(db.store.get('campaigns/c'),{ownerUid:'gm',membershipSchemaVersion:2,ucn:code,name:'Asteria'});
  assert.equal(db.store.has('campaigns/c/members/alice'),false);
});
test('selected character must exist and belong to the requesting account',async()=>{
  const db=fixture();
  await assert.rejects(submit(db,'alice','missing'),/not owned/);
  db.store.set('users/alice/characters/hero',{id:'hero',ownerUid:'bob',xp:999});
  await assert.rejects(submit(db,'alice','hero'),/not owned/);
  db.store.set('users/alice/characters/hero',{id:'hero',ownerUid:'alice',xp:999,inventory:['sword']});
  const result=await submit(db,'alice','hero');
  assert.equal(result.requestedCharacterId,'hero');
  assert.equal(db.store.get('users/alice/characters/hero').xp,999);
  assert.equal(db.store.get('campaigns/c/joinRequests/alice').requestedCharacterId,'hero');
  assert.equal(db.store.has('campaigns/c/characters/hero'),false);
});
test('owner, existing member and inactive member cannot create new pending join requests',async()=>{
  const db=fixture();
  assert.equal((await submit(db,'gm')).status,'member');
  db.store.set('campaigns/c/members/alice',{uid:'alice',campaignId:'c',role:'player',status:'active'});
  assert.equal((await submit(db)).status,'member');
  for(const memberStatus of ['banned','removed','suspended']){
    db.store.set('campaigns/c/members/alice',{uid:'alice',campaignId:'c',role:'player',status:memberStatus});
    assert.equal((await submit(db)).status,'blocked');
  }
  assert.equal(db.store.has('campaigns/c/joinRequests/alice'),false);
});
test('terminal request statuses are never resurrected by another UCN request',async()=>{
  const db=fixture();
  for(const state of ['approved','declined','cancelled','expired']){
    db.store.set('campaigns/c/joinRequests/alice',{uid:'alice',campaignId:'c',status:state,revision:3,requestedCharacterId:'hero'});
    const result=await submit(db);
    assert.equal(result.status,state);
    assert.equal(result.alreadyExists,true);
    assert.equal(db.store.get('campaigns/c/joinRequests/alice').revision,3);
  }
});
test('legacy campaigns, mismatched code and unknown schema cannot create requests',async()=>{
  for(const version of [undefined,1,3]){
    const db=fixture({ownerUid:'gm',ucn:code,membershipSchemaVersion:version});
    await assert.rejects(submit(db),/unavailable/);
    assert.equal(db.store.size,1);
  }
  const db=fixture();
  await assert.rejects(campaignJoinRequest(db,'alice',{action:'submit',campaignId:'c',ucn:'111111111111'}),/unavailable/);
});
test('malformed input or missing authentication fails closed',async()=>{
  const db=fixture();
  for(const uid of ['',undefined,'invalid/uid'])await assert.rejects(campaignJoinRequest(db,uid,{action:'submit',campaignId:'c',ucn:code}),/Sign in/);
  await assert.rejects(campaignJoinRequest(db,'alice',{action:'submit',campaignId:'../x',ucn:code}),/Verify/);
  await assert.rejects(submit(db,'alice','../hero'),/valid owned character/);
  assert.equal(db.store.size,1);
});
test('daily throttle limits new requests but repeated pending request does not count again',async()=>{
  const db=fixture();
  db.store.set('campaignJoinRequestThrottle/alice',{windowStartedAtMs:100000,created:10});
  await assert.rejects(submit(db,'alice',null,{now:new Date(100001)}),/limit reached/);
  assert.equal(db.store.has('campaigns/c/joinRequests/alice'),false);
  const created=await submit(db,'alice',null,{now:new Date(100000+86401000)});
  assert.equal(created.status,'pending');
  assert.equal(db.store.get('campaignJoinRequestThrottle/alice').created,1);
  assert.equal((await submit(db)).alreadyExists,true);
});
test('existing forged request identities and membership records are refused',async()=>{
  const db=fixture();
  db.store.set('campaigns/c/joinRequests/alice',{uid:'bob',campaignId:'c',status:'pending'});
  await assert.rejects(submit(db),/needs review/);
  db.store.delete('campaigns/c/joinRequests/alice');
  db.store.set('campaigns/c/members/alice',{uid:'bob',campaignId:'c',role:'player',status:'active'});
  await assert.rejects(submit(db),/needs review/);
});

test('closed campaigns reject new requests but preserve previously pending requests',async()=>{
  const db=fixture({ownerUid:'gm',membershipSchemaVersion:2,ucn:code,joinPolicy:{joinRequestsOpen:false}});
  assert.equal((await status(db)).status,'closed');
  await assert.rejects(submit(db),/not accepting/);
  db.store.set('campaigns/c/joinRequests/alice',{uid:'alice',campaignId:'c',status:'pending',requestedCharacterId:null});
  assert.equal((await status(db)).status,'pending');
  assert.equal(db.store.has('campaigns/c/members/alice'),false);
});
