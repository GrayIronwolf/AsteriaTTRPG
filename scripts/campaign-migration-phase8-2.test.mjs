import test from 'node:test';
import assert from 'node:assert/strict';
import {rehearseLegacyCampaignMigration,assertDemoMigrationTarget}
  from '../functions/campaignMigrationRehearsal.mjs';
import {createHash} from 'node:crypto';

const now=new Date('2026-11-09T00:00:00.000Z');
const copy=x=>structuredClone(x);
const digest=(uid,id)=>createHash('sha256').update(uid+'\0'+id).digest('hex');
function fixture({
  projectId='demo-asteria',host='127.0.0.1:8080',
  campaignChanges={},changes={}
}={}){
  const campaign={
    id:'c',name:'Legacy Party',ownerUid:'gm',ucn:'123456789012',
    gmUids:['gm'],playerUids:['alice'],roles:{gm:'gm',alice:'player'},
    players:{gm:{uid:'gm',status:'active',characterIds:[]},
      alice:{uid:'alice',status:'active',characterIds:['a']}},
    party:['a'],
    playerCharacterLinks:{a:'alice'},
    characters:{a:{ownerUid:'alice',sourceCharacterId:'a',level:7}}
  };
  const store=new Map(Object.entries({
    'campaigns/c':{...campaign,...campaignChanges},
    'campaignInvites/123456789012':{
      campaignId:'c',ucn:'123456789012',ownerUid:'gm',status:'active'
    },
    'campaigns/c/characters/a':{id:'a',ownerUid:'alice',
      sourceCharacterId:'a',name:'Hero',xp:1234,inventory:[{id:'sword'}]},
    'users/alice/characters/a':{id:'a',ownerUid:'alice',
      sourceCharacterId:'a',campaignCharacterIds:{c:'a'},
      name:'Hero',xp:1234,inventory:[{id:'sword'}]},
    ...changes
  }).map(([k,v])=>[k,copy(v)]));
  let writes=0;
  const db={
    app:{options:{projectId}},
    doc(path){return {path,id:path.split('/').at(-1)};},
    collection(path){
      return {path,limit(n){return {path,limit:n};}};
    },
    async runTransaction(fn){
      const operations=[];
      const tx={
        async get(ref){
          if(ref.limit!==undefined){
            const prefix=ref.path+'/';
            const docs=[...store].filter(([key])=>
              key.startsWith(prefix)&&key.slice(prefix.length).split('/').length===1)
              .sort(([a],[b])=>a.localeCompare(b))
              .slice(0,ref.limit)
              .map(([key,value])=>({id:key.split('/').at(-1),data:()=>copy(value)}));
            return {docs,size:docs.length};
          }
          const value=store.get(ref.path);
          return {id:ref.id,exists:store.has(ref.path),data:()=>copy(value)};
        },
        create(ref,value){operations.push({path:ref.path,value:copy(value)});}
      };
      const result=await fn(tx);
      for(const op of operations){
        if(store.has(op.path))throw Error('Already exists');
      }
      for(const op of operations){
        store.set(op.path,op.value);writes++;
      }
      return result;
    }
  };
  // Test harness attaches emulator origin only via process.env.
  return {db,store,host,get writes(){return writes;}};
}
async function run(f,stage=false,uid='gm'){
  const previous=process.env.FIRESTORE_EMULATOR_HOST;
  if(f.host===null)delete process.env.FIRESTORE_EMULATOR_HOST;
  else process.env.FIRESTORE_EMULATOR_HOST=f.host;
  try{return await rehearseLegacyCampaignMigration(f.db,uid,'c',{stage,now});}
  finally{
    if(previous===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST=previous;
  }
}
test('read-only audit reports deterministic identities and does not leak sheet or invitation secrets',async()=>{
  const f=fixture();
  const original=copy([...f.store]);
  const r=await run(f);
  assert.equal(r.mode,'dry-run');
  assert.equal(r.readyToStage,true);
  assert.equal(r.readyForActivation,false);
  assert.deepEqual(r.members,{total:2,missing:2});
  assert.deepEqual(r.characters,{total:1,verified:1,missingCanonicalLinks:1,privateMappingsToReview:0});
  assert.equal(r.directory.missing,true);
  assert.equal(r.issues.length,0);
  assert.equal(f.writes,0);
  assert.deepEqual([...f.store],original);
  assert.doesNotMatch(JSON.stringify(r),/alice|sword|1234|123456789012|token|recipientEmail/i);
});
test('owner-only audit; no actor-supplied role or access escalation',async()=>{
  const f=fixture();
  await assert.rejects(run(f,false,'alice'),/verified campaign owner/);
  await assert.rejects(run(f,true,'alice'),/verified campaign owner/);
  assert.equal(f.writes,0);
});
test('write mode is categorically rejected outside the named local emulator',async()=>{
  for(const options of [
    {projectId:'asteria-ttrpg'},
    {host:'firebase.google.com:8080'},
    {host:null}
  ]){
    const f=fixture(options);
    await assert.rejects(run(f,true),/demo-asteria Firestore emulator/);
    assert.equal(f.writes,0);
  }
  assert.throws(()=>assertDemoMigrationTarget({app:{options:{projectId:'prod'}}},'localhost:8080'),/demo-asteria/);
});
test('emulator rehearsal creates only missing canonical records, directory and link reservation',async()=>{
  const f=fixture();
  const originals=Object.fromEntries([...f.store]);
  const result=await run(f,true);
  assert.deepEqual(result.staged,{members:2,links:1,reservations:1,directory:1});
  assert.equal(f.store.get('campaigns/c').membershipSchemaVersion,undefined);
  assert.equal(f.store.get('campaigns/c/members/alice').status,'active');
  assert.equal(f.store.get('campaigns/c/members/gm').role,'owner');
  assert.equal(f.store.get('campaignDirectory/123456789012').campaignId,'c');
  const id=digest('alice','a');
  const link=f.store.get('campaigns/c/characterLinks/'+id);
  assert.equal(link.origin,'legacy-migration');
  assert.equal(link.campaignCharacterId,'a');
  assert.equal(f.store.get('campaigns/c/characterLinkKeys/'+id).sourceCharacterId,'a');
  for(const [path,data] of Object.entries(originals))
    assert.deepEqual(f.store.get(path),data,'no existing document may be modified: '+path);
  assert.equal(f.store.has('campaigns/c/auditEvents/phase8-2'),false);
  assert.equal(f.store.has('campaignMemberProjections/alice/campaigns/c'),false);
  assert.equal(f.store.has('campaigns/c/invitations/a'),false);
  assert.equal(f.store.get('users/alice/characters/a').xp,1234);
  assert.deepEqual(f.store.get('users/alice/characters/a').inventory,[{id:'sword'}]);
  const repeat=await run(f,true);
  assert.deepEqual(repeat.staged,{members:0,links:0,reservations:0,directory:0});
  assert.equal(repeat.readyForActivation,true);
  assert.equal(f.writes,6);
});
test('revoked account stays inactive and member conflicts block all writes',async()=>{
  const f=fixture({campaignChanges:{
    playerUids:['alice','bob'],
    roles:{gm:'gm',alice:'player',bob:'player'},
    players:{alice:{status:'active',characterIds:['a']},bob:{status:'banned'}}
  },changes:{'campaigns/c/members/bob':{
    uid:'bob',campaignId:'c',role:'player',status:'active',revision:8
  }}});
  const r=await run(f);
  assert.equal(r.readyToStage,false);
  assert.ok(r.issues.some(x=>x.code==='staged-member-conflict'));
  await assert.rejects(run(f,true),/blocked/);
  assert.equal(f.writes,0);
  assert.equal(f.store.get('campaigns/c/members/bob').revision,8);
});
test('ambiguous legacy character owner refuses staging without claiming an account',async()=>{
  const f=fixture({campaignChanges:{playerCharacterLinks:{}}});
  const r=await run(f);
  assert.equal(r.readyToStage,false);
  assert.ok(r.issues.some(x=>x.code==='missing-verified-character-owner'));
  await assert.rejects(run(f,true),/blocked/);
  assert.equal(f.writes,0);
});
test('private sheets cannot be claimed by matching name or a conflicting source mapping',async()=>{
  for(const sheet of [
    {id:'a',ownerUid:'bob',sourceCharacterId:'a',name:'Hero'},
    {id:'a',ownerUid:'alice',sourceCharacterId:'a',
      campaignCharacterIds:{c:'different'}},
    null
  ]){
    const changes={'users/alice/characters/a':sheet};
    const f=fixture({changes});
    if(sheet===null)f.store.delete('users/alice/characters/a');
    const r=await run(f);
    assert.ok(r.issues.some(x=>x.code==='private-character-identity-or-map-conflict'));
    await assert.rejects(run(f,true),/blocked/);
    assert.equal(f.writes,0);
  }
});
test('private mapping gaps and historical private invites require manual reconciliation',async()=>{
  const f=fixture({campaignChanges:{
    invites:[{email:'recipient@example.com',token:'sensitive-secret'}]
  },changes:{'users/alice/characters/a':{
    id:'a',ownerUid:'alice',sourceCharacterId:'a',xp:1234
  }}});
  const r=await run(f);
  assert.equal(r.readyToStage,true);
  assert.equal(r.readyForActivation,false);
  assert.ok(r.warnings.some(x=>x.code==='private-character-mapping-requires-review'));
  assert.ok(r.warnings.some(x=>x.code==='legacy-private-invites-require-review'));
  assert.doesNotMatch(JSON.stringify(r),/recipient@example.com|sensitive-secret/);
  await assert.rejects(run(f,true),/blocked/);
  assert.equal(f.writes,0);
});
test('mismatched, disabled or duplicate UCN directory blocks rehearsal',async()=>{
  for(const record of [
    {campaignId:'other',ownerUid:'gm',status:'active'},
    {campaignId:'c',ownerUid:'gm',status:'closed'},
    {campaignId:'c',ownerUid:'wrong-owner',status:'active'}
  ]){
    const f=fixture({changes:{'campaignDirectory/123456789012':record}});
    const r=await run(f);
    assert.ok(r.issues.some(x=>x.code==='directory-identity-or-status-conflict'));
    await assert.rejects(run(f,true),/blocked/);
  }
});
test('v2 and unknown schema never restage, reset, overwrite, or downgrade',async()=>{
  for(const version of [2,3,'2']){
    const f=fixture({campaignChanges:{membershipSchemaVersion:version}});
    const r=await run(f);
    assert.equal(r.readyToStage,false);
    await assert.rejects(run(f,true),/blocked/);
    assert.equal(f.writes,0);
  }
});
test('legacy duplicate owned source ID across distinct account owners is not conflated',async()=>{
  const f=fixture({campaignChanges:{
    playerUids:['alice','bob'],
    roles:{gm:'gm',alice:'player',bob:'player'},
    players:{alice:{characterIds:['a']},bob:{characterIds:['b']}},
    party:['a','b'],
    playerCharacterLinks:{a:'alice',b:'bob'},
    characters:{
      a:{ownerUid:'alice',sourceCharacterId:'shared'},
      b:{ownerUid:'bob',sourceCharacterId:'shared'}
    }
  },changes:{
    'campaigns/c/characters/a':{id:'a',ownerUid:'alice',sourceCharacterId:'shared',xp:42},
    'campaigns/c/characters/b':{id:'b',ownerUid:'bob',sourceCharacterId:'shared',xp:48},
    'users/alice/characters/shared':{
      id:'shared',ownerUid:'alice',campaignCharacterIds:{c:'a'},xp:42
    },
    'users/bob/characters/shared':{
      id:'shared',ownerUid:'bob',campaignCharacterIds:{c:'b'},xp:48
    }
  }});
  f.store.delete('users/alice/characters/a');
  const r=await run(f,true);
  assert.equal(r.staged.links,2);
  assert.equal(f.store.get('campaigns/c/characterLinks/'+digest('alice','shared')).campaignCharacterId,'a');
  assert.equal(f.store.get('campaigns/c/characterLinks/'+digest('bob','shared')).campaignCharacterId,'b');
});
