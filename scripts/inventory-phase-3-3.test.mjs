import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanGMShop,applyGMShopAction,PHASE33_MAX_SHOP_STOCK} from '../functions/itemStoreCommands.mjs';

const base=()=>({id:'shop-1',name:'Village Smith',status:'open',type:'Blacksmith',
  buyModifier:1,sellModifier:1,currencyCopper:10000,visitorCharacterIds:['a'],stock:[]});

test('Phase 3.3: canonical shop IDs, status and bounds are enforced',()=>{
  const shop=cleanGMShop({name:'Reliable Market',status:'open'},base(),'shop-1');
  assert.equal(shop.name,'Reliable Market');
  assert.equal(shop.status,'open');
  assert.deepEqual(shop.visitorCharacterIds,['a']);
  assert.throws(()=>cleanGMShop({},base(),'bad/shop'),/valid shop/);
  assert.throws(()=>cleanGMShop({}, {...base(),stock:Array.from({length:PHASE33_MAX_SHOP_STOCK+1},()=>({}))},'shop-1'),/too many/);
});

test('Phase 3.3: saving shop settings preserves stock exactly',()=>{
  const source={...base(),stock:[{qty:3,item:{name:'Iron Sword',material:'Iron',quality:'Common'}}]};
  const updated=applyGMShopAction(source,{type:'save',shop:{name:'New Name',status:'closed'}},'shop-1');
  assert.deepEqual(updated.stock,source.stock);
  assert.equal(updated.status,'closed');
  assert.equal(source.name,'Village Smith');
  assert.equal(source.stock[0].qty,3);
});

test('Phase 3.3: stock changes are bounded and preserve item variants',()=>{
  let shop=applyGMShopAction(base(),{type:'stock',quantity:2,item:{name:'Iron Sword',material:'Iron',quality:'Common',marketPrice:1,marketValue:.5}},'shop-1');
  assert.equal(shop.stock.length,1);
  shop=applyGMShopAction(shop,{type:'stock',quantity:3,item:{name:'Iron Sword',material:'Iron',quality:'Common',marketPrice:1,marketValue:.5}},'shop-1');
  assert.equal(shop.stock.length,1);
  assert.equal(shop.stock[0].qty,5);
  shop=applyGMShopAction(shop,{type:'stock',quantity:1,item:{name:'Iron Sword',material:'Mithril',quality:'Superior',marketPrice:1,marketValue:.5}},'shop-1');
  assert.equal(shop.stock.length,2);
  shop=applyGMShopAction(shop,{type:'remove-stock',stockIndex:0},'shop-1');
  assert.equal(shop.stock.length,1);
  assert.equal(shop.stock[0].item.material,'Mithril');
});

test('Phase 3.3: invalid quantities and forged operations leave source unchanged',()=>{
  const source=base();
  for(const input of [
    {type:'stock',item:{name:'Gem'},quantity:0},
    {type:'stock',item:{name:'Gem'},quantity:1.5},
    {type:'stock',item:{},quantity:2},
    {type:'remove-stock',stockIndex:99},
    {type:'other'}
  ])assert.throws(()=>applyGMShopAction(source,input,'shop-1'));
  assert.deepEqual(source,base());
});

test('Phase 3.3: deleted shop stays a tombstone instead of regaining stale stock',()=>{
  const deleted=applyGMShopAction({...base(),stock:[{qty:1,item:{name:'Gem'}}]},{type:'delete'},'shop-1');
  assert.equal(deleted.status,'deleted');
  assert.deepEqual(deleted.stock,[]);
});
