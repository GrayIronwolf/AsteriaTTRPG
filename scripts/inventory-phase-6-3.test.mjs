import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLootTable} from '../src/state/lootTableModel.mjs';
import {validateLootBatchRequest,prepareLootBatch,MAX_LOOT_BATCH_ROLLS} from '../src/state/lootBatchModel.mjs';

const table=validateLootTable({name:'Bandit Hideout',location:'North Passage',threatTier:3,status:'active',
  entries:[{id:'empty',kind:'nothing',weight:1,note:'Nothing'},
    {id:'coins',kind:'currency',weight:1,minCopper:30,maxCopper:30,note:'Money'},
    {id:'sword',kind:'item',weight:1,name:'Iron Sword',definitionId:'base:sword',
      minQuantity:2,maxQuantity:2,note:'Sword'}]},'bandits');

test('Phase 6.3: bounded batch counts, source and identifiers',()=>{
  assert.equal(MAX_LOOT_BATCH_ROLLS,10);
  assert.deepEqual(validateLootBatchRequest({count:3,source:' A Cave '}),{count:3,source:'A Cave'});
  for(const count of [0,-1,1.5,11,100,'3',null,undefined])
    assert.throws(()=>validateLootBatchRequest({count}),/whole loot rolls/);
  assert.throws(()=>validateLootBatchRequest({count:1,source:'x'.repeat(161)}),/160/);
  assert.throws(()=>prepareLootBatch(table,{count:1},'bad/path',()=>0),/identifier/);
});

test('Phase 6.3: batch results generate only nonempty hidden-drop payloads',()=>{
  const draws=[0,1,0,2,0];
  const result=prepareLootBatch(table,{count:3,source:'North Passage'},'batchtest',()=>draws.shift());
  assert.equal(result.totalRolls,3);
  assert.equal(result.generatedCount,2);
  assert.equal(result.emptyCount,1);
  assert.equal(result.results[0].payload,null);
  assert.equal(result.results[1].payload.drop.kind,'currency');
  assert.equal(result.results[1].payload.drop.currencyCopper,30);
  assert.equal(result.results[1].payload.drop.source,'North Passage');
  assert.equal(result.results[2].payload.drop.item.qty,2);
  assert.equal(result.results[2].payload.secretItem.qty,2);
  assert.equal(new Set(result.results.filter(r=>r.lootId).map(r=>r.lootId)).size,2);
});

test('Phase 6.3: all empty rolls prepare zero writes',()=>{
  const result=prepareLootBatch(table,{count:10},'emptybatch',()=>0);
  assert.equal(result.generatedCount,0);
  assert.equal(result.emptyCount,10);
  assert.ok(result.results.every(row=>row.lootId===null&&!row.generated));
});

test('Phase 6.3: server batch requires GM authorization, table revision, atomic drafts',()=>{
  const src=readFileSync(new URL('../functions/lootTableCommands.mjs',import.meta.url),'utf8');
  const party=readFileSync(new URL('../functions/partyLootCommands.mjs',import.meta.url),'utf8');
  assert.match(src,/requireCampaignGM\(tx,campaignId\)/);
  assert.match(src,/action\.expectedRevision!==previous\.revision/);
  assert.match(src,/prepareLootBatch\(previous,action\.batch/);
  assert.match(src,/Promise\.all\(generated\.flatMap/);
  assert.match(src,/tx\.set\(doc\(db,'campaigns',campaignId,'partyLootDrafts'/);
  assert.match(party,/delete publicDrop\.generatedFrom/);
  assert.doesNotMatch(src,/writeLiveCharacter|setCurrencyTotal|placeCharacterItem/);
});
