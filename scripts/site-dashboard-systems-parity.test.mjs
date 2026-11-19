import test from 'node:test';
import assert from 'node:assert/strict';
import {playerCharacterProjection} from '../frontend/src/player/playerDashboardModel.mjs';

const owned='owner-123',id='character-123';
function character(overrides={}) {
  return {id,ownerUid:owned,name:'Character',hp:[24,30],sp:[17,20],mp:[9,15],
    conditions:[{id:'concussion-1',name:'Concussion',description:'Dazed',source:'Combat',
      duration:{unit:'days',value:1},allowPlayerRemoval:false,
      effects:[{id:'concussion-skill',target:'skills',operation:'SUBTRACT',value:3}]}],
    coins:{Gold:25,Silver:16},specialDamage:{soul:{value:5}},
    restState:{request:{status:'pending',soulRecovery:2,note:'Await GM'}},...overrides};
}
test('original conditions, currency, soul damage, and rest are projected without mutating source',()=>{
  const source=character();
  const result=playerCharacterProjection(source,{owned:true});
  assert.equal(result.conditionDetails[0].name,'Concussion');
  assert.equal(result.conditionDetails[0].allowPlayerRemoval,false);
  assert.equal(result.conditionDetails[0].effects[0].value,3);
  assert.equal(result.skillCheck.value,-3);
  assert.equal(result.soulDamage,5);
  assert.equal(result.soulHealingCap,25);
  assert.equal(result.restRequest.status,'pending');
  assert.equal(result.currencies.find(c=>c.id==='gold').amount,25);
  assert.equal(result.currencies.find(c=>c.id==='silver').amount,16);
  assert.equal(source.conditions[0].effects[0].value,3);
});
test('no unexpected GM or owner-only fields leak through shared player projections',()=>{
  const projected=playerCharacterProjection(character({
    journal:[{title:'Private',content:'SECRET ENTRY'}],
    gmNotes:'SECRET GM',campaignSecrets:{hidden:'SECRET'},
    currency:{Gold:4},conditions:[]}),{owned:false});
  assert.deepEqual(projected.journal,[]);
  assert.equal(projected.backstory,'');
  assert.equal('gmNotes' in projected,false);
  assert.equal('campaignSecrets' in projected,false);
  assert.equal(JSON.stringify(projected).includes('SECRET'),false);
  assert.equal(projected.conditionDetails.length,0);
});
test('unsafe currency data and malformed requests do not leak to the dashboard',()=>{
  const projected=playerCharacterProjection(character({
    coins:{Gold:-12,Custom:Infinity,Other:'not-a-number'},
    restState:{request:{status:'not-a-real-status',note:'private'}}}),{owned:true});
  assert.equal(projected.currencies.find(c=>c.id==='gold').amount,0);
  assert.equal(projected.currencies.some(c=>c.label==='Custom'),false);
  assert.equal(projected.restRequest,null);
});
