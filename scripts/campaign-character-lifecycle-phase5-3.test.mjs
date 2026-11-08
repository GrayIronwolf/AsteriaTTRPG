import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignCharacterLink} from '../functions/campaignCharacterLinks.mjs';
import {reviewCampaignCharacterLink} from '../functions/campaignCharacterApproval.mjs';
import {listCampaignCharacterLifecycle,changeCampaignCharacterLifecycle} from '../functions/campaignCharacterLifecycle.mjs';
import {validateOwnedRecord} from '../src/state/ownedCharacterRecords.mjs';

const clone=value=>structuredClone(value);
function fixture(overrides={}){
  const store=new Map([
    ['campaigns/c',{id:'c',name:'Asteria',ownerUid:'gm',membershipSchemaVersion:2,
      partySize:4,settings:{allowPlayerLinkCharacter:true,allowPlayerCreateCharacter:true},...clone(overrides)}],
    ['campaigns/c/members/alice',{uid:'alice',campaignId:'c',role:'player',status:'active',revision:1}],
    ['campaignMemberProjections/alice/campaigns/c',{campaignId:'c',role:'player',status:'active'}],
    ['users/alice/characters/hero',{id:'hero',ownerUid:'alice',sourceCharacterId:'hero',
      name:'Hero',level:7,xp:345,inventory:[{name:'Sword'}],coins:{copper:120},hp:[17,35],
      backstory:'Private family',privateNotes:'cannot leak'}]
  ]);
  const read=ref=>{
    if(ref.isQuery){
      let rows=[...store].filter(([path,data])=>path.startsWith(ref.path+'/')&&
        !path.slice(ref.path.length+1).includes('/')&&
        (!ref.filter||data[ref.filter[0]]===ref.filter[2]))
        .map(([path,data])=>({id:path.slice(ref.path.length+1),data:()=>clone(data)}));
      if(ref.max)rows=rows.slice(0,ref.max);
      return {docs:rows,size:rows.length};
    }
    return {exists:store.has(ref.path),data:()=>clone(store.get(ref.path))};
  };
  return {store,
    doc:path=>({path,get:async()=>read({path})}),
    collection:path=>({path,isQuery:true,
      where(k,op,v){return {...this,filter:[k,op,v]};},
      limit(n){return {...this,max:n};},
      async get(){return read(this);}
    }),
    async runTransaction(fn){
      const writes=[];
      const tx={
        get:async ref=>read(ref),
        create(ref,value){if(store.has(ref.path))throw Error('already exists');
          writes.push(['create',ref.path,clone(value)]);},
        update(ref,value){if(!store.has(ref.path))throw Error('missing');
          writes.push(['update',ref.path,clone(value)]);},
        delete(ref){writes.push(['delete',ref.path]);}
      };
      const result=await fn(tx);
      for(const [operation,path,data] of writes){
        if(operation==='create')store.set(path,data);
        if(operation==='update')store.set(path,{...store.get(path),...data});
        if(operation==='delete')store.delete(path);
      }
      return result;
    }
  };
}
const request=(db,sourceId='hero')=>campaignCharacterLink(db,'alice',{
  action:'request',campaignId:'c',sourceCharacterId:sourceId
});
const decide=(db,link,decision='approve')=>reviewCampaignCharacterLink(db,'gm',{
  campaignId:'c',linkId:link.linkId,decision,expectedRevision:link.revision
});
const lifecycle=(db,link,action,actor='gm')=>changeCampaignCharacterLifecycle(db,actor,{
  campaignId:'c',linkId:link.linkId,action,expectedRevision:link.revision
});
async function approvedFixture(){
  const db=fixture();
  await request(db);
  const link=(await db.collection('campaigns/c/characterLinks').get()).docs[0].data();
  await decide(db,link);
  return {db,link:{...link,revision:2},id:link.campaignCharacterId};
}
const currentLink=(db,link)=>db.store.get('campaigns/c/characterLinks/'+link.linkId);

test('GM deactivates by archiving complete shared gameplay and preserving Forge progress',async()=>{
  const {db,link,id}=await approvedFixture();
  const path='campaigns/c/characters/'+id;
  const live=db.store.get(path);
  live.xp=888;live.hp=[11,35];live.inventory=[{name:'Hammer'}];live.coins={copper:600};
  live.updatedAt=new Date(Date.now()+5000);
  const change=await lifecycle(db,link,'deactivate');
  assert.equal(change.status,'inactive');
  assert.equal(db.store.has(path),false);
  const archive=db.store.get('campaigns/c/archivedCharacters/'+id);
  assert.equal(archive.xp,888);assert.deepEqual(archive.inventory,[{name:'Hammer'}]);
  assert.equal(archive.status,'inactive');
  const owned=db.store.get('users/alice/characters/hero');
  assert.equal(owned.xp,888);assert.deepEqual(owned.hp,[11,35]);
  assert.equal(owned.coins.copper,600);
  assert.equal(owned.privateNotes,'cannot leak');
  assert.deepEqual(owned.campaignCharacterIds,{});
  assert.deepEqual(owned.linkedCampaignIds,[]);
  assert.equal(owned.sharedCampaignId,'');
  assert.equal(db.store.get('campaigns/c').party.length,0);
  assert.equal(db.store.get('campaigns/c').playerCharacterLinks[id],undefined);
  assert.equal(db.store.get('campaigns/c').characters[id],undefined);
  assert.equal(await validateOwnedRecord(owned,'alice',()=>{throw Error('should not look up');}),true);
  assert.equal((await lifecycle(db,link,'deactivate')).alreadyApplied,true);
});

test('authorised GM restores previously deactivated character without resetting gameplay',async()=>{
  const {db,link,id}=await approvedFixture();
  db.store.get('campaigns/c/characters/'+id).xp=777;
  await lifecycle(db,link,'deactivate');
  const row={...link,revision:3};
  const restored=await lifecycle(db,row,'restore');
  assert.equal(restored.status,'approved');
  assert.equal(db.store.has('campaigns/c/archivedCharacters/'+id),false);
  assert.equal(db.store.get('campaigns/c/characters/'+id).xp,777);
  assert.equal(db.store.get('users/alice/characters/hero').campaignCharacterIds.c,id);
  assert.deepEqual(db.store.get('campaigns/c').party,[id]);
  assert.equal((await lifecycle(db,row,'restore')).alreadyApplied,true);
});

test('unlink keeps archived gameplay and leaves no active campaign associations',async()=>{
  const {db,link,id}=await approvedFixture();
  assert.equal((await lifecycle(db,link,'unlink','alice')).status,'unlinked');
  assert.equal(db.store.has('campaigns/c/characters/'+id),false);
  const archived=db.store.get('campaigns/c/archivedCharacters/'+id);
  assert.equal(archived.status,'unlinked');
  assert.equal(archived.ownerUid,'alice');
  assert.deepEqual(db.store.get('campaigns/c').party,[]);
  assert.equal(db.store.get('users/alice/characters/hero').ownerUid,'alice');
  await assert.rejects(lifecycle(db,{...link,revision:3},'restore'),/changed/);
  await assert.rejects(request(db),/inactive/);
});

test('unlink after deactivation is archival only and never erases the Forge sheet',async()=>{
  const {db,link,id}=await approvedFixture();
  await lifecycle(db,link,'deactivate');
  const privateCopy=clone(db.store.get('users/alice/characters/hero'));
  const result=await lifecycle(db,{...link,revision:3},'unlink');
  assert.equal(result.status,'unlinked');
  assert.deepEqual(db.store.get('users/alice/characters/hero'),privateCopy);
  assert.equal(db.store.get('campaigns/c/archivedCharacters/'+id).status,'unlinked');
});

test('owner can withdraw a pending link, after which resubmission increments revision',async()=>{
  const db=fixture();await request(db);
  const pending=(await db.collection('campaigns/c/characterLinks').get()).docs[0].data();
  const original=clone(db.store.get('users/alice/characters/hero'));
  const withdrawn=await lifecycle(db,pending,'cancel','alice');
  assert.equal(withdrawn.status,'declined');
  assert.equal(db.store.has('campaigns/c/characters/'+pending.campaignCharacterId),false);
  assert.deepEqual(db.store.get('users/alice/characters/hero'),original);
  const next=await request(db);
  assert.equal(next.revision,3);
  await assert.rejects(lifecycle(db,pending,'cancel','alice'),/changed/);
});

test('GM and owner rights, delegated permissions and role revocation',async()=>{
  const {db,link}=await approvedFixture();
  await assert.rejects(lifecycle(db,link,'deactivate','alice'),/authorised GM/);
  await assert.rejects(lifecycle(db,link,'unlink','outsider'),/owner or an authorised GM/);
  db.store.set('campaigns/c/members/co',{uid:'co',campaignId:'c',status:'active',
    role:'co-gm',revision:1,capabilityOverrides:{'review-join-requests':true}});
  await assert.rejects(lifecycle(db,link,'deactivate','co'),/authorised GM/);
  db.store.get('campaigns/c/members/co').capabilityOverrides={'moderate-members':true};
  db.store.get('campaigns/c/members/co').status='suspended';
  await assert.rejects(lifecycle(db,link,'deactivate','co'),/authorised GM/);
  db.store.get('campaigns/c/members/co').status='active';
  assert.equal((await lifecycle(db,link,'deactivate','co')).status,'inactive');
});

test('cannot deactivate participant in an active combat encounter',async()=>{
  const {db,link,id}=await approvedFixture();
  db.store.set('campaigns/c/systems/encounter',{
    status:'active',combatants:[{kind:'player',characterId:id}]
  });
  await assert.rejects(lifecycle(db,link,'deactivate'),/active encounter/);
  assert.equal(db.store.has('campaigns/c/characters/'+id),true);
  assert.equal(currentLink(db,link).status,'approved');
});

test('replay, inconsistent source ownership and tampered root indexes fail closed',async()=>{
  const {db,link,id}=await approvedFixture();
  await assert.rejects(lifecycle(db,{...link,revision:99},'unlink'),/changed/);
  db.store.get('campaigns/c').playerCharacterLinks[id]='mallory';
  await assert.rejects(lifecycle(db,link,'unlink'),/roster does not match/);
  db.store.get('campaigns/c').playerCharacterLinks[id]='alice';
  db.store.get('users/alice/characters/hero').ownerUid='mallory';
  await assert.rejects(lifecycle(db,link,'unlink'),/not owned/);
  assert.equal(db.store.get('campaigns/c/characters/'+id).status,'linked');
});

test('conflicting newer Forge gameplay blocks detach, preventing silent loss',async()=>{
  const {db,link,id}=await approvedFixture();
  const privateCopy=db.store.get('users/alice/characters/hero');
  const shared=db.store.get('campaigns/c/characters/'+id);
  privateCopy.xp=999;privateCopy.updatedAt=new Date(Date.now()+100000);
  shared.xp=234;shared.updatedAt=new Date();
  await assert.rejects(lifecycle(db,link,'deactivate'),/newer conflicting gameplay/);
  assert.equal(currentLink(db,link).status,'approved');
});

test('restore fails on altered Forge gameplay, suspended membership and full capacity',async()=>{
  const {db,link,id}=await approvedFixture();
  await lifecycle(db,link,'deactivate');
  const version={...link,revision:3};
  db.store.get('users/alice/characters/hero').xp=999;
  await assert.rejects(lifecycle(db,version,'restore'),/Forge sheet changed/);
  db.store.get('users/alice/characters/hero').xp=345;
  db.store.get('campaignMemberProjections/alice/campaigns/c').status='removed';
  await assert.rejects(lifecycle(db,version,'restore'),/active membership/);
  db.store.get('campaignMemberProjections/alice/campaigns/c').status='active';
  db.store.get('campaigns/c').capacity={maxActiveCharacters:1,maxCharactersPerPlayer:1};
  db.store.get('campaigns/c').party=['other'];
  await assert.rejects(lifecycle(db,version,'restore'),/capacity/);
  assert.equal(db.store.get('campaigns/c/archivedCharacters/'+id).status,'inactive');
});

test('GM listing is bounded to safe metadata; members and outsiders cannot browse',async()=>{
  const {db,link}=await approvedFixture();
  const queue=await listCampaignCharacterLifecycle(db,'gm','c');
  assert.equal(queue.links.length,1);
  assert.equal(queue.links[0].linkId,link.linkId);
  assert.equal(JSON.stringify(queue).includes('privateNotes'),false);
  assert.equal(JSON.stringify(queue).includes('Sword'),false);
  await assert.rejects(listCampaignCharacterLifecycle(db,'alice','c'),/authorised GM/);
  await assert.rejects(listCampaignCharacterLifecycle(db,'outsider','c'),/authorised GM/);
});

test('legacy campaign lifecycle is denied and does not change gameplay',async()=>{
  const {db,link,id}=await approvedFixture();
  db.store.get('campaigns/c').membershipSchemaVersion=1;
  await assert.rejects(lifecycle(db,link,'deactivate'),/upgraded campaign/);
  assert.equal(db.store.has('campaigns/c/characters/'+id),true);
});

test('owner cannot guess a different source character ID to access someone else',async()=>{
  const {db,link}=await approvedFixture();
  await assert.rejects(changeCampaignCharacterLifecycle(db,'bob',{
    campaignId:'c',sourceCharacterId:'hero',action:'unlink',expectedRevision:2
  }),/not found|owner/);
  await assert.rejects(changeCampaignCharacterLifecycle(db,'alice',{
    campaignId:'c',sourceCharacterId:'other',linkId:link.linkId,
    action:'unlink',expectedRevision:2
  }),/identity mismatch/);
});
