import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertConsumableInventoryItem} from '../src/state/inventoryUseGuard.mjs';
import {playerCharacterProjection} from '../frontend/src/player/playerDashboardModel.mjs';
import {inventoryProjection} from '../frontend/src/economy/economyModel.mjs';

test('Phase 1.3: rejected use of depleted, fractional, invalid and unidentified items',()=>{
  assert.equal(assertConsumableInventoryItem({id:'tonic',qty:2,identified:true}),2);
  for(const qty of [0,-1,0.5,Infinity,'0',null,'bad'])
    assert.throws(()=>assertConsumableInventoryItem({qty}),/remaining charges or quantity/);
  assert.throws(()=>assertConsumableInventoryItem({qty:1,identified:false}),/Identify/);
  assert.throws(()=>assertConsumableInventoryItem(null),/not found/);
});
test('Phase 1.3: owner quick-slot use cannot bypass depletion or identification checks',()=>{
  const source={id:'hero1',ownerUid:'owner1',name:'Hero',inventory:[
    {id:'tonic1',name:'Healing Tonic',qty:0,effect:{resource:'hp',amount:6}},
    {id:'tonic2',name:'Hidden Tonic',identified:false,qty:1,effect:{resource:'hp',amount:6}},
    {id:'tonic3',name:'Available Tonic',qty:2,effect:{resource:'hp',amount:6}}
  ],quickSlots:['tonic1','tonic2','tonic3',null]};
  const projected=playerCharacterProjection(source,{owned:true});
  assert.equal(projected.quickSlots[0].usable,false);
  assert.equal(projected.quickSlots[1].usable,false);
  assert.equal(projected.quickSlots[1].name,'Unidentified Item');
  assert.equal(projected.quickSlots[2].usable,true);
  const economy=inventoryProjection(source,false);
  assert.equal(economy.quickSlots[0].quantity,0);
  assert.equal(economy.quickSlots[1].hasEffect,false);
  assert.equal(economy.quickSlots[2].quantity,2);
  const panels=readFileSync(new URL('../frontend/src/player/PlayerOverviewPanels.jsx',import.meta.url),'utf8');
  const economyUI=readFileSync(new URL('../frontend/src/economy/EconomyWorkspace.jsx',import.meta.url),'utf8');
  const commands=readFileSync(new URL('../functions/commands.mjs',import.meta.url),'utf8');
  assert.match(panels,/!item\.usable/);
  assert.match(economyUI,/item\.quantity<1\|\|!item\.identified/);
  assert.ok(commands.split('assertConsumableInventoryItem(item);').length-1>=3);
});
