import assert from 'node:assert/strict';
import test from 'node:test';
import {installDevFixtures} from '../src/devFixtures.js';
import {firebaseService} from '../src/firebase/asteriaFirebaseService.js';

const campaignId = 'demo-campaign';
const fixtureQuery = '?reactFixture=1';
const nextDelivery = () => new Promise(resolve => queueMicrotask(resolve));

function install(t, search = fixtureQuery, origin = 'http://127.0.0.1', authBridge) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const view = new EventTarget();
  view.location = new URL('/' + search, origin);
  view.AsteriaAuthBridge = authBridge;
  globalThis.window = view;
  globalThis.document = {documentElement:{dataset:{}}};
  t.after(() => {
    if(previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if(previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  return installDevFixtures();
}

async function firstSnapshot(watch, ...args) {
  const snapshots = [];
  const stop = watch(...args, value => snapshots.push(value));
  assert.equal(typeof stop, 'function');
  assert.equal(snapshots.length, 0, 'initial snapshot must be asynchronous');
  await nextDelivery();
  stop();
  assert.equal(snapshots.length, 1, 'one initial snapshot per subscription');
  return snapshots[0];
}

test('simply opening the dashboard does not install a fixture', t => {
  assert.equal(install(t, ''), false);
  assert.equal(firebaseService.currentUser(), null);
});

test('an explicit fixture query cannot install a synthetic account outside loopback', t => {
  assert.equal(install(t, fixtureQuery, 'https://asteria.example'), false);
  assert.equal(firebaseService.currentUser(), null);
});

test('the existing no-role fixture retains Preview Player access to the GM dashboard', async t => {
  assert.equal(install(t), true);
  assert.equal(firebaseService.currentUser().uid, 'player-demo');
  assert.equal(firebaseService.currentProfile().displayName, 'Preview Player');
  const campaign = await firstSnapshot(firebaseService.subscribeCampaign, campaignId);
  assert.equal(campaign.ownerUid, 'player-demo');
  assert.deepEqual(campaign.gmUids, ['player-demo']);
});

test('an explicit Player owns Kael and has no GM access to the demo campaign', async t => {
  assert.equal(install(t, fixtureQuery + '&reactFixtureRole=player'), true);
  const uid = firebaseService.currentUser().uid;
  const campaign = await firstSnapshot(firebaseService.subscribeCampaign, campaignId);
  const kael = await firstSnapshot(firebaseService.subscribeOwnedCharacter, 'kael');
  assert.equal(uid, 'player-demo');
  assert.equal(kael.ownerUid, uid);
  assert.equal(campaign.playerCharacterLinks[kael.id], uid);
  assert.equal(campaign.ownerUid, 'gm-demo');
  assert.equal(campaign.gmUids.includes(uid), false);
  assert.equal(await firstSnapshot(firebaseService.subscribeOwnedCharacter, 'lyra'), null);
});

test('the explicit baseline role signs the legacy shell in through its normal Auth bridge', async t => {
  const sessions = [];
  install(t, fixtureQuery + '&reactFixtureRole=gm', 'http://127.0.0.1', {
    setSession: (profile, account) => sessions.push({profile, account})
  });
  assert.equal(sessions.length, 1);
  const {profile, account} = sessions[0];
  assert.equal(account.uid, 'gm-demo');
  assert.equal(profile.username, 'PreviewGM');
  assert.deepEqual(await window.AsteriaFirebase.readAccountProfileForDisplay(), {
    uid: account.uid, authEmail: account.email, profile
  });
});

test('an explicit GM owns the campaign and can inspect the linked Kael without owning him', async t => {
  assert.equal(install(t, fixtureQuery + '&reactFixtureRole=gm'), true);
  const uid = firebaseService.currentUser().uid;
  const campaign = await firstSnapshot(firebaseService.subscribeCampaign, campaignId);
  const characters = await firstSnapshot(firebaseService.subscribeCharacters, campaignId);
  assert.equal(uid, 'gm-demo');
  assert.equal(firebaseService.currentProfile().uid, uid);
  assert.equal(campaign.ownerUid, uid);
  assert.equal(campaign.playerCharacterLinks.kael, 'player-demo');
  assert.equal(characters.kael.ownerUid, 'player-demo');
  assert.equal(await firstSnapshot(firebaseService.subscribeOwnedCharacter, 'kael'), null);
});

test('recording subscribers receive the original idle, own-consent and archive shapes', async t => {
  install(t, fixtureQuery + '&reactFixtureRole=gm');
  const idle = {status:'idle',revision:0};
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeRecordingNotice, campaignId), idle);
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeRecordingControl, campaignId), idle);
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeRecordingConsents, campaignId), []);
  assert.equal(await firstSnapshot(firebaseService.subscribeOwnRecordingConsent, campaignId), null);
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeRecordingArchives, campaignId), []);
  assert.deepEqual(await firstSnapshot(
    (id, cb) => firebaseService.subscribeRecordingArchives(id, cb, 'gm'), campaignId
  ), []);
});

test('Universal Check subscriptions are limited to the Player even when GM mode is requested', async t => {
  install(t, fixtureQuery + '&reactFixtureRole=player');
  const watch = (id, cb) => firebaseService.subscribeUniversalChecks(id, cb, {gm:true});
  const rows = await firstSnapshot(watch, campaignId);
  assert.deepEqual(rows.map(row => row.ownerUid), ['player-demo']);
  assert.equal(rows[0].characterId, 'kael');
  assert.deepEqual(await firstSnapshot(watch, 'another-campaign'), []);
});

test('a GM-mode Universal Check subscription includes other campaign owners', async t => {
  install(t, fixtureQuery + '&reactFixtureRole=gm');
  const watch = (id, cb) => firebaseService.subscribeUniversalChecks(id, cb, {gm:true});
  const rows = await firstSnapshot(watch, campaignId);
  assert.deepEqual(rows.map(row => row.ownerUid).sort(), ['player-demo', 'player-lyra']);
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeUniversalChecks, campaignId), []);
});

test('a subscriber that stops before the first delivery sees no callbacks', async t => {
  install(t);
  let calls = 0;
  const early = firebaseService.subscribeSession(campaignId, () => calls++);
  const layoutEarly = firebaseService.subscribeUserDashboardLayout(campaignId, 'gm', () => calls++);
  const checkEarly = firebaseService.subscribeUniversalChecks(campaignId, () => calls++);
  early();
  layoutEarly();
  checkEarly();
  await firebaseService.pauseSession(campaignId);
  await nextDelivery();
  assert.equal(calls, 0);
});

test('a write before initial delivery is included in a single asynchronous snapshot', async t => {
  install(t);
  const snapshots = [];
  const stop = firebaseService.subscribeSession(campaignId, session => snapshots.push(session.status));
  const save = firebaseService.pauseSession(campaignId);
  assert.deepEqual(snapshots, []);
  await save;
  await nextDelivery();
  stop();
  assert.deepEqual(snapshots, ['paused']);
});

test('campaign listeners receive one cloned initial snapshot and unsubscribe independently', async t => {
  install(t);
  const first = [], second = [];
  const stopFirst = firebaseService.subscribeCampaign(campaignId, value => {
    value.party.push('subscriber-only');
    first.push(value);
  });
  const stopSecond = firebaseService.subscribeCampaign(campaignId, value => second.push(value));
  assert.deepEqual([first.length, second.length], [0,0]);
  await nextDelivery();
  assert.deepEqual([first.length, second.length], [1,1]);
  assert.deepEqual(second[0].party, ['kael','lyra']);
  stopFirst();
  await firebaseService.updateCampaignDetails(campaignId, {name:'The Caverns'});
  assert.equal(first.length, 1);
  assert.equal(second[1].name, 'The Caverns');
  assert.deepEqual(second[1].party, ['kael','lyra']);
  stopSecond();
});

test('independent layout subscriptions start once, even using the same callback', async t => {
  install(t);
  const snapshots = [];
  const callback = value => snapshots.push(value);
  const stopFirst = firebaseService.subscribeUserDashboardLayout(campaignId, 'gm', callback);
  const stopSecond = firebaseService.subscribeUserDashboardLayout(campaignId, 'gm', callback);
  await nextDelivery();
  assert.deepEqual(snapshots, [null,null]);
  stopFirst();
  await firebaseService.saveUserDashboardLayout(campaignId, 'gm', {preset:'combat'});
  assert.deepEqual(snapshots, [null,null,{preset:'combat'}]);
  stopSecond();
});

test('a later recording subscriber cannot replay or mutate the first subscriber’s snapshot', async t => {
  install(t);
  const snapshots = [];
  const stop = firebaseService.subscribeRecordingNotice(campaignId, value => {
    snapshots.push(value);
    value.revision = 42;
  });
  await nextDelivery();
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeRecordingNotice, campaignId),
    {status:'idle',revision:0});
  assert.equal(snapshots.length, 1);
  stop();
});

test('tab reads expose the empty shapes from the original campaign and account adapters', async t => {
  install(t);
  for(const name of [
    'subscribeBattleMaps','subscribeWorldAtlas','subscribeAsteriaCalendarEntries',
    'subscribeWeatherZones','subscribeWeatherReports','subscribeSessionNotes',
    'subscribeSessionPdfs','subscribeCampaignAudio','subscribeEncounterPlans',
    'subscribeRandomTables','subscribeRandomTableHistory','subscribeLootTables',
    'subscribeCraftingStations','subscribeNPCServices','subscribeNPCRepairRequests',
    'subscribeEnhancementPlans','subscribeEnhancementRequests','subscribeCraftingRecipes',
    'subscribeCraftingRequests','subscribeMerchantRelationships','subscribeMerchantDeals',
    'subscribeItemLore','subscribeItemDiscoveries','subscribeGMRewardBundles'
  ]) {
    assert.equal(typeof firebaseService[name], 'function', name);
    assert.deepEqual(await firstSnapshot(firebaseService[name], campaignId), [], name);
  }
  assert.equal(await firstSnapshot(firebaseService.subscribeAsteriaCalendar, campaignId), null);
  assert.equal(await firstSnapshot(firebaseService.subscribePresentationControl, campaignId), null);
  assert.equal(await firstSnapshot(firebaseService.subscribePresentationDisplay, campaignId), null);
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeBattleMapPrivatePins, campaignId, 'map-fixture'), []);
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeCampaignAudioLive, campaignId),
    {version:1,revision:0,ambient:null,effect:null});
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeDiceWorkspace), {version:1,presets:[],history:[]});
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeMerchantTemplates), []);
  assert.deepEqual(await firebaseService.fetchEventHistory(campaignId, 'kael', ''),
    {events:[],cursor:'',more:false});
});

test('scoped dashboard lookups do not deliver another campaign’s state', async t => {
  install(t);
  assert.equal(await firstSnapshot(firebaseService.subscribeCampaign, 'another-campaign'), null);
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeCharacters, 'another-campaign'), {});
  assert.deepEqual(await firstSnapshot(firebaseService.subscribeSession, 'another-campaign'),
    {id:'',status:'idle'});
});

test('changes to the fixture campaign do not notify subscribers to another campaign', async t => {
  install(t);
  const snapshots = [];
  const stop = firebaseService.subscribeCampaign('another-campaign', value => snapshots.push(value));
  await nextDelivery();
  await firebaseService.updateCampaignDetails(campaignId, {name:'The Caverns'});
  stop();
  assert.deepEqual(snapshots, [null]);
});

test('Player event reads exclude rewards addressed to another owner', async t => {
  install(t);
  await firebaseService.grantXP(campaignId, 'lyra', 10);
  await firebaseService.grantXP(campaignId, 'kael', 10);
  const watch = (id, cb) => firebaseService.subscribeEvents(id, cb, {
    mode:'character', characterId:'kael', targetOwnerUid:'player-lyra'
  });
  const rows = await firstSnapshot(watch, campaignId);
  assert.deepEqual(rows.map(row => row.targetCharacterId), ['kael']);
  const history = await firebaseService.fetchEventHistory(campaignId, 'kael', '');
  assert.deepEqual(history.events.map(row => row.id), [rows[0].id]);
  assert.equal(history.cursor, rows[0].id);
  assert.deepEqual(await firebaseService.fetchEventHistory(campaignId, 'lyra', ''),
    {events:[],cursor:rows[0].id,more:false});
});

test('existing owner and GM mount synchronization completes locally', async t => {
  install(t, fixtureQuery + '&reactFixtureRole=gm');
  assert.equal((await firebaseService.syncCampaignShopStores(campaignId, 'gm-scope')).ok, true);
  assert.equal((await firebaseService.syncGMRewardBundles(campaignId, 'gm-scope')).ok, true);
});
