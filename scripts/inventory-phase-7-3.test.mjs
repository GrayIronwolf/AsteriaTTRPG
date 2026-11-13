import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  gmInventoryAuditRows,filterGMInventoryAudit,gmInventoryAuditReceipt,
  exportGMInventoryAuditCsv,GM_INVENTORY_AUDIT_LIMIT
} from '../src/state/gmInventoryAuditModel.mjs';

const now=Date.parse('2026-11-13T10:00:00Z');
const characters={
  first:{id:'a',name:'Alice',ownerUid:'alice',actionLog:[
    {id:'same',type:'shop-purchase',message:'Bought an Iron Sword',at:'2026-11-13T09:00:00Z'},
    {id:'storage',type:'party-stash-deposit',message:'Deposited 2 potions',at:'2026-11-12T10:00:00Z'}
  ]},
  second:{id:'b',name:'Bob',ownerUid:'bob',actionLog:[
    {id:'same',type:'shop-purchase',message:'Bought a Torch',at:'2026-11-13T08:00:00Z'}
  ]}
};
const events=[
  {id:'mirror-a',type:'shop-purchase',targetCharacterId:'a',targetOwnerUid:'alice',
    payload:{activityId:'same',message:'Bought an Iron Sword'},createdAt:'2026-11-13T09:00:03Z'},
  {id:'currency-b',type:'party-currency-split',targetCharacterId:'b',targetOwnerUid:'bob',
    payload:{message:'Received 20 copper'},createdAt:'2026-11-13T09:30:00Z'},
  {id:'forged',type:'shop-sale',targetCharacterId:'a',targetOwnerUid:'bob',
    payload:{message:'Private to Bob'},createdAt:'2026-11-13T09:50:00Z'},
  {id:'other-char',type:'shop-sale',targetCharacterId:'z',targetOwnerUid:'alice',
    payload:{message:'Missing character'},createdAt:'2026-11-13T09:55:00Z'}
];

test('Phase 7.3: campaign GM journal deduplicates mirrors but preserves each character',()=>{
  const rows=gmInventoryAuditRows(characters,events);
  assert.equal(rows.length,4);
  assert.equal(new Set(rows.map(row=>row.id)).size,4);
  assert.equal(rows.filter(row=>row.receiptId==='activity:same').length,2);
  assert.equal(rows[0].category,'currency');
  assert.equal(rows.some(row=>row.title.includes('Private to Bob')),false);
  assert.equal(rows.some(row=>row.title.includes('Missing character')),false);
});

test('Phase 7.3: GM audit filters by character, category, search and date',()=>{
  const rows=gmInventoryAuditRows(characters,events);
  assert.equal(filterGMInventoryAudit(rows,{characterId:'a'}).length,2);
  assert.equal(filterGMInventoryAudit(rows,{characterId:'b'}).length,2);
  assert.equal(filterGMInventoryAudit(rows,{category:'shop'}).length,2);
  assert.equal(filterGMInventoryAudit(rows,{category:'currency',characterId:'b'}).length,1);
  assert.equal(filterGMInventoryAudit(rows,{query:'IRON SWORD'}).length,1);
  assert.equal(filterGMInventoryAudit(rows,{dateRange:'7d',now}).length,4);
  assert.equal(filterGMInventoryAudit(rows,{dateRange:'unknown',now}).length,0);
});

test('Phase 7.3: receipt and export do not include unrevealed or arbitrary source fields',()=>{
  const rows=gmInventoryAuditRows(characters,events);
  const enriched={...rows[0],curse:'Forbidden',trueName:'Blood Blade',gmNotes:'Never tell players'};
  const receipt=gmInventoryAuditReceipt(enriched);
  assert.deepEqual(Object.keys(receipt),[
    'reference','dateUtc','category','activity','origin','character','characterId','pending'
  ]);
  const csv=exportGMInventoryAuditCsv([enriched,...rows]);
  assert.match(csv,/Character ID/);
  assert.match(csv,/Alice/);
  assert.match(csv,/Bob/);
  assert.doesNotMatch(csv,/Forbidden|Blood Blade|Never tell players/);
});

test('Phase 7.3: campaign export resists spreadsheet formulas and limits rows',()=>{
  const source=gmInventoryAuditRows(characters,events)[0];
  const csv=exportGMInventoryAuditCsv([{...source,title:' =SUM(A1:A2)',characterName:'@HACK'}]);
  assert.match(csv,/"' =SUM\(A1:A2\)"/);
  assert.match(csv,/"'@HACK"/);
  assert.equal(GM_INVENTORY_AUDIT_LIMIT,200);
  const many=Array.from({length:250},(_,i)=>({...source,id:'row'+i}));
  assert.equal(exportGMInventoryAuditCsv(many).split('\r\n').length,202);
});

test('Phase 7.3: GM audit is read-only and uses existing GM dashboard access',()=>{
  const ui=readFileSync(new URL('../src/dashboards/GMInventoryAuditWorkspace.jsx',import.meta.url),'utf8');
  const dash=readFileSync(new URL('../src/dashboards/GMDashboard.jsx',import.meta.url),'utf8');
  const model=readFileSync(new URL('../src/state/gmInventoryAuditModel.mjs',import.meta.url),'utf8');
  assert.match(ui,/Export filtered GM CSV/);
  assert.match(ui,/Selected GM transaction receipt/);
  assert.match(dash,/GMInventoryAuditWorkspace characters=\{live.characters\} events=\{live.events\}/);
  assert.match(dash,/AsteriaCharacterAccess\.isGM/);
  assert.doesNotMatch(model,/runTransaction|setDoc|updateDoc|deleteDoc|collection\(/);
});
