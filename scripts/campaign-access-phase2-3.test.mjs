import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isCampaignGM,isCampaignMember} from '../functions/characterPermissions.mjs';

const base={ownerUid:'gm',gmUids:['gm','old-gm'],playerUids:['alice','bob'],roles:{gm:'gm','old-gm':'gm',alice:'player',bob:'player'}};
const v2={...base,id:'c',membershipSchemaVersion:2};
const member=(uid,role,status='active',campaignId='c')=>({uid,campaignId,role,status});

test('legacy campaigns continue using existing owner, GM, and player permissions',()=>{
  assert.equal(isCampaignGM(base,'gm'),true);
  assert.equal(isCampaignGM(base,'old-gm'),true);
  assert.equal(isCampaignMember(base,'alice'),true);
  assert.equal(isCampaignMember(base,'eve'),false);
  assert.equal(isCampaignMember({...base,membershipSchemaVersion:1},'bob'),true);
});

test('v2 denies revoked users even when present in stale roles and UID arrays',()=>{
  for(const uid of ['alice','bob','old-gm']){
    const role=uid==='old-gm'?'co-gm':'player';
    for(const status of ['suspended','removed','banned','pending']){
      assert.equal(isCampaignMember(v2,uid,member(uid,role,status)),false);
      assert.equal(isCampaignGM(v2,uid,member(uid,role,status)),false);
    }
    assert.equal(isCampaignMember(v2,uid),false);
    assert.equal(isCampaignGM(v2,uid),false);
  }
});

test('v2 only grants roles from active canonical member docs',()=>{
  assert.equal(isCampaignMember(v2,'gm'),true);
  assert.equal(isCampaignGM(v2,'gm'),true);
  assert.equal(isCampaignMember(v2,'alice',member('alice','player')),true);
  assert.equal(isCampaignGM(v2,'alice',member('alice','player')),false);
  assert.equal(isCampaignMember(v2,'old-gm',member('old-gm','co-gm')),true);
  assert.equal(isCampaignGM(v2,'old-gm',member('old-gm','co-gm')),true);
  assert.equal(isCampaignGM(v2,'old-gm',member('old-gm','player')),false);
});

test('v2 rejects forged UIDs, campaign IDs and unsupported roles',()=>{
  assert.equal(isCampaignMember(v2,'alice',member('bob','player')),false);
  assert.equal(isCampaignMember(v2,'alice',member('alice','player','active','other')),false);
  assert.equal(isCampaignMember(v2,'alice',member('alice','owner')),false);
  assert.equal(isCampaignGM(v2,'old-gm',member('old-gm','gm')),false);
});

test('unknown schema versions fail closed without granting legacy access',()=>{
  for(const membershipSchemaVersion of [-1,0,3,'2',false]){
    assert.equal(isCampaignMember({...base,membershipSchemaVersion},'alice'),false);
    assert.equal(isCampaignGM({...base,membershipSchemaVersion},'old-gm'),false);
  }
});
