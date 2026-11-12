import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equipCharacterInventoryItem,rewardEquipmentSlots,stageDirectEquipReward} from '../functions/rewardDelivery.mjs';

const bag={id:'bag',name:'Adventuring Pack',rows:2,cols:2,maxSlots:4};
const character=(inventory=[],equipment={})=>({id:'hero',name:'Hero',naturalAC:2,inventory,storages:[bag],equipment});
const sword=(id='sword',patch={})=>({id,instanceId:id,name:'Steel Sword',type:'Weapon',qty:1,storageId:'bag',storageSlot:0,...patch});
const shield=(id='shield',patch={})=>({id,instanceId:id,name:'High Steel Kite Shield',type:'Armour',armourPieceType:'kiteShield',materialBaseAC:3,quality:'Average',qty:1,storageId:'bag',storageSlot:0,...patch});

test('Phase 3.1: GM reward uses the same validated equip operation as inventory',()=>{
  const hero=character([sword('reward-sword')]);
  const item=equipCharacterInventoryItem(hero,'reward-sword','Main Hand',{reward:true});
  assert.equal(item.equipped,true);
  assert.equal(hero.equipment['Main Hand'].id,'reward-sword');
  assert.equal(hero.inventory.filter(row=>row.equipped).length,1);
});

test('Phase 3.1: unsupported reward destinations and forged slots are rejected',()=>{
  const hero=character([sword('reward')]);
  assert.throws(()=>equipCharacterInventoryItem(hero,'reward','Ring 1',{reward:true}),/cannot be equipped/);
  assert.throws(()=>equipCharacterInventoryItem(hero,'reward','unknown-slot',{reward:true}),/valid equipment slot/);
  assert.equal(hero.inventory[0].equipped,undefined);
});

test('Phase 3.1: armour piece location is validated before consuming a reward',()=>{
  const hero=character([shield('reward-shield')]);
  assert.deepEqual(rewardEquipmentSlots(hero.inventory[0]),['Off-Hand']);
  assert.throws(()=>equipCharacterInventoryItem(hero,'reward-shield','Head'),/Off-Hand/);
  assert.equal(hero.inventory[0].equipped,undefined);
  equipCharacterInventoryItem(hero,'reward-shield','Off Hand',{reward:true});
  assert.equal(hero.equipment['Off Hand'].equipped,true);
});

test('Phase 3.1: replacing equipment preserves the displaced item and synchronizes equipment map',()=>{
  const original=sword('old',{equipped:true,equippedSlot:'Main Hand',location:'equipment',storageSlot:0});
  const incoming=sword('new',{storageSlot:1});
  const hero=character([original,incoming],{'Main Hand':original});
  equipCharacterInventoryItem(hero,'new','Main Hand',{reward:true});
  assert.deepEqual(Object.keys(hero.equipment),['Main Hand']);
  assert.equal(hero.equipment['Main Hand'].id,'new');
  const retired=hero.inventory.find(item=>item.id==='old');
  assert.equal(retired.equipped,false);
  assert.equal(retired.location,'inventory');
  assert.equal(retired.storageId,'bag');
  assert.equal(retired.storageSlot,0);
});

test('Phase 3.1: replacing equipment fails safely when no storage is available',()=>{
  const old=sword('old',{equipped:true,equippedSlot:'Main Hand',location:'equipment'});
  const next=sword('incoming',{storageSlot:0});
  const occupied=sword('occupied',{storageSlot:0});
  const hero=character([old,next,occupied],{'Main Hand':old});
  hero.storages=[{id:'bag',name:'Full Bag',rows:1,cols:1,maxSlots:1}];
  assert.throws(()=>equipCharacterInventoryItem(hero,'incoming','Main Hand',{reward:true}),/Make room/);
  assert.equal(hero.inventory.find(row=>row.id==='old').equipped,true);
  assert.equal(hero.equipment['Main Hand'].id,'old');
});

test('Phase 3.1: direct equipment reward can be staged without an empty bag slot',()=>{
  const hero=character([sword('existing',{storageSlot:0})]);
  hero.storages=[{id:'bag',name:'Full Bag',rows:1,cols:1,maxSlots:1}];
  const staged=stageDirectEquipReward(hero,sword('source'),'event-1');
  equipCharacterInventoryItem(hero,staged.id,'Main Hand',{reward:true});
  assert.equal(hero.inventory.length,2);
  assert.equal(hero.inventory.find(row=>row.id==='existing').equipped,undefined);
  assert.equal(hero.equipment['Main Hand'].id,staged.id);
});

test('Phase 3.1: distinct reward event IDs prevent inventory identity collision',()=>{
  const hero=character([sword('reward-event-1')]);
  const row=stageDirectEquipReward(hero,sword('source'),'event-1');
  assert.notEqual(row.id,'reward-event-1');
  assert.equal(new Set(hero.inventory.map(item=>item.id)).size,2);
});
