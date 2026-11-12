import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemDefinitionKey, itemStackFingerprint, stackableStorageItem, normalizeInventoryItems } from '../src/state/liveWorkspaceModel.mjs';

const base={id:'stack-1',instanceId:'stack-1',definitionId:'07-05-002-001',catalogId:'red-primdale',name:'Red Primdale',trueName:'Red Primdale',qty:2,storageId:'bag',quality:'Common',material:'Plant',identified:true,marketValue:1,marketPrice:2};
const matched=patch=>({...base,id:'incoming',instanceId:'incoming',qty:1,...patch});

test('base Asteria ID stays distinct from inventory instance IDs',()=>{
  const items=normalizeInventoryItems([base,{...base,id:'stack-1',instanceId:'stack-1',qty:1}],{storages:[{id:'bag',name:'Bag',rows:4,cols:4}]});
  assert.notEqual(items[0].instanceId,items[1].instanceId);
  assert.equal(items[0].definitionId,items[1].definitionId);
  assert.equal(items[1].catalogId,'red-primdale');
});

test('identical instances in one container stack',()=>{
  assert.equal(stackableStorageItem([base],matched({}), 'bag')?.id,'stack-1');
  assert.equal(stackableStorageItem([base],matched({}), 'other'),null);
});

test('variant differences prevent accidental item stacking',()=>{
  for(const patch of [
    {quality:'Superior'}, {material:'Silver'}, {condition:'Damaged'},
    {enchantments:[{name:'Flame'}]}, {effects:['Healing']},
    {identified:false}, {charges:2}, {rarity:'Rare'},
    {marketPrice:99}, {raw:{enchantment:'Frost'}}
  ]) {
    assert.equal(stackableStorageItem([base],matched(patch),'bag'),null,JSON.stringify(patch));
  }
});

test('different definitions do not stack even with the same name',()=>{
  assert.notEqual(itemDefinitionKey(base),itemDefinitionKey({...base,definitionId:'07-05-002-002'}));
  assert.equal(stackableStorageItem([base],matched({definitionId:'07-05-002-002'}),'bag'),null);
});

test('bound, quest and unique items never stack',()=>{
  for(const patch of [{bound:true},{questItem:true},{unique:true},{maxStack:1}]){
    assert.equal(stackableStorageItem([base],matched(patch),'bag'),null);
  }
});

test('stack fingerprint is order-independent for nested properties',()=>{
  assert.equal(itemStackFingerprint({material:'Iron',enchantments:[{level:2,name:'Flame'}]}),
    itemStackFingerprint({enchantments:[{name:'Flame',level:2}],material:'Iron'}));
});
