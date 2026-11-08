import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignIdentity, previewCampaignUCN, randomUCN, validUCN } from '../functions/campaignUCN.mjs';

function memoryFirestore(entries = {}) {
  const records = new Map(Object.entries(entries));
  return {
    records,
    doc(path) { return { path }; },
    async runTransaction(callback) {
      const pending = [];
      const transaction = {
        async get(ref) {
          const data = records.get(ref.path);
          return { exists: data !== undefined, data: () => structuredClone(data) };
        },
        create(ref, value) {
          if(records.has(ref.path)) throw new Error('already exists');
          pending.push({ path:ref.path, value });
        },
        set(ref, value) { pending.push({ path:ref.path, value }); }
      };
      const result = await callback(transaction);
      for(const write of pending) records.set(write.path,structuredClone(write.value));
      return result;
    }
  };
}
const code = (index) => String(index).padStart(12, '0');

test('UCNs use twelve decimal digits and reject invalid lengths', () => {
  for(let n=0;n<30;n++) assert.match(randomUCN(),/^\d{12}$/);
  assert.equal(validUCN('001234567890'),true);
  for(const input of ['', '1234', '1234567890123', 'abc123456789', 123456789012, '12345678901-']) assert.equal(validUCN(input),false);
});

test('allocating a campaign creates the permanent directory and legacy join mapping atomically', async () => {
  const db = memoryFirestore();
  const identity = await createCampaignIdentity(db,'gm','  The Last Citadel  ',{nextCode:()=>code(23),nextId:()=> 'campaign-test'});
  assert.deepEqual(identity,{id:'campaign-test',name:'The Last Citadel',ucn:code(23)});
  assert.equal(db.records.get('campaigns/campaign-test').ownerUid,'gm');
  assert.equal(db.records.get('campaignDirectory/'+code(23)).campaignId,'campaign-test');
  assert.equal(db.records.get('campaignInvites/'+code(23)).status,'active');
  assert.equal(db.records.get('campaigns/campaign-test').membershipSchemaVersion,undefined);
});

test('old invitation codes are never reissued to a new campaign', async () => {
  const db = memoryFirestore({['campaignInvites/'+code(1)]:{campaignId:'old',ownerUid:'other',status:'active'}});
  let index=0;
  const created=await createCampaignIdentity(db,'gm','New Campaign',{
    nextCode:()=>[code(1),code(2)][index++],
    nextId:()=> 'new-campaign'
  });
  assert.equal(created.ucn,code(2));
  assert.equal(db.records.get('campaignInvites/'+code(1)).campaignId,'old');
});

test('directory collisions and campaign document IDs both cause safe retries',async()=>{
  const db=memoryFirestore({
    ['campaignDirectory/'+code(1)]:{campaignId:'other',ownerUid:'other',status:'active'},
    'campaigns/already-there':{ownerUid:'other',ucn:code(42)}
  });
  let n=0;
  const result=await createCampaignIdentity(db,'gm','Test',{
    nextCode:()=>[code(1),code(2),code(3)][n],
    nextId:()=>['candidate-a','already-there','candidate-c'][n++]
  });
  assert.equal(result.ucn,code(3));
  assert.equal(db.records.get('campaigns/already-there').ownerUid,'other');
});

test('invalid owner and campaign names cannot allocate identity',async()=>{
  const db=memoryFirestore();
  await assert.rejects(createCampaignIdentity(db,'','Test'),/Sign in/);
  await assert.rejects(createCampaignIdentity(db,'gm','  '),/campaign name/);
  await assert.rejects(createCampaignIdentity(db,'gm','x'.repeat(121)),/campaign name/);
  assert.equal(db.records.size,0);
});

test('campaign creation is limited to ten campaigns per account in a rolling day',async()=>{
  const db=memoryFirestore();
  let i=0;
  for(let n=0;n<10;n++) {
    await createCampaignIdentity(db,'gm','Campaign '+n,{nextCode:()=>code(i),nextId:()=> 'camp-'+(i++)});
  }
  await assert.rejects(createCampaignIdentity(db,'gm','Extra',{nextCode:()=>code(999),nextId:()=> 'extra'}),/limit reached/);
});

test('UCN preview returns only id, name and ucn, never GM private data',async()=>{
  const db=memoryFirestore({
    ['campaignDirectory/'+code(2)]:{campaignId:'c',ownerUid:'gm',status:'active'},
    ['campaignInvites/'+code(2)]:{campaignId:'c',ownerUid:'gm',status:'active'},
    campaigns: {}
  });
  db.records.set('campaigns/c',{ownerUid:'gm',ucn:code(2),name:'Citadel',invites:[{email:'private@example.test'}],players:{gm:{email:'private@example.test'}}});
  const summary=await previewCampaignUCN(db,'player',code(2),{now:100000});
  assert.deepEqual(summary,{id:'c',name:'Citadel',ucn:code(2)});
  assert.equal(JSON.stringify(summary).includes('private@example.test'),false);
});

test('legacy campaign UCN lookup remains possible until the membership migration',async()=>{
  const db=memoryFirestore({
    ['campaignInvites/'+code(4)]:{campaignId:'old',ownerUid:'owner',status:'active'},
    'campaigns/old':{ownerUid:'owner',name:'Legacy',ucn:code(4)}
  });
  assert.deepEqual(await previewCampaignUCN(db,'player',code(4),{now:100000}),{id:'old',name:'Legacy',ucn:code(4)});
});

test('closed directory entries must not silently use active legacy invitations',async()=>{
  const db=memoryFirestore({
    ['campaignDirectory/'+code(5)]:{campaignId:'old',ownerUid:'owner',status:'closed'},
    ['campaignInvites/'+code(5)]:{campaignId:'old',ownerUid:'owner',status:'active'},
    'campaigns/old':{ownerUid:'owner',name:'Legacy',ucn:code(5)}
  });
  assert.equal(await previewCampaignUCN(db,'player',code(5),{now:100000}),null);
});

test('forged owner and mismatched UCN do not disclose campaign details',async()=>{
  const db=memoryFirestore({
    ['campaignDirectory/'+code(6)]:{campaignId:'victim',ownerUid:'attacker',status:'active'},
    'campaigns/victim':{ownerUid:'real-owner',ucn:code(6),name:'Private'}
  });
  assert.equal(await previewCampaignUCN(db,'player',code(6),{now:100000}),null);
  db.records.set('campaignDirectory/'+code(6),{campaignId:'victim',ownerUid:'real-owner',status:'active'});
  assert.deepEqual(await previewCampaignUCN(db,'player',code(6),{now:100001}),{id:'victim',name:'Private',ucn:code(6)});
  db.records.set('campaigns/victim',{ownerUid:'real-owner',ucn:code(7),name:'Private'});
  assert.equal(await previewCampaignUCN(db,'player',code(6),{now:100002}),null);
});

test('preview is rate limited across both valid and missing campaign codes',async()=>{
  const db=memoryFirestore();
  for(let n=0;n<12;n++) assert.equal(await previewCampaignUCN(db,'reader',code(n),{now:100000+n}),null);
  await assert.rejects(previewCampaignUCN(db,'reader',code(100),{now:100013}),/Too many/);
  assert.equal(await previewCampaignUCN(db,'reader',code(100),{now:161000}),null);
});

test('unauthenticated lookups and invalid codes are denied',async()=>{
  const db=memoryFirestore();
  await assert.rejects(previewCampaignUCN(db,'',code(5)),/Sign in/);
  await assert.rejects(previewCampaignUCN(db,'reader','bad'),/valid 12-digit/);
});
