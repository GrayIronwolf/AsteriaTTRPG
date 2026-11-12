import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  INVENTORY_CATEGORIES,inventoryCategory,matchesInventoryFilter,canTransferInventoryItem,
  itemRecoveryEffect,availableInventoryEquipmentSlots,inventoryQuickActionAvailability
} from '../src/state/inventoryQuickActions.mjs';

const sword={id:'s1',name:'High Steel Sword',type:'Weapon',rarity:'Rare',qty:1,storageId:'bag'};
const potion={id:'p1',name:'Healing Potion',type:'Consumable',qty:2,effect:{resource:'hp',amount:15}};
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Phase 4.1: category filtering and inventory searches preserve existing items',()=>{
  assert.deepEqual(INVENTORY_CATEGORIES.map(category=>category.id),
    ['all','weapons','armour','consumables','materials','other']);
  assert.equal(inventoryCategory(sword),'weapons');
  assert.equal(inventoryCategory({name:'Shield',type:'Armour'}),'armour');
  assert.equal(inventoryCategory(potion),'consumables');
  assert.equal(inventoryCategory({name:'Iron Ore',type:'Material'}),'materials');
  assert.equal(inventoryCategory({name:'Map',type:'Miscellaneous'}),'other');
  assert.equal(matchesInventoryFilter(sword,'steel','weapons'),true);
  assert.equal(matchesInventoryFilter(sword,'potion','weapons'),false);
  assert.equal(matchesInventoryFilter(sword,'steel','materials'),false);
  assert.equal(matchesInventoryFilter({...sword,identified:false,name:'Mysterious Blade',trueName:'High Steel Sword'},'steel','all'),false,
    'Unidentified secret names must not become searchable');
});
test('Phase 4.1: equipment slots bridge legacy labels to trusted backend slot names',()=>{
  assert.deepEqual(availableInventoryEquipmentSlots({...sword,allowedSlots:['Main Weapon','Off-Hand']}),
    ['Main Hand','Off Hand']);
  assert.deepEqual(availableInventoryEquipmentSlots({...sword,allowedSlots:[]}),['Main Hand','Off Hand']);
  assert.deepEqual(availableInventoryEquipmentSlots({...potion,type:'Consumable'}),[]);
});
test('Phase 4.1: unusable items cannot be offered a resource-use action',()=>{
  assert.deepEqual(itemRecoveryEffect(potion),{hp:15});
  assert.deepEqual(itemRecoveryEffect({...potion,effect:{resource:'hp',amount:-15}}),{});
  assert.deepEqual(itemRecoveryEffect(sword),{});
  const allowed=inventoryQuickActionAvailability(potion,{editable:true,hasStorage:true,hasParty:true});
  assert.equal(allowed.use,true);
  assert.equal(allowed.give,true);
  assert.equal(allowed.equip,false);
  assert.equal(allowed.store,true);
});
test('Phase 4.1: ownership restrictions and live-session locks are respected',()=>{
  for(const state of [{locked:true},{bound:true},{questItem:true},{equipped:true},{qty:0}]){
    const item={...sword,...state};
    assert.equal(canTransferInventoryItem(item),false);
    const actions=inventoryQuickActionAvailability(item,{editable:true,hasStorage:true,hasParty:true,hasMerchant:true});
    assert.equal(actions.give,false);
    assert.equal(actions.trade,false);
    assert.equal(actions.sell,false);
  }
  const locked=inventoryQuickActionAvailability(potion,{editable:false,hasParty:true,hasStorage:true,hasMerchant:true});
  assert.equal(locked.inspect,true);
  for(const [key,value] of Object.entries(locked))if(key!=='inspect')assert.equal(value,false,key);
  assert.equal(inventoryQuickActionAvailability(potion,{editable:true,busy:true,hasParty:true}).give,false);
});
test('Phase 4.1: equip, unequip, sell and store actions appear only when eligible',()=>{
  const armed=inventoryQuickActionAvailability(sword,{editable:true,hasStorage:true,hasMerchant:true});
  assert.equal(armed.equip,true);
  assert.equal(armed.unequip,false);
  assert.equal(armed.sell,true);
  const equipped=inventoryQuickActionAvailability({...sword,equipped:true},{editable:true,hasStorage:true,hasMerchant:true});
  assert.equal(equipped.unequip,true);
  assert.equal(equipped.equip,false);
  assert.equal(equipped.store,false);
});
test('Phase 4.1: contextual controls reuse secure inventory, exchange and merchant actions',()=>{
  const workspace=file('../src/dashboards/InventoryWorkspace.jsx');
  const merchant=file('../src/dashboards/ShopWorkspace.jsx');
  const service=file('../src/firebase/asteriaFirebaseService.js');
  assert.match(workspace,/InventoryQuickActions/);
  assert.match(workspace,/matchesInventoryFilter\(item,query,categoryFilter\)/);
  assert.match(workspace,/firebaseService\.updateInventory\(campaignId,character\.id/);
  assert.match(workspace,/type:'use',itemId:pendingUse\.id/);
  assert.match(workspace,/type==='move-storage'/);
  assert.match(workspace,/onOffer\(recipient,item,'give'\)/);
  assert.match(workspace,/onOffer\(recipient,item,'trade'\)/);
  assert.match(workspace,/onSell\(item\)/);
  assert.match(workspace,/Confirm Use/);
  assert.match(merchant,/requestedSale/);
  assert.match(merchant,/handledSaleToken/);
  assert.match(service,/buyShopItem:[^\n]+quote/);
  assert.match(service,/sellShopItem:[^\n]+quantity=1, quote=/);
});
