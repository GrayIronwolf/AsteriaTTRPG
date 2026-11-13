import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  INVENTORY_JOURNAL_DATE_RANGES,filterInventoryJournalDate,
  inventoryJournalReceipt,exportInventoryJournalCsv,inventoryJournalFilename
} from '../src/state/inventoryJournalReceiptModel.mjs';
import {inventoryActivityRecords,filterInventoryActivityRecords} from '../src/state/inventoryActivityModel.mjs';

const NOW=Date.parse('2026-11-13T10:00:00.000Z');
const day=24*60*60*1000;
const records=[
  {id:'activity:one',type:'shop-purchase',title:'Bought potion',category:'shop',source:'activity',at:NOW-2*day},
  {id:'activity:two',type:'party-stash-deposit',title:'Stored sword',category:'stash',source:'activity',at:NOW-29*day},
  {id:'event:three',type:'party-currency-split',title:'Received 50 copper',category:'currency',source:'event',at:NOW-60*day},
  {id:'event:old',type:'shop-sale',title:'Sold a cloak',category:'shop',source:'event',at:NOW-95*day},
  {id:'activity:undated',type:'item-equipped',title:'Equipped shield',category:'equipment',source:'activity',at:0}
];
test('Phase 7.2: date filters use exact bounded UTC timestamps',()=>{
  assert.deepEqual(INVENTORY_JOURNAL_DATE_RANGES.map(x=>x.id),['all','7d','30d','90d']);
  assert.equal(filterInventoryJournalDate(records,'all',NOW).length,5);
  assert.deepEqual(filterInventoryJournalDate(records,'7d',NOW).map(r=>r.id),['activity:one']);
  assert.deepEqual(filterInventoryJournalDate(records,'30d',NOW).map(r=>r.id),['activity:one','activity:two']);
  assert.equal(filterInventoryJournalDate(records,'90d',NOW).length,3);
  assert.deepEqual(filterInventoryJournalDate(records,'unknown',NOW),[]);
  assert.deepEqual(filterInventoryJournalDate(records,'7d',0),[]);
  assert.equal(filterInventoryJournalDate([...records,{id:'future',at:NOW+day}],'7d',NOW).length,1);
});
test('Phase 7.2: receipts include only normalized owner-visible fields',()=>{
  const r=inventoryJournalReceipt({...records[0],curse:'Do not reveal',trueName:'Ancient Blade',
    gmNotes:'Secret',payload:{privateBarter:'Hidden'}});
  assert.deepEqual(Object.keys(r),['reference','dateUtc','category','activity','origin']);
  assert.equal(r.category,'Merchants');
  assert.equal(r.dateUtc,'2026-11-11T10:00:00.000Z');
  assert.equal(r.origin,'Character activity');
  assert.equal(inventoryJournalReceipt(records[2]).origin,'Campaign event');
  assert.throws(()=>inventoryJournalReceipt({}),/reference/);
});
test('Phase 7.2: CSV escapes quotes, commas and newlines and prevents formula injection',()=>{
  const csv=exportInventoryJournalCsv([
    {...records[0],title:'Sword "Royal", ornate\n+INFO'},
    {...records[1],title:'=HYPERLINK("https://bad.example","click")'},
    {...records[2],title:'   @SUM(A1:A9)'},
    {...records[3],title:'-1 dangerous'},
    {...records[4],title:'\t=SUM(1,2)'}
  ]);
  assert.ok(csv.startsWith('\uFEFF"Date (UTC)"'));
  assert.match(csv,/"Sword ""Royal"", ornate\n\+INFO"/);
  assert.match(csv,/"'=HYPERLINK\(""https:\/\/bad\.example"",""click""\)"/);
  assert.match(csv,/"'   @SUM\(A1:A9\)"/);
  assert.match(csv,/"'-1 dangerous"/);
  assert.match(csv,/"'\t=SUM\(1,2\)"/);
  assert.equal(csv.split('\r\n').length,7);
});
test('Phase 7.2: export is bounded, deterministic and uses a safe filename',()=>{
  const entries=Array.from({length:125},(_,i)=>({...records[0],id:'event:'+i}));
  const csv=exportInventoryJournalCsv(entries);
  assert.equal(csv.split('\r\n').length,102);
  assert.equal(exportInventoryJournalCsv(entries),csv);
  assert.equal(inventoryJournalFilename('../My; Hero!?',NOW),
    'asteria-inventory-journal-my-hero-2026-11-13.csv');
});
test('Phase 7.2: uses owner-filtered journal data, never raw Firestore records',()=>{
  const character={id:'a',ownerUid:'owner',actionLog:[
    {id:'tx-1',type:'shop-sale',message:'Sold an apple',at:'2026-11-12T10:00:00.000Z'}
  ]};
  const events=[
    {id:'bad',type:'shop-sale',targetCharacterId:'a',targetOwnerUid:'intruder',
      payload:{message:'Hidden trade'},createdAt:'2026-11-12T10:00:00.000Z'}
  ];
  const normalized=inventoryActivityRecords(character,events,100);
  const visible=filterInventoryActivityRecords(normalized,{category:'shop'});
  const csv=exportInventoryJournalCsv(filterInventoryJournalDate(visible,'7d',NOW));
  assert.match(csv,/Sold an apple/);
  assert.doesNotMatch(csv,/Hidden trade/);
  const ui=readFileSync(new URL('../src/dashboards/InventoryWorkspace.jsx',import.meta.url),'utf8');
  assert.match(ui,/exportInventoryJournalCsv\(visibleActivity\)/);
  assert.match(ui,/filterInventoryJournalDate\(filterInventoryActivityRecords/);
  assert.match(ui,/Selected transaction receipt/);
  assert.match(ui,/Export filtered CSV/);
});
