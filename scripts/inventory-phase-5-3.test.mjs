import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {itemLoreKey,cleanSecretItemLore,recordLoreOwnership,recordLoreDiscovery,visibleLoreDiscovery} from '../src/state/itemLoreModel.mjs';

test('Phase 5.3: secret lore preserves distinct hidden properties, curses and notes',()=>{
  const secret=cleanSecretItemLore({
    hiddenProperties:'Ancient blood magic',curse:'Whispers to the bearer',gmNotes:'Secret patron',
    discoveryClues:'Maker mark',originalOwner:'Lost king'
  },{},'alice-character','iron-blade');
  assert.equal(secret.id,'alice-character__iron-blade');
  assert.equal(secret.curse,'Whispers to the bearer');
  assert.equal(cleanSecretItemLore({gmNotes:'Updated'},secret,'alice-character','iron-blade').hiddenProperties,'Ancient blood magic');
  assert.throws(()=>itemLoreKey('bad/path','blade'),/valid campaign/);
});

test('Phase 5.3: discoveries cannot leak unrevealed secrets',()=>{
  const secret=cleanSecretItemLore({hiddenProperties:'Secret Fire',curse:'Hidden Curse',
    gmNotes:'Never reveal',ownershipPublic:false}, {}, 'a','sword');
  const recorded=recordLoreDiscovery(secret,'An ancient maker mark','gm','2026-11-13');
  const visible=visibleLoreDiscovery(recorded,'owner',recorded.discoveryHistory);
  assert.deepEqual(visible.revealedLore,['An ancient maker mark']);
  for(const name of ['hiddenProperties','curse','gmNotes','discoveryClues','originalOwner'])
    assert.equal(Object.hasOwn(visible,name),false,name);
  assert.deepEqual(visible.ownershipHistory,[]);
});

test('Phase 5.3: ownership chronology is private until explicitly revealed',()=>{
  let secret=cleanSecretItemLore({ownershipPublic:false},{},'a','sword');
  secret=recordLoreOwnership(secret,'First keeper','gm','t1');
  secret=recordLoreOwnership(secret,'Second keeper','gm','t2');
  secret=recordLoreOwnership(secret,'Second keeper','gm','t3');
  assert.equal(secret.ownershipHistory.length,2);
  assert.deepEqual(visibleLoreDiscovery(secret,'owner',[]).ownershipHistory,[]);
  secret=cleanSecretItemLore({ownershipPublic:true},secret,'a','sword');
  assert.deepEqual(visibleLoreDiscovery(secret,'owner',[]).ownershipHistory.map(x=>x.owner),['First keeper','Second keeper']);
});

test('Phase 5.3: only trusted GM actions edit lore and players read only sanitized discoveries',()=>{
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  const commands=readFileSync(new URL('../functions/itemLoreCommands.mjs',import.meta.url),'utf8');
  const handler=readFileSync(new URL('../functions/handler.mjs',import.meta.url),'utf8');
  assert.match(rules,/match \/itemLore\/\{itemId\}/);
  assert.match(rules,/match \/itemDiscoveries\/\{itemId\}/);
  assert.match(commands,/isCampaignGM/);
  assert.match(commands,/visibleLoreDiscovery/);
  assert.match(commands,/tx\.set\(revealRef/);
  assert.match(handler,/manageItemLore/);
});
