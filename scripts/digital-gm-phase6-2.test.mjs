import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createFogCells,validFogCells,resizeFogCells,paintFogStroke,hiddenFogRuns,
  fogRevealFraction,distanceMetersPerCell,measureGridDistance,battleMapPrivatePins
} from '../src/state/battleMapFogModel.mjs';
import {battleMapEditableSettings} from '../src/state/battleMapModel.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('legacy image and looping video maps stay visible until GM enables fog',()=>{
  const scene=battleMapEditableSettings({name:'Glowing cavern',gridColumns:10,gridRows:8});
  assert.equal(scene.fogEnabled,false);
  assert.equal(scene.fogCells,createFogCells(10,8));
  assert.equal(scene.metresPerCell,1);
  assert.equal(createFogCells(2,2,true),'1111');
  assert.equal(createFogCells(2,2,false),'0000');
});
test('hide and reveal brushes apply only within the map bounds',()=>{
  const empty=createFogCells(8,8);
  const revealed=paintFogStroke(empty,8,8,{x:12,y:12},{x:87,y:87},'reveal',0);
  assert.equal(revealed.length,64);
  assert.equal(revealed[0],'1');
  assert.equal(revealed.at(-1),'1');
  assert.ok(revealed.includes('0'));
  const hidden=paintFogStroke(revealed,8,8,{x:50,y:50},{x:50,y:50},'hide',1);
  assert.notEqual(hidden,revealed);
  assert.equal(hidden[4*8+4],'0');
  assert.equal(fogRevealFraction(empty,8,8),0);
  assert.equal(fogRevealFraction('1'.repeat(64),8,8),1);
});
test('fog preserves normalized geometry through map grid size changes',()=>{
  const source=paintFogStroke('0'.repeat(4),2,2,{x:25,y:25},{x:25,y:25},'reveal',0);
  assert.equal(source,'1000');
  const enlarged=resizeFogCells(source,2,2,4,4);
  assert.equal(enlarged,'1100110000000000');
  assert.equal(resizeFogCells(enlarged,4,4,2,2),source);
  const legacy=resizeFogCells('',20,15,10,10);
  assert.equal(legacy.length,100);
  assert.equal(fogRevealFraction(legacy,10,10),0);
});
test('fog snapshots reject corrupt sizes and out-of-range brushes',()=>{
  assert.throws(()=>validFogCells('010',2,2),/does not match/);
  assert.throws(()=>validFogCells('xyz0',2,2),/does not match/);
  assert.throws(()=>validFogCells('0'.repeat(81),81,1),/grid columns/);
  assert.throws(()=>paintFogStroke('0000',2,2,{x:-1,y:0},{x:2,y:2}),/between/);
  assert.throws(()=>paintFogStroke('0000',2,2,{x:0,y:0},{x:2,y:2},'erase'),/Unknown/);
  assert.throws(()=>paintFogStroke('0000',2,2,{x:0,y:0},{x:2,y:2},'reveal',9),/radius/);
  assert.throws(()=>battleMapEditableSettings({name:'Cave',gridColumns:2,gridRows:2,fogCells:'1'}),/does not match/);
});
test('hidden map areas produce compact non-overlapping raster spans',()=>{
  const runs=hiddenFogRuns('010011',3,2);
  assert.deepEqual(runs.map(r=>[r.x,r.y,r.width,r.height]),[
    [0,0,100/3,50],[200/3,0,100/3,50],
    [0,50,100/3,50]
  ]);
  assert.deepEqual(hiddenFogRuns('1111',2,2),[]);
});
test('ruler converts grid squares to metres and restricts scale',()=>{
  assert.deepEqual(measureGridDistance({x:0,y:0},{x:50,y:50},8,6,1.5),
    {squares:5,metres:7.5});
  assert.equal(distanceMetersPerCell(0.29),0.29);
  assert.throws(()=>distanceMetersPerCell(0),/0.1/);
  assert.throws(()=>distanceMetersPerCell(100.01),/0.1/);
  assert.throws(()=>distanceMetersPerCell(1.234),/decimals/);
});
test('GM-only annotations are bounded and normalized',()=>{
  const result=battleMapPrivatePins([{id:'pin-1',label:' Secret corridor ',kind:'note',
    note:'Open after puzzle',x:10.111,y:60.999}]);
  assert.deepEqual(result,[{id:'pin-1',label:'Secret corridor',kind:'note',
    note:'Open after puzzle',x:10.11,y:61}]);
  assert.throws(()=>battleMapPrivatePins([{...result[0],x:120}]),/between/);
  assert.throws(()=>battleMapPrivatePins([result[0],result[0]]),/unique/);
  assert.throws(()=>battleMapPrivatePins(Array.from({length:41},(_,i)=>({...result[0],id:'p'+i}))),/40/);
});
test('React map renderer layers fog above public tokens while keeping GM pins separate',()=>{
  const ui=source('src/dashboards/BattleMapWorkspace.jsx');
  const auth=source('js/firebase-auth.js');
  const rules=source('firestore.rules');
  assert.match(ui,/hiddenFogRuns/);
  assert.match(ui,/onPointerDown/);
  assert.match(ui,/onPointerMove/);
  assert.match(ui,/Fog of War & Map Tools/);
  assert.match(ui,/Distance ruler/);
  assert.match(ui,/Save GM-only notes/);
  assert.match(ui,/onMeasure/);
  assert.match(auth,/subscribeBattleMapPrivatePins/);
  assert.match(auth,/saveBattleMapPrivatePins/);
  assert.match(rules,/match \/battleMaps\/\{mapId\}\/gmNotes\/\{noteId\}/);
  assert.match(rules,/allow get, list: if isCampaignGM\(campaignId\)/);
});
