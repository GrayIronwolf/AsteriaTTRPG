import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {
  MAX_3D_DICE_MESHES,prepareAsteriaDicePreview,matchesAsteriaDicePreview
} from '../src/dice/openDiceAdapter.mjs';

function serverRoll(pool,faces,modifier=0){
  const remaining=[...faces];
  return diceResult({pool,modifier,label:'3D integration'},
    ()=>remaining.shift(),1730000000000,'open-dice-phase1');
}
const preview=roll=>prepareAsteriaDicePreview(roll);
const observed=faces=>({results:faces.map(value=>({value,visible:value})),variances:[]});

test('One reusable adapter accepts only authoritative server rolls',()=>{
  const roll=serverRoll([{count:1,sides:20}],[20],5);
  const scene=preview(roll);
  assert.equal(roll.total,25);
  assert.equal(scene.total,25);
  assert.equal(scene.dice[0].rolled,20);
  assert.equal(scene.mode,'3d');
  assert.equal(matchesAsteriaDicePreview(scene,observed([20])),true);
  assert.throws(()=>preview({...roll,source:'player-reported'}),/server-digital/);
  assert.throws(()=>preview({...roll,total:999}),/totals/);
  assert.throws(()=>preview({...roll,results:[{...roll.results[0],faces:[19]}]}),/sum/);
  assert.throws(()=>preview({...roll,results:[{...roll.results[0],faces:[21]}]}),/range/);
});

test('d10 rolls of ten and d100 rolls of one hundred map to physical zeros',()=>{
  const roll=serverRoll([
    {count:1,sides:10},{count:2,sides:100}
  ],[10,42,100],4);
  assert.equal(roll.total,156);
  const scene=preview(roll);
  assert.deepEqual(scene.dice.map(die=>die.rolled),[0,42,0]);
  assert.deepEqual(scene.expectedFaces,[0,2,40,0,0]);
  assert.equal(scene.meshCount,5);
  assert.equal(scene.total,156);
  assert.equal(matchesAsteriaDicePreview(scene,observed([0,2,40,0,0])),true);
  assert.equal(matchesAsteriaDicePreview(scene,observed([10,2,40,0,0])),false);
});

test('Every supported dice type keeps its Firebase face and order',()=>{
  const types=[4,6,8,10,12,20,100];
  const roll=serverRoll(types.map(sides=>({count:1,sides})),
    [4,6,8,7,12,17,42],5);
  const scene=preview(roll);
  assert.equal(roll.total,101);
  assert.deepEqual(scene.dice.map(die=>die.dice),
    types.map(sides=>'d'+sides));
  assert.deepEqual(scene.expectedFaces,[4,6,8,7,12,17,2,40]);
  assert.equal(matchesAsteriaDicePreview(scene,observed(scene.expectedFaces)),true);
});

test('Renderer mismatches cannot overwrite the saved result',()=>{
  const scene=preview(serverRoll([{count:2,sides:6}],[3,4],2));
  assert.equal(scene.total,9);
  assert.equal(matchesAsteriaDicePreview(scene,observed([3,4])),true);
  assert.equal(matchesAsteriaDicePreview(scene,observed([4,3])),false);
  assert.equal(matchesAsteriaDicePreview(scene,
    {results:[{value:3,visible:2},{value:4,visible:4}],
      variances:[{expected:3,visible:2}]}),false);
  assert.equal(matchesAsteriaDicePreview(scene,{total:7,results:[]}),false);
});

test('Pools exceeding the WebGL preview budget preserve their complete server result',()=>{
  const roll=serverRoll([{count:40,sides:6}],Array(40).fill(6),-5);
  assert.equal(roll.total,235);
  const scene=preview(roll);
  assert.equal(MAX_3D_DICE_MESHES,24);
  assert.deepEqual({mode:scene.mode,total:scene.total,meshCount:scene.meshCount},
    {mode:'text',total:235,meshCount:40});
  assert.equal(matchesAsteriaDicePreview(scene,observed([6])),false);
  const percentiles=serverRoll([{count:13,sides:100}],Array(13).fill(100));
  assert.equal(preview(percentiles).mode,'text');
});

test('Existing private history/presets and server-only rolling stay wired to the same workspace',()=>{
  const ui=readFileSync(new URL('../src/dashboards/AdvancedDiceWorkspace.jsx',import.meta.url),'utf8');
  const scene=readFileSync(new URL('../src/dice/AsteriaDiceTray.jsx',import.meta.url),'utf8');
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.match(ui,/AdvancedDiceWorkspace/);
  assert.match(ui,/firebaseService\.advancedDiceAction/);
  assert.match(ui,/firebaseService\.subscribeDiceWorkspace/);
  assert.match(ui,/onClick=\{savePreset\}/);
  assert.match(ui,/Clear private roll history/);
  assert.match(ui,/Roll All/);
  assert.match(ui,/<AsteriaDiceTray/);
  assert.match(scene,/import\('open-dice-dnd'\)/);
  assert.match(scene,/instance\.destroy\(\)/);
  assert.doesNotMatch(ui+scene,/Math\.random/);
  assert.equal(pkg.dependencies['open-dice-dnd'],'1.13.0');
  assert.ok(pkg.dependencies.three);
  assert.ok(pkg.dependencies['cannon-es']);
});
