import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  INVENTORY_ACTIVITY_KINDS,INVENTORY_ACTIVITY_CATEGORIES,inventoryActivityRecords,
  inventoryActivityDelta,inventoryActivityCategory,filterInventoryActivityRecords
} from '../src/state/inventoryActivityModel.mjs';

const character={id:'hero',ownerUid:'alice',actionLog:[
  {id:'buy-1',type:'shop-purchase',message:'Purchased 2 potions',at:'2026-11-13T01:10:00Z'},
  {id:'stash-1',type:'party-stash-deposit',message:'Stored sword in party chest',at:'2026-11-13T01:11:00Z'},
  {id:'deal-1',type:'merchant-bargain',message:'Bargained for a sword',at:'2026-11-13T01:12:00Z'},
  {id:'claim-1',type:'party-loot-claimed',message:'Claimed the iron helm',at:'2026-11-13T01:13:00Z'},
  {id:'secret-1',type:'quest-reward',message:'Private quest reward',at:'2026-11-13T01:14:00Z'}
]};
const events=[
  {id:'activity-hero-buy-1',type:'shop-purchase',targetCharacterId:'hero',
    targetOwnerUid:'alice',payload:{message:'Purchased 2 potions',activityId:'buy-1'},
    createdAt:'2026-11-13T01:10:02Z'},
  {id:'currency-1',type:'party-currency-split',targetCharacterId:'hero',
    targetOwnerUid:'alice',payload:{message:'Received 150 copper'},
    createdAt:'2026-11-13T01:15:00Z'},
  {id:'hidden',type:'shop-purchase',targetCharacterId:'hero',targetOwnerUid:'bob',
    payload:{message:'Secret other player'},createdAt:'2026-11-13T01:20:00Z'},
  {id:'other-char',type:'shop-sale',targetCharacterId:'other',targetOwnerUid:'alice',
    payload:{message:'Other character'},createdAt:'2026-11-13T01:20:00Z'}
];

test('Phase 7.1: journal covers all supported inventory and trade actions',()=>{
  for(const type of ['merchant-bargain','party-loot-claimed','party-stash-deposit',
    'party-stash-withdraw','party-currency-split','item-trade-completed',
    'item-trade-accepted','item-identified','shop-purchase','shop-sale'])
    assert.ok(INVENTORY_ACTIVITY_KINDS.has(type),type);
  assert.equal(inventoryActivityCategory('shop-purchase'),'shop');
  assert.equal(inventoryActivityCategory('party-stash-deposit'),'stash');
  assert.equal(inventoryActivityCategory('merchant-bargain'),'trade');
  assert.deepEqual(INVENTORY_ACTIVITY_CATEGORIES.map(x=>x.id),
    ['all','loot','trade','shop','stash','currency','equipment','inventory']);
});

test('Phase 7.1: owner and character scoping hide unrelated events',()=>{
  const entries=inventoryActivityRecords(character,events,100);
  assert.equal(entries.some(x=>x.title.includes('Secret other player')),false);
  assert.equal(entries.some(x=>x.title.includes('Other character')),false);
  assert.equal(entries.some(x=>x.title.includes('Private quest reward')),false);
  assert.equal(entries.length,5);
});

test('Phase 7.1: server event and action log have one stable receipt ID',()=>{
  const entries=inventoryActivityRecords(character,events,100);
  assert.equal(entries.filter(x=>x.id==='activity:buy-1').length,1);
  assert.equal(entries.find(x=>x.id==='activity:buy-1').source,'activity');
  assert.equal(inventoryActivityDelta(null,entries).added.length,0);
  const first=inventoryActivityDelta(null,entries);
  assert.equal(inventoryActivityDelta(first.ids,inventoryActivityRecords(character,events,100)).added.length,0);
});

test('Phase 7.1: category, search, bounded history and stable timestamps',()=>{
  const entries=inventoryActivityRecords(character,events,100);
  assert.deepEqual(filterInventoryActivityRecords(entries,{category:'shop'}).map(x=>x.id),['activity:buy-1']);
  assert.equal(filterInventoryActivityRecords(entries,{query:'  COPPER '}).length,1);
  assert.equal(filterInventoryActivityRecords(entries,{category:'stash',query:'sword'}).length,1);
  assert.equal(filterInventoryActivityRecords(entries,{category:'invalid'}).length,0);
  assert.equal(inventoryActivityRecords(character,events,2).length,2);
  assert.equal(inventoryActivityRecords(character,events,1000000).length,5);
});

test('Phase 7.1: hidden item fields are not searchable or in the journal',()=>{
  const secret={id:'secret-reward',type:'loot-reward',targetCharacterId:'hero',targetOwnerUid:'alice',
    payload:{item:{identified:false,name:'Unknown blade',trueName:'Dragonfang',curse:'Dark curse'}},
    createdAt:'2026-11-13T02:00:00Z'};
  const entries=inventoryActivityRecords(character,[secret],100);
  assert.equal(filterInventoryActivityRecords(entries,{query:'Dragonfang'}).length,0);
  assert.equal(filterInventoryActivityRecords(entries,{query:'Dark curse'}).length,0);
  assert.equal(filterInventoryActivityRecords(entries,{query:'Unknown blade'}).length,1);
});

test('Phase 7.1: journal is a display-only feature using existing event subscriptions',()=>{
  const ui=readFileSync(new URL('../src/dashboards/InventoryWorkspace.jsx',import.meta.url),'utf8');
  const model=readFileSync(new URL('../src/state/inventoryActivityModel.mjs',import.meta.url),'utf8');
  assert.match(ui,/Inventory &amp; Trade Journal/);
  assert.match(ui,/filterInventoryActivityRecords/);
  assert.match(ui,/INVENTORY_ACTIVITY_CATEGORIES/);
  assert.match(ui,/aria-label="Inventory and trade journal"/);
  assert.doesNotMatch(model,/runTransaction|setDoc|updateDoc|deleteDoc/);
});
