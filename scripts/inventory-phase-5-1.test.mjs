import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validatePartyStash,validatePartyLootDrop,splitPartyCopper,
  safePartyStashEntry,safePublicPartyItem,validatePartyContainerSize
} from '../src/state/partyLootModel.mjs';

const load=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sword={id:'original',instanceId:'original',name:'Iron Sword',trueName:'Iron Sword',
  type:'Weapon',qty:3,ownerUid:'alice',storageId:'bag',storageSlot:3,equipped:false};
test('Phase 5.1: stashes preserve existing item stacks when renamed and cannot delete stocked records',()=>{
  const first=validatePartyStash({name:'Party Chest',kind:'chest'}, {},'stash-1');
  assert.deepEqual(first.items,[]);
  const next=validatePartyStash({name:'Shared Vault'}, {...first,items:[{id:'loot',name:'Sword',qty:2}]},'stash-1');
  assert.equal(next.name,'Shared Vault');
  assert.equal(next.items[0].id,'loot');
  assert.throws(()=>validatePartyStash({kind:'invalid'}, {},'stash-1'),/Choose a party/);
});
test('Phase 5.1: stack quantities and sensitive ownership are sanitized before party visibility',()=>{
  const entry=safePartyStashEntry(sword,'stash-item-1',2);
  assert.equal(entry.qty,2);
  assert.equal(entry.id,'stash-item-1');
  assert.equal(entry.ownerUid,undefined);
  assert.equal(entry.storageId,undefined);
  assert.equal(entry.equipped,undefined);
  assert.equal(sword.qty,3,'source quantity unchanged');
  assert.throws(()=>safePartyStashEntry(sword,'stash-item-1',0),/quantity/);
  assert.throws(()=>safePartyStashEntry({...sword,identified:false},'stash-item-2',1),/Identify/);
  assert.throws(()=>validatePartyContainerSize({items:Array.from({length:81},()=>entry)}),/full/);
});
test('Phase 5.1: unidentified treasure never exposes true item metadata in member-visible records',()=>{
  const secret={name:'Cursed Sunblade',trueName:'Cursed Sunblade',basicName:'Unidentified Blade',
    identified:false,qty:1,rarity:'Legendary',description:'Secret lore',metadata:{spell:'Fire'},
    catalogId:'secret-catalog',definitionId:'secret-definition',image:'secret.png',type:'Sword'};
  const publicItem=safePublicPartyItem(secret);
  assert.equal(publicItem.name,'Unidentified Blade');
  for(const field of ['trueName','description','metadata','catalogId','definitionId','rarity','image','type'])
    assert.equal(publicItem[field],undefined,field);
  const drop=validatePartyLootDrop({kind:'item',item:secret,title:'Ancient Tomb',source:'Ruins'},'loot-1');
  assert.equal(drop.item.name,'Unidentified Blade');
});
test('Phase 5.1: item drops require valid compendium-style item descriptions and quantities',()=>{
  const drop=validatePartyLootDrop({kind:'item',title:'Chest',source:'Ruins',item:sword},'loot-1');
  assert.equal(drop.kind,'item');assert.equal(drop.item.qty,3);
  assert.throws(()=>validatePartyLootDrop({kind:'item',item:{}},'loot-1'),/valid name/);
  assert.throws(()=>validatePartyLootDrop({kind:'currency',currencyCopper:-1},'loot-2'),/whole currency total/);
  assert.deepEqual(validatePartyLootDrop({kind:'currency',currencyCopper:15},'loot-3').currencyCopper,15);
});
test('Phase 5.1: copper split uses all coins exactly once and is deterministic',()=>{
  assert.deepEqual(splitPartyCopper(10,['c','a','b']),[
    {characterId:'a',copper:4},{characterId:'b',copper:3},{characterId:'c',copper:3}
  ]);
  assert.equal(splitPartyCopper(100,['b','a']).reduce((sum,row)=>sum+row.copper,0),100);
  assert.throws(()=>splitPartyCopper(100,['a','a']),/distinct/);
  assert.throws(()=>splitPartyCopper(100,[]),/Select/);
  assert.throws(()=>splitPartyCopper(1.2,['a']),/Invalid/);
});
test('Phase 5.1: UI actions remain authenticated and player writes remain denied',()=>{
  const server=load('../functions/partyLootCommands.mjs');
  const rules=load('../firestore.rules');
  const player=load('../src/dashboards/PartyLootWorkspace.jsx');
  const handler=load('../functions/handler.mjs');
  assert.match(server,/verifyOwnedLiveCharacter/);
  assert.match(server,/verifyLiveTradeCounterparty/);
  assert.match(server,/writeLiveCharacter/);
  assert.match(server,/requireLiveSession/);
  assert.match(server,/claimPartyLoot/);
  assert.match(server,/managePartyStash/);
  assert.match(server,/managePartyLootDrop/);
  assert.match(server,/splitPartyLootCurrency/);
  assert.match(server,/secretItem/);
  assert.match(rules,/match \/partyLootDrafts\/\{lootId\}/);
  assert.match(rules,/match \/partyStashes\/\{stashId\}/);
  assert.match(handler,/partyLootCurrency/);
  assert.match(player,/Deposit Item/);
  assert.match(player,/Withdraw Item/);
  assert.match(player,/Claim to/);
  assert.match(player,/Reveal to Party/);
  assert.match(player,/Confirm & Distribute/);
});
