import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  normalizePreparedEnemy,normalizePreparedEncounters,validatePreparedEncounterInput,
  instantiatePreparedEnemies,preparedEncounterRoster,PREPARED_ENCOUNTER_MAX_PLANS
} from '../src/state/preparedEncounterModel.mjs';
import {validateCombatCommand} from '../frontend/src/combat/combatModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const example={name:'Frost Gate',notes:'Keep the party moving.',mapId:'map-1',
  enemies:[{name:'Varkhyn',hp:[21,21],sp:[10,10],mp:[4,4],initiative:3,ac:9,xpReward:100}]};
test('Phase 6.2: prepared encounter validates bounded name, enemies, HP and map',()=>{
  const saved=validatePreparedEncounterInput(example);
  assert.equal(saved.name,example.name);
  assert.equal(saved.mapId,example.mapId);
  assert.deepEqual(saved.enemies[0].hp,[21,21]);
  assert.equal(saved.enemies[0].name,'Varkhyn');
  assert.throws(()=>validatePreparedEncounterInput({...example,name:''}),/Encounter name/);
  assert.throws(()=>validatePreparedEncounterInput({...example,enemies:[]}),/between 1 and 60/);
  assert.throws(()=>validatePreparedEncounterInput({...example,mapId:'../secret'}),/valid campaign battle map/);
  assert.throws(()=>validatePreparedEncounterInput({...example,enemies:[{name:'Bad',hp:0}]}),/Each enemy/);
  assert.equal(normalizePreparedEnemy({name:'Player',characterId:'character-1',hp:10}),null);
});
test('Phase 6.2: private encounter storage ignores untrusted fields and malformed plans',()=>{
  const prepared=normalizePreparedEncounters([
    {id:'prepared-good',revision:1,...example,ownerUid:'other',combatants:[{id:'player-1'}]},
    {id:'prepared-bad',revision:1,name:'Empty',enemies:[]}
  ]);
  assert.equal(prepared.length,1);
  assert.equal(prepared[0].ownerUid,undefined);
  assert.equal(prepared[0].combatants,undefined);
  assert.equal(prepared[0].enemies[0].characterId,undefined);
  assert.equal(normalizePreparedEncounters(Array.from({length:40},(_,i)=>({
    ...example,id:'prepared-'+i,revision:1
  }))).length,PREPARED_ENCOUNTER_MAX_PLANS);
});
test('Phase 6.2: loading creates unique fresh enemies but keeps only pre-linked PCs',()=>{
  const pcs=[{id:'player-hero',characterId:'hero-1',kind:'player',name:'Hero'}];
  const enemies=instantiatePreparedEnemies(example,'req-123');
  assert.deepEqual(enemies.map(row=>row.id),['enemy-req-123-1']);
  assert.deepEqual(enemies[0].hp,[21,21]);
  const roster=preparedEncounterRoster(example,[...pcs,{id:'enemy-old',kind:'enemy',name:'Old'}],'req-456');
  assert.equal(roster.length,2);
  assert.equal(roster[0].id,'player-hero');
  assert.equal(roster[1].id,'enemy-req-456-1');
  assert.throws(()=>preparedEncounterRoster(example,[], '../bad'),/Invalid combat request/);
});
test('Phase 6.2: only the GM command validator accepts prepared encounter loading',()=>{
  assert.equal(validateCombatCommand('gm','encounter',{
    operation:'load-prepared',preparedId:'prepared-good',replace:true,revision:0
  }).operation,'load-prepared');
  assert.throws(()=>validateCombatCommand('player','encounter',{
    operation:'load-prepared',preparedId:'prepared-good',revision:0
  }),/unavailable/);
});
test('Phase 6.2: authenticated private storage, revision and combat protections exist',()=>{
  const service=read('frontend/src/combat/firebaseCombatService.mjs');
  const backend=read('functions/combatCommands.mjs');
  const ui=read('frontend/src/combat/PreparedEncounterLibrary.jsx');
  const workspace=read('frontend/src/combat/CombatWorkspace.jsx');
  assert.match(service,/preparedEncounters:normalizePreparedEncounters/);
  assert.match(service,/await check\(id,'gm'\)/);
  assert.match(service,/firestoreSdk\.runTransaction/);
  assert.match(service,/GM permission was revoked before saving/);
  assert.match(service,/Prepared encounter changed in another session/);
  assert.match(service,/savePrepared:/);
  assert.match(service,/deletePrepared:/);
  assert.match(service,/loadPrepared:/);
  assert.match(backend,/if\(encounter\.status==='active'\)/);
  assert.match(backend,/preparedEncounterRoster\(prepared,encounter\.combatants,context\.requestId\)/);
  assert.match(backend,/if\(!gm\)throw new Error\('Only the campaign GM may load/);
  assert.match(backend,/if\(input\.revision!==oldRevision\)/);
  assert.match(workspace,/<PreparedEncounterLibrary/);
  assert.match(ui,/data-testid="site-prepared-encounter-save"/);
  assert.doesNotMatch(ui,/firebase\/firestore|setDoc|updateDoc|window\.AsteriaFirebase/);
  assert.doesNotMatch(read('frontend/src/combat/PreparedEncounterLibrary.module.css'),
    /!\s*important|@import\b/i);
});
