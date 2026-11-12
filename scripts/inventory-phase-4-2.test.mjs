import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {linkedGMRewardRecipients,normalizeGMRewardRecipients,previewGMRewardBatch,deliverGMRewardBatch} from '../src/state/gmRewardBatchModel.mjs';

const characters={
  a:{id:'a',name:'Alice',klass:'Ranger'},
  b:{id:'b',name:'Bob',klass:'Paladin'},
  c:{id:'c',name:'Charlie',klass:'Wizard'}
};
const reward={items:[{name:'Healing Potion',qty:2,material:'Glass'}],currency:{key:'silver',amount:25},bundleName:'Forest Cache',message:'From the village'};
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Phase 4.2: linked recipient search is deterministic and filters only known linked character IDs',()=>{
  assert.deepEqual(linkedGMRewardRecipients(characters).map(row=>row.id),['a','b','c']);
  assert.deepEqual(linkedGMRewardRecipients(characters,'ranger').map(row=>row.id),['a']);
  assert.deepEqual(linkedGMRewardRecipients(characters,'BO').map(row=>row.id),['b']);
});

test('Phase 4.2: reject empty and unknown recipient selections, cap at 50, dedupe IDs',()=>{
  assert.throws(()=>normalizeGMRewardRecipients([],characters),/at least one/);
  assert.throws(()=>normalizeGMRewardRecipients(['missing'],characters),/no longer linked/);
  assert.throws(()=>normalizeGMRewardRecipients(['a','missing'],characters),/no longer linked/);
  assert.deepEqual(normalizeGMRewardRecipients(['a','b','a'],characters),['a','b']);
  const many=Object.fromEntries(Array.from({length:51},(_,i)=>['member'+i,{id:'member'+i,name:'Player '+i}]));
  assert.throws(()=>normalizeGMRewardRecipients(Object.keys(many),many),/50 or fewer/);
});

test('Phase 4.2: preview validates reward content and describes exact totals without changing inputs',()=>{
  const source={recipientIds:['a','b'],characters,reward};
  const plan=previewGMRewardBatch(source);
  assert.equal(plan.characters,2);
  assert.equal(plan.itemTypes,1);
  assert.equal(plan.itemUnitsPerCharacter,2);
  assert.equal(plan.totalItemUnits,4);
  assert.equal(plan.currencyPerCharacter,25);
  assert.equal(plan.totalCurrency,50);
  assert.deepEqual(plan.recipientIds,['a','b']);
  assert.deepEqual(reward.items[0],{name:'Healing Potion',qty:2,material:'Glass'});
  assert.throws(()=>previewGMRewardBatch({recipientIds:['a'],characters,reward:{}}),/Add an item or currency/);
  assert.throws(()=>previewGMRewardBatch({recipientIds:['a'],characters,reward:{currency:{key:'gold',amount:-2}}}),/whole currency/);
});

test('Phase 4.2: delivered rewards are handled exactly once, in reviewed order',async()=>{
  const calls=[],progress=[];
  const plan=previewGMRewardBatch({recipientIds:['c','a','b'],characters,reward});
  const result=await deliverGMRewardBatch(plan,async(id,payload)=>{
    calls.push({id,payload});
    return {ok:true,itemCount:payload.items.length};
  },event=>progress.push(event));
  assert.equal(result.ok,true);
  assert.deepEqual(calls.map(row=>row.id),['c','a','b']);
  assert.ok(calls.every(row=>row.payload.items[0].qty===2));
  assert.deepEqual(result.completed.map(row=>row.characterId),['c','a','b']);
  assert.equal(progress.at(-1).stage,'completed');
});

test('Phase 4.2: stop on first explicit failure and do not deliver to remaining recipients',async()=>{
  const calls=[];
  const plan=previewGMRewardBatch({recipientIds:['a','b','c'],characters,reward});
  const result=await deliverGMRewardBatch(plan,async(id)=>{
    calls.push(id);
    if(id==='b')return {ok:false,error:'Session expired'};
    return {ok:true,itemCount:1};
  });
  assert.equal(result.ok,false);
  assert.deepEqual(calls,['a','b']);
  assert.deepEqual(result.completed.map(row=>row.characterId),['a']);
  assert.equal(result.failed.characterId,'b');
  assert.deepEqual(result.remaining,['c']);
});

test('Phase 4.2: ambiguous network errors never auto-retry (avoid duplicated rewards)',async()=>{
  const calls=[];
  const plan=previewGMRewardBatch({recipientIds:['a','b','c'],characters,reward});
  const result=await deliverGMRewardBatch(plan,async id=>{
    calls.push(id);
    if(id==='b')throw Error('Network timeout after commit');
    return {ok:true,itemCount:1};
  });
  assert.equal(result.ok,false);
  assert.deepEqual(calls,['a','b']);
  assert.match(result.failed.error,/Network timeout/);
  assert.deepEqual(result.remaining,['c']);
});

test('Phase 4.2: UI requires confirmation and preserves reusable bundles and reward history',()=>{
  const page=file('../src/dashboards/GMRewardTools.jsx');
  const dashboard=file('../src/dashboards/GMDashboard.jsx');
  assert.match(page,/previewGMRewardBatch/);
  assert.match(page,/deliverGMRewardBatch/);
  assert.match(page,/Confirm GM Reward Delivery/);
  assert.match(page,/Select All Players/);
  assert.match(page,/Clear Selection/);
  assert.match(page,/Check Reward History before trying again/);
  assert.match(page,/subscribeGMRewardBundles/);
  assert.match(page,/filterGMRewardEvents/);
  assert.match(page,/manageGMRewardBundle/);
  assert.match(dashboard,/GMRewardTools[^\n]*editable=\{live\.session\?\.editable\}/);
});
