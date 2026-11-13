import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  inventoryStorageSummary,filterMerchantStockRows,filterInventoryNames,
  pendingActionKeys,actionKey
} from '../src/state/inventoryPresentationModel.mjs';

const load=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('12.2: a single pass computes storage totals without changing item identities',()=>{
  const items=[
    {id:'a',qty:3,weight:2,storageId:'bag',equipped:false},
    {id:'b',qty:1,weight:5,storageId:'bag',equipped:false},
    {id:'c',qty:2,weight:1,storageId:'chest',equipped:false},
    {id:'d',qty:1,weight:1,storageId:'unknown',equipped:false},
    {id:'e',qty:1,weight:0.5,storageId:'bag',equipped:true}
  ];
  const result=inventoryStorageSummary(items,[{id:'bag'},{id:'chest'}]);
  assert.equal(result.nonEquippedCount,4);
  assert.equal(result.countsByStorage.get('bag'),2);
  assert.equal(result.countsByStorage.get('chest'),1);
  assert.equal(result.totalWeight,14.5);
  assert.deepEqual(result.unassignedItems.map(row=>row.id),['d']);
  assert.equal(result.unassignedItems[0],items[3]);
  assert.equal(items[3].storageId,'unknown');
  assert.deepEqual(inventoryStorageSummary([],[]).unassignedItems,[]);
});
test('12.2: merchant search preserves authoritative stock indices for purchases',()=>{
  const stock=[
    {item:{name:'Iron Sword'},qty:2},
    {item:{name:'Silver Hammer'},qty:1},
    {item:{name:'Crystal Sword'},qty:4}
  ];
  assert.deepEqual(filterMerchantStockRows(stock,' sword ').map(x=>x.index),[0,2]);
  assert.deepEqual(filterMerchantStockRows(stock,'HAMMER').map(x=>x.index),[1]);
  assert.deepEqual(filterMerchantStockRows(stock,'nonexistent'),[]);
  assert.deepEqual(filterMerchantStockRows(stock,'').map(x=>x.index),[0,1,2]);
  assert.equal(stock[2].index,undefined,'No client projection may rewrite stock records');
  assert.deepEqual(filterMerchantStockRows(undefined,'anything'),[]);
});
test('12.2: inventory and pending action search preserve correct IDs',()=>{
  const inventory=[{id:'one',name:'Iron Sword'}, {id:'two',name:'Silver Key'},
    {id:'three',name:'Bronze Sword'}];
  assert.deepEqual(filterInventoryNames(inventory,'sword').map(x=>x.id),['one','three']);
  assert.equal(filterInventoryNames(inventory,''),inventory);
  assert.deepEqual(filterInventoryNames(inventory,'missing'),[]);
  const pending=[
    {status:'pending',recipeId:'r1',characterId:'a'},
    {status:'approved',recipeId:'r2',characterId:'a'},
    {status:'pending',recipeId:'r3',characterId:'b'},
    {status:'pending',recipeId:'r1',characterId:'a'}
  ];
  const keys=pendingActionKeys(pending,'recipeId','characterId','a');
  assert.equal(keys.size,1);
  assert.equal(keys.has(actionKey('r1','a')),true);
  assert.equal(keys.has(actionKey('r3','b')),false);
  assert.equal(keys.has(actionKey('r2','a')),false);
  assert.equal(pending.length,4);
  assert.equal(pendingActionKeys([], 'serviceId','itemId').size,0);
});
test('12.2: UI uses cached selectors without changing approval or purchase routes',()=>{
  const inventory=load('../src/dashboards/InventoryWorkspace.jsx');
  const shop=load('../src/dashboards/ShopWorkspace.jsx');
  const crafting=load('../src/dashboards/CraftingRecipeWorkspace.jsx');
  const enchanting=load('../src/dashboards/ItemEnhancementWorkspace.jsx');
  const services=load('../src/dashboards/CraftingServicesWorkspace.jsx');
  assert.match(inventory,/inventoryStorageSummary\(items,storages\)/);
  assert.match(inventory,/useMemo\(\(\)=>inventoryItems\(character\),\[character\]\)/);
  assert.match(shop,/filterMerchantStockRows\(stock,deferredSearch\)/);
  assert.match(shop,/availableStock\.map\(row=>renderRow\('buy',row,row\.index\)\)/);
  assert.match(shop,/useDeferredValue\(search\)/);
  assert.match(shop,/firebaseService\.buyShopItem/);
  assert.match(shop,/firebaseService\.sellShopItem/);
  assert.match(crafting,/pendingActionKeys\(requests,'recipeId','characterId',character\.id\)/);
  assert.match(crafting,/craftingInventoryPlan\(recipe,inventory\)/);
  assert.match(crafting,/firebaseService\.requestCraftingRecipe/);
  assert.match(enchanting,/enhancementInventoryPlan\(plan,inventoryRaw,index,stoneMode\)/);
  assert.match(enchanting,/pendingRequests\.has\(actionKey\(plan\.id,target\?\.id\)\)/);
  assert.match(enchanting,/firebaseService\.requestEnhancement/);
  assert.match(services,/serviceInventoryPlan\(service,inventoryRaw,index\)/);
  assert.match(services,/firebaseService\.requestNPCRepair/);
  assert.match(services,/Approve & Repair/);
});
test('12.2: responsive layout and accessibility preserve mobile button usability',()=>{
  const css=load('../src/styles/asteria-react.css');
  assert.match(css,/Phase 12\.2 — mobile inventory, merchant and crafting usability/);
  assert.match(css,/@container \(max-width: 520px\)/);
  assert.match(css,/\.react-merchant-workspace \.react-merchant-toolbar/);
  assert.match(css,/\.react-crafting-material-editor/);
  assert.match(css,/\.react-merchant-stock-action button[\s\S]*?min-height: 44px;/);
  assert.match(css,/@media \(hover:none\), \(pointer:coarse\)/);
  assert.match(css,/\.react-crafting-request-history summary/);
});
