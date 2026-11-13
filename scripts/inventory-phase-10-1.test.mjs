import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyGMShopAction,cleanGMShop} from '../functions/itemStoreCommands.mjs';
import {merchantStockIdentity,merchantStockHealth,merchantRestockPlan,merchantInventorySummary,validateRestockPolicy} from '../src/state/merchantInventoryModel.mjs';

const sword={id:'iron-sword',name:'Iron Sword',definitionId:'base:sword',
  material:'Iron',quality:'Common',marketPrice:1,marketValue:.5};
const mithril={...sword,material:'Mithril',quality:'Superior'};
const source=()=>({id:'smith',name:'Village Smith',status:'open',currencyCopper:1234,
  buyModifier:1,sellModifier:1,visitorCharacterIds:['a'],stock:[
    {item:sword,qty:1},{item:mithril,qty:0}
  ]});

test('Phase 10.1: restock target and low-stock threshold are bounded',()=>{
  assert.deepEqual(validateRestockPolicy(20,5),{restockTarget:20,lowStockAt:5});
  assert.deepEqual(validateRestockPolicy(0,0),{restockTarget:0,lowStockAt:0});
  for(const [a,b] of [[-1,0],[1,2],[3,-1],[1.5,0],[1,0.5],[1000001,1]])
    assert.throws(()=>validateRestockPolicy(a,b));
});
test('Phase 10.1: configured stock health and plans are deterministic',()=>{
  const rows=[
    {item:sword,qty:2,restockTarget:10,lowStockAt:3},
    {item:mithril,qty:0,restockTarget:6,lowStockAt:2},
    {item:{name:'Mug'},qty:10}
  ];
  assert.equal(merchantStockHealth(rows[0]).status,'low');
  assert.equal(merchantStockHealth(rows[1]).status,'out');
  assert.equal(merchantStockHealth(rows[2]).status,'unmanaged');
  assert.deepEqual(merchantInventorySummary(rows),{lines:3,out:1,low:1,invalid:0});
  assert.deepEqual(merchantRestockPlan(rows).changes.map(x=>x.added),[8,6]);
  assert.equal(merchantRestockPlan(rows).units,14);
  assert.equal(merchantRestockPlan(rows,0).lines,1);
  assert.equal(merchantRestockPlan(rows,2).lines,0);
});
test('Phase 10.1: GM stock configuration, set quantity and restocking are atomic pure operations',()=>{
  const start=source();
  const first=applyGMShopAction(start,{type:'configure-restock',stockIndex:0,
    stockIdentity:merchantStockIdentity(sword),restockTarget:10,lowStockAt:3},'smith');
  assert.equal(first.stock[0].restockTarget,10);
  const corrected=applyGMShopAction(first,{type:'set-stock',stockIndex:0,
    stockIdentity:merchantStockIdentity(sword),quantity:0},'smith');
  assert.equal(corrected.stock[0].qty,0);
  const restored=applyGMShopAction(corrected,{type:'restock',stockIndex:0,
    stockIdentity:merchantStockIdentity(sword),operationId:'once'},'smith');
  assert.equal(restored.stock[0].qty,10);
  assert.equal(restored.stock[1].qty,0);
  assert.equal(restored.restockHistory[0].units,10);
  assert.equal(restored.currencyCopper,1234);
  assert.equal(restored.stock[0].priceCopper,undefined);
  assert.throws(()=>applyGMShopAction(restored,{type:'restock',stockIndex:0,
    stockIdentity:merchantStockIdentity(sword)},'smith'),/No configured/);
  assert.deepEqual(source(),start);
});
test('Phase 10.1: all-target restocking leaves unmanaged rows and prices unchanged',()=>{
  let shop=source();
  shop=applyGMShopAction(shop,{type:'configure-restock',stockIndex:0,
    stockIdentity:merchantStockIdentity(sword),restockTarget:10,lowStockAt:3},'smith');
  shop=applyGMShopAction(shop,{type:'configure-restock',stockIndex:1,
    stockIdentity:merchantStockIdentity(mithril),restockTarget:5,lowStockAt:2},'smith');
  shop.stock.push({item:{id:'potion',name:'Potion'},qty:4});
  const done=applyGMShopAction(shop,{type:'restock-all',operationId:'batch'},'smith');
  assert.deepEqual(done.stock.map(row=>row.qty),[10,5,4]);
  assert.equal(done.restockHistory[0].lines,2);
  assert.equal(done.restockHistory[0].units,14);
  assert.equal(done.status,'open');
  assert.equal(cleanGMShop({status:'closed'},done,'smith').stock[0].qty,10);
  assert.equal(cleanGMShop({},done,'smith').restockHistory.length,1);
});
test('Phase 10.1: stale identities and invalid quantities cannot overwrite another item',()=>{
  const initial=source();
  for(const input of [
    {type:'set-stock',stockIndex:0,stockIdentity:merchantStockIdentity(mithril),quantity:20},
    {type:'configure-restock',stockIndex:0,stockIdentity:'forged',restockTarget:10,lowStockAt:2},
    {type:'restock',stockIndex:1,stockIdentity:merchantStockIdentity(sword)},
    {type:'set-stock',stockIndex:0,stockIdentity:merchantStockIdentity(sword),quantity:-1},
    {type:'set-stock',stockIndex:0,stockIdentity:merchantStockIdentity(sword),quantity:2.5},
    {type:'set-stock',stockIndex:99,stockIdentity:'none',quantity:1}
  ])assert.throws(()=>applyGMShopAction(initial,input,'smith'));
  assert.deepEqual(source(),initial);
  assert.throws(()=>applyGMShopAction({...initial,status:'deleted'},
    {type:'restock-all'},'smith'),/Deleted shops/);
});
test('Phase 10.1: server permissions and current trusted shop transactions are preserved',()=>{
  const server=readFileSync(new URL('../functions/itemStoreCommands.mjs',import.meta.url),'utf8');
  const shop=readFileSync(new URL('../src/dashboards/ShopWorkspace.jsx',import.meta.url),'utf8');
  const gm=readFileSync(new URL('../src/dashboards/GMWorkspacePanels.jsx',import.meta.url),'utf8');
  const commands=readFileSync(new URL('../functions/commands.mjs',import.meta.url),'utf8');
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/asteria-react.css',import.meta.url),'utf8');
  assert.match(server,/await gm\(tx,campaignId\)/);
  assert.match(server,/runTransaction\(db,async tx/);
  assert.match(server,/merchantRestockPlan/);
  assert.match(gm,/Review Restock All/);
  assert.match(gm,/Save Restock Rules/);
  assert.match(gm,/Set Quantity/);
  assert.match(gm,/Confirm Restock All/);
  assert.match(shop,/Limited stock/);
  assert.match(commands,/buyLiveShopItem/);
  assert.match(commands,/sellLiveShopItem/);
  assert.match(commands,/assertMerchantDealMatches/);
  assert.match(rules,/match \/shops\/\{shopId\}/);
  assert.match(rules,/allow create, update, delete: if false/);
  assert.match(css,/\.react-merchant-stock-manager/);
});
