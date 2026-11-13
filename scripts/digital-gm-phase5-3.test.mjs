import test from 'node:test';
import assert from 'node:assert/strict';
import {merchantGeneratedStockPreview,mergeGeneratedMerchantStock} from '../src/state/shopGeneratorIntegrationModel.mjs';
import {applyGMShopAction} from '../functions/itemStoreCommands.mjs';
const iron={name:'Iron Sword',definitionId:'07-01-001-001',material:'Iron',marketValue:100};
const steel={name:'Iron Sword',definitionId:'07-01-001-001',material:'Steel',marketValue:250};
const old=[{item:iron,qty:3,restockTarget:10,lowStockAt:2,priceCopper:120}];
const generated=[{item:iron,qty:2,restockTarget:0,lowStockAt:0},{item:steel,qty:4,restockTarget:0,lowStockAt:0}];
test('append combines exact variants, preserves existing row policy, and adds distinct material',()=>{
  const result=mergeGeneratedMerchantStock(old,generated,'append');
  assert.equal(result.stock.length,2);
  assert.equal(result.stock[0].qty,5);
  assert.equal(result.stock[0].priceCopper,120);
  assert.equal(result.stock[0].restockTarget,10);
  assert.equal(result.stock[1].qty,4);
  assert.equal(old[0].qty,3);
});
test('replace requires explicit mode and leaves original untouched',()=>{
  const result=merchantGeneratedStockPreview(old,generated,'replace');
  assert.equal(result.linesBefore,1);
  assert.equal(result.linesAfter,2);
  assert.equal(result.stock[0].qty,2);
  assert.equal(old[0].qty,3);
});
test('quantity overflow and invalid mode are rejected',()=>{
  assert.throws(()=>mergeGeneratedMerchantStock([{item:iron,qty:999999}],generated),/quantity limit/);
  assert.throws(()=>mergeGeneratedMerchantStock(old,generated,'unknown'),/append or replace/);
});
test('trusted shop action preserves money and access when applying generated stock',()=>{
  const shop={id:'shop-1',name:'Iron Bench',status:'closed',currencyCopper:4200,
    visitorCharacterIds:['pc-1'],stock:old};
  const appended=applyGMShopAction(shop,{type:'apply-generated-stock',
    mode:'append',stock:generated},'shop-1');
  assert.equal(appended.currencyCopper,4200);
  assert.deepEqual(appended.visitorCharacterIds,['pc-1']);
  assert.equal(appended.stock[0].qty,5);
  assert.equal(appended.stock.length,2);
  const replaced=applyGMShopAction(shop,{type:'apply-generated-stock',
    mode:'replace',stock:generated},'shop-1');
  assert.equal(replaced.stock[0].qty,2);
  assert.equal(shop.stock[0].qty,3);
});
