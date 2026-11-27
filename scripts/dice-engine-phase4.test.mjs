import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultDiceWindowSettings,validateDiceWindowSettings,readDiceWindowSettings,
 addDiceToPool,removeDiceFromPool,formatShareableDiceResult}
 from '../src/dice/diceWindowModel.mjs';
import {diceGesture,fitDieInsideTray} from '../src/dice/diceTrayInteraction.mjs';
import {trayOutline,verifyTrayContainment} from '../src/dice/diceTrayGeometry.mjs';
import {defaultDiceTrayAppearance} from '../src/dice/diceTrayCatalogue.mjs';
import {diceResult,diceExpression,dicePreset} from '../src/state/diceRollModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Phase 4 window settings are device-local and reject invalid input',()=>{
 const defaults=defaultDiceWindowSettings();
 assert.deepEqual(validateDiceWindowSettings(defaults),defaults);
 assert.deepEqual(readDiceWindowSettings(JSON.stringify(defaults)),defaults);
 assert.deepEqual(readDiceWindowSettings('invalid'),defaults);
 for(const invalid of [{...defaults,version:2},{...defaults,towerId:'hacked'},
  {...defaults,cameraPreset:'remote'},{...defaults,autoHideResult:'yes'},
  {...defaults,accountId:'other'},{...defaults,interactionSpeed:'warp'}])
  assert.throws(()=>validateDiceWindowSettings(invalid));
});
test('drawer add/remove respects roll limits without modifying original pool',()=>{
 const original=[{count:1,sides:20}];
 const added=addDiceToPool(original,6);
 assert.deepEqual(original,[{count:1,sides:20}]);
 assert.deepEqual(added,[{count:1,sides:20},{count:1,sides:6}]);
 assert.deepEqual(removeDiceFromPool(added,20),[{count:1,sides:6}]);
 let pool=original;
 for(let i=0;i<80;i++)pool=addDiceToPool(pool,20);
 assert.equal(pool[0].count,40);
 assert.deepEqual(addDiceToPool(pool,6),pool);
 assert.throws(()=>addDiceToPool(original,7));
});
test('pointer gestures distinguish click, reposition and flick',()=>{
 assert.equal(diceGesture({x:0,y:0},{x:1,y:1},100).click,true);
 assert.equal(diceGesture({x:0,y:0},{x:18,y:0},400).flick,false);
 assert.equal(diceGesture({x:0,y:0},{x:120,y:0},100).flick,true);
});
test('dragged die coordinates are clamped within the actual physical tray polygon',()=>{
 for(const id of ['obsidian-hexagon','knights-iron','arcane-circle']){
  const outline=trayOutline(defaultDiceTrayAppearance(id),{width:800,height:420});
  const fitted=fitDieInsideTray({x:100,z:100},outline);
  assert.ok(fitted);
  assert.equal(verifyTrayContainment(outline,fitted,.65),true);
 }
});
test('manual GM summary is based only on server-confirmed results',()=>{
 const roll=diceResult({pool:[{count:1,sides:20}],modifier:3,label:'Investigation'},
  ()=>17,1730000000000,'phase-4-official-001');
 const text=formatShareableDiceResult(roll);
 assert.match(text,/Total: 20/);
 assert.match(text,/Server verified/);
 assert.throws(()=>formatShareableDiceResult({total:20}));
});
test('single existing workspace owns fullscreen, drawers, settings and server roll',()=>{
 const work=read('src/dashboards/AdvancedDiceWorkspace.jsx');
 const tray=read('src/dice/AsteriaDiceTray.jsx');
 const css=read('src/styles/advanced-dice.css');
 assert.match(work,/data-dice-window-version="4"/);
 assert.match(work,/requestFullscreen/);
 assert.match(work,/DiceCustomizationStudio/);
 assert.match(work,/DiceAppearanceCollections/);
 assert.match(work,/DiceEffectsControls/);
 assert.match(work,/DiceTowerStudio/);
 assert.match(work,/DiceAppearanceCollections/);
 assert.match(work,/roll\(\{pool:\[\{count:1,sides\}\],modifier:0,label:''\}\)/);
 assert.match(work,/firebaseService\.advancedDiceAction/);
 assert.match(tray,/fitDieInsideTray/);
 assert.match(tray,/onPointerDown/);
 assert.match(tray,/onPointerMove/);
 assert.match(tray,/onWheel/);
 assert.match(tray,/sampleDiceGesture/);
 assert.match(tray,/releaseDiceGesture/);
 assert.match(tray,/engine\.roll\(diceToRoll\)/);
 assert.match(css,/asteria-dice-window-drawer/);
 assert.doesNotMatch(read('src/dice/diceWindowModel.mjs'),/firebaseService|Math\.random/);
});

test('saved preset rendering never passes metadata to the strict dice expression validator',()=>{
 const preset=dicePreset({id:'phase4-preset-001',name:'Phase 4 quick roll',
  pool:[{count:1,sides:20},{count:1,sides:6}],modifier:0,label:''});
 assert.throws(()=>diceExpression(preset),/Invalid dice configuration/);
 assert.equal(diceExpression({pool:preset.pool,modifier:preset.modifier,label:preset.label}),
  '1d20 + 1d6');
 const workspace=read('src/dashboards/AdvancedDiceWorkspace.jsx');
 assert.match(workspace,/diceExpression\(\{pool:preset\.pool,modifier:preset\.modifier,label:preset\.label\}\)/);
 assert.doesNotMatch(workspace,/diceExpression\(preset\)/);
});
