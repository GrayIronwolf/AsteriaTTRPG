import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listPendingCampaignJoinRequests,reviewCampaignJoinRequest,setCampaignJoinApprovalMode} from '../functions/campaignJoinApproval.mjs';
import {campaignJoinRequest} from '../functions/campaignJoinRequests.mjs';

function fixture(campaign={ownerUid:'gm',name:'Asteria',membershipSchemaVersion:2,ucn:'000000000789',playerLimit:2}) {
  const store=new Map([['campaigns/c',{...campaign}]]);
  const doc=path=>({path});
  const collection=path=>({
    path,where(field,comparison,value){return {...this,whereClause:[field,comparison,value]};},
    limit(count){return {...this,limitCount:count};}
  });
  const read=ref=>{
    if(ref.whereClause || ref.path.endsWith('/joinRequests') || ref.path.endsWith('/members')){
      const prefix=ref.path+'/';
      const docs=[...store].filter(([path,data])=>path.startsWith(prefix)&&!path.slice(prefix.length).includes('/') &&
        (!ref.whereClause||data[ref.whereClause[0]]===ref.whereClause[2]))
        .map(([path,data])=>({id:path.slice(prefix.length),data:()=>structuredClone(data)}))
        .slice(0,ref.limitCount??Infinity);
      return {docs,size:docs.length,empty:docs.length===0};
    }
    return {exists:store.has(ref.path),data:()=>structuredClone(store.get(ref.path))};
  };
  const db={store,doc,collection,
    async runTransaction(fn){
      const pending=[];
      const tx={
        get:async ref=>read(ref),
        create(ref,data){if(store.has(ref.path)||pending.some(p=>p[0]===ref.path)) throw Error('already exists');pending.push([ref.path,structuredClone(data)]);},
        set(ref,data){pending.push([ref.path,structuredClone(data)]);},
        update(ref,patch){const prev=store.get(ref.path);if(!prev)throw Error('not found');pending.push([ref.path,{...prev,...structuredClone(patch)}]);}
      };
      const result=await fn(tx);
      for(const [path,data] of pending)store.set(path,data);
      return result;
    }
  };
  db.doc=(path)=>({path,get:async()=>read({path})});
  db.collection=(path)=>({...collection(path),get:async function(){
    return read(this);
  }});
  return db;
}
const request=(db,uid='alice',characterId=null,other={})=>
  campaignJoinRequest(db,uid,{action:'submit',campaignId:'c',ucn:'000000000789',characterId},other);
const review=(db,actor='gm',uid='alice',decision='approve',expectedRevision=1)=>
  reviewCampaignJoinRequest(db,actor,{campaignId:'c',requestUid:uid,decision,expectedRevision});

test('GM owner lists sanitized pending queue; unauthorised players cannot',async()=>{
  const db=fixture();
  await request(db);
  const queue=await listPendingCampaignJoinRequests(db,'gm','c');
  assert.equal(queue.requests.length,1);
  assert.equal(queue.capacity,2);
  assert.equal(queue.activePlayers,0);
  assert.deepEqual(Object.keys(queue.requests[0]).sort(),
    ['campaignId','requestedAt','requestedCharacterId','revision','status','uid']);
  await assert.rejects(listPendingCampaignJoinRequests(db,'alice','c'),/authorised GM/);
});

test('approval atomically creates active member and private projection, never a linked character',async()=>{
  const db=fixture();
  await request(db);
  const approved=await review(db);
  assert.equal(approved.status,'approved');
  assert.equal(db.store.get('campaigns/c/members/alice').status,'active');
  assert.equal(db.store.get('campaigns/c/members/alice').role,'player');
  assert.equal(db.store.get('campaignMemberProjections/alice/campaigns/c').status,'active');
  assert.equal(db.store.get('campaigns/c/joinRequests/alice').status,'approved');
  assert.equal(db.store.has('campaigns/c/characters/hero'),false);
  assert.equal(db.store.get('campaigns/c/joinReviewHistory/alice').decision,'approve');
  assert.equal((await review(db)).alreadyReviewed,true);
});

test('decline is idempotent and never grants membership, even on repeated attempts',async()=>{
  const db=fixture();
  await request(db);
  assert.equal((await review(db,'gm','alice','decline')).status,'declined');
  assert.equal((await review(db,'gm','alice','decline')).alreadyReviewed,true);
  assert.equal(db.store.has('campaigns/c/members/alice'),false);
  assert.equal(db.store.has('campaignMemberProjections/alice/campaigns/c'),false);
  await assert.rejects(review(db),/already resolved/);
});

test('capacity excludes owner but refuses excess player approvals without partial writes',async()=>{
  const db=fixture({...fixture().store.get('campaigns/c'),playerLimit:1});
  await request(db,'alice');
  await request(db,'bob');
  assert.equal((await review(db)).status,'approved');
  await assert.rejects(review(db,'gm','bob'),/capacity/);
  assert.equal(db.store.get('campaigns/c/joinRequests/bob').status,'pending');
  assert.equal(db.store.has('campaigns/c/members/bob'),false);
});

test('stale revision, foreign reviewer and existing suspended member fail closed',async()=>{
  const db=fixture();
  await request(db);
  await assert.rejects(review(db,'alice'),/authorised GM/);
  await assert.rejects(review(db,'gm','alice','approve',999),/Refresh/);
  db.store.set('campaigns/c/members/alice',{uid:'alice',campaignId:'c',role:'player',status:'suspended'});
  await assert.rejects(review(db),/Existing membership/);
  assert.equal(db.store.get('campaigns/c/joinRequests/alice').status,'pending');
});

test('explicit Co-GM delegation grants only review capability',async()=>{
  const db=fixture();
  await request(db);
  db.store.set('campaigns/c/members/co',{uid:'co',campaignId:'c',role:'co-gm',status:'active',capabilityOverrides:{}});
  await assert.rejects(review(db,'co'),/authorised GM/);
  db.store.set('campaigns/c/members/co',{uid:'co',campaignId:'c',role:'co-gm',status:'active',
    capabilityOverrides:{'review-join-requests':true}});
  assert.equal((await review(db,'co')).status,'approved');
});

test('only owner can enable automatic approval and backend switch must allow it',async()=>{
  const db=fixture();
  await assert.rejects(setCampaignJoinApprovalMode(db,'alice','c','manual'),/owner/);
  await assert.rejects(setCampaignJoinApprovalMode(db,'gm','c','automatic'),/not enabled/);
  assert.equal((await setCampaignJoinApprovalMode(db,'gm','c','automatic',{autoAvailable:true})).approvalMode,'automatic');
  assert.equal(db.store.get('campaigns/c').joinPolicy.autoApprove,true);
  await setCampaignJoinApprovalMode(db,'gm','c','manual');
  assert.equal(db.store.get('campaigns/c').joinPolicy.autoApprove,false);
});

test('opted-in automatic mode atomically approves a new request when capacity permits',async()=>{
  const db=fixture({...fixture().store.get('campaigns/c'),joinPolicy:{autoApprove:true}});
  const result=await request(db,'alice',null,{autoApproveEnabled:true});
  assert.equal(result.status,'approved');
  assert.equal(db.store.get('campaigns/c/members/alice').status,'active');
  assert.equal(db.store.get('campaigns/c/joinReviewHistory/alice').mode,'automatic');
  assert.equal(db.store.get('campaigns/c/joinRequests/alice').reviewedByUid,'gm');
});

test('disabled auto-mode and full capacity never bypass request approval',async()=>{
  const db=fixture({...fixture().store.get('campaigns/c'),playerLimit:1,joinPolicy:{autoApprove:true}});
  const pending=await request(db,'alice');
  assert.equal(pending.status,'pending');
  const second=fixture({...fixture().store.get('campaigns/c'),playerLimit:1,joinPolicy:{autoApprove:true}});
  second.store.set('campaigns/c/members/existing',{uid:'existing',campaignId:'c',role:'player',status:'active'});
  await assert.rejects(request(second,'bob',null,{autoApproveEnabled:true}),/capacity/);
  assert.equal(second.store.has('campaigns/c/joinRequests/bob'),false);
});

test('non-v2 campaigns never accept review actions',async()=>{
  const db=fixture({ownerUid:'gm',membershipSchemaVersion:1,ucn:'000000000789'});
  await assert.rejects(listPendingCampaignJoinRequests(db,'gm','c'),/unavailable/);
  await assert.rejects(setCampaignJoinApprovalMode(db,'gm','c','manual'),/unavailable/);
});

test('request status shows approved outcome after GM activates membership',async()=>{
  const db=fixture();
  await request(db);
  await review(db);
  const status=await campaignJoinRequest(db,'alice',{action:'status',campaignId:'c',ucn:'000000000789'});
  assert.equal(status.status,'approved');
  assert.equal(status.alreadyExists,true);
});
