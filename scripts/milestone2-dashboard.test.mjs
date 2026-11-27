import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultGMCanvasLayout,defaultPlayerCanvasLayout,
  normalizeGMCanvasLayout,normalizePlayerCanvasLayout
} from '../src/state/dashboardLayoutModel.mjs';
import {
  COMBAT_PANEL_IDS,defaultCombatWorkspaceLayout,normalizeCombatWorkspace
} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
import {
  normalizeEnemyProfile,enemyProfileSnapshot,
  compareEnemyProfile,refreshEnemyProfile,enemyCombatOptions
} from '../src/state/enemyProfileModel.mjs';
import {
  normalizePreparedEnemy,comparePreparedEnemySource,refreshPreparedEnemyFields
} from '../src/state/preparedEncounterModel.mjs';
import {validateCombatCommand,projectCombat} from '../src/dashboards/combat/combatModel.mjs';

test('each dashboard has its approved visible default windows',()=>{
  for(const [layout,count] of [
    [defaultGMCanvasLayout(),8],[defaultPlayerCanvasLayout(),7],
    [defaultCombatWorkspaceLayout(),8]]){
    assert.equal(Object.keys(layout.freeform.positions).length>=count,true);
    assert.equal(Object.keys(layout.freeform.positions)
      .filter(id=>!layout.hidden.includes(id)).length,count);
  }
  assert.equal(COMBAT_PANEL_IDS.length,15);
  const gm=defaultGMCanvasLayout();
  assert.equal(gm.freeform.positions.gmResources.w,490);
  assert.equal(gm.freeform.positions.gmResources.h,670);
  const combat=defaultCombatWorkspaceLayout();
  assert.equal(combat.hidden.includes('enemyTracker'),false);
  assert.equal(combat.freeform.positions.enemyTracker.h,710);
});
test('saved GM, Player and Combat layout geometry and hidden state survive normalization',()=>{
  for(const [layout,normalize,id] of [
    [defaultGMCanvasLayout(),normalizeGMCanvasLayout,'gmResources'],
    [defaultPlayerCanvasLayout(),normalizePlayerCanvasLayout,'armour'],
    [defaultCombatWorkspaceLayout(),normalizeCombatWorkspace,'enemyTracker']]){
    const saved={...layout,
      hidden:[...layout.hidden,id],freeform:{...layout.freeform,
        positions:{...layout.freeform.positions,
          [id]:{x:124,y:235,w:385,h:426}}}};
    const current=normalize(JSON.parse(JSON.stringify(saved)));
    assert.equal(current.hidden.includes(id),true);
    assert.deepEqual(current.freeform.positions[id],{x:124,y:235,w:385,h:426});
  }
});
test('creature snapshots have separate independent attacks and valid costs',()=>{
  const source={attacks:[{id:'bite',name:'Bite',damage:'1d8',ap:1,sp:2}],
    spells:[{id:'fire',name:'Fire',rank:'Weak',ap:1,mp:16}]};
  const snapshot=enemyProfileSnapshot(source);
  snapshot.attacks[0].name='Changed';
  assert.equal(source.attacks[0].name,'Bite');
  assert.equal(enemyCombatOptions(source).length,2);
  assert.equal(enemyCombatOptions(source)[0].costs.sp,2);
  assert.throws(()=>normalizeEnemyProfile({spells:[{name:'Fire',ap:4}]}),/cost/);
  assert.throws(()=>normalizeEnemyProfile({attacks:new Array(33).fill({name:'Hit'})}),/32/);
});
test('selective profile refresh does not silently overwrite other custom changes',()=>{
  const old={attacks:[{id:'bite',name:'Old Bite',ap:1}],
    equipment:[{id:'claw',name:'Claw'}]};
  const customized={...structuredClone(old),attacks:[{id:'bite',name:'Special Bite',ap:1}]};
  const latest={attacks:[{id:'bite',name:'New Bite',ap:2}],
    equipment:[{id:'claw',name:'Steel Claw'}]};
  assert.equal(compareEnemyProfile(old,latest).length,2);
  const next=refreshEnemyProfile(customized,latest,['equipment']);
  assert.equal(next.attacks[0].name,'Special Bite');
  assert.equal(next.equipment[0].name,'Steel Claw');
});
test('prepared enemies preserve source snapshot and encounter overrides',()=>{
  const base=normalizePreparedEnemy({
    name:'Goblin',hp:[20,20],sourceId:'goblin',
    sourceRef:'creature-goblin',preparedEnemyId:'prepared-enemy-1',
    sourceSnapshot:{name:'Goblin',hp:[20,20],
      attacks:[{id:'swing',name:'Swing',ap:1}]},
    attacks:[{id:'swing',name:'Special Swing',ap:1}]
  });
  const latest={name:'Elite Goblin',hp:[30,30],
    attacks:[{id:'swing',name:'Stronger Swing',ap:1}]};
  const differences=comparePreparedEnemySource(base,latest);
  assert.ok(differences.find(x=>x.field==='attacks'&&x.customized));
  const updated=refreshPreparedEnemyFields(base,latest,['hp','name']);
  assert.equal(updated.name,'Elite Goblin');
  assert.deepEqual(updated.hp,[30,30]);
  assert.equal(updated.attacks[0].name,'Special Swing');
  assert.equal(updated.preparedEnemyId,'prepared-enemy-1');
  assert.equal(updated.sourceRef,'creature-goblin');
  assert.equal(comparePreparedEnemySource({name:'Old',hp:[1,1]},latest),null);
  assert.throws(()=>refreshPreparedEnemyFields({name:'Old',hp:[1,1]},latest,['hp']),/snapshot/);
});
test('only the GM may submit a creature-profile declaration',()=>{
  const input={operation:'declare',revision:1,
    optionId:'enemy:attacks:bite',targetIds:['player-1']};
  assert.equal(validateCombatCommand('gm','enemy-1',input),input);
  assert.throws(()=>validateCombatCommand('player','enemy-1',input),/approved basic action/);
  assert.throws(()=>validateCombatCommand('gm','enemy-1',{...input,targetIds:[]}),/required target/);
});
test('private creature options are not leaked in player combat projection',()=>{
  const encounter={status:'ready',combatants:[
    {id:'enemy-1',kind:'enemy',name:'Wolf',hp:[9,10],
      attacks:[{id:'bite',name:'Bite',ap:1}]}
  ],combat:{version:1,revision:0,participants:{}}};
  const gm=projectCombat(encounter,null,{role:'gm'});
  const player=projectCombat(encounter,null,{role:'player'});
  assert.equal(gm.combatants[0].attacks[0].name,'Bite');
  assert.equal(player.combatants[0].attacks,undefined);
  assert.equal(player.combatants[0].hp,undefined);
});
