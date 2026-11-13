import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLootTable,rollLootTable} from '../src/state/lootTableModel.mjs';
import {lootTableDropFromRoll} from '../src/state/lootTableDropModel.mjs';

const table=validateLootTable({name:'Forest Cache',location:'Moss Cave',threatTier:2,
  status:'active',entries:[
    {id:'none',kind:'nothing',weight:1,note:'GM only'},
    {id:'coins',kind:'currency',weight:1,minCopper:50,maxCopper:50,note:'Private'},
    {id:'item',kind:'item',name:'Iron Sword',definitionId:'base:sword',
      minQuantity:2,maxQuantity:2,weight:1,note:'Hidden'}
  ]},'forest');

test('Phase 6.2: empty and zero-copper rolls never create a treasure drop',()=>{
  const none=rollLootTable(table,()=>0);
  assert.equal(lootTableDropFromRoll(table,none,'party-loot-none'),null);
  assert.equal(lootTableDropFromRoll(table,{...none,kind:'currency',currencyCopper:0},'party-loot-zero'),null);
});
test('Phase 6.2: currency rolls generate a standard hidden party-copper payload',()=>{
  const roll=rollLootTable(table,()=>1);
  const result=lootTableDropFromRoll(table,roll,'party-loot-coin');
  assert.equal(result.drop.kind,'currency');
  assert.equal(result.drop.currencyCopper,50);
  assert.equal(result.drop.status,'available');
  assert.equal(result.secretItem,null);
  assert.equal(result.drop.note,'');
});
test('Phase 6.2: generated item drops preserve canonical reward identity and quantity',()=>{
  const roll=rollLootTable(table,()=>2);
  const result=lootTableDropFromRoll(table,roll,'party-loot-item');
  assert.equal(result.drop.item.name,'Iron Sword');
  assert.equal(result.drop.item.definitionId,'base:sword');
  assert.equal(result.drop.item.qty,2);
  assert.equal(result.secretItem.qty,2);
  assert.equal(result.drop.note,'');
});
test('Phase 6.2: forged rolls, invalid quantities and unsupported drop IDs fail closed',()=>{
  const roll=rollLootTable(table,()=>2);
  assert.throws(()=>lootTableDropFromRoll(table,{...roll,tableId:'other'},'party-loot-test'),/does not belong/);
  assert.throws(()=>lootTableDropFromRoll(table,{...roll,item:{...roll.item,quantity:0}},'party-loot-test'),/quantity/);
  assert.throws(()=>lootTableDropFromRoll(table,roll,'bad/path'),/identifier/);
});
test('Phase 6.2: generation remains GM-only and reuses hidden party loot storage',()=>{
  const server=readFileSync(new URL('../functions/lootTableCommands.mjs',import.meta.url),'utf8');
  const handler=readFileSync(new URL('../functions/handler.mjs',import.meta.url),'utf8');
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  assert.match(server,/requireCampaignGM\(tx,campaignId\)/);
  assert.match(server,/partyLootDrafts/);
  assert.match(server,/type==='generate'/);
  assert.match(server,/action\.expectedRevision!==previous\.revision/);
  assert.match(handler,/manageLootTable/);
  assert.match(rules,/match \/partyLootDrafts\/\{lootId\}/);
  assert.doesNotMatch(server,/writeLiveCharacter|setCurrencyTotal|placeCharacterItem/);
});
