import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('js/firebase-auth.js', 'utf8');
const start = source.indexOf('  saveCharacter: async function(');
const end = source.indexOf('\n  },', start) + 4;
assert.ok(start >= 0 && end > start, 'saveCharacter method exists');

function fixture({uid='owner',commitError=null,projectionError=null}={}){
  const writes=[];
  let commits=0, projections=0;
  const context={
    db:{},currentUser:uid ? {uid} : null,currentProfile:{characters:['existing']},
    writeBatch:()=>({
      set:(ref,value,options)=>writes.push({ref,value,options}),
      commit:async()=>{commits++;if(commitError)throw commitError;}
    }),
    doc:(_db,...parts)=>parts.join('/'),
    arrayUnion:(id)=>({arrayUnion:id}),
    serverTimestamp:()=>({serverTimestamp:true}),
    saveLocalProfile:()=>{},
    syncCharacterToCampaigns:async()=>{projections++;if(projectionError)throw projectionError;},
    reportSyncError:()=>{},
    console:{warn:()=>{}}
  };
  const api=vm.runInNewContext('({' + source.slice(start,end) + '})',context);
  return {api,writes,counts:()=>({commits,projections})};
}

test('new character persists private record and profile index in one batch',async()=>{
  const f=fixture();
  assert.equal(await f.api.saveCharacter('new',{id:'new',ownerUid:'owner',name:'Hero'}),true);
  assert.equal(f.counts().commits,1);
  assert.equal(f.writes.length,2);
  assert.equal(f.writes[0].ref,'users/owner/characters/new');
  assert.equal(f.writes[1].ref,'users/owner');
  assert.equal(f.writes[1].value.characters.arrayUnion,'new');
});
test('editing existing character updates same document',async()=>{
  const f=fixture();
  assert.equal(await f.api.saveCharacter('existing',{id:'existing',ownerUid:'owner',name:'Updated'}),true);
  assert.equal(f.writes[0].ref,'users/owner/characters/existing');
  assert.equal(f.writes[0].value.name,'Updated');
});
test('foreign character and missing sign-in never commit',async()=>{
  for(const [options,character] of [[{}, {ownerUid:'other'}],[{uid:null},{ownerUid:'owner'}]]){
    const f=fixture(options);
    assert.equal(await f.api.saveCharacter('new',character),false);
    assert.equal(f.counts().commits,0);
  }
});
test('failed commit reports failure, and opt-in error propagates for Forge retry UI',async()=>{
  const error=Object.assign(new Error('network unavailable'),{code:'unavailable'});
  const f=fixture({commitError:error});
  assert.equal(await f.api.saveCharacter('new',{ownerUid:'owner'}),false);
  await assert.rejects(f.api.saveCharacter('new',{ownerUid:'owner'},{throwOnError:true}),e=>e.code==='unavailable');
  assert.equal(f.counts().projections,0);
});
test('campaign projection failure does not turn a committed private save into failure',async()=>{
  const f=fixture({projectionError:new Error('campaign offline')});
  assert.equal(await f.api.saveCharacter('new',{ownerUid:'owner'}),true);
  assert.deepEqual(f.counts(),{commits:1,projections:1});
});
