import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignCharacterLink} from '../functions/campaignCharacterLinks.mjs';
import {listPendingCampaignCharacterLinks,reviewCampaignCharacterLink} from '../functions/campaignCharacterApproval.mjs';
import {validateOwnedRecord} from '../src/state/ownedCharacterRecords.mjs';

function fixture(overrides={}){
  const campaign={id:'c',ownerUid:'gm',membershipSchemaVersion:2,partySize:4,
    settings:{allowPlayerLinkCharacter:true,allowPlayerCreateCharacter:true},...overrides};
  const store=new Map([
    ['campaigns/c',structuredClone(campaign)],
    ['campaigns/c/members/alice',{uid:'alice',campaignId:'c',role:'player',status:'active',revision:1}],
    ['campaignMemberProjections/alice/campaigns/c',{campaignId:'c',role:'player',status:'active'}],
    ['users/alice/characters/hero',{id:'hero',ownerUid:'alice',sourceCharacterId:'hero',
      name:'Hero',level:7,xp:345,inventory:[{name:'Sword'}],coins:{copper:120},
      backstory:'Visible biography',secretNotes:'do not disclose'}]
  ]);
  const read=ref=>{
    if(ref.isQuery){
      let docs=[...store].filter(([path,data])=>path.startsWith(ref.path+'/')&&
        !path.slice(ref.path.length+1).includes('/')&&
        (!ref.filter||data[ref.filter[0]]===ref.filter[2]))
        .map(([path,data])=>({id:path.slice(ref.path.length+1),data:()=>structuredClone(data)}));
      if(ref.max)docs=docs.slice(0,ref.max);
      return {docs,size:docs.length};
    }
    return {exists:store.has(ref.path),data:()=>structuredClone(store.get(ref.path))};
  };
  const db={
    store,doc:path=>({path,get:async()=>read({path})}),
    collection:path=>({path,isQuery:true,
      where(k,op,v){return {...this,filter:[k,op,v]};},
      limit(n){return {...this,max:n};},
      async get(){return read(this);}
    }),
    async runTransaction(callback){
      const writes=[];
      const tx={
        async get(ref){return read(ref);},
        create(ref,data){
          if(store.has(ref.path)||writes.some(([p])=>p===ref.path))throw Error('already exists');
          writes.push([ref.path,'create',structuredClone(data)]);
        },
        update(ref,patch){
          if(!store.has(ref.path))throw Error('missing');
          writes.push([ref.path,'update',structuredClone(patch)]);
        }
      };
      const result=await callback(tx);
      for(const [path,op,data] of writes){
        if(op==='create')store.set(path,data);
        else store.set(path,{...store.get(path),...data});
      }
      return result;
    }
  };
  return db;
}
async function pending(db,uid='alice',sourceId='hero'){
  await campaignCharacterLink(db,uid,{action:'request',campaignId:'c',sourceCharacterId:sourceId});
  const queue=await listPendingCampaignCharacterLinks(db,'gm','c');
  assert.equal(queue.requests.length,1);
  return queue.requests[0];
}
const review=(db,row,decision='approve',actor='gm')=>reviewCampaignCharacterLink(db,actor,{
  campaignId:'c',linkId:row.linkId,decision,expectedRevision:row.revision
});

test('GM list is restricted, bounded and exposes no private sheet fields',async()=>{
  const db=fixture();const row=await pending(db);
  assert.equal(row.ownerUid,'alice');
  assert.equal(row.sourceCharacterId,'hero');
  assert.equal(row.status,'pending');
  assert.equal(JSON.stringify(row).includes('Sword'),false);
  assert.equal(JSON.stringify(row).includes('secretNotes'),false);
  await assert.rejects(listPendingCampaignCharacterLinks(db,'alice','c'),/authorised GM/);
  await assert.rejects(listPendingCampaignCharacterLinks(db,'eve','c'),/authorised GM/);
});
test('GM approval imports gameplay under distinct ID without losing owned Forge data',async()=>{
  const db=fixture(),row=await pending(db);
  const original=structuredClone(db.store.get('users/alice/characters/hero'));
  const approved=await review(db,row);
  assert.equal(approved.status,'approved');
  const cid=approved.campaignCharacterId;
  assert.notEqual(cid,'hero');
  const shared=db.store.get('campaigns/c/characters/'+cid);
  const owned=db.store.get('users/alice/characters/hero');
  assert.equal(shared.ownerUid,'alice');
  assert.equal(shared.sourceCharacterId,'hero');
  assert.equal(shared.xp,original.xp);
  assert.deepEqual(shared.inventory,original.inventory);
  assert.deepEqual(shared.coins,original.coins);
  assert.equal(shared.secretNotes,undefined);
  assert.equal(owned.secretNotes,original.secretNotes);
  assert.equal(owned.xp,original.xp);
  assert.deepEqual(owned.inventory,original.inventory);
  assert.equal(owned.campaignCharacterIds.c,cid);
  assert.deepEqual(db.store.get('campaigns/c').party,[cid]);
  assert.equal(db.store.get('campaigns/c').playerCharacterLinks[cid],'alice');
  assert.equal(db.store.get('campaigns/c/characterLinks/'+row.linkId).status,'approved');
  assert.equal(db.store.get('campaigns/c/auditEvents/character-link-review-'+row.linkId+'-r1').decision,'approve');
  assert.equal(await validateOwnedRecord(owned,'alice',async(c,id)=>
    db.store.get('campaigns/'+c+'/characters/'+id)),true);
  assert.equal((await review(db,row)).alreadyReviewed,true);
  assert.equal(db.store.get('campaigns/c').party.length,1);
});
test('GM decline leaves saved and campaign gameplay untouched',async()=>{
  const db=fixture(),row=await pending(db);
  const original=structuredClone(db.store.get('users/alice/characters/hero'));
  assert.equal((await review(db,row,'decline')).status,'declined');
  assert.deepEqual(db.store.get('users/alice/characters/hero'),original);
  assert.equal(db.store.get('campaigns/c').party,undefined);
  assert.equal([...db.store.keys()].some(p=>p.startsWith('campaigns/c/characters/')),false);
  assert.equal((await review(db,row,'decline')).alreadyReviewed,true);
  await assert.rejects(review(db,row,'approve'),/changed/);
});
test('declined member can submit new revision; stale GM decision cannot apply',async()=>{
  const db=fixture(),old=await pending(db);
  await review(db,old,'decline');
  const next=await campaignCharacterLink(db,'alice',{action:'request',campaignId:'c',
    sourceCharacterId:'hero'});
  assert.equal(next.status,'pending');
  assert.equal(next.revision,3);
  await assert.rejects(review(db,old,'approve'),/changed/);
  const current=(await listPendingCampaignCharacterLinks(db,'gm','c')).requests[0];
  assert.equal(current.revision,3);
  assert.equal((await review(db,current,'approve')).status,'approved');
  assert.equal(db.store.get('campaigns/c/characterLinks/'+old.linkId).revision,4);
});
test('players, outsiders, suspended Co-GMs and undelegated Co-GMs cannot approve',async()=>{
  const db=fixture(),row=await pending(db);
  db.store.set('campaigns/c/members/co',{uid:'co',campaignId:'c',
    role:'co-gm',status:'active',revision:1,capabilityOverrides:{}});
  await assert.rejects(review(db,row,'approve','alice'),/authorised GM/);
  await assert.rejects(review(db,row,'approve','eve'),/authorised GM/);
  await assert.rejects(review(db,row,'approve','co'),/authorised GM/);
  db.store.get('campaigns/c/members/co').capabilityOverrides={'review-join-requests':true};
  db.store.get('campaigns/c/members/co').status='suspended';
  await assert.rejects(review(db,row,'approve','co'),/authorised GM/);
  db.store.get('campaigns/c/members/co').status='active';
  assert.equal((await review(db,row,'approve','co')).status,'approved');
});
test('revoked player and mismatched projection prevent approval',async()=>{
  const db=fixture(),row=await pending(db);
  db.store.get('campaigns/c/members/alice').status='removed';
  await assert.rejects(review(db,row),/Active member/);
  db.store.get('campaigns/c/members/alice').status='active';
  db.store.get('campaignMemberProjections/alice/campaigns/c').role='co-gm';
  await assert.rejects(review(db,row),/Active member/);
  assert.equal(db.store.get('campaigns/c/characterLinks/'+row.linkId).status,'pending');
});
test('lost, transferred or conflicting source sheet cannot be approved',async()=>{
  const db=fixture(),row=await pending(db);
  db.store.delete('users/alice/characters/hero');
  await assert.rejects(review(db,row),/no longer exists/);
  db.store.set('users/alice/characters/hero',{id:'hero',ownerUid:'bob'});
  await assert.rejects(review(db,row),/not owned/);
  db.store.set('users/alice/characters/hero',{id:'hero',ownerUid:'alice',sharedCampaignId:'other'});
  await assert.rejects(review(db,row),/another primary campaign/);
});
test('collision, tampered reservation and stale revision are rejected atomically',async()=>{
  const db=fixture(),row=await pending(db);
  await assert.rejects(reviewCampaignCharacterLink(db,'gm',{campaignId:'c',linkId:row.linkId,
    decision:'approve',expectedRevision:2}),/changed/);
  db.store.set('campaigns/c/characters/'+row.campaignCharacterId,{ownerUid:'mallory',xp:900});
  await assert.rejects(review(db,row),/already exists/);
  db.store.delete('campaigns/c/characters/'+row.campaignCharacterId);
  db.store.get('campaigns/c/characterLinkKeys/'+row.linkId).ownerUid='mallory';
  await assert.rejects(review(db,row),/reservation/);
  assert.equal(db.store.get('campaigns/c/characterLinks/'+row.linkId).status,'pending');
});
test('full campaign or owner capacity blocks approval without mutating links',async()=>{
  const db=fixture(),row=await pending(db);
  db.store.get('campaigns/c').capacity={maxActiveCharacters:1,maxCharactersPerPlayer:1};
  db.store.get('campaigns/c').party=['occupied'];
  await assert.rejects(review(db,row),/capacity/);
  assert.equal(db.store.get('campaigns/c/characterLinks/'+row.linkId).status,'pending');
});
test('disabled GM settings and legacy campaign fail closed',async()=>{
  const db=fixture(),row=await pending(db);
  db.store.get('campaigns/c').settings.allowPlayerLinkCharacter=false;
  await assert.rejects(review(db,row),/disabled/);
  db.store.get('campaigns/c').membershipSchemaVersion=1;
  await assert.rejects(review(db,row),/upgraded/);
});
test('different owners with same source ID remain separate during approval',async()=>{
  const db=fixture({capacity:{maxActiveCharacters:4,maxCharactersPerPlayer:1}});
  const first=await pending(db);
  db.store.set('campaigns/c/members/bob',{uid:'bob',campaignId:'c',role:'player',status:'active',revision:1});
  db.store.set('campaignMemberProjections/bob/campaigns/c',{campaignId:'c',role:'player',status:'active'});
  db.store.set('users/bob/characters/hero',{id:'hero',ownerUid:'bob',xp:999});
  await campaignCharacterLink(db,'bob',{action:'request',campaignId:'c',sourceCharacterId:'hero'});
  const list=(await listPendingCampaignCharacterLinks(db,'gm','c')).requests;
  const second=list.find(x=>x.ownerUid==='bob');
  const a=await review(db,first),b=await review(db,second);
  assert.notEqual(a.campaignCharacterId,b.campaignCharacterId);
  assert.equal(db.store.get('campaigns/c/characters/'+a.campaignCharacterId).ownerUid,'alice');
  assert.equal(db.store.get('campaigns/c/characters/'+b.campaignCharacterId).ownerUid,'bob');
});
