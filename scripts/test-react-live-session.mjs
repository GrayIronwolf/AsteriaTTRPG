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
  SESSION_LIMIT_MS,
  applyCharacteristicAllocations,
  applyCharacteristicPoints,
  characterKnowsIdentify,
  effectiveSession,
  firstFreeStorageSlot,
  nextSkillProgress,
  normalizeCharacterStorages,
  normalizeDashboardPreferences,
  normalizeLiveItem,
  stackableStorageItem,
  talentRankCost
} from '../src/state/liveWorkspaceModel.mjs';
import { buildReactRoute, parseReactRoute } from '../src/app/asteriaRoutes.mjs';
import { liveSyncPresentation } from '../src/state/liveSyncState.mjs';

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

test('16b. Staged characteristic allocations commit atomically', () => {
  const result = applyCharacteristicAllocations({ cp:3, characteristics:{ constitution:10, endurance:8 }, hp:[50,100], sp:[40,80] }, { constitution:2, endurance:1 });
  assert.equal(result.total, 3);
  assert.equal(result.character.cp, 0);
  assert.equal(result.character.characteristics.constitution, 12);
  assert.equal(result.character.characteristics.endurance, 9);
  assert.deepEqual(result.character.hp, [50,120]);
  assert.deepEqual(result.character.sp, [40,90]);
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
  const inventory = read('src/dashboards/InventoryWorkspace.jsx');
  ['CharacterTab','TalentsTab','SkillsTab','SpellsTab','InventoryWorkspace','QuestTab','JournalTab','PartyTab'].forEach(name => assert.match(dashboard + tabs + inventory, new RegExp(name)));
  ['spendCPBatch','purchaseTalent','recordSkillSuccess','castSpell','updateInventory','updateQuest','addJournalEntry','sendPartyMessage'].forEach(name => assert.match(dashboard + tabs + inventory, new RegExp(name)));
  assert.doesNotMatch(tabs, /export function InventoryTab/);
});

test('19. Firebase gates live mutations and exposes the party workspace', () => {
  const firebase = read('js/firebase-auth.js');
  ['spendCharacteristicAllocations','purchaseTalentRank','recordSkillSuccess','castCharacterSpell','updateCampaignCharacterCurrency','updateCharacterInventory','buyLiveShopItem','sellLiveShopItem','createLiveTrade','respondLiveTrade','updateCharacterQuest','addJournalEntry','sendPartyMessage'].forEach(name => assert.match(firebase, new RegExp(name)));
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

test('21. New characters start with three available but uncreated storage slots', () => {
  const storages = normalizeCharacterStorages({});
  assert.equal(storages.length, 0);
  assert.equal(normalizeLiveItem({ id:'loose-item', name:'Loose Item' }).storageId, '');
});

test('22. Dashboard preferences preserve valid ordering and visibility choices', () => {
  const preferences = normalizeDashboardPreferences({ dashboardPreferences:{ panelOrder:['spells','equipment'], hiddenPanels:['coins','invalid'], visibleTitleId:'title-1', showPartyMembership:false } });
  assert.equal(preferences.panelOrder[0], 'spells');
  assert.deepEqual(preferences.hiddenPanels, []);
  assert.equal(preferences.visibleTitleId, 'title-1');
  assert.equal(preferences.showPartyMembership, false);
});

test('23. Gallery, organizations, titles, custom items, and player item requests use the shared Firebase service', () => {
  const firebase = read('js/firebase-auth.js');
  const service = read('src/firebase/asteriaFirebaseService.js');
  const dashboard = read('src/dashboards/CharacterDashboard.jsx') + read('src/dashboards/InventoryWorkspace.jsx') + read('src/dashboards/PlayerItemExchange.jsx') + read('src/dashboards/CharacterGallerySettings.jsx');
  ['uploadCharacterGalleryImage','refreshCharacterGalleryImage','setCharacterGalleryPortrait','createPartyOrganization','grantCharacterTitle','grantCharacterStorageSlots','createCustomItem','createLiveItemRequest','respondLiveItemRequest','cancelLiveItemRequest','acknowledgeLiveItemRequest'].forEach(name => assert.match(firebase, new RegExp(name)));
  ['uploadGalleryImage','refreshGalleryImage','createPartyOrganization','grantTitle','grantStorageSlots','createCustomItem','createItemRequest','respondItemRequest','cancelItemRequest','acknowledgeItemRequest'].forEach(name => assert.match(service, new RegExp(name)));
  ['GalleryTab','DashboardSettingsTab','InventoryWorkspace','Create Custom Item','PlayerItemRequestCenter'].forEach(name => assert.match(dashboard, new RegExp(name)));
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

test('28. The dashboard uses modular armour, weapon, and quick-item summaries', () => {
  const dashboard = read('src/dashboards/CharacterDashboard.jsx');
  const overview = read('src/dashboards/PlayerDashboardOverview.jsx');
  assert.match(dashboard, /PlayerDashboardOverview/);
  ['ArmourPanel','WeaponsPanel','QuickItemsPanel'].forEach(name => assert.match(overview, new RegExp(name)));
  assert.match(overview, /firebaseService\.updateInventory/);
  assert.doesNotMatch(read('src/dashboards/InventoryWorkspace.jsx'), /ariaLabel="Inventory menu"/);
});

test('29. Bag inventory follows fixed slots, auto-stacking, and blank storage headers', () => {
  const inventory = read('src/dashboards/InventoryWorkspace.jsx');
  const styles = read('src/styles/asteria-react.css');
  const storage = normalizeCharacterStorages({ storages:[{ id:'pack', name:'Pack', rows:4, cols:4 }] })[0];
  const existing = { id:'ore-1', name:'Iron Ore', identified:true, storageId:'pack', storageSlot:0, qty:2 };
  assert.equal(firstFreeStorageSlot([existing], storage), 1);
  assert.equal(stackableStorageItem([existing], { name:'Iron Ore', identified:true }, 'pack'), existing);
  assert.match(inventory, /Empty Storage Slot/);
  assert.match(inventory, /Create Container/);
  assert.match(styles, /grid-template-columns: minmax\(320px, 360px\) minmax\(420px, 1fr\) minmax\(150px, 178px\)/);
  assert.match(inventory, /react-inventory-mobile-tabs/);
  assert.match(inventory, /react-inventory-item-grid.*view/);
});

test('30. Player item requests use one canonical live record collection', () => {
  const firebase = read('js/firebase-auth.js');
  const fixture = read('src/devFixtures.js');
  assert.match(firebase, /ecosystem\.playerItemRequests/);
  assert.match(fixture, /playerItemRequests:\[\]/);
  assert.match(firebase, /player-request-escrow/);
  assert.match(firebase, /senderNotice\s*=\s*'unread'/);
  assert.match(firebase, /recipientNotice\s*=\s*'acknowledged'/);
});

test('31. Incoming item notifications are mounted outside the inventory tab', () => {
  const dashboard = read('src/dashboards/CharacterDashboard.jsx');
  assert.match(dashboard, /<PlayerItemRequestCenter/);
  assert.match(dashboard, /ecosystem=\{live\.itemEcosystem\}/);
  assert.doesNotMatch(read('src/dashboards/InventoryWorkspace.jsx'), /function IncomingOffers/);
});

test('32. Trade, sell, give, and identify have dedicated shared request windows', () => {
  const exchange = read('src/dashboards/PlayerItemExchange.jsx');
  ['trade','sell','give','identify'].forEach(mode => assert.match(exchange, new RegExp(`${mode}: \\{`)));
  ['SendPlayerItemModal','IncomingRequestModal','RequestResultModal','SentRequestsModal'].forEach(name => assert.match(exchange, new RegExp(name)));
  assert.match(exchange, /exchangeItemId/);
  assert.match(exchange, /priceCopper/);
  assert.match(exchange, /characterKnowsIdentify/);
});

test('33. The exchange UI has a persistent request dock and responsive transaction layout', () => {
  const styles = read('src/styles/asteria-react.css');
  ['react-item-request-dock','react-exchange-route','react-exchange-item','react-request-history'].forEach(name => assert.match(styles, new RegExp(name)));
  assert.match(styles, /@media \(max-width: 680px\)/);
});

test('34. Campaign, character progression, resources, characteristics, and currency share reusable dashboard components', () => {
  const information = read('src/components/DashboardInformation.jsx');
  const dashboard = read('src/dashboards/CharacterDashboard.jsx');
  const overview = read('src/dashboards/PlayerDashboardOverview.jsx');
  ['CampaignInformationPanel','CurrencyPanel','DashboardInformationRow','selectGold'].forEach(name => assert.match(information, new RegExp(name)));
  assert.match(dashboard, /<DashboardInformationRow/);
  assert.match(information, /react-campaign-resource-hud/);
  assert.match(information, /CharacteristicSummary/);
  assert.match(overview, /<CurrencyPanel[\s\S]*react-overview-currency/);
  assert.match(information, /onResourceChange/);
  assert.doesNotMatch(dashboard, /CharacterSidebar|SidebarResource/);
  assert.match(information, /selectCurrencies/);
  assert.match(information, /Object\.entries\(source\)/);
  assert.match(information, /currencies\.map/);
  assert.doesNotMatch(dashboard, /Coin Pouch/);
});

test('35. The modern shell exposes an accessible responsive navigation drawer', () => {
  const html = read('index.html');
  const shell = read('js/asteria-core-shell.js');
  const styles = read('css/asteria-modern-ui.css');
  ['mobileNavToggle','globalNavigation','mobileNavShade'].forEach(id => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(shell, /setMobileNavigation/);
  assert.match(shell, /mobile-nav-open/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /body\.mobile-nav-open \.public-sidebar/);
});

test('36. Shared tabs and modals expose keyboard and focus behavior', () => {
  const ui = read('src/components/WorkspaceUI.jsx');
  assert.match(ui, /role="tablist"/);
  assert.match(ui, /aria-selected/);
  assert.match(ui, /ArrowLeft/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /returnFocusRef/);
});

test('37. One application provider and route contract own React navigation', () => {
  assert.equal(buildReactRoute({ type:'gm', campaignId:'campaign one' }), '#/react/gm/campaign%20one');
  assert.deepEqual(parseReactRoute('#/react/character/campaign%201/character%202'), {
    type:'character', campaignId:'campaign 1', characterId:'character 2'
  });
  assert.equal(parseReactRoute('#/react/character/campaign-only'), null);
  const provider = read('src/app/AsteriaAppContext.jsx');
  const bridge = read('src/app/legacyBridge.js');
  assert.match(provider, /AsteriaAppProvider/);
  assert.match(provider, /parseReactRoute/);
  assert.match(bridge, /openLegacyView/);
  assert.match(read('src/main.jsx'), /navigateReactRoute/);
  assert.doesNotMatch(read('src/dashboards/GMDashboard.jsx'), /window\.location\.hash|window\.setView|window\.setGMSystem/);
});

test('38. Live sync presentation covers every user-visible connection state', () => {
  assert.equal(liveSyncPresentation({ loading:true }).state, 'connecting');
  assert.equal(liveSyncPresentation({ online:false }).state, 'disconnected');
  assert.equal(liveSyncPresentation({ session:{ status:'expired' } }).state, 'expired');
  assert.equal(liveSyncPresentation({ session:{ readOnly:true } }).state, 'read-only');
  assert.equal(liveSyncPresentation({ session:{ status:'idle' } }).state, 'waiting-for-gm');
  assert.equal(liveSyncPresentation({ error:'Denied' }).state, 'error');
});

test('39. Central tokens and reusable components form the design-system boundary', () => {
  const html = read('index.html');
  const tokens = read('css/asteria-design-tokens.css');
  const ui = read('src/components/WorkspaceUI.jsx');
  assert.ok(html.indexOf('asteria-design-tokens.css') < html.indexOf('asteria-modern-ui.css'));
  ['--asteria-surface','--asteria-text','--asteria-hp','--asteria-sp','--asteria-mp','--asteria-xp','--asteria-focus'].forEach(token => assert.match(tokens, new RegExp(token)));
  ['AsteriaAppShell','AppHeader','AsteriaPanel','DashboardNavigation','LiveSyncStatus','LoadingSkeleton','CurrencyDisplay','ResourceChip'].forEach(name => assert.match(ui, new RegExp(name)));
  assert.match(read('src/dashboards/CharacterDashboard.jsx'), /AsteriaAppShell/);
  assert.match(read('src/dashboards/GMDashboard.jsx'), /DashboardNavigation/);
});

test('40. Player navigation uses one SVG icon system and preserves every dashboard route', () => {
  const dashboard = read('src/dashboards/CharacterDashboard.jsx');
  const icons = read('src/components/AsteriaIcons.jsx');
  const ui = read('src/components/WorkspaceUI.jsx');
  ['dashboard','character','talents','skills','spells','inventory','quest','journal','party','gallery','settings'].forEach(route => assert.match(dashboard, new RegExp(`id: '${route}'`)));
  assert.match(icons, /viewBox="0 0 24 24"/);
  assert.match(ui, /<AsteriaIcon name=\{tab\.icon/);
  assert.doesNotMatch(dashboard, /icon: '\\u/);
});

test('41. Inventory has responsive Equipment, Inventory, and Party workspaces with real state summaries', () => {
  const inventory = read('src/dashboards/InventoryWorkspace.jsx');
  const styles = read('src/styles/asteria-react.css');
  ['Equipment Slots','Inventory / Storage','Party item actions'].forEach(label => assert.match(inventory, new RegExp(label)));
  ['mobile-equipment','mobile-inventory','mobile-party','valid-drop','invalid-drop','Sort: Rarity','Encumbered'].forEach(label => assert.match(inventory + styles, new RegExp(label)));
  ['rarity-uncommon','rarity-unusual','rarity-rare','rarity-epic','rarity-mythic','rarity-legendary','rarity-relic'].forEach(name => assert.match(styles, new RegExp(name)));
  assert.match(styles, /@container \(max-width: 900px\)/);
});

test('42. Dashboard routes expose search, content states, party presence, and an accessible gallery lightbox', () => {
  const tabs = read('src/dashboards/CharacterWorkspaceTabs.jsx');
  const gallery = read('src/dashboards/CharacterGallerySettings.jsx');
  const dashboard = read('src/dashboards/CharacterDashboard.jsx') + read('src/dashboards/PlayerDashboardOverview.jsx');
  assert.match(tabs, /SearchField/);
  assert.match(tabs, /Tracked/);
  assert.match(tabs, /Archived/);
  assert.match(tabs, /react-party-member-card/);
  assert.match(gallery, /react-gallery-lightbox-image/);
  assert.match(gallery, /<Modal/);
  ['Current Quests','Recent Journal','Party'].forEach(title => assert.match(dashboard, new RegExp(title)));
});

test('43. Live sync has a canonical reconnecting state without hiding session expiry', () => {
  assert.equal(liveSyncPresentation({ connectionState:'reconnecting' }).state, 'reconnecting');
  assert.equal(liveSyncPresentation({ connectionState:'reconnecting', session:{ status:'expired' } }).state, 'expired');
  const hook = read('src/sessions/useCampaignLiveData.js');
  assert.match(hook, /LIVE_SYNC_STATES\.RECONNECTING/);
  assert.match(hook, /connectionState/);
});

test('44. GM and character dashboard routes are split behind one Suspense boundary', () => {
  const rootSource = read('src/app/AsteriaReactRoot.jsx');
  assert.match(rootSource, /lazy\(\(\) => import\('\.\.\/dashboards\/GMDashboard\.jsx'\)/);
  assert.match(rootSource, /lazy\(\(\) => import\('\.\.\/dashboards\/CharacterDashboard\.jsx'\)/);
  assert.match(rootSource, /<Suspense/);
  assert.match(rootSource, /role="status"/);
});

test('45. Shared controls expose progress, dialog, disabled, and announcement semantics', () => {
  const ui = read('src/components/WorkspaceUI.jsx');
  assert.match(ui, /role="progressbar"/);
  assert.match(ui, /aria-valuenow/);
  assert.match(ui, /useId/);
  assert.match(ui, /disabledReason/);
  assert.match(ui, /LiveRegion/);
  assert.match(ui, /Close dialog/);
});

test('46. Static campaign sync relinquishes campaign listeners while React is active', () => {
  const sync = read('js/data-sync.js');
  assert.match(sync, /reactOwnsCampaignSubscriptions/);
  assert.match(sync, /stopCampaignRealtimeSubscriptions/);
  assert.match(sync, /isDashboardActive/);
  assert.match(sync, /addEventListener\('hashchange'/);
});

test('47. Settings and mobile navigation both trap focus and restore the trigger', () => {
  const shell = read('js/asteria-core-shell.js');
  const html = read('index.html');
  assert.match(shell, /bindSettingsAccessibility/);
  assert.match(shell, /settingsReturnFocus/);
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /aria-labelledby="settingsTitle"/);
  assert.match(html, /id="asteriaLiveRegion"/);
});

test('48. Site-wide compendium and Forge galleries share responsive six-column primitives', () => {
  const styles = read('css/asteria-modern-ui.css');
  ['.codex-card-grid','.race-card-grid','.clean-card-grid','.phase3-forge-card-grid','.forge-character-gallery'].forEach(selector => assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(styles, /repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});

test('49. Removed fallback and theme polling no longer compete with the official shell', () => {
  const html = read('index.html');
  const theme = read('js/asteria-ui-theme-system.js');
  assert.doesNotMatch(html, /asteria-home-fix\.js/);
  assert.equal(fs.existsSync(path.join(root, 'js/asteria-home-fix.js')), false);
  assert.doesNotMatch(theme, /setInterval\(bind/);
  assert.match(theme, /refreshControls:bind/);
});

test('50. The player HUD is connected, modular, and backed by existing state actions', () => {
  const information = read('src/components/DashboardInformation.jsx');
  const overview = read('src/dashboards/PlayerDashboardOverview.jsx');
  const ui = read('src/components/WorkspaceUI.jsx');
  ['PlayerLevelDisplay','ExperienceBar','ResourceBarGroup','CurrencyPanel','CampaignInformationPanel'].forEach(name => assert.match(information, new RegExp(name)));
  assert.match(information, /react-player-topbar/);
  assert.match(information, /onResourceChange/);
  assert.match(information, /excluded = new Set/);
  assert.match(overview, /firebaseService\.castSpell/);
  assert.match(overview, /firebaseService\.updateInventory/);
  assert.match(ui, /DashboardPanel/);
  assert.doesNotMatch(overview, /Kaelen|Lyra|Thorne|Isera|Borin|12,845|Elden Reach|Western Cliffs/);
});

test('51. The redesigned player dashboard responds by reflowing panels and scrolling navigation', () => {
  const styles = read('src/styles/asteria-react.css');
  assert.match(styles, /react-player-topbar[\s\S]*repeat\(24, minmax\(0, 1fr\)\)/);
  assert.match(styles, /react-player-resources \{ grid-column: span 8/);
  assert.match(styles, /react-player-topbar-heading[\s\S]*border-bottom/);
  assert.match(styles, /react-player-overview-grid/);
  assert.match(styles, /react-armour-layout/);
  assert.match(styles, /react-ability-grid/);
  assert.match(styles, /@container \(max-width: 900px\)/);
  assert.match(styles, /@container \(max-width: 620px\)/);
  assert.match(styles, /react-character-dashboard \.react-workspace-main > \.react-tabs[\s\S]*overflow-x: auto/);
});

test('52. Production chunks share one React entry URL', () => {
  const entry = read('src/dev-entry.js');
  assert.match(entry, /import\('\.\.\/react-dist\/asteria-react\.js'\)/);
  assert.doesNotMatch(entry, /asteria-react\.js\?/);
});

test('53. Optional HUD fields persist without allowing essential information to disappear', () => {
  const preferences = normalizeDashboardPreferences({ dashboardPreferences:{ hiddenInformationFields:['portrait','currency','campaignDetails','invalid'] } });
  assert.deepEqual(preferences.hiddenInformationFields, ['portrait','currency','campaignDetails']);
  const information = read('src/components/DashboardInformation.jsx');
  assert.match(read('src/dashboards/PlayerDashboardOverview.jsx'), /hiddenInformationFields\.includes\('currency'\)/);
  assert.match(information, /hiddenInformationFields\.includes\('campaignDetails'\)/);
  assert.doesNotMatch(read('src/state/liveWorkspaceModel.mjs'), /OPTIONAL_INFORMATION_FIELDS[\s\S]*'name'/);
});

test('54. React snapshots are isolated from mutable legacy dashboard helpers', () => {
  const bridge = read('src/app/legacyBridge.js');
  assert.match(bridge, /structuredClone\(character\)/);
  assert.doesNotMatch(bridge, /Object\.assign\(\{\}, window\.chars\[character\.id\] \|\| \{\}, character\)/);
});

test('55. Inventory uses the requested four-column support, equipment, storage, and party layout', () => {
  const inventory = read('src/dashboards/InventoryWorkspace.jsx');
  const styles = read('src/styles/asteria-react.css');
  ['InventorySupportPanel','InventoryEquipmentPanel','StoragePanel','PartyInventoryPanel'].forEach(name => assert.match(inventory, new RegExp(name)));
  assert.match(styles, /react-inventory-layout \{ grid-template-columns: minmax\(150px,\.58fr\) minmax\(315px,1\.18fr\) minmax\(440px,2\.85fr\) minmax\(76px,\.32fr\)/);
  assert.match(inventory, /type:'reorder-storages'/);
  assert.match(inventory, /Drag storage tabs to change that order/);
});

test('56. Titles can be granted, selected, edited, and revoked through shared services', () => {
  const firebase = read('js/firebase-auth.js');
  const service = read('src/firebase/asteriaFirebaseService.js');
  const settings = read('src/dashboards/CharacterGallerySettings.jsx');
  const gm = read('src/dashboards/GMDashboard.jsx');
  assert.match(firebase, /manageCharacterTitle/);
  assert.match(service, /manageTitle/);
  assert.match(settings, /visibleTitleId/);
  assert.match(gm, /Manage Existing Titles/);
  assert.match(gm, /revoke:true/);
});

test('57. Player trades require recipient acceptance and sender final confirmation', () => {
  const firebase = read('js/firebase-auth.js');
  const exchange = read('src/dashboards/PlayerItemExchange.jsx');
  const fixture = read('src/devFixtures.js');
  assert.match(firebase, /status='awaiting-sender'/);
  assert.match(firebase, /finalizeLiveItemTrade/);
  assert.match(exchange, /Final Trade Confirmation/);
  assert.match(exchange, /Confirm Final Trade/);
  assert.match(fixture, /finalizeLiveItemTrade/);
  assert.match(fixture, /acknowledgeLiveItemRecipientUpdate/);
});

let failed = 0;
for(const entry of cases) {
  try { await entry.action(); console.log(`PASS ${entry.name}`); }
  catch(error) { failed += 1; console.error(`FAIL ${entry.name}\n  ${error.message}`); }
}
console.log(`\n${cases.length - failed}/${cases.length} React milestone tests passed.`);
if(failed) process.exit(1);
