import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PREPARED_LOAD_CONFIRMATION,previewPreparedEncounterLoad,validatePreparedLoadRequest
} from '../src/state/preparedEncounterLoadModel.mjs';
import {preparedEncounterRoster} from '../src/state/preparedEncounterModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const plan={id:'prepared-winter',name:'Winter Guard',revision:3,notes:'',
  folder:'',tags:[],archived:false,mapId:'map-1',
  enemies:[{name:'Ice Guardian',hp:[20,20],xpReward:50}]};
const combat={status:'ready',revision:8,battleMapId:'',combatants:[
  {id:'player-1',characterId:'hero-1',name:'Hero'},
  {id:'enemy-stale',kind:'enemy',name:'Old Enemy'}
]};
const maps=[{id:'map-1',name:'Frozen Valley'}];
const validRequest={
  operation:'load-prepared',preparedId:plan.id,replace:true,
  revision:combat.revision,expectedPreparedRevision:plan.revision,
  confirmation:PREPARED_LOAD_CONFIRMATION
};
test('Phase 6.4: reviewer summarizes exact staged changes without mutating data',()=>{
  const preview=previewPreparedEncounterLoad(plan,combat,maps);
  assert.equal(preview.eligible,true);
  assert.equal(preview.incomingEnemies,1);
  assert.equal(preview.stagedEnemies,1);
  assert.equal(preview.linkedPlayers,1);
  assert.equal(preview.mapName,'Frozen Valley');
  assert.equal(preview.templateRevision,3);
  assert.equal(preview.combatRevision,8);
  assert.equal(combat.combatants.length,2);
});
test('Phase 6.4: archive, active encounter, duplicate PCs and stale map block preview',()=>{
  assert.equal(previewPreparedEncounterLoad({...plan,archived:true},combat,maps).eligible,false);
  assert.equal(previewPreparedEncounterLoad(plan,{...combat,status:'active'},maps).eligible,false);
  assert.equal(previewPreparedEncounterLoad(plan,combat,[]).eligible,false);
  assert.equal(previewPreparedEncounterLoad(plan,{...combat,battleMapId:'map-existing'},maps).eligible,false);
  assert.equal(previewPreparedEncounterLoad(plan,{...combat,combatants:[
    ...combat.combatants,{id:'player-2',characterId:'hero-1'}
  ]},maps).eligible,false);
});
test('Phase 6.4: server command requires reviewed template ID and exact revision',()=>{
  const result=validatePreparedLoadRequest(validRequest,plan,combat);
  assert.equal(result.enemyCount,1);
  assert.equal(result.linkedPlayers,1);
  assert.equal(result.mapId,'map-1');
  assert.throws(()=>validatePreparedLoadRequest({...validRequest,expectedPreparedRevision:2},
    plan,combat),/changed/);
  assert.throws(()=>validatePreparedLoadRequest({...validRequest,confirmation:'yes'},
    plan,combat),/Confirm/);
  assert.throws(()=>validatePreparedLoadRequest({...validRequest,replace:false},
    plan,combat),/Confirm/);
  assert.throws(()=>validatePreparedLoadRequest({...validRequest,preparedId:'prepared-other'},
    plan,combat),/removed/);
  assert.throws(()=>validatePreparedLoadRequest({...validRequest,mapId:'map-other'},
    plan,combat),/Confirm/);
  assert.throws(()=>validatePreparedLoadRequest(validRequest,{...plan,archived:true},
    combat),/archived/);
  assert.throws(()=>validatePreparedLoadRequest(validRequest,plan,
    {...combat,status:'active'}),/End active combat/);
  assert.throws(()=>validatePreparedLoadRequest(validRequest,plan,
    {...combat,battleMapId:'map-existing'}),/Unlink/);
});
test('Phase 6.4: prepared roster keeps linked PC, removes stale enemies, never mutates template',()=>{
  const roster=preparedEncounterRoster(plan,combat.combatants,'request-new');
  assert.equal(roster.length,2);
  assert.equal(roster[0].id,'player-1');
  assert.equal(roster[1].id,'enemy-request-new-1');
  roster[1].hp[0]=2;
  assert.equal(plan.enemies[0].hp[0],20);
});
test('Phase 6.4: transactions revalidate GM, live revision, map and planned revision',()=>{
  const server=read('functions/combatCommands.mjs');
  const adapter=read('frontend/src/combat/firebaseCombatService.mjs');
  const view=read('frontend/src/combat/PreparedEncounterLibrary.jsx');
  assert.match(server,/validatePreparedLoadRequest\(input,prepared,encounter\)/);
  assert.match(server,/if\(input\.revision!==oldRevision\)/);
  assert.match(server,/if\(!gm\)throw new Error\('Only the campaign GM may load/);
  assert.match(server,/if\(preparedMapRef&&!preparedMapSnap\.exists\(\)\)/);
  assert.match(server,/preparedEncounterRoster\(prepared,encounter\.combatants,context\.requestId\)/);
  assert.match(adapter,/expectedPreparedRevision,confirmation:'replace-staged-enemies'/);
  assert.match(view,/data-testid="site-prepared-load-review"/);
  assert.match(view,/data-testid="site-prepared-load-confirm"/);
  assert.match(view,/reviewFresh/);
  assert.doesNotMatch(view,/window\.confirm\('Load/);
});
