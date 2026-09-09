import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../js/character-access.js';
import { validateOwnedRecord } from '../src/state/ownedCharacterRecords.mjs';
import { openGMCharacter, gmReturnContext, returnToGM, restoredGMView } from '../src/app/gmCharacterNavigation.mjs';

const access = globalThis.AsteriaCharacterAccess;
const campaign = { id:'c', ownerUid:'gm', playerCharacterLinks:{ b:'player' }, characters:{ b:{ ownerUid:'player' } } };
const a = { id:'a', ownerUid:'gm' };
const b = { id:'b', ownerUid:'player', sourceCharacterId:'b', sharedCampaignId:'c' };
const c = { id:'c', ownerUid:'outsider' };

test('A/B/D/E: ownership ignores campaign roles, selected character, and legacy aliases', () => {
  const characters = { a, b:{ ...b, accountId:'gm', uid:'gm', ownerAccount:'gm' }, c, legacy:{ uid:'gm' } };
  assert.deepEqual(access.ownedIds(characters, 'gm'), ['a']);
  assert.deepEqual(access.ownedIds(characters, 'player'), ['b']);
  assert.deepEqual(access.ownedIds(characters, ''), []);
  assert.equal(access.canGMView(campaign, b, 'gm'), true);
  assert.equal(access.canGMView(campaign, c, 'gm'), false);
  assert.equal(access.canGMView(campaign, b, 'outsider'), false);
  assert.equal(access.canGMView({ ...campaign, playerCharacterLinks:{ b:'outsider' } }, b, 'gm'), false);
});

function navigationWindow(uid = 'gm') {
  const events = [], entries = [];
  return { AsteriaCharacterAccess:access, AsteriaFirebase:{ getUser:()=>({ uid }) }, scrollY:420,
    location:{ hash:'#/react/gm/c' },
    dispatchEvent:event=>events.push(event.type), events, entries,
    history:{ state:null, replaceState(state){ this.state = state; }, pushState(state, _, hash){ this.state = state; entries.push(hash); } }
  };
}
test('C: authorised GM entry and Back preserve campaign, tab, selected player, and scroll', () => {
  const win = navigationWindow();
  assert.equal(openGMCharacter(campaign, b, { tab:'tools' }, win), true);
  assert.equal(win.entries[0], '#/react/character/c/b');
  const context = gmReturnContext(campaign, b, 'gm', win);
  assert.ok(context);
  returnToGM(context, win);
  assert.equal(win.entries[1], '#/react/gm/c');
  assert.deepEqual(restoredGMView('c', 'gm', win), { uid:'gm', campaignId:'c', characterId:'b', tab:'tools', selectedId:'b', scrollY:420 });
  assert.deepEqual(win.events, ['hashchange','hashchange']);
});
test('D/E: direct navigation, player accounts, account changes and revoked GM roles cannot get a GM Back control', () => {
  const win = navigationWindow();
  assert.equal(gmReturnContext(campaign, b, 'gm', win), null);
  assert.equal(openGMCharacter(campaign, c, { tab:'main' }, win), false);
  openGMCharacter(campaign, b, { tab:'main' }, win);
  assert.equal(gmReturnContext(campaign, b, 'player', win), null);
  assert.equal(gmReturnContext({ ...campaign, ownerUid:'new-gm' }, b, 'gm', win), null);
  assert.equal(gmReturnContext({ ...campaign, id:'another' }, b, 'gm', win), null);
  assert.equal(openGMCharacter(campaign, b, { tab:'main' }, navigationWindow('player')), false);
});
test('private records with rewritten owners are quarantined using the shared owner', async () => {
  const rewritten = { ...b, ownerUid:'gm' };
  assert.equal(await validateOwnedRecord(rewritten, 'gm', async()=>b), false);
  assert.equal(await validateOwnedRecord(b, 'player', async()=>b), true);
  assert.equal(await validateOwnedRecord(a, 'gm', async()=>{ throw new Error('Unlinked characters need no campaign read'); }), true);
  assert.equal(await validateOwnedRecord({ id:'old', accountId:'gm' }, 'gm', async()=>null), false);
  assert.equal(await validateOwnedRecord(rewritten, 'gm', async()=>null), false);
});

function namedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n  function ', start + 1);
  return source.slice(start, end);
}
test('F: actual Forge entry points reject a foreign ID before edit, delete, colour, or navigation', () => {
  const source = fs.readFileSync('js/asteria-gameplay-systems.js', 'utf8');
  const window = { AsteriaCharacterAccess:access, AsteriaFirebase:{getUser:()=>({uid:'gm'}),isReady:()=>true}, chars:{a,b}, toast:()=>{} };
  const context = vm.createContext({ window });
  vm.runInContext(namedFunction(source, 'accountCharacterIds'), context);
  for(const name of ['editForgedCharacter','deleteForgedCharacter','setCharacterCardColour','openCharacterDashboardFromForge']) {
    vm.runInContext(namedFunction(source, name), context);
    assert.equal(context[name]('b'), false, name);
  }
  assert.equal(window.chars.b, b);
});
test('F: Firebase save entry points reject foreign and missing owner before writing', async () => {
  const source = fs.readFileSync('js/firebase-auth.js', 'utf8');
  let writes = 0;
  for(const name of ['saveCharacter','saveOwnedCharacterSnapshot','saveOwnedCharacterProgress']) {
    const start = source.indexOf(`  ${name}: async function(`);
    const end = source.indexOf('\n  },', start) + 4;
    const method = source.slice(start, end).trim();
    const api = vm.runInNewContext(`({${method}})`, { db:{}, currentUser:{uid:'gm'}, setDoc:()=>{ writes++; }, console });
    assert.equal(await api[name]('b', b), false);
    assert.equal(await api[name]('unknown', {id:'unknown'}), false);
  }
  assert.equal(writes, 0);
});
test('GM snapshot mirroring does not change the personal selected character', async () => {
  const source = fs.readFileSync('src/app/legacyBridge.js', 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export function', 'function');
  const window = { AsteriaCharacterAccess:access, AsteriaFirebase:{getUser:()=>({uid:'gm'}),isReady:()=>true}, chars:{a}, selected:'a', session:{character:'a'} };
  const context = vm.createContext({window,structuredClone});
  vm.runInContext(source, context);
  context.mirrorCharacterSnapshot(b);
  assert.equal(window.chars.b.ownerUid, 'player');
  assert.equal(window.selected, 'a');
  assert.equal(window.session.character, 'a');
});
test('owner query/import removes stale mirrors from the account cache without cloud deletion', async () => {
  const source = fs.readFileSync('js/firebase-auth.js', 'utf8');
  const start = source.indexOf('async function loadCharacters(user)');
  const end = source.indexOf('\nfunction openAccountHome', start);
  const queried = [], imported = [];
  const window = { chars:{a, b:{...b,ownerUid:'gm'}}, dispatchEvent:()=>{}, AsteriaAuthBridge:{importCharacters:(uid,list)=>imported.push(...list)} };
  const context = vm.createContext({ window, currentUser:{uid:'gm'}, currentProfile:{characters:['a','b']}, ownershipReadyUid:'', db:{}, validateOwnedRecord,
    collection:(_db,...path)=>path.join('/'), where:(...args)=>args, query:(...args)=>{queried.push(args);return args;},
    getDocs:async()=>({ docs:[a,{...b,ownerUid:'gm'}].map(record=>({id:record.id,data:()=>record})) }),
    doc:(_db,...path)=>path.join('/'), getDoc:async()=>({id:'b',exists:()=>true,data:()=>b}),
    CustomEvent:class { constructor(type, options){this.type=type;this.detail=options?.detail;} }, console:{warn:()=>{}}, reportSyncError:()=>{}
  });
  vm.runInContext(source.slice(start,end), context);
  await context.loadCharacters({uid:'gm'});
  assert.deepEqual(queried, [['users/gm/characters',['ownerUid','==','gm']]]);
  assert.deepEqual(imported.map(record=>record.id), ['a']);
  assert.equal(window.chars.b, undefined);
  assert.equal(context.ownershipReadyUid, 'gm');
});
