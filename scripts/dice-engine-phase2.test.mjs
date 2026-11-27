import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {prepareAsteriaDicePreview,matchesAsteriaDicePreview} from '../src/dice/openDiceAdapter.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function roll(sides,faces,modifier=0){
  const next=[...faces];
  return diceResult({pool:[{count:faces.length,sides}],modifier,label:'Phase 2'},
    ()=>next.shift(),1730000000000,'dice-phase2-roll');
}

test('Replay uses one recorded roll, not a client-generated random number',()=>{
  const record=roll(20,[20],5);
  const a=prepareAsteriaDicePreview(record),b=prepareAsteriaDicePreview(record);
  assert.deepEqual(a,b);
  assert.equal(a.total,25);
  assert.equal(matchesAsteriaDicePreview(a,{
    results:[{value:20,visible:20}],variances:[]
  }),true);
  assert.throws(()=>prepareAsteriaDicePreview({...record,total:999}),/totals/);
});

test('d10/d100 100 values remain official even when visual values are zero',()=>{
  const d10=prepareAsteriaDicePreview(roll(10,[10],3));
  const d100=prepareAsteriaDicePreview(roll(100,[100],9));
  assert.equal(d10.total,13);
  assert.equal(d10.dice[0].rolled,0);
  assert.equal(d100.total,109);
  assert.equal(d100.dice[0].rolled,0);
  assert.deepEqual(d100.expectedFaces,[0,0]);
});

test('Phase 2 keeps controls in the same React dice table and preserves data',()=>{
  const ui=read('src/dashboards/AdvancedDiceWorkspace.jsx');
  const tray=read('src/dice/AsteriaDiceTray.jsx');
  const css=read('src/styles/advanced-dice.css');
  assert.match(ui,/<AsteriaDiceTray/);
  assert.match(ui,/onReplay=\{/);
  assert.match(ui,/onClear=\{/);
  assert.match(ui,/setReplayToken/);
  assert.match(ui,/firebaseService\.advancedDiceAction/);
  assert.match(ui,/firebaseService\.subscribeDiceWorkspace/);
  assert.match(ui,/onClick=\{savePreset\}/);
  assert.match(ui,/Clear private roll history/);
  assert.match(tray,/ResizeObserver/);
  assert.match(tray,/_handleResize/);
  assert.match(tray,/onToggleEnabled/);
  assert.match(tray,/Replay last roll/);
  assert.match(tray,/Clear tray/);
  assert.match(tray,/record\.total/);
  assert.match(css,/@container asteriaDice/);
  assert.match(css,/data-tray-size=expanded/);
  assert.match(css,/--asteria-accent/);
  assert.doesNotMatch(ui+tray,/Math\.random/);
});
