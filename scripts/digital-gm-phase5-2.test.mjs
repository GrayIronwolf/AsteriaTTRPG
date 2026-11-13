import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMerchantStock,merchantGeneratorCatalogFacets} from '../src/state/shopGeneratorModel.mjs';
import {applyGMShopAction} from '../functions/itemStoreCommands.mjs';
const catalog=[
  {id:'a',name:'Iron Sword',category:'Weapons',rarity:'Common',type:'Sword',marketValue:100},
  {id:'b',name:'Steel Sword',category:'Weapons',rarity:'Uncommon',type:'Sword',marketValue:400},
  {id:'c',name:'Healing Potion',category:'Consumables',rarity:'Common',type:'Potion',marketValue:20},
  {id:'d',name:'Secret Potion',category:'Consumables',rarity:'Rare',type:'Potion',identified:false,marketValue:20}
];
test('same seed and options generate identical stock',()=>{
  const options={seed:'palladium',lines:3,minQuantity:1,maxQuantity:5};
  assert.deepEqual(generateMerchantStock(catalog,options),generateMerchantStock(catalog,options));
});
test('filters, value bounds and unidentified exclusions are applied',()=>{
  const result=generateMerchantStock(catalog,{seed:'x',lines:10,categories:['Weapons'],maxUnitValue:150});
  assert.equal(result.generated,1);
  assert.equal(result.stock[0].item.name,'Iron Sword');
  assert.ok(result.warning);
  assert.ok(merchantGeneratorCatalogFacets(catalog).categories.includes('Weapons'));
});
test('quantity and line limits reject invalid settings',()=>{
  assert.throws(()=>generateMerchantStock(catalog,{lines:51}),/Stock lines/);
  assert.throws(()=>generateMerchantStock(catalog,{minQuantity:10,maxQuantity:2}),/Maximum quantity/);
});
test('generated stock is appended only to the selected existing shop',()=>{
  const generated=generateMerchantStock(catalog,{seed:'x',lines:2});
  const original={id:'shop-1',name:'Market',type:'General Goods',status:'closed',stock:[]};
  const updated=applyGMShopAction(original,{type:'apply-generated-stock',
    stock:generated.stock,mode:'append'},'shop-1');
  assert.equal(updated.stock.length,2);
  assert.equal(original.stock.length,0);
  assert.throws(()=>applyGMShopAction(original,{type:'apply-generated-stock',
    stock:generated.stock,mode:'replace'},'shop-1'),/appended/);
});
