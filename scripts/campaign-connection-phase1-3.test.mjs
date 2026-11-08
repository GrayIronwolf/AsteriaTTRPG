import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_CONNECTIONS_V2_DEFAULT,
  CAMPAIGN_CONNECTIONS_V2_FLAG,
  isCampaignConnectionsV2Requested,
  campaignConnectionMode,
  mayAccessV2Campaign,
  mayManageV2Campaign
} from '../functions/campaignConnectionPolicy.mjs';

const legacy = Object.freeze({ ownerUid: 'gm', gmUids: ['gm', 'former'], playerUids: ['alice', 'former'], roles: { gm: 'gm', former: 'player' } });
const v2 = Object.freeze({ ...legacy, membershipSchemaVersion: 2 });
const flags = { [CAMPAIGN_CONNECTIONS_V2_FLAG]: 'enabled' };
const member = (uid = 'alice', status = 'active', role = 'player', overrides = {}) =>
  ({ uid, campaignId: 'campaign1', status, role, capabilityOverrides: overrides });
const access = (uid, membership, campaign = v2, settings = flags) =>
  mayAccessV2Campaign({ campaign, campaignId: 'campaign1', uid, membership, flags: settings });

test('feature is disabled by default and requires an exact enable token', () => {
  assert.equal(CAMPAIGN_CONNECTIONS_V2_DEFAULT, 'disabled');
  for (const value of [undefined, false, true, 'true', '1', 'disabled', 'ENABLED']) {
    assert.equal(isCampaignConnectionsV2Requested({ [CAMPAIGN_CONNECTIONS_V2_FLAG]: value }), false);
  }
  assert.equal(isCampaignConnectionsV2Requested(flags), true);
});

test('old campaign is identified as legacy; the v2 helper cannot grant its access', () => {
  assert.equal(campaignConnectionMode(legacy), 'legacy');
  assert.equal(campaignConnectionMode({ ...legacy, membershipSchemaVersion: 1 }, flags), 'legacy');
  assert.equal(access('alice', member(), legacy), false);
  assert.equal(access('gm', null, legacy), false);
});

test('v2 never falls back to old roles when flag disabled', () => {
  assert.equal(campaignConnectionMode(v2), 'blocked');
  assert.equal(access('alice', member(), v2, {}), false);
  assert.equal(access('gm', null, v2, {}), false);
});

test('missing or unsupported schema is blocked', () => {
  assert.equal(campaignConnectionMode(null, flags), 'blocked');
  for (const version of [0, -1, 3, '2', false]) {
    assert.equal(campaignConnectionMode({ ...legacy, membershipSchemaVersion: version }, flags), 'blocked');
  }
});

test('verified campaign owner has access in enabled v2 without a member document', () => {
  assert.equal(access('gm', null), true);
  assert.equal(mayManageV2Campaign({ campaign: v2, campaignId: 'campaign1', uid: 'gm', flags, permission: 'transfer-ownership' }), true);
});

test('only canonical active player and co-GM membership grants v2 access', () => {
  assert.equal(access('alice', member()), true);
  assert.equal(access('alice', member('alice', 'active', 'co-gm')), true);
  for (const status of ['pending', 'suspended', 'removed', 'banned', 'inactive']) {
    assert.equal(access('alice', member('alice', status)), false);
  }
  assert.equal(access('alice', { ...member(), status: undefined }), false);
  assert.equal(access('alice', null), false);
  assert.equal(access('alice', member('alice', 'active', 'owner')), false);
  assert.equal(access('alice', member('alice', 'active', 'gm')), false);
});

test('stale legacy arrays and roles cannot restore revoked v2 access', () => {
  assert.equal(access('former', null), false);
  assert.equal(access('former', member('former', 'removed')), false);
  assert.equal(access('former', member('former', 'banned')), false);
});

test('forged or incorrectly scoped membership cannot grant access', () => {
  assert.equal(access('alice', member('bob')), false);
  assert.equal(access('alice', { ...member(), campaignId: 'otherCampaign' }), false);
  assert.equal(access('alice', { ...member(), uid: '' }), false);
  assert.equal(mayAccessV2Campaign({ campaign: v2, campaignId: '', uid: 'alice', membership: member(), flags }), false);
  assert.equal(mayAccessV2Campaign({ campaign: v2, campaignId: 'campaign1', uid: '', membership: member(), flags }), false);
});

test('players cannot perform GM operations and Co-GM actions require explicit grants', () => {
  const args = { campaign: v2, campaignId: 'campaign1', flags, permission: 'review-join-requests' };
  assert.equal(mayManageV2Campaign({ ...args, uid: 'alice', membership: member() }), false);
  assert.equal(mayManageV2Campaign({ ...args, uid: 'co', membership: member('co', 'active', 'co-gm') }), false);
  assert.equal(mayManageV2Campaign({ ...args, uid: 'co', membership: member('co', 'active', 'co-gm', { 'review-join-requests': true }) }), true);
  assert.equal(mayManageV2Campaign({ ...args, uid: 'co', permission: 'transfer-ownership', membership: member('co', 'active', 'co-gm', { 'transfer-ownership': true }) }), false);
  assert.equal(mayManageV2Campaign({ ...args, uid: 'co', membership: member('co', 'suspended', 'co-gm', { 'review-join-requests': true }) }), false);
});
