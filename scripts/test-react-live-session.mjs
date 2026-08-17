import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyEventOnce,
  eventIsResolved,
  mergeEvents,
  nextSessionState,
  pendingLootEvent,
  pendingMagicRewardEvent,
  resourcePatch,
  xpNoticeEvent
} from '../src/state/liveEventReducer.mjs';
import {
  DEFAULT_CHARACTER_STORAGES,
  SESSION_LIMIT_MS,
  applyCharacteristicPoints,
  characterKnowsIdentify,
  effectiveSession,
  firstFreeStorageSlot,
  nextSkillProgress,
  normalizeCharacterStorages,
  normalizeDashboardPreferences,
  normalizeLiveItem,
  talentRankCost
} from '../src/state/liveWorkspaceModel.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const cases = [];
function test(name, action) { cases.push({ name, action }); }

test('1. XP bursts apply each event exactly once', () => {
  const processed = new Set();
  let xp = 0;
  const event = { id:'xp-1', type:'xp-reward', payload:{ amount:500 } };
  assert.equal(applyEventOnce(processed, event, value => { xp += value.payload.amount; }), true);
  assert.equal(applyEventOnce(processed, event, value => { xp += value.payload.amount; }), false);
  assert.equal(xp, 500);
});

test('2. Reconnect snapshots merge without duplicate events', () => {
  const merged = mergeEvents([{ id:'a', status:'delivered' }], [{ id:'a', status:'acknowledged' }, { id:'b' }]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(event => event.id === 'a').status, 'acknowledged');
});

test('3. Accepted, equipped, declined, and resolved loot never reopens', () => {
  ['accepted','equipped','declined','resolved'].forEach(status => assert.equal(eventIsResolved({ status }), true));
  assert.equal(pendingLootEvent([{ id:'1', type:'loot-reward', status:'accepted' }]), null);
});

test('4. Only one unresolved loot event is presented', () => {
  const event = pendingLootEvent([
    { id:'old', type:'loot-reward', status:'accepted', createdAt:'2026-01-01' },
    { id:'new', type:'loot-reward', status:'pending', createdAt:'2026-01-02' }
  ]);
  assert.equal(event.id, 'new');
});

test('5. Acknowledged XP notifications stay closed after reconnect', () => {
  assert.equal(xpNoticeEvent([{ id:'x', type:'xp-reward', acknowledged:true }]), null);
  assert.equal(xpNoticeEvent([{ id:'x', type:'xp-reward' }], new Set(['x'])), null);
});

test('6. Live sessions follow start, pause, resume, and end states', () => {
  let state = nextSessionState({}, 'start');
  state = nextSessionState(state, 'pause');
  state = nextSessionState(state, 'resume');
  state = nextSessionState(state, 'end');
  assert.equal(state.status, 'ended');
});

test('7. Invalid session transitions do not corrupt state', () => {
  const idle = { status:'idle' };
  assert.equal(nextSessionState(idle, 'pause'), idle);
  assert.equal(nextSessionState(idle, 'end'), idle);
});

test('8. Resource updates clamp to canonical minimum and maximum', () => {
  assert.deepEqual(resourcePatch({ hp:[5,10] }, 'hp', 20), { hp:[10,10] });
  assert.deepEqual(resourcePatch({ mp:[5,10] }, 'mp', -20), { mp:[0,10] });
});

test('9. React uses the existing Firebase singleton service', () => {
  const service = read('src/firebase/asteriaFirebaseService.js');
  assert.match(service, /window\.AsteriaFirebase/);
  assert.doesNotMatch(read('src/dashboards/GMDashboard.jsx') + read('src/dashboards/CharacterDashboard.jsx'), /firebase\/firestore|initializeApp|getFirestore/);
});

test('10. Firebase exposes transactional session, XP, loot, resource, and acknowledgement APIs', () => {
  const firebase = read('js/firebase-auth.js');
  ['startLiveSession','pauseLiveSession','endLiveSession','grantCampaignXP','createLootReward','updateCampaignCharacterResource','acknowledgeCampaignEvent'].forEach(name => assert.match(firebase, new RegExp(name)));
  assert.match(firebase, /runTransaction/);
});

test('11. The character dashboard has one live route and no legacy character fallback', () => {
  const html = read('index.html');
  assert.match(html, /id="player"/);
  assert.match(html, /id="gm"/);
  assert.match(read('src/main.jsx'), /openLegacyGM/);
  assert.doesNotMatch(read('src/main.jsx'), /openLegacyCharacter/);
  assert.match(read('src/main.jsx'), /if\(view === 'player'\).*openCurrentCharacter/);
  assert.doesNotMatch(read('src/dashboards/CharacterDashboard.jsx'), /LegacyTab|openLegacyCharacter|Open full existing/);
});

test('12. React route and production bundle are present', () => {
  assert.match(read('index.html'), /id="reactDashboard"/);
  assert.match(read('index.html'), /src\/dev-entry\.js/);
  assert.equal(fs.existsSync(path.join(root, 'react-dist/asteria-react.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'react-dist/asteria-react.css')), true);
});

test('13. Magic rewards remain pending once and resolve through the canonical event helper', () => {
  const event = pendingMagicRewardEvent([
    { id:'closed', type:'magic-element-reward', status:'accepted', createdAt:'2026-01-01' },
    { id:'open', type:'magic-element-reward', status:'pending', createdAt:'2026-01-02' }
  ]);
  assert.equal(event.id, 'open');
  assert.equal(pendingMagicRewardEvent([{ id:'closed', type:'magic-element-reward', status:'declined' }]), null);
});

test('14. React owns encounter and additional-magic workflows without raw Firestore calls', () => {
  const gm = read('src/dashboards/GMDashboard.jsx');
  const character = read('src/dashboards/CharacterDashboard.jsx');
  const service = read('src/firebase/asteriaFirebaseService.js');
  assert.match(gm, /CampaignEncounter/);
  assert.match(gm, /MagicElementRewards/);
  assert.match(character, /MagicRewardModal/);
  ['subscribeEncounter','saveEncounter','createMagicReward','respondMagicReward'].forEach(name => assert.match(service, new RegExp(name)));
  assert.doesNotMatch(gm + character, /firebase\/firestore|runTransaction|getFirestore/);
});

test('15. A live session expires after ten wall-clock hours and locks editing', () => {
  const startedAt = Date.now();
  const active = effectiveSession({ status:'active', startedAt, expiresAt:startedAt + SESSION_LIMIT_MS }, startedAt + SESSION_LIMIT_MS - 1);
  const expired = effectiveSession({ status:'active', startedAt, expiresAt:startedAt + SESSION_LIMIT_MS }, startedAt + SESSION_LIMIT_MS);
  const pausedExpired = effectiveSession({ status:'paused', startedAt, expiresAt:startedAt + SESSION_LIMIT_MS }, startedAt + SESSION_LIMIT_MS);
  assert.equal(active.editable, true);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.editable, false);
  assert.equal(pausedExpired.status, 'expired');
});

test('16. Characteristic spending uses CP and the 1:10 resource rule', () => {
  const result = applyCharacteristicPoints({ cp:2, characteristics:{ constitution:10 }, hp:[50,100] }, 'constitution', 2);
  assert.equal(result.character.cp, 0);
  assert.equal(result.character.characteristics.constitution, 12);
  assert.deepEqual(result.character.hp, [50,120]);
});

test('17. Talent and skill progression match the existing Asteria costs', () => {
  assert.equal(talentRankCost(1), 3);
  assert.equal(talentRankCost(5), 15);
  const progress = nextSkillProgress({ rank:'Novice', successes:4 });
  assert.equal(progress.rankName, 'Initiate');
  assert.equal(progress.successes, 0);
});

test('18. All character workspace systems render natively in React', () => {
  const dashboard = read('src/dashboards/CharacterDashboard.jsx');
  const tabs = read('src/dashboards/CharacterWorkspaceTabs.jsx');
  ['CharacterTab','TalentsTab','SkillsTab','SpellsTab','InventoryTab','QuestTab','JournalTab','PartyTab'].forEach(name => assert.match(dashboard + tabs, new RegExp(name)));
  ['spendCP','purchaseTalent','recordSkillSuccess','castSpell','updateInventory','updateQuest','addJournalEntry','sendPartyMessage'].forEach(name => assert.match(dashboard + tabs, new RegExp(name)));
});

test('19. Firebase gates live mutations and exposes the party workspace', () => {
  const firebase = read('js/firebase-auth.js');
  ['spendCharacteristicPoints','purchaseTalentRank','recordSkillSuccess','castCharacterSpell','updateCharacterInventory','buyLiveShopItem','sellLiveShopItem','createLiveTrade','respondLiveTrade','updateCharacterQuest','addJournalEntry','sendPartyMessage'].forEach(name => assert.match(firebase, new RegExp(name)));
  assert.match(firebase, /requireLiveSession/);
  assert.match(read('firestore.rules'), /match \/partyChat\/\{messageId\}/);
});

test('20. Unidentified items hide their true name until Identify is available', () => {
  const item = normalizeLiveItem({ id:'relic-1', name:'Moonfall Blade', type:'Sword', identified:false });
  assert.equal(item.name, 'Sword');
  assert.equal(item.trueName, 'Moonfall Blade');
  assert.equal(characterKnowsIdentify({ spells:[{ name:'Identify' }] }), true);
  assert.equal(characterKnowsIdentify({ spells:[{ name:'Fire Bolt' }] }), false);
});

test('21. Characters receive three ordered default inventory storages', () => {
  const storages = normalizeCharacterStorages({});
  assert.equal(storages.length, 3);
  assert.deepEqual(storages.map(value => value.id), DEFAULT_CHARACTER_STORAGES.map(value => value.id));
});

test('22. Dashboard preferences preserve valid ordering and visibility choices', () => {
  const preferences = normalizeDashboardPreferences({ dashboardPreferences:{ panelOrder:['spells','equipment'], hiddenPanels:['coins','invalid'], visibleTitleId:'title-1', showPartyMembership:false } });
  assert.equal(preferences.panelOrder[0], 'spells');
  assert.deepEqual(preferences.hiddenPanels, ['coins']);
  assert.equal(preferences.visibleTitleId, 'title-1');
  assert.equal(preferences.showPartyMembership, false);
});

test('23. Gallery, organizations, titles, custom items, and player item offers use the shared Firebase service', () => {
  const firebase = read('js/firebase-auth.js');
  const service = read('src/firebase/asteriaFirebaseService.js');
  const dashboard = read('src/dashboards/CharacterDashboard.jsx') + read('src/dashboards/InventoryWorkspace.jsx') + read('src/dashboards/CharacterGallerySettings.jsx');
  ['uploadCharacterGalleryImage','refreshCharacterGalleryImage','setCharacterGalleryPortrait','createPartyOrganization','grantCharacterTitle','grantCharacterStorageSlots','createCustomItem','createLiveItemOffer','respondLiveItemOffer'].forEach(name => assert.match(firebase, new RegExp(name)));
  ['uploadGalleryImage','refreshGalleryImage','createPartyOrganization','grantTitle','grantStorageSlots','createCustomItem','createItemOffer','respondItemOffer'].forEach(name => assert.match(service, new RegExp(name)));
  ['GalleryTab','DashboardSettingsTab','InventoryWorkspace','Create Custom Item','Player Requests'].forEach(name => assert.match(dashboard, new RegExp(name)));
  assert.match(read('storage.rules'), /gallery\/\{fileName\}/);
  assert.match(read('firestore.rules'), /match \/customItems\/\{itemId\}/);
});

test('24. Inventory uses one equipment, storage, and party workspace with direct party actions', () => {
  const inventory = read('src/dashboards/InventoryWorkspace.jsx');
  const styles = read('src/styles/asteria-react.css');
  ['InventoryEquipmentPanel','StoragePanel','PartyInventoryPanel','PartyActionBubble'].forEach(name => assert.match(inventory, new RegExp(name)));
  ['Trade','Sell','Give','Identify'].forEach(label => assert.match(inventory, new RegExp(label)));
  assert.match(styles, /react-inventory-layout/);
  assert.match(styles, /repeat\(var\(--storage-cols/);
  assert.match(inventory, /storageSlot:slot/);
  assert.match(inventory, /max="20"/);
  assert.match(styles, /react-party-speech::after/);
});

test('25. Gallery supports legacy image records and Firebase URL recovery', () => {
  const gallery = read('src/dashboards/CharacterGallerySettings.jsx');
  assert.match(gallery, /galleryRecords/);
  assert.match(gallery, /downloadURL/);
  assert.match(gallery, /refreshGalleryImage/);
  assert.match(gallery, /Image unavailable/);
});

test('26. Storage grids preserve dimensions, legacy bags, and occupied cells', () => {
  const current = normalizeCharacterStorages({ storages:[{ id:'pack', name:'Pack', rows:10, cols:6 }] });
  assert.equal(current[0].maxSlots, 60);
  const legacy = normalizeCharacterStorages({ bags:[{ id:'old-bag', name:'Old Bag', rows:4, cols:4 }] });
  assert.equal(legacy[0].id, 'old-bag');
  assert.equal(firstFreeStorageSlot([{ id:'a', storageId:'pack', storageSlot:0 }], current[0]), 1);
});

test('27. Linked owners can use gallery and item workflows without trusting stale owner metadata', () => {
  const firebase = read('js/firebase-auth.js');
  const rules = read('firestore.rules');
  assert.match(firebase, /verifyOwnedLiveCharacter/);
  assert.match(firebase, /syncOwnedCharacterGalleryMedia/);
  assert.match(rules, /isLinkedCharacterOwner/);
  assert.match(read('src/firebase/asteriaFirebaseService.js'), /syncGalleryMedia/);
});

test('28. The dashboard uses one compact weapons and quick-items panel', () => {
  const dashboard = read('src/dashboards/CharacterDashboard.jsx');
  assert.match(dashboard, /Weapons & Quick Items/);
  assert.doesNotMatch(dashboard, /title="Equipment \/ Armor"/);
  assert.deepEqual(DEFAULT_CHARACTER_STORAGES.map(value => value.rows * value.cols), [16,16,60]);
});

let failed = 0;
for(const entry of cases) {
  try { await entry.action(); console.log(`PASS ${entry.name}`); }
  catch(error) { failed += 1; console.error(`FAIL ${entry.name}\n  ${error.message}`); }
}
console.log(`\n${cases.length - failed}/${cases.length} React milestone tests passed.`);
if(failed) process.exit(1);
