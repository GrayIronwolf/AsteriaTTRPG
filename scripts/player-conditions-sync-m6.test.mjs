import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {effectIsActive,collectCharacterEffects,characterCheck} from '../src/state/effectsEngine.mjs';
import {makeCondition,activeConditions,expireConditions} from '../src/state/conditionModel.mjs';
import {characterSystemsRefreshDecision,nextCharacterSystemsDeadline} from '../src/state/characterSystemsSyncModel.mjs';
import {reconcileCharacterSystems,processCharacterRest} from '../src/state/characterSystems.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const now=1_000_000;
const encounter={status:'active',combatId:'battle',round:1};
const sheet=extra=>({id:'hero',hp:[40,100],mp:[10,100],sp:[10,100],
  coreStateVersion:1,coreRevision:9,...extra});
test('encounter-scoped condition and nested effects expire without an encounter and after the last round',()=>{
  const condition=makeCondition({name:'Bound',duration:{unit:'rounds',value:2},
    effects:[{target:'skills',operation:'ADD',value:4}]},'gm',{now,encounter},'bound');
  const character=sheet({conditions:[condition]});
  assert.equal(activeConditions(character,{now,encounter}).length,1);
  assert.equal(collectCharacterEffects(character,{now,encounter}).filter(row=>row.target==='skills').length,1);
  for(const clock of [{now},{now,encounter:{status:'ended'}},{now,encounter:{...encounter,round:3}}]){
    assert.equal(activeConditions(character,clock).length,0);
    assert.equal(collectCharacterEffects(character,clock).filter(row=>row.target==='skills'&&effectIsActive(row,clock)).length,0);
  }
  assert.equal(effectIsActive(condition,{now}),false);
});
test('short and long rests expire their scoped conditions and do not clear permanent effects',()=>{
  const short=makeCondition({name:'Short',duration:{unit:'short-rest'}},'gm',{now,encounter},'short');
  const long=makeCondition({name:'Long',duration:{unit:'long-rest'}},'gm',{now,encounter},'long');
  const permanent=makeCondition({name:'Permanent',duration:{unit:'permanent'}},'gm',{now,encounter},'permanent');
  const character=sheet({conditions:[short,long,permanent]});
  assert.deepEqual(activeConditions({conditions:expireConditions(character,{now,encounter},'short')},{now,encounter}).map(row=>row.id),['long','permanent']);
  assert.deepEqual(activeConditions({conditions:expireConditions(character,{now,encounter},'long')},{now,encounter}).map(row=>row.id),['permanent']);
  assert.deepEqual(activeConditions(processCharacterRest(character,'long',[],{now,encounter}).entity,{now,encounter}).map(row=>row.id),['permanent']);
});
test('time boundaries only trigger once due and become reconciled expiry',()=>{
  const condition=makeCondition({name:'Timed',duration:{unit:'minutes',value:2},
    effects:[{target:'mp.maximum',operation:'MULTIPLY',value:.5}]},'gm',{now,encounter},'timed');
  const character=sheet({conditions:[condition]});
  assert.equal(nextCharacterSystemsDeadline({hero:character},encounter,now),now+120000);
  assert.equal(characterSystemsRefreshDecision(character,encounter,now),null);
  const due=characterSystemsRefreshDecision(character,encounter,now+120000);
  assert.deepEqual(due.timed,['timed']);
  const reconciled=reconcileCharacterSystems(character,[],{now:now+120000,encounter});
  assert.equal(characterSystemsRefreshDecision(reconciled,encounter,now+120000),null);
  assert.equal(nextCharacterSystemsDeadline({hero:reconciled},encounter,now+120000),null);
});
test('regeneration refresh only when due and not during disallowed combat',()=>{
  const character=sheet({resources:{focus:[3,10]},
    resourceDefinitions:{focus:{name:'Focus',regeneration:{amount:2,intervalMs:5000,inCombat:false}}},
    resourceState:{focus:{recoveryAt:now,baseMaximum:10,maximum:10,combatId:''}}});
  const ready={status:'ready'};
  assert.equal(nextCharacterSystemsDeadline({hero:character},ready,now),now+5000);
  assert.equal(characterSystemsRefreshDecision(character,ready,now+4000),null);
  assert.deepEqual(characterSystemsRefreshDecision(character,ready,now+5000).regeneration,['focus']);
  assert.equal(nextCharacterSystemsDeadline({hero:character},encounter,now),null);
  const blocked=sheet({...character,resourceState:{focus:{...character.resourceState.focus,combatId:'battle'}}});
  assert.equal(characterSystemsRefreshDecision(blocked,encounter,now+8000),null);
});
test('core synchronization includes offline guard, scheduled refresh, and safe retry',()=>{
  const hook=source('src/sessions/useCharacterSystemsSync.js');
  assert.match(hook,/if\(!editable\|\|!online\|\|!campaignId\)return undefined/);
  assert.match(hook,/attempted\.current\.delete\(decision\.key\)/);
  assert.match(hook,/nextCharacterSystemsDeadline\(characters,encounter,now\)/);
  const player=source('src/dashboards/CharacterDashboard.jsx');
  const gm=source('src/dashboards/GMDashboard.jsx');
  const panels=source('src/dashboards/CharacterSystemsPanels.jsx');
  assert.match(player,/live\.session\?\.editable,live\.online&&!live\.error/);
  assert.match(gm,/rawLive\.session\?\.editable,rawLive\.online&&!rawLive\.error/);
  assert.match(panels,/Offline — condition changes are unavailable/);
  assert.match(panels,/Offline — rest approval is unavailable/);
});
