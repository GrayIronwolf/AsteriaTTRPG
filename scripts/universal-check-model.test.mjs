import test from 'node:test';
import assert from 'node:assert/strict';
import {UNIVERSAL_CHECK_RANKS,universalSkillRankModifier,universalCheckOutcome,
  universalCheckModifierBreakdown} from '../src/state/universalCheckModel.mjs';
test('all eight approved Asteria ranks map correctly',()=>{
  assert.deepEqual(Object.values(UNIVERSAL_CHECK_RANKS),[-2,-1,0,1,2,3,4,5]);
  assert.equal(universalSkillRankModifier('Expert'),3);
  assert.throws(()=>universalSkillRankModifier(4),/legacy numeric/);
});
test('d20 criticals and opposed ties are resolved',()=>{
  assert.equal(universalCheckOutcome(1,100,10).outcome,'critical-failure');
  assert.equal(universalCheckOutcome(20,-100,30).outcome,'critical-success');
  assert.equal(universalCheckOutcome(15,0,null,{opposed:true}).outcome,'awaiting-opponent');
  assert.equal(universalCheckOutcome(15,0,15).success,true);
});
test('modifier breakdown is validated',()=>{
  assert.equal(universalCheckModifierBreakdown([{label:'Rank',value:2},{label:'Situation',value:-3}]).total,-1);
  assert.throws(()=>universalCheckModifierBreakdown([{label:'Invalid',value:Infinity}]));
});
