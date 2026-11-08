import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeCampaignMemberRole,setCampaignCoGmPermission,listCampaignMembershipActivity} from '../functions/campaignRolePermissions.mjs';
import {listCampaignPlayerRoster} from '../functions/campaignPlayerRoster.mjs';

const base={ownerUid:'gm',membershipSchemaVersion:2,membershipRevision:1,playerLimit:2,name:'Asteria'};
function fixture(campaign=base){
  const store=new Map([['campaigns/c',structuredClone(campaign)]]);
  const read=ref=>{
    if(ref.path&&ref.isQuery){
      let docs=[...store].filter(([p,d])=>p.startsWith(ref.path+'/')&&!p.slice(ref.path.length+1).includes('/')&&
        (!ref.filter||d[ref.filter[0]]===ref.filter[2])).map(([p,d])=>({id:p.slice(ref.path.length+1),data:()=>structuredClone(d)}));
      if(ref.sort)docs.sort((a,b)=>{
        const av=a.data()[ref.sort[0]],bv=b.data()[ref.sort[0]];
        return String(ref.sort[1]==='desc'?bv:av).localeCompare(String(ref.sort[1]==='desc'?av:bv));
      });
      if(ref.max)docs=docs.slice(0,ref.max);
      return {docs,size:docs.length};
    }
    return {exists:store.has(ref.path),data:()=>structuredClone(store.get(ref.path))};
  };
  const db={
    store,doc:path=>({path,get:async()=>read({path})}),
    collection:path=>({path,isQuery:true,
      where(k,op,v){return {...this,filter:[k,op,v]};},
      orderBy(k,order){return {...this,sort:[k,order]};},
      limit(n){return {...this,max:n};},
      async get(){return read(this);}
    }),
    async runTransaction(fn){
      const writes=[];
      const tx={
        get:async ref=>read(ref),
        update(ref,patch){if(!store.has(ref.path))throw Error('missing');writes.push([ref.path,{...store.get(ref.path),...structuredClone(patch)}]);},
        create(ref,doc){if(store.has(ref.path)||writes.some(w=>w[0]===ref.path))throw Error('already exists');writes.push([ref.path,structuredClone(doc)]);}
      };
      const result=await fn(tx);
      for(const [p,v] of writes)store.set(p,v);
      return result;
    }
  };
  return db;
}
function member(db,uid,role='player',status='active',revision=1,capabilityOverrides={}){
  const m={uid,campaignId:'c',role,status,revision,capabilityOverrides};
  db.store.set('campaigns/c/members/'+uid,m);
  db.store.set('campaignMemberProjections/'+uid+'/campaigns/c',{campaignId:'c',role,status});
}
const role=(db,actor='gm',uid='alice',newRole='co-gm',revision=1,previousRole='player')=>
  changeCampaignMemberRole(db,actor,{campaignId:'c',memberUid:uid,newRole,
    expectedRevision:revision,expectedRole:previousRole,expectedStatus:'active'});
const permission=(db,actor='gm',uid='co',capability='review-join-requests',enabled=true,revision=1)=>
  setCampaignCoGmPermission(db,actor,{campaignId:'c',memberUid:uid,capability,enabled,
    expectedRevision:revision,expectedRole:'co-gm',expectedStatus:'active'});

test('owner promotes Player into Co-GM and updates projection and history atomically',async()=>{
  const db=fixture();member(db,'alice');
  const result=await role(db);
  assert.equal(result.role,'co-gm');
  assert.equal(db.store.get('campaigns/c/members/alice').role,'co-gm');
  assert.equal(db.store.get('campaignMemberProjections/alice/campaigns/c').role,'co-gm');
  assert.deepEqual(db.store.get('campaigns/c/members/alice').capabilityOverrides,{});
  assert.equal(db.store.get('campaigns/c/membershipRoleEvents/alice-2').kind,'role');
  assert.equal(db.store.get('campaigns/c').membershipRevision,2);
  assert.equal((await role(db)).alreadyApplied,true);
});

test('demotion clears all Co-GM capabilities and respects player capacity',async()=>{
  const db=fixture({...base,playerLimit:1});member(db,'alice','co-gm');member(db,'bob','player');
  db.store.get('campaigns/c/members/alice').capabilityOverrides={'moderate-members':true};
  await assert.rejects(role(db,'gm','alice','player',1,'co-gm'),/capacity/);
  assert.equal(db.store.get('campaigns/c/members/alice').role,'co-gm');
  db.store.get('campaigns/c/members/bob').status='removed';
  db.store.get('campaignMemberProjections/bob/campaigns/c').status='removed';
  const result=await role(db,'gm','alice','player',1,'co-gm');
  assert.equal(result.role,'player');
  assert.deepEqual(db.store.get('campaigns/c/members/alice').capabilityOverrides,{});
  assert.equal(db.store.get('campaignMemberProjections/alice/campaigns/c').role,'player');
});

test('only owner can change roles, never themselves or inactive accounts',async()=>{
  const db=fixture();member(db,'alice');member(db,'co','co-gm');member(db,'gm','owner');
  await assert.rejects(role(db,'co'),/campaign owner/);
  await assert.rejects(role(db,'alice'),/campaign owner/);
  await assert.rejects(role(db,'gm','gm'),/own role/);
  db.store.get('campaigns/c/members/alice').status='suspended';
  db.store.get('campaignMemberProjections/alice/campaigns/c').status='suspended';
  await assert.rejects(role(db),/Inactive members/);
});

test('owner delegates independent Co-GM permissions with revision checks',async()=>{
  const db=fixture();member(db,'co','co-gm');
  const first=await permission(db);
  assert.equal(first.enabled,true);
  assert.equal(db.store.get('campaigns/c/members/co').capabilityOverrides['review-join-requests'],true);
  assert.equal((await permission(db)).alreadyApplied,true);
  await assert.rejects(permission(db,'gm','co','moderate-members',true,1),/Refresh/);
  await permission(db,'gm','co','moderate-members',true,2);
  const flags=db.store.get('campaigns/c/members/co').capabilityOverrides;
  assert.equal(flags['review-join-requests'],true);
  assert.equal(flags['moderate-members'],true);
  await permission(db,'gm','co','review-join-requests',false,3);
  assert.equal(db.store.get('campaigns/c/members/co').capabilityOverrides['review-join-requests'],false);
});

test('delegation blocks players, inactive co-GMs, invalid capabilities and v1 campaigns',async()=>{
  const db=fixture();member(db,'alice');member(db,'co','co-gm','suspended');
  await assert.rejects(permission(db,'gm','alice'),/Only active Co-GMs/);
  await assert.rejects(permission(db,'gm','co'),/Only active Co-GMs/);
  await assert.rejects(permission(db,'alice','co'),/campaign owner/);
  await assert.rejects(permission(db,'gm','co','edit-campaign'),/Invalid delegated/);
  db.store.get('campaigns/c').membershipSchemaVersion=1;
  await assert.rejects(role(db),/upgraded campaign/);
});

test('stale revision, projection mismatch and protected owner cannot gain privileges',async()=>{
  const db=fixture();member(db,'alice');
  await assert.rejects(role(db,'gm','alice','co-gm',9),/Refresh/);
  db.store.get('campaignMemberProjections/alice/campaigns/c').role='co-gm';
  await assert.rejects(role(db),/projection needs reconciliation/);
  assert.equal(db.store.get('campaigns/c/members/alice').role,'player');
});

test('read-only GM timeline merges role, moderation, join and capability events',async()=>{
  const db=fixture();member(db,'co','co-gm');
  await permission(db);
  db.store.set('campaigns/c/memberModerationEvents/alice-2',{
    campaignId:'c',uid:'alice',actorUid:'gm',action:'suspend',fromStatus:'active',
    toStatus:'suspended',reason:'Session issue',createdAt:new Date('2026-11-08T10:01:00Z')
  });
  db.store.set('campaigns/c/joinReviewHistory/bob',{
    campaignId:'c',uid:'bob',actorUid:'gm',decision:'approve',at:new Date('2026-11-08T10:02:00Z')
  });
  const result=await listCampaignMembershipActivity(db,'co','c');
  assert.equal(result.events.length,3);
  assert.ok(result.events.some(e=>e.type==='permission'&&e.detail.includes('enabled')));
  assert.ok(result.events.some(e=>e.type==='join'&&e.detail==='approve'));
  assert.ok(result.events.some(e=>e.type==='moderation'&&e.reason==='Session issue'));
  await assert.rejects(listCampaignMembershipActivity(db,'eve','c'),/active campaign GM/);
  db.store.get('campaigns/c/members/co').status='suspended';
  await assert.rejects(listCampaignMembershipActivity(db,'co','c'),/active campaign GM/);
});

test('roster exposes safe snapshots and only owner edit controls for canonical members',async()=>{
  const db=fixture();member(db,'alice');member(db,'co','co-gm');
  const roster=await listCampaignPlayerRoster(db,'gm','c');
  const row=roster.active.find(m=>m.uid==='co');
  assert.equal(row.roleEditable,true);
  assert.deepEqual(row.capabilities,{'review-join-requests':false,'moderate-members':false});
  const owner=roster.active.find(m=>m.uid==='gm');
  assert.equal(owner.roleEditable,false);
  const coRoster=await listCampaignPlayerRoster(db,'co','c');
  assert.equal(coRoster.active.find(m=>m.uid==='alice').roleEditable,false);
});
