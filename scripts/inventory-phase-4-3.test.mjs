import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inventoryActivityDelta,inventoryActivityLabel,inventoryActivityRecords} from '../src/state/inventoryActivityModel.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const owner={id:'char-a',ownerUid:'alice',actionLog:[
  {id:'local-1',type:'item-used',message:'Used healing potion',at:'2026-11-11T08:00:00Z'},
  {id:'other',type:'unrelated',message:'Quest note',at:'2026-11-11T09:00:00Z'}
]};
const events=[
  {id:'reward-1',type:'loot-reward',targetCharacterId:'char-a',targetOwnerUid:'alice',
    payload:{item:{name:'Iron Sword',qty:2}},status:'pending',createdAt:'2026-11-12T08:00:00Z'},
  {id:'money-1',type:'currency-reward',targetCharacterId:'char-a',targetOwnerUid:'alice',
    payload:{key:'silver',amount:12},createdAt:'2026-11-12T09:00:00Z'},
  {id:'secret',type:'loot-reward',targetCharacterId:'char-a',targetOwnerUid:'bob',
    payload:{item:{name:'Secret'}},createdAt:'2026-11-12T10:00:00Z'},
  {id:'other-player',type:'loot-reward',targetCharacterId:'char-b',targetOwnerUid:'alice',
    payload:{item:{name:'Other'}},createdAt:'2026-11-12T11:00:00Z'}
];

test('Phase 4.3: activity is scoped to character and owner with chronological results',()=>{
  const rows=inventoryActivityRecords(owner,events);
  assert.deepEqual(rows.map(row=>row.id),['event:money-1','event:reward-1','activity:local-1']);
  assert.equal(rows[1].pending,true);
  assert.match(rows[0].title,/12 silver/);
  assert.match(rows[1].title,/Iron Sword x2/);
});
test('Phase 4.3: unidentified item labels cannot expose their hidden true name',()=>{
  const row={type:'loot-reward',payload:{item:{
    name:'Unknown blade',trueName:'Secret sword',identified:false,qty:1
  }}};
  assert.match(inventoryActivityLabel(row),/Unknown blade/);
  assert.doesNotMatch(inventoryActivityLabel(row),/Secret sword/);
});
test('Phase 4.3: activity notification ignores initial hydration and Firestore replays',()=>{
  const rows=inventoryActivityRecords(owner,events);
  const initial=inventoryActivityDelta(null,rows);
  assert.deepEqual(initial.added,[]);
  assert.deepEqual(inventoryActivityDelta(initial.ids,[...rows]).added,[]);
  const extra={id:'event:new-1',title:'Shop purchase',at:Date.now()};
  const update=inventoryActivityDelta(initial.ids,[extra,...rows]);
  assert.deepEqual(update.added.map(row=>row.id),['event:new-1']);
  assert.deepEqual(inventoryActivityDelta(update.ids,[extra,...rows]).added,[]);
});
test('Phase 4.3: activity limits are bounded and duplicates are suppressed',()=>{
  const repeated=[events[0],events[0],events[1]];
  assert.equal(inventoryActivityRecords(owner,repeated,1).length,1);
  assert.equal(inventoryActivityRecords(owner,repeated,40).length,3);
  assert.deepEqual(inventoryActivityRecords({},events),[]);
});
test('Phase 4.3: inventory touch actions stay on trusted Firebase commands',()=>{
  const file=read('../src/dashboards/InventoryWorkspace.jsx');
  const character=read('../src/dashboards/CharacterDashboard.jsx');
  const merchant=read('../src/dashboards/ShopWorkspace.jsx');
  const css=read('../src/styles/asteria-react.css');
  assert.match(file,/inventoryActivityDelta/);
  assert.match(file,/role="status" aria-live="polite"/);
  assert.match(file,/Inventory &amp; Trade Journal/);
  assert.match(file,/onEquipSelected/);
  assert.match(file,/type:'quick',itemId:selected.id,index/);
  assert.match(file,/type:'equip',itemId:selected.id,slot/);
  assert.match(file,/aria-label=\{\`Assign/);
  assert.match(character,/editable=\{editable\} events=\{live\.events\}/);
  assert.match(merchant,/Check inventory and merchant history before retrying/);
  assert.match(css,/@media \(hover:none\),\(pointer:coarse\)/);
  assert.match(css,/safe-area-inset-bottom/);
});
