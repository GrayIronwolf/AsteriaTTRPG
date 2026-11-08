import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignCharacterLink} from '../functions/campaignCharacterLinks.mjs';

function fixture(overrides={}){
  const campaign={id:'c',ownerUid:'gm',membershipSchemaVersion:2,
    partySize:4,settings:{allowPlayerLinkCharacter:true,allowPlayerCreateCharacter:true},...overrides};
  const store=new Map([
    ['campaigns/c',campaign],
    ['campaigns/c/members/alice',{uid:'alice',campaignId:'c',role:'player',status:'active',revision:1}],
    ['campaignMemberProjections/alice/campaigns/c',{campaignId:'c',role:'player',status:'active'}],
    ['users/alice/characters/hero',{id:'hero',ownerUid:'alice',name:'Hero',xp:250,inventory:['sword']}]
  ]);
  const db={store,doc:path=>({path}),collection:path=>({path,isQuery:true}),
    async runTransaction(callback){
      const writes=[];
      const get=async ref=>{
        if(ref.isQuery){
          const docs=[...store].filter(([path])=>path.startsWith(ref.path+'/') &&
            !path.slice(ref.path.length+1).includes('/')).map(([path,data])=>({
              id:path.slice(ref.path.length+1),data:()=>structuredClone(data)
            }));
          return {docs,size:docs.length};
        }
        return {exists:store.has(ref.path),data:()=>structuredClone(store.get(ref.path))};
      };
      const tx={get,create(ref,data){
        if(store.has(ref.path)||writes.some(([path])=>path===ref.path))throw Error('Already exists');
        writes.push([ref.path,structuredClone(data)]);
      }};
      const result=await callback(tx);
      for(const [path,data] of writes)store.set(path,data);
      return result;
    }
  };
  return db;
}
const request=(db,uid='alice',id='hero',sourceKind='owned',action='request')=>
  campaignCharacterLink(db,uid,{action,campaignId:'c',sourceCharacterId:id,sourceKind});

test('owner-verified saved character creates pending request and immutable private sheet',async()=>{
  const db=fixture(),before=structuredClone(db.store.get('users/alice/characters/hero'));
  const result=await request(db);
  assert.equal(result.status,'pending');
  assert.equal(result.alreadyExists,false);
  assert.ok(result.campaignCharacterId.startsWith('linkchar-'));
  assert.deepEqual(db.store.get('users/alice/characters/hero'),before);
  assert.equal(db.store.get('campaigns/c').party,undefined);
  assert.equal([...db.store.keys()].some(p=>p.startsWith('campaigns/c/characters/')),false);
  const link=[...db.store].find(([path])=>path.startsWith('campaigns/c/characterLinks/'));
  assert.equal(link[1].sourceCharacterId,'hero');
  assert.equal(db.store.has('campaigns/c/auditEvents/character-link-'+link[1].linkId),true);
});
test('idempotent retry and status create no extra writes',async()=>{
  const db=fixture();
  const first=await request(db),size=db.store.size;
  const second=await request(db),status=await request(db,'alice','hero','owned','status');
  assert.equal(first.campaignCharacterId,second.campaignCharacterId);
  assert.equal(second.alreadyExists,true);
  assert.equal(status.status,'pending');
  assert.equal(db.store.size,size);
  assert.equal((await request(fixture(),'alice','hero','owned','status')).status,'none');
});
test('unapproved and inactive members cannot request links',async()=>{
  for(const status of ['suspended','removed','banned']){
    const db=fixture();
    db.store.get('campaigns/c/members/alice').status=status;
    db.store.get('campaignMemberProjections/alice/campaigns/c').status=status;
    await assert.rejects(request(db),/Active campaign membership/);
  }
  const db=fixture();
  db.store.delete('campaigns/c/members/alice');
  await assert.rejects(request(db),/Active campaign membership/);
});
test('cannot spoof another owner or source record',async()=>{
  const db=fixture();
  await assert.rejects(request(db,'bob'),/Active campaign membership/);
  db.store.get('users/alice/characters/hero').ownerUid='bob';
  await assert.rejects(request(db),/not owned/);
  db.store.get('users/alice/characters/hero').ownerUid='alice';
  db.store.get('users/alice/characters/hero').sourceCharacterId='another';
  await assert.rejects(request(db),/not owned/);
});
test('legacy campaigns and account-projection mismatches fail closed',async()=>{
  await assert.rejects(request(fixture({membershipSchemaVersion:1})),/upgraded campaign/);
  const db=fixture();
  db.store.get('campaignMemberProjections/alice/campaigns/c').role='co-gm';
  await assert.rejects(request(db),/reconciliation/);
});
test('campaign settings deny link and new-forge requests',async()=>{
  await assert.rejects(request(fixture({settings:{allowPlayerLinkCharacter:false}})),/disabled character linking/);
  await assert.rejects(request(fixture({settings:{allowPlayerCreateCharacter:false}}),'alice','hero','forge'),/disabled new characters/);
});
test('capacity counts pending reservations and blocks new requests',async()=>{
  const db=fixture({capacity:{maxActiveCharacters:1,maxCharactersPerPlayer:1}});
  await request(db);
  db.store.set('users/alice/characters/second',{id:'second',ownerUid:'alice'});
  await assert.rejects(request(db,'alice','second'),/capacity|limit/);
});
test('duplicate legacy link is blocked without overwriting gameplay',async()=>{
  const db=fixture({party:['hero'],playerCharacterLinks:{hero:'alice'},
    characters:{hero:{ownerUid:'alice',sourceCharacterId:'hero',xp:900}}});
  await assert.rejects(request(db),/legacy campaign link/);
  assert.equal(db.store.get('campaigns/c').characters.hero.xp,900);
});
test('tampered key or link cannot be used for an additional request',async()=>{
  const db=fixture();
  await request(db);
  const key=[...db.store.keys()].find(p=>p.includes('/characterLinkKeys/'));
  db.store.get(key).ownerUid='mallory';
  await assert.rejects(request(db),/reservation does not match/);
});
test('different accounts may use same source character ID without collision',async()=>{
  const db=fixture();
  db.store.set('campaigns/c/members/bob',{uid:'bob',campaignId:'c',role:'player',status:'active',revision:1});
  db.store.set('campaignMemberProjections/bob/campaigns/c',{campaignId:'c',role:'player',status:'active'});
  db.store.set('users/bob/characters/hero',{id:'hero',ownerUid:'bob'});
  const a=await request(db),b=await request(db,'bob');
  assert.notEqual(a.campaignCharacterId,b.campaignCharacterId);
  assert.equal([...db.store.keys()].filter(p=>p.startsWith('campaigns/c/characterLinks/')).length,2);
});
