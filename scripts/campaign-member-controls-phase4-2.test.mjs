import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moderateCampaignMember,allowedMemberControls} from '../functions/campaignMemberControls.mjs';
import {listCampaignPlayerRoster} from '../functions/campaignPlayerRoster.mjs';
const base={ownerUid:'gm',membershipSchemaVersion:2,playerLimit:3,membershipRevision:1,name:'Asteria',
  playerUids:['alice','bob'],gmUids:['gm','co'],roles:{gm:'gm',alice:'player',co:'gm'}};
function fixture(campaign={...base}){
  const store=new Map([['campaigns/c',structuredClone(campaign)]]);
  const db={store,doc:path=>({path}),collection:path=>({
    path,filter:null,where(k,op,v){return {...this,filter:[k,op,v]};}
  })};
  const read=ref=>{
    if(ref.filter){
      const docs=[...store.entries()].filter(([p,row])=>p.startsWith(ref.path+'/') &&
        !p.slice(ref.path.length+1).includes('/')&&row[ref.filter[0]]===ref.filter[2])
        .map(([p,row])=>({id:p.slice(ref.path.length+1),data:()=>structuredClone(row)}));
      return {docs,size:docs.length};
    }
    return {exists:store.has(ref.path),data:()=>structuredClone(store.get(ref.path))};
  };
  db.runTransaction=async fn=>{
    const writes=[];
    const tx={
      get:async ref=>read(ref),
      update(ref,patch){
        if(!store.has(ref.path))throw Error('missing document');
        writes.push([ref.path,{...store.get(ref.path),...structuredClone(patch)}]);
      },
      create(ref,value){
        if(store.has(ref.path))throw Error('duplicate');
        writes.push([ref.path,structuredClone(value)]);
      }
    };
    const result=await fn(tx);
    for(const [path,value] of writes)store.set(path,value);
    return result;
  };
  db.doc=path=>({...{path},get:async()=>read({path})});
  db.collection=path=>({...{path},
    limit(n){return {...this,max:n};},
    where(k,op,v){return {...this,filter:[k,op,v]};},
    async get(){const prefix=this.path+'/';let docs=[...store].filter(([p,data])=>p.startsWith(prefix)&&!p.slice(prefix.length).includes('/')&&
      (!this.filter||data[this.filter[0]]===this.filter[2])).map(([p,data])=>({id:p.slice(prefix.length),data:()=>structuredClone(data)}));
      if(this.max)docs=docs.slice(0,this.max);return{docs,size:docs.length};
    }
  });
  return db;
}
function seed(db,uid,role='player',status='active',revision=1,overrides={}){
  const value={uid,campaignId:'c',role,status,revision,capabilityOverrides:overrides};
  db.store.set('campaigns/c/members/'+uid,value);
  db.store.set('campaignMemberProjections/'+uid+'/campaigns/c',{campaignId:'c',role,status});
  return value;
}
const act=(db,actorUid,memberUid,action,revision=1,status='active',reason='')=>
  moderateCampaignMember(db,actorUid,{campaignId:'c',memberUid,action,expectedRevision:revision,expectedStatus:status,reason});
test('owner suspends an active player and updates member/projection in one transaction',async()=>{
  const db=fixture();seed(db,'alice');
  const result=await act(db,'gm','alice','suspend');
  assert.equal(result.status,'suspended');
  assert.equal(db.store.get('campaigns/c/members/alice').status,'suspended');
  assert.equal(db.store.get('campaignMemberProjections/alice/campaigns/c').status,'suspended');
  assert.equal(db.store.get('campaigns/c/members/alice').revision,2);
  assert.equal(db.store.get('campaigns/c/memberModerationEvents/alice-2').action,'suspend');
  assert.equal(db.store.get('campaigns/c').membershipRevision,2);
  assert.equal((await act(db,'gm','alice','suspend')).alreadyApplied,true);
});
test('remove and ban are tombstones and never delete gameplay or account records',async()=>{
  const db=fixture();seed(db,'alice');
  db.store.set('campaigns/c/characters/a',{ownerUid:'alice',xp:777,inventory:[{id:'sword'}]});
  db.store.set('users/alice/characters/a',{ownerUid:'alice',xp:777,coins:123});
  const original=[structuredClone(db.store.get('campaigns/c/characters/a')),structuredClone(db.store.get('users/alice/characters/a'))];
  await act(db,'gm','alice','remove',1,'active','Left the party');
  assert.equal(db.store.get('campaigns/c/members/alice').status,'removed');
  assert.equal(db.store.get('campaignMemberProjections/alice/campaigns/c').status,'removed');
  await act(db,'gm','alice','ban',2,'removed','Repeated abuse');
  assert.equal(db.store.get('campaigns/c/members/alice').status,'banned');
  assert.deepEqual(db.store.get('campaigns/c/characters/a'),original[0]);
  assert.deepEqual(db.store.get('users/alice/characters/a'),original[1]);
});
test('restore enforces player capacity and cannot bypass projection consistency',async()=>{
  const db=fixture({...base,playerLimit:1});
  seed(db,'alice','player','suspended');seed(db,'bob','player','active');
  await assert.rejects(act(db,'gm','alice','restore',1,'suspended'),/capacity/);
  assert.equal(db.store.get('campaigns/c/members/alice').status,'suspended');
  db.store.get('campaigns/c/members/bob').status='removed';
  db.store.get('campaignMemberProjections/bob/campaigns/c').status='removed';
  assert.equal((await act(db,'gm','alice','restore',1,'suspended')).status,'active');
  assert.equal(db.store.get('campaignMemberProjections/alice/campaigns/c').status,'active');
});
test('owner and self moderation are prohibited',async()=>{
  const db=fixture();seed(db,'gm','owner');seed(db,'alice');
  await assert.rejects(act(db,'gm','gm','suspend'),/protected/);
  await assert.rejects(act(db,'alice','alice','suspend'),/protected/);
  await assert.rejects(act(db,'alice','gm','suspend'),/protected/);
});
test('ordinary player and legacy GM array cannot moderate canonical accounts',async()=>{
  const db=fixture();seed(db,'alice');seed(db,'bob');seed(db,'co','co-gm','suspended');
  await assert.rejects(act(db,'bob','alice','suspend'),/authorised GM/);
  await assert.rejects(act(db,'co','alice','suspend'),/authorised GM/);
  db.store.get('campaigns/c').membershipSchemaVersion=1;
  await assert.rejects(act(db,'gm','alice','suspend'),/upgraded campaign/);
});
test('delegated active Co-GM can suspend/remove ordinary player but not ban or moderate Co-GMs',async()=>{
  const db=fixture();seed(db,'alice');seed(db,'bob');seed(db,'co','co-gm','active',1,{'moderate-members':true});
  seed(db,'other-co','co-gm');
  assert.deepEqual(allowedMemberControls(db.store.get('campaigns/c'),'co',db.store.get('campaigns/c/members/co'),db.store.get('campaigns/c/members/alice')),['suspend','remove']);
  assert.equal((await act(db,'co','alice','suspend')).status,'suspended');
  await assert.rejects(act(db,'co','bob','ban',1,'active','Abuse reported'),/authorised GM/);
  await assert.rejects(act(db,'co','other-co','suspend'),/authorised GM/);
  assert.equal((await act(db,'gm','other-co','suspend')).status,'suspended');
});
test('stale revision, forged status, mismatched projection and missing projection fail closed',async()=>{
  const db=fixture();seed(db,'alice');
  await assert.rejects(act(db,'gm','alice','suspend',2),/Refresh/);
  await assert.rejects(act(db,'gm','alice','suspend',1,'removed'),/cannot be changed|Refresh/);
  db.store.get('campaignMemberProjections/alice/campaigns/c').status='removed';
  await assert.rejects(act(db,'gm','alice','suspend'),/out of sync/);
  db.store.delete('campaignMemberProjections/alice/campaigns/c');
  await assert.rejects(act(db,'gm','alice','suspend'),/reconciliation/);
});
test('banned member may only be restored by owner, and remove/ban require reasons',async()=>{
  const db=fixture();seed(db,'alice','player','banned');seed(db,'co','co-gm','active',1,{'moderate-members':true});
  assert.deepEqual(allowedMemberControls(db.store.get('campaigns/c'),'co',db.store.get('campaigns/c/members/co'),db.store.get('campaigns/c/members/alice')),[]);
  await assert.rejects(act(db,'co','alice','restore',1,'banned'),/authorised GM/);
  await assert.rejects(act(db,'gm','alice','remove',1,'banned','because'),/cannot be changed/);
  await assert.rejects(act(db,'gm','alice','ban',1,'banned',''),/reason/);
  assert.equal((await act(db,'gm','alice','restore',1,'banned')).status,'active');
});
test('roster controls are generated by server and do not expose actions to ordinary player',async()=>{
  const db=fixture();seed(db,'alice');seed(db,'bob');seed(db,'co','co-gm','active',1,{'moderate-members':true});
  const owner=await listCampaignPlayerRoster(db,'gm','c');
  assert.deepEqual(owner.active.find(x=>x.uid==='alice').controls,['suspend','remove','ban']);
  const co=await listCampaignPlayerRoster(db,'co','c');
  assert.deepEqual(co.active.find(x=>x.uid==='alice').controls,['suspend','remove']);
  assert.deepEqual(co.active.find(x=>x.uid==='gm').controls,[]);
});
