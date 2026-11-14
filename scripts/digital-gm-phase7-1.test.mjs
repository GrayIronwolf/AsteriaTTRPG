import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DICE_SIDES,dicePool,diceConfig,diceExpression,diceResult,
  dicePreset,validateDiceAction,MAX_DICE_HISTORY,MAX_DICE_PRESETS
} from '../src/state/diceRollModel.mjs';
import {advancedDiceAction} from '../functions/advancedDiceCommands.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const config={pool:[{count:2,sides:6},{count:1,sides:20}],modifier:4,label:'Initiative damage'};
const rollRequest=(requestId='roll-123456')=>({action:'roll',requestId,...config});
function fakeDatabase(){
  const store=new Map();
  const db={
    doc:path=>({path}),
    runTransaction:async callback=>callback({
      get:async ref=>({exists:store.has(ref.path),data:()=>store.get(ref.path)}),
      set:(ref,data)=>store.set(ref.path,data)
    })
  };
  return {db,store};
}
test('Phase 7.1 supports standard tabletop dice and mixed dice groups',()=>{
  assert.deepEqual(DICE_SIDES,[4,6,8,10,12,20,100]);
  assert.deepEqual(dicePool(config.pool),config.pool);
  assert.equal(diceExpression(config),'2d6 + 1d20 + 4');
  assert.equal(diceExpression({pool:[{count:1,sides:20}],modifier:-3,label:''}),'1d20 - 3');
  assert.equal(diceExpression({pool:[{count:1,sides:100}],modifier:0,label:''}),'1d100');
  assert.equal(diceConfig(config).label,'Initiative damage');
});
test('Dice request schema rejects unbounded pools and forged server result fields',()=>{
  for(const bad of [
    [{count:41,sides:6}], [{count:2.5,sides:6}],
    [{count:1,sides:5}], [],Array.from({length:9},()=>({count:1,sides:6})),
    [{count:30,sides:6},{count:11,sides:4}],
    [{count:1,sides:20,faces:[20]}]
  ])assert.throws(()=>dicePool(bad));
  assert.throws(()=>diceConfig({...config,modifier:1.3}));
  assert.throws(()=>diceConfig({...config,modifier:1000}));
  assert.throws(()=>diceConfig({...config,label:'Z'.repeat(81)}));
  assert.throws(()=>validateDiceAction({...rollRequest(),total:999}));
  assert.throws(()=>validateDiceAction({...rollRequest(),source:'physical'}));
  assert.throws(()=>validateDiceAction({...rollRequest(),requestId:'bad'}));
  assert.throws(()=>validateDiceAction({action:'clear-history',confirmed:false}));
});
test('Server-digital roll records each face, sums pools and flags natural 1/20 only on single d20',()=>{
  const values=[3,5,20],result=diceResult(config,()=>values.shift(),1730000000000,'roll-123456');
  assert.equal(result.total,32);
  assert.equal(result.subtotal,28);
  assert.deepEqual(result.results.map(row=>row.faces),[[3,5],[20]]);
  assert.equal(result.natural,'');
  assert.equal(result.source,'server-digital');
  const nat20=diceResult({pool:[{count:1,sides:20}],modifier:1,label:''},()=>20,1730000000000,'natural-20');
  const nat1=diceResult({pool:[{count:1,sides:20}],modifier:1,label:''},()=>1,1730000000000,'natural-01');
  assert.equal(nat20.natural,'natural-20');
  assert.equal(nat1.natural,'natural-1');
  assert.throws(()=>diceResult(config,()=>0,1730000000000,'roll-123456'));
});
test('Saving, updating, deleting and retaining user private presets is bounded',async()=>{
  const {db,store}=fakeDatabase();
  const preset={id:'preset-123456',name:'Longsword',pool:[{count:1,sides:8}],modifier:3,label:'Slash'};
  assert.deepEqual(dicePreset(preset),preset);
  let result=await advancedDiceAction(db,'alice',{action:'save-preset',preset});
  assert.equal(result.presetCount,1);
  result=await advancedDiceAction(db,'alice',{action:'save-preset',preset:{...preset,modifier:4}});
  assert.equal(result.presetCount,1);
  assert.equal(store.get('users/alice/diceWorkspace/current').presets[0].modifier,4);
  await advancedDiceAction(db,'alice',{action:'delete-preset',presetId:preset.id});
  assert.equal(store.get('users/alice/diceWorkspace/current').presets.length,0);
  for(let i=0;i<MAX_DICE_PRESETS;i++){
    await advancedDiceAction(db,'alice',{action:'save-preset',
      preset:{...preset,id:'preset-'+String(i).padStart(8,'0')}});
  }
  await assert.rejects(()=>advancedDiceAction(db,'alice',{action:'save-preset',
    preset:{...preset,id:'preset-overflow'}}),/Remove an existing preset/);
});
test('Private server rolls are stored with idempotent replay, capped history and clear confirmation',async()=>{
  const {db,store}=fakeDatabase();
  let now=1730000000000,face=0;
  const call=input=>advancedDiceAction(db,'alice',input,()=>now,()=>new Date(now),sides=>(++face%sides)+1);
  const first=await call(rollRequest());
  assert.equal(first.ok,true);
  assert.equal(first.roll.source,'server-digital');
  assert.equal(first.roll.results.length,2);
  assert.equal(store.get('users/alice/diceWorkspace/current').history.length,1);
  now+=20;
  const repeat=await call(rollRequest());
  assert.equal(repeat.repeat,true);
  assert.deepEqual(repeat.roll,first.roll);
  assert.equal(face,3);
  await assert.rejects(()=>call(rollRequest('roll-234567')),/allow a moment/);
  for(let i=0;i<MAX_DICE_HISTORY+3;i++){
    now+=300;
    await call(rollRequest('roll-'+String(i).padStart(8,'0')));
  }
  const records=store.get('users/alice/diceWorkspace/current').history;
  assert.equal(records.length,MAX_DICE_HISTORY);
  assert.equal(records[0].id,'roll-00000082');
  await call({action:'clear-history',confirmed:true});
  assert.equal(store.get('users/alice/diceWorkspace/current').history.length,0);
});
test('Calls are scoped to authenticated user and cannot specify another history owner',async()=>{
  const {db,store}=fakeDatabase();
  await advancedDiceAction(db,'alice',rollRequest(),()=>1730000000000,()=>new Date(),()=>5);
  assert.equal(store.has('users/alice/diceWorkspace/current'),true);
  assert.equal(store.has('users/bob/diceWorkspace/current'),false);
  await assert.rejects(()=>advancedDiceAction(db,'alice',{...rollRequest(),uid:'bob'}),/Unsupported/);
  await assert.rejects(()=>advancedDiceAction(db,'',rollRequest()),/Sign in/);
});
test('UI, callable, private Firestore rule and dashboard navigation are wired together',()=>{
  const index=read('functions/index.mjs'),auth=read('js/firebase-auth.js');
  const rules=read('firestore.rules'),gm=read('src/dashboards/GMDashboard.jsx');
  const player=read('src/dashboards/CharacterDashboard.jsx');
  const ui=read('src/dashboards/AdvancedDiceWorkspace.jsx');
  const toolkit=read('src/state/gmToolkitModel.mjs');
  assert.match(index,/export const asteriaAdvancedDice=onCall/);
  assert.match(auth,/advancedDiceAction: async data/);
  assert.match(auth,/subscribeDiceWorkspace: function/);
  assert.match(rules,/match \/diceWorkspace\/\{documentId\}/);
  assert.match(rules,/collectionId != 'characters' && collectionId != 'diceWorkspace'/);
  assert.match(rules,/allow create, update, delete: if false/);
  assert.match(gm,/AdvancedDiceWorkspace role="gm"/);
  assert.match(player,/AdvancedDiceWorkspace role="player"/);
  assert.match(toolkit,/id:'advanced-dice'/);
  assert.match(ui,/Roll digital dice/);
  assert.match(ui,/Save preset/);
  assert.match(ui,/Clear roll history/);
  assert.doesNotMatch(ui,/Math\.random/);
});
