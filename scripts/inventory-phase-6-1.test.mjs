import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLootTable,rollLootTable} from '../src/state/lootTableModel.mjs';

const input=()=>({name:'Bandit cache',description:'Encounter treasure',location:'Old road',
  threatTier:3,status:'active',entries:[
    {id:'empty',kind:'nothing',weight:1,note:'Empty chest'},
    {id:'coins',kind:'currency',weight:3,minCopper:2,maxCopper:5,note:'Loose coins'},
    {id:'sword',kind:'item',weight:2,name:'Iron Sword',definitionId:'base:sword',minQuantity:1,maxQuantity:2,note:'Rusty'}
  ]});

test('Phase 6.1: a reusable table normalizes weights, threat and revisions',()=>{
  const one=validateLootTable(input(),'cache');
  assert.equal(one.totalWeight,6);
  assert.equal(one.revision,1);
  assert.equal(one.threatTier,3);
  const next=validateLootTable(input(),'cache',one);
  assert.equal(next.revision,2);
});

test('Phase 6.1: rolls respect inclusive ranges and weighted boundaries',()=>{
  const table=validateLootTable(input(),'cache');
  assert.equal(rollLootTable(table,()=>0).kind,'nothing');
  assert.equal(rollLootTable(table,()=>1).currencyCopper,2);
  const draws=[3,3];
  assert.equal(rollLootTable(table,()=>draws.shift()).currencyCopper,5);
  const itemDraws=[4,1];
  const rolled=rollLootTable(table,()=>itemDraws.shift());
  assert.equal(rolled.kind,'item');
  assert.equal(rolled.item.quantity,2);
  assert.equal(rolled.item.definitionId,'base:sword');
  assert.throws(()=>rollLootTable(table,()=>6),/could not be completed/);
  assert.throws(()=>rollLootTable({...table,status:'archived'},()=>0),/active/);
});

test('Phase 6.1: reject malformed, unbounded, duplicate and impossible entries',()=>{
  const valid=input();
  assert.throws(()=>validateLootTable({...valid,entries:[]},'a'),/1 to 40/);
  assert.throws(()=>validateLootTable({...valid,entries:[...valid.entries,valid.entries[0]]},'a'),/unique/);
  assert.throws(()=>validateLootTable({...valid,entries:[{id:'wrong',kind:'spell',weight:1}]},'a'),/type/);
  assert.throws(()=>validateLootTable({...valid,entries:[{id:'bad',kind:'nothing',weight:0}]},'a'),/whole number/);
  assert.throws(()=>validateLootTable({...valid,entries:[{id:'bad',kind:'nothing',weight:1.5}]},'a'),/whole number/);
  assert.throws(()=>validateLootTable({...valid,entries:[{id:'bad',kind:'currency',weight:1,minCopper:5,maxCopper:2}]},'a'),/whole number/);
  assert.throws(()=>validateLootTable({...valid,entries:[{id:'bad',kind:'item',weight:1,name:'Sword',minQuantity:0,maxQuantity:1}]},'a'),/whole number/);
  assert.throws(()=>validateLootTable({...valid,threatTier:21},'a'),/Threat tier/);
  assert.throws(()=>validateLootTable({...valid,name:'x'.repeat(101)},'a'),/length/);
  assert.throws(()=>validateLootTable({...valid,entries:Array.from({length:41},(_,i)=>({id:'entry-'+i,kind:'nothing',weight:1}))},'a'),/1 to 40/);
});

test('Phase 6.1: table secrets are GM-readable and writes are server-only',()=>{
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  const handler=readFileSync(new URL('../functions/handler.mjs',import.meta.url),'utf8');
  const server=readFileSync(new URL('../functions/lootTableCommands.mjs',import.meta.url),'utf8');
  const start=rules.indexOf('match /lootTables/{tableId}');
  assert.ok(start>0);
  const block=rules.slice(start,start+180);
  assert.match(block,/isCampaignGM\(campaignId\)/);
  assert.match(block,/allow create, update, delete: if false/);
  assert.match(handler,/manageLootTable/);
  assert.match(server,/requireCampaignGM\(tx,campaignId\)/);
  assert.match(server,/randomInt/);
  assert.doesNotMatch(server,/placeCharacterItem|setCurrencyTotal|partyLootDrafts|inventory\.push/);
});
