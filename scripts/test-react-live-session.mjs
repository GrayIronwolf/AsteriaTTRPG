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

test('11. Static dashboards remain available as explicit fallbacks', () => {
  const html = read('index.html');
  assert.match(html, /id="player"/);
  assert.match(html, /id="gm"/);
  assert.match(read('src/main.jsx'), /openLegacyGM/);
  assert.match(read('src/main.jsx'), /openLegacyCharacter/);
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

let failed = 0;
for(const entry of cases) {
  try { await entry.action(); console.log(`PASS ${entry.name}`); }
  catch(error) { failed += 1; console.error(`FAIL ${entry.name}\n  ${error.message}`); }
}
console.log(`\n${cases.length - failed}/${cases.length} React milestone tests passed.`);
if(failed) process.exit(1);
