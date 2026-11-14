import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 RANDOM_TABLE_CATEGORIES,MAX_RANDOM_TABLE_ENTRIES,
 validateRandomTable,rollRandomTable,randomTableStarter,randomLootLinks,randomBatchCount
} from '../src/state/randomTableModel.mjs';
import {createRandomTableCommands} from '../functions/randomTableCommands.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const entry=(id='entry-a',overrides={})=>({id,kind:'text',
  label:'Unexpected visitors',description:'Three travellers ask for shelter.',
  weight:2,note:'Private GM information',...overrides});
const draft=(overrides={})=>({
 name:'Snowy Mountain Encounters',category:'encounter',
 description:'GM encounters',location:'Altarin',threatTier:3,
 entries:[entry(),entry('entry-b',{label:'Wildlife',weight:1})],
 ...overrides
});
const id='random-table-one';
const prepared=()=>validateRandomTable(draft(),id);
function fakeContext(){
 const store=new Map(),reads=[],writes=[];
 const doc=(base,...parts)=>({path:parts.join('/')});
 const db={},currentUser={uid:'gm'};
 const tx={
   get:async ref=>{
     reads.push(ref.path);
     const data=store.get(ref.path);
     return {exists:()=>Boolean(data),data:()=>data};
   },
   set:(ref,row)=>{store.set(ref.path,row);writes.push(['set',ref.path]);},
   update:(ref,patch)=>{store.set(ref.path,{...store.get(ref.path),...patch});writes.push(['update',ref.path]);}
 };
 const context={db,currentUser,doc,requestId:'test-op-id',
   serverTimestamp:()=>12345,runTransaction:async(_db,run)=>run(tx)};
 return {store,reads,writes,context,tx};
}
test('Phase 7.2 supports categories, starter templates and bounded weighted entry validation',()=>{
 assert.deepEqual(RANDOM_TABLE_CATEGORIES.map(row=>row.id),
   ['encounter','npc','event','travel','custom']);
 for(const category of RANDOM_TABLE_CATEGORIES){
  let n=0;const rows=randomTableStarter(category.id,()=>'entry-'+(++n));
  assert.equal(rows.length,3);
  assert.equal(rows.every(row=>row.kind==='text'&&row.weight===1),true);
 }
 const table=prepared();
 assert.equal(table.totalWeight,3);
 assert.equal(table.revision,1);
 assert.equal(table.threatTier,3);
 assert.equal(table.entries.length,2);
 assert.equal(table.status,'active');
});
test('Reject invalid weights, forged fields, duplicate IDs, unsupported categories and oversized entries',()=>{
 for(const invalid of [
  {entries:[]},{entries:Array.from({length:MAX_RANDOM_TABLE_ENTRIES+1},(_,i)=>entry('entry-'+i))},
  {entries:[entry('duplicate'),entry('duplicate')]},
  {entries:[entry('one',{weight:0})]},
  {entries:[entry('one',{weight:1001})]},
  {entries:[entry('one',{weight:1.1})]},
  {entries:[entry('one',{kind:'secret'})]},
  {entries:[entry('one',{label:''})]},
  {category:'not-a-category'},{threatTier:21},
  {entries:[entry('one',{total:999})]},
  {entries:[entry('one',{kind:'text',lootTableId:'loot-one'})]},
  {name:'x'.repeat(101)}
 ])assert.throws(()=>validateRandomTable(draft(invalid),id));
 assert.throws(()=>validateRandomTable(draft(),id,{status:'archived',revision:2}),/Archived/);
 assert.throws(()=>randomBatchCount(11));
 assert.throws(()=>randomBatchCount(0));
 assert.throws(()=>randomBatchCount(1.5));
});
test('Weighted server selection works at every probability boundary with no gameplay mutation',()=>{
 const table=prepared(),before=JSON.stringify(table);
 assert.equal(rollRandomTable(table,()=>0).entryId,'entry-a');
 assert.equal(rollRandomTable(table,()=>1).entryId,'entry-a');
 const last=rollRandomTable(table,()=>2);
 assert.equal(last.entryId,'entry-b');
 assert.equal(last.totalWeight,3);
 assert.equal(last.draw,3);
 assert.equal(last.chancePercent,33.33);
 assert.equal(last.tableName,'Snowy Mountain Encounters');
 assert.equal(JSON.stringify(table),before);
 for(const illegal of [-1,3,0.5,NaN])assert.throws(()=>rollRandomTable(table,()=>illegal));
 assert.throws(()=>rollRandomTable({...table,status:'archived'},()=>0));
});
test('Loot references are informative and do not generate inventory or currency',()=>{
 const clean=validateRandomTable(draft({entries:[
  entry('linked',{kind:'loot-link',label:'Hidden treasure',lootTableId:'loot-existing'}),
  entry('plain',{label:'An old bridge',weight:1})
 ]}),id);
 assert.deepEqual(randomLootLinks(clean),['loot-existing']);
 const selected=rollRandomTable(clean,()=>0);
 assert.equal(selected.lootTableId,'loot-existing');
 assert.equal(selected.kind,'loot-link');
 assert.equal(selected.item,undefined);
 assert.equal(selected.currencyCopper,undefined);
});
test('GM command creates saved tables, authoritative batch results, immutable history and archive',async()=>{
 const f=fakeContext();
 const commands=createRandomTableCommands(f.context,{requireCampaignGM:async()=>true});
 const action=(type,props={})=>commands.manageRandomTable('campaign-one','gm-scope',{
  type,tableId:id,expectedRevision:type==='save'?0:1,...props
 });
 const saved=await action('save',{table:draft()});
 assert.equal(saved.ok,true);
 assert.equal(saved.revision,1);
 assert.equal(f.store.get('campaigns/campaign-one/randomTables/'+id).status,'active');
 const batch=await action('batch',{count:5});
 assert.equal(batch.ok,true);
 assert.equal(batch.rollCount,5);
 assert.equal(batch.preview,true);
 assert.equal(batch.applied,false);
 assert.equal(batch.results.length,5);
 assert.equal(f.store.get('campaigns/campaign-one/randomTableRolls/random-roll-test-op-id').results.length,5);
 assert.equal(f.writes.some(row=>row[1].includes('partyLoot')),false);
 const archived=await action('archive');
 assert.equal(archived.ok,true);
 assert.equal(archived.status,'archived');
 const rejected=await commands.manageRandomTable('campaign-one','gm-scope',{
  type:'roll',tableId:id,expectedRevision:2});
 assert.equal(rejected.ok,false);
});
test('GM permission check occurs before reading or writing table documents',async()=>{
 const f=fakeContext();
 const commands=createRandomTableCommands(f.context,{requireCampaignGM:async()=>{throw Error('GM only');}});
 const result=await commands.manageRandomTable('campaign-one','gm-scope',{
  type:'save',tableId:id,expectedRevision:0,table:draft()});
 assert.equal(result.ok,false);
 assert.match(result.error,/GM only/);
 assert.equal(f.writes.length,0);
 assert.equal(f.reads.length,0);
});
test('Loot references must exist and be active before saving',async()=>{
 const f=fakeContext();
 const commands=createRandomTableCommands(f.context,{requireCampaignGM:async()=>true});
 const input=draft({entries:[entry('linked',{kind:'loot-link',
   label:'See GM loot table',lootTableId:'loot-missing'})]});
 const fail=await commands.manageRandomTable('campaign-one','gm-scope',{
  type:'save',tableId:id,expectedRevision:0,table:input});
 assert.equal(fail.ok,false);
 assert.match(fail.error,/must be an existing active table/);
 assert.equal(f.writes.length,0);
 f.store.set('campaigns/campaign-one/lootTables/loot-missing',{status:'active'});
 const success=await commands.manageRandomTable('campaign-one','gm-scope',{
  type:'save',tableId:id,expectedRevision:0,table:input});
 assert.equal(success.ok,true);
});
test('Frontend and backend are connected without replacing loot or advanced dice',()=>{
 const gm=read('src/dashboards/GMDashboard.jsx'),
  ui=read('src/dashboards/GMRandomTableWorkspace.jsx'),
  router=read('functions/handler.mjs'),
  commands=read('functions/commands.mjs'),
  rules=read('firestore.rules'),
  auth=read('js/firebase-auth.js'),
  toolkit=read('src/state/gmToolkitModel.mjs');
 assert.match(gm,/GMRandomTableWorkspace/);
 assert.match(gm,/tab === 'random-tables'/);
 assert.match(ui,/randomTableStarter/);
 assert.match(ui,/manageRandomTable/);
 assert.match(ui,/subscribeRandomTableHistory/);
 assert.match(auth,/subscribeRandomTables: function/);
 assert.match(router,/'manageRandomTable'/);
 assert.match(commands,/createRandomTableCommands/);
 assert.match(rules,/match \/randomTables\/\{tableId\}/);
 assert.match(rules,/match \/randomTableRolls\/\{rollId\}/);
 assert.match(toolkit,/id:'random-tables'/);
});
