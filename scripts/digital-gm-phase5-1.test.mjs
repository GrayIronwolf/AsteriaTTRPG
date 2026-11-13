import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MERCHANT_TYPES,merchantBuiltInTemplates,merchantTemplateFromShop,
  normalizeMerchantTemplate,merchantWorldNPCOptions,merchantWorldLocationOptions
} from '../src/state/merchantTemplateModel.mjs';
import {applyGMShopAction,cleanGMShop} from '../functions/itemStoreCommands.mjs';

test('merchant types are standardized and built-ins are empty closed-shop presets',()=>{
  assert.equal(MERCHANT_TYPES.length,16);
  const built=merchantBuiltInTemplates();
  assert.equal(built.length,16);
  assert.equal(new Set(built.map(x=>x.id)).size,16);
  assert.ok(built.every(x=>x.stock.length===0));
});
test('saved templates omit funds, private links and visitor IDs',()=>{
  const template=merchantTemplateFromShop({
    name:'Iron Bench',type:'Blacksmith',currencyCopper:400,
    visitorCharacterIds:['pc-1'],npcId:'npc-1',locationId:'town-1',
    stock:[{item:{name:'Iron Nails',definitionId:'07-05-001-001'},qty:4}]
  },'Village Smith','template-test-1234');
  assert.equal(template.name,'Village Smith');
  assert.equal(template.stock[0].qty,4);
  assert.equal(template.currencyCopper,undefined);
  assert.equal(template.npcId,undefined);
  assert.equal(template.locationId,undefined);
  assert.equal(template.visitorCharacterIds,undefined);
});
test('invalid quantities and unidentified items are rejected',()=>{
  const base={id:'template-test-1234',name:'Test',type:'Blacksmith'};
  assert.throws(()=>normalizeMerchantTemplate({...base,stock:[{item:{name:'Potion'},qty:1.5}]}),/quantity/);
  assert.throws(()=>normalizeMerchantTemplate({...base,stock:[{item:{name:'Potion',identified:false},qty:1}]}),/unidentified/);
  assert.throws(()=>normalizeMerchantTemplate({...base,buyModifier:50}),/modifiers/);
});
test('template shop creation copies stock without modifying the source',()=>{
  const template=normalizeMerchantTemplate({id:'template-test-1234',name:'Smith',
    type:'Blacksmith',stock:[{item:{name:'Iron Nails',definitionId:'07-05-001-001',
      marketValue:100},qty:5,restockTarget:10,lowStockAt:2}]});
  const created=applyGMShopAction({id:'shop-new'},{
    type:'create-from-template',template,shop:{id:'shop-new',name:'New Smith',region:'Palladium'}
  },'shop-new');
  assert.equal(created.status,'closed');
  assert.equal(created.name,'New Smith');
  assert.equal(created.region,'Palladium');
  assert.equal(created.stock[0].qty,5);
  assert.equal(created.stock[0].restockTarget,10);
  assert.equal(template.stock[0].qty,5);
  assert.equal(created.visitorCharacterIds.length,0);
  assert.equal(created.currencyCopper,100000);
});
test('NPC and location IDs survive shop updates',()=>{
  const saved=cleanGMShop({name:'Smith',npcId:'npc-1',npcName:'Vaughn',
    locationId:'town-1',locationName:'Gray Stone',region:'Palladium'},
    {id:'shop-123'},'shop-123');
  const changed=cleanGMShop({personality:'Friendly'},saved,'shop-123');
  assert.equal(changed.npcId,'npc-1');
  assert.equal(changed.locationId,'town-1');
  assert.equal(changed.region,'Palladium');
});
test('world options use existing NPC, region and settlement records',()=>{
  const world={npcs:[{id:'npc-1',name:'Vaughn'}],
    regions:[{id:'reg-1',name:'Palladium'}],
    settlements:[{id:'town-1',name:'Gray Stone',region:'Palladium'}]};
  assert.deepEqual(merchantWorldNPCOptions(world),[{id:'npc-1',name:'Vaughn'}]);
  assert.equal(merchantWorldLocationOptions(world).length,2);
  assert.equal(merchantWorldLocationOptions(world).find(x=>x.id==='town-1').region,'Palladium');
});
