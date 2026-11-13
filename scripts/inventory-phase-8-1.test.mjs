import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playerTradeLootOverview} from '../src/state/inventoryActionHubModel.mjs';

const fixture={
  character:{id:'hero',ownerUid:'alice'},
  characters:{hero:{id:'hero'},ally:{id:'ally'},other:{id:'other'}},
  ecosystem:{shops:[
    {id:'town',status:'open',visitorCharacterIds:[]},
    {id:'private',status:'open',visitorCharacterIds:['other']},
    {id:'allowed',status:'open',visitorCharacterIds:['hero']},
    {id:'closed',status:'closed',visitorCharacterIds:['hero']}
  ]},
  partyLoot:{
    loot:[
      {id:'item',visibility:'revealed',status:'available',kind:'item',item:{name:'Sword'}},
      {id:'currency',visibility:'revealed',status:'available',kind:'currency',currencyCopper:25},
      {id:'hidden',visibility:'hidden',status:'available',kind:'item',item:{name:'GM Secret'},gmNotes:'GM ONLY'},
      {id:'claimed',visibility:'revealed',status:'claimed',kind:'item'}
    ],
    stashes:[
      {id:'shared',status:'open',name:'Party Chest'},
      {id:'sealed',status:'locked',name:'Hidden Vault'},
      {id:'removed',status:'deleted'}
    ]
  },
  activity:[{id:'tx1',type:'shop-purchase'}, {id:'tx2',type:'party-stash-deposit'}]
};
test('Phase 8.1: player hub counts only revealed available treasure and permitted merchants',()=>{
  const result=playerTradeLootOverview(fixture);
  assert.equal(result.claimableItemDrops,1);
  assert.equal(result.awaitingCurrencyDrops,1);
  assert.equal(result.availableTreasure,2);
  assert.equal(result.sharedStashes,1);
  assert.equal(result.accessibleShops,2);
  assert.equal(result.partyMembers,2);
  assert.equal(result.recentActivity,2);
  assert.deepEqual(result.links.map(x=>x.id),['party-loot','shops','party','journal']);
  assert.equal(JSON.stringify(result).includes('GM Secret'),false);
  assert.equal(JSON.stringify(result).includes('GM ONLY'),false);
  assert.equal(JSON.stringify(result).includes('Hidden Vault'),false);
});
test('Phase 8.1: missing campaign data fails closed to safe empty shortcuts',()=>{
  const r=playerTradeLootOverview({});
  assert.equal(r.availableTreasure,0);
  assert.equal(r.accessibleShops,0);
  assert.equal(r.sharedStashes,0);
  assert.equal(r.partyMembers,0);
  assert.equal(r.links.length,4);
});
test('Phase 8.1: merchant visitor list is scoped to the active character',()=>{
  const r=playerTradeLootOverview({...fixture,character:{id:'other'}});
  assert.equal(r.accessibleShops,2);
  assert.equal(r.partyMembers,2);
});
test('Phase 8.1: navigation uses existing panes without new backend actions',()=>{
  const view=readFileSync(new URL('../src/dashboards/InventoryWorkspace.jsx',import.meta.url),'utf8');
  const model=readFileSync(new URL('../src/state/inventoryActionHubModel.mjs',import.meta.url),'utf8');
  assert.match(view,/Inventory trade and loot shortcuts/);
  assert.match(view,/actionHub\.links\.map/);
  assert.match(view,/setMobileView\(target\)/);
  assert.match(view,/setActivityOpen\(true\)/);
  assert.match(view,/id="react-inventory-party"/);
  assert.match(view,/id="react-inventory-shops"/);
  assert.match(view,/id="react-inventory-party-loot"/);
  assert.doesNotMatch(model,/setDoc|updateDoc|runTransaction|firebaseService|functionsClient/);
});
