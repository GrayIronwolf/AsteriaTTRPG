import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  GM_REWARD_CURRENCIES,filterGMRewardEvents,prepareGMRewardBundle,
  rewardEventLabel,rewardEventStatus,validateGMRewardPayload
} from '../src/state/gmRewardModel.mjs';

test('Phase 3.2: all six Asteria currency denominations remain available',()=>{
  assert.deepEqual(GM_REWARD_CURRENCIES.map(row=>row.key),
    ['copper','silver','gold','platinum_crown','royal_crown','royal_platinum']);
});
test('Phase 3.2: currency-only and item-only rewards are valid',()=>{
  assert.deepEqual(validateGMRewardPayload({currency:{key:'silver',amount:50}}).currency,{key:'silver',amount:50});
  const item=validateGMRewardPayload({items:[{name:'Iron Sword',qty:2,definitionId:'07-05-002-001'}]}).items[0];
  assert.equal(item.qty,2);
  assert.equal(item.definitionId,'07-05-002-001');
  assert.equal(item.name,'Iron Sword');
});
test('Phase 3.2: reject empty, negative, fractional, unsupported and oversized awards',()=>{
  for(const data of [
    {},{currency:{key:'gold',amount:-1}},{currency:{key:'gold',amount:1.5}},
    {currency:{key:'invalid',amount:1}},{items:[{name:'Sword',qty:0}]},
    {items:[{name:'Sword',qty:1.5}]},
    {items:Array.from({length:9},()=>({name:'Sword',qty:1}))}
  ])assert.throws(()=>validateGMRewardPayload(data));
});
test('Phase 3.2: strip item ownership and storage metadata without losing variants',()=>{
  const source={id:'source',name:'Ring',qty:1,material:'Silver',quality:'Rare',
    enchantments:['Glowing'],ownerUid:'private-uid',storageId:'secret-bag',
    storageSlot:5,equipped:true,location:'equipment',history:['private']};
  const row=validateGMRewardPayload({items:[source]}).items[0];
  for(const key of ['ownerUid','storageId','storageSlot','equipped','location','history'])
    assert.equal(Object.hasOwn(row,key),false,key);
  assert.deepEqual(row.enchantments,['Glowing']);
  assert.equal(row.material,'Silver');assert.equal(row.quality,'Rare');
});
test('Phase 3.2: a saved bundle preserves its ID and creation time on edits',()=>{
  const old={id:'bundle-1',createdAt:'2026-01-01T00:00:00Z'};
  const saved=prepareGMRewardBundle({id:'bundle-1',name:'Ancient Cache',
    currency:{key:'copper',amount:120},items:[{name:'Elixir',qty:2}]},old);
  assert.equal(saved.id,'bundle-1');assert.equal(saved.createdAt,old.createdAt);
  assert.equal(saved.items.length,1);
});
test('Phase 3.2: searchable reward history retains statuses and sorts newest first',()=>{
  const entries=[
    {id:'a',type:'loot-reward',targetCharacterId:'a',status:'pending',payload:{item:{name:'Potion',qty:2}},createdAt:'2026-01-01'},
    {id:'b',type:'loot-reward',targetCharacterId:'b',status:'equipped',payload:{item:{name:'Sword',qty:1}},createdAt:'2026-01-02'},
    {id:'c',type:'currency-reward',targetCharacterId:'a',payload:{key:'silver',amount:100},createdAt:'2026-01-03'}
  ];
  assert.deepEqual(filterGMRewardEvents(entries,{},{}).map(row=>row.id),['c','b','a']);
  assert.deepEqual(filterGMRewardEvents(entries,{status:'Equipped'},{}).map(row=>row.id),['b']);
  assert.deepEqual(filterGMRewardEvents(entries,{search:'alice'},{a:{name:'Alice'}}).map(row=>row.id),['c','a']);
  assert.equal(rewardEventStatus(entries[0]),'Pending');
  assert.equal(rewardEventStatus(entries[1]),'Equipped');
  assert.match(rewardEventLabel(entries[2]),/100 Silver Mark/);
});
