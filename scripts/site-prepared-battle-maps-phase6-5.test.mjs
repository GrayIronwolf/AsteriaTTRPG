import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePreparedEncounterInput,normalizePreparedEncounters,
  instantiatePreparedEnemies} from '../src/state/preparedEncounterModel.mjs';
import {setPreparedEnemySpawn,preparedBattleMapPreview,
  preparedMapTokenCapacity,clearPreparedEnemySpawns} from '../src/state/preparedBattleMapModel.mjs';
import {synchronizeCombatMapTokens} from '../src/state/battleMapCombatModel.mjs';
import {validateCombatCommand,projectCombat} from '../frontend/src/combat/combatModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const map={id:'map-1',name:'Winter Valley',gridColumns:10,gridRows:10,
  tokens:[{id:'marker-1',kind:'marker',label:'Old landmark',x:12,y:12}]};
const enemy={name:'Wraith',kind:'enemy',hp:[20,20],xpReward:100};
const template={id:'prepared-winter',revision:1,name:'Winter Battle',notes:'',
  mapId:'map-1',enemies:[enemy],folder:'',tags:[],archived:false};

test('Phase 6.5: enemy spawn is grid-snapped, persisted in private encounter, and reusable',()=>{
  const prepared=setPreparedEnemySpawn([enemy],0,{x:17,y:23},map);
  assert.deepEqual(prepared[0].spawn,{x:15,y:25});
  const normalized=validatePreparedEncounterInput({...template,enemies:prepared});
  assert.deepEqual(normalized.enemies[0].spawn,{x:15,y:25});
  const saved=normalizePreparedEncounters([{...template,enemies:prepared}]);
  assert.deepEqual(saved[0].enemies[0].spawn,{x:15,y:25});
  const staged=instantiatePreparedEnemies(saved[0],'request-1');
  assert.equal(staged[0].spawn.x,15);
  assert.equal(staged[0].id,'enemy-request-1-1');
  assert.equal(enemy.spawn,undefined,'original source enemy is unchanged');
});
test('Phase 6.5: reject off-map, missing-map, non-number and malformed placements',()=>{
  assert.throws(()=>setPreparedEnemySpawn([enemy],0,{x:-1,y:3},map),/starting positions/);
  assert.throws(()=>setPreparedEnemySpawn([enemy],0,{x:15,y:'25'},map),/starting positions/);
  assert.throws(()=>setPreparedEnemySpawn([enemy],3,{x:20,y:20},map),/Select an enemy/);
  assert.throws(()=>validatePreparedEncounterInput({...template,mapId:'',
    enemies:[{...enemy,spawn:{x:1,y:1}}]}),/Choose a battle map/);
  assert.throws(()=>validatePreparedEncounterInput({...template,
    enemies:[{...enemy,spawn:{x:101,y:1}}]}),/starting position/);
  assert.equal(clearPreparedEnemySpawns([{...enemy,spawn:{x:12,y:25}}])[0].spawn,undefined);
});
test('Phase 6.5: map preview adds virtual markers without modifying stored map or templates',()=>{
  const placed=setPreparedEnemySpawn([enemy],0,{x:17,y:23},map);
  const preview=preparedBattleMapPreview(map,placed);
  assert.equal(preview.tokens.length,2);
  assert.equal(preview.tokens[1].label,'Wraith');
  assert.deepEqual(preview.tokens[0],map.tokens[0]);
  assert.equal(map.tokens.length,1);
  assert.equal(placed.length,1);
});
test('Phase 6.5: encounter spawn survives official combat-token synthesis',()=>{
  const actors=[
    {id:'player-1',characterId:'hero',kind:'player',name:'Hero'},
    {id:'enemy-1',kind:'enemy',name:'Wraith',spawn:{x:15,y:25}}
  ];
  const encounter={status:'active',combatId:'live-1',turnIndex:0,
    combat:{version:1,participants:{}},combatants:actors};
  let n=0;
  const tokens=synchronizeCombatMapTokens(map,encounter,()=>('generated-'+(++n)));
  assert.equal(tokens.length,3);
  assert.equal(tokens.find(t=>t.combatantId==='enemy-1').x,15);
  assert.equal(tokens.find(t=>t.combatantId==='enemy-1').y,25);
  assert.equal(tokens.find(t=>t.combatantId==='player-1').kind,'character');
  assert.equal(tokens.find(t=>t.id==='marker-1').kind,'marker');
});
test('Phase 6.5: map capacity includes existing markers and roster',()=>{
  assert.deepEqual(preparedMapTokenCapacity(map,1,1),{
    manual:1,enemies:1,players:1,required:3,limit:60,available:true
  });
  assert.equal(preparedMapTokenCapacity(map,60,1).available,false);
});
test('Phase 6.5: GM map preparation remains command-validated and player-isolated',()=>{
  assert.equal(validateCombatCommand('gm','encounter',{
    operation:'map-prepare',mapId:'map-1',revision:2
  }).operation,'map-prepare');
  assert.throws(()=>validateCombatCommand('player','encounter',{
    operation:'map-prepare',mapId:'map-1',revision:2
  }),/unavailable/);
  const publicCombat=projectCombat({status:'ready',
    preparedMapId:'map-1',combat:{revision:2},combatants:[]},
  {status:'active',expiresAt:Date.now()+60000},{role:'player'});
  assert.equal(publicCombat.preparedMapId,undefined);
});
test('Phase 6.5: existing secured map service and map binding used, not duplicated',()=>{
  const server=read('functions/combatCommands.mjs');
  const ui=read('frontend/src/combat/PreparedEncounterLibrary.jsx');
  const combat=read('frontend/src/combat/CombatWorkspace.jsx');
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  assert.match(server,/input.operation==='map-prepare'/);
  assert.match(server,/preparedMapTokenCapacity/);
  assert.match(server,/synchronizeCombatMapTokens\(data,encounter/);
  assert.match(server,/tx.update\(preparedMapRef/);
  assert.match(server,/if\(preparedMapRef&&!preparedMapSnap.exists\(\)\)/);
  assert.match(ui,/CampaignMapCanvas/);
  assert.match(ui,/mode="gm"/);
  assert.match(ui,/setPreparedEnemySpawn/);
  assert.match(combat,/operation:'map-prepare'/);
  assert.match(gm,/mediaApi=\{mediaEnabled\?api.media:null\}/);
  assert.doesNotMatch(ui,/firebase\/firestore|setDoc|updateDoc/);
});
