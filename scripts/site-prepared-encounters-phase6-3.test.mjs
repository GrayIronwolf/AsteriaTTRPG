import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validatePreparedEncounterInput,normalizePreparedEncounters,
  preparedEncounterRoster
} from '../src/state/preparedEncounterModel.mjs';
import {
  queryPreparedEncounterLibrary,preparedEncounterFolders,
  duplicatePreparedEncounter,setPreparedEncounterArchived
} from '../src/state/preparedEncounterLibraryModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const enemy={name:'Snow Wraith',hp:[20,20],xpReward:20};
const input={name:'Frost Pass',notes:'Blizzard approach',mapId:'map-one',
  enemies:[enemy],folder:'Act One',tags:['Winter','Ambush'],archived:false};
const records=[
  {id:'prepared-one',revision:1,...input,updatedAt:'2026-10-01T00:00:00Z'},
  {id:'prepared-two',revision:1,...input,name:'Mountain Siege',
    notes:'Hold the gate',folder:'Act Two',tags:['Siege'],archived:true,
    updatedAt:'2026-11-01T00:00:00Z'}
];
test('Phase 6.3: validated encounter organization survives persistence',()=>{
  const payload=validatePreparedEncounterInput(input);
  assert.deepEqual(payload.tags,['Winter','Ambush']);
  assert.equal(payload.folder,'Act One');
  assert.equal(payload.archived,false);
  const loaded=normalizePreparedEncounters(records);
  assert.equal(loaded.length,2);
  assert.equal(loaded[1].archived,true);
  assert.equal(loaded[1].folder,'Act Two');
  assert.deepEqual(loaded[1].tags,['Siege']);
  assert.throws(()=>validatePreparedEncounterInput({...input,tags:Array(9).fill('x')}),/eight tags/);
  assert.throws(()=>validatePreparedEncounterInput({...input,folder:'x'.repeat(61)}),/60 characters/);
  assert.throws(()=>validatePreparedEncounterInput({...input,archived:'yes'}),/archive status/);
});
test('Phase 6.3: search and filtering support notes, enemies, tags, folders and archive',()=>{
  assert.deepEqual(queryPreparedEncounterLibrary(records).map(x=>x.name),['Frost Pass']);
  assert.deepEqual(queryPreparedEncounterLibrary(records,{status:'archived'}).map(x=>x.name),
    ['Mountain Siege']);
  assert.deepEqual(queryPreparedEncounterLibrary(records,{status:'all',query:'snow wraith'})
    .map(x=>x.name),['Mountain Siege','Frost Pass']);
  assert.deepEqual(queryPreparedEncounterLibrary(records,{status:'all',folder:'act two'})
    .map(x=>x.name),['Mountain Siege']);
  assert.deepEqual(queryPreparedEncounterLibrary(records,{status:'all',query:'ambush'})
    .map(x=>x.name),['Frost Pass']);
  assert.deepEqual(preparedEncounterFolders(records),['Act One','Act Two']);
});
test('Phase 6.3: sorting and duplication create independently editable copies',()=>{
  assert.deepEqual(queryPreparedEncounterLibrary(records,{status:'all',sort:'name'})
    .map(x=>x.name),['Frost Pass','Mountain Siege']);
  const duplicate=duplicatePreparedEncounter(records[1]);
  assert.equal(duplicate.name,'Copy of Mountain Siege');
  assert.equal(duplicate.archived,false);
  assert.equal(duplicate.folder,'Act Two');
  duplicate.enemies[0].hp[0]=1;
  assert.equal(records[1].enemies[0].hp[0],20);
  const archived=setPreparedEncounterArchived(records[0],true);
  assert.equal(archived.archived,true);
  assert.equal(records[0].archived,false);
});
test('Phase 6.3: load still preserves linked player and regenerates enemy IDs',()=>{
  const combatants=[{id:'player-linked',characterId:'linked-char',kind:'player'},
    {id:'enemy-stale',kind:'enemy'}];
  const rows=preparedEncounterRoster(records[0],combatants,'request-new');
  assert.deepEqual(rows.map(row=>row.id),['player-linked','enemy-request-new-1']);
});
test('Phase 6.3: archive cannot bypass server combat admission',()=>{
  const server=read('functions/combatCommands.mjs');
  const service=read('frontend/src/combat/firebaseCombatService.mjs');
  const library=read('frontend/src/combat/PreparedEncounterLibrary.jsx');
  const styles=read('frontend/src/combat/PreparedEncounterLibrary.module.css');
  assert.match(server,/if\(prepared\.archived===true\)throw new Error/);
  assert.match(server,/Only the campaign GM may load a prepared encounter/);
  assert.match(service,/GM permission was revoked before saving/);
  assert.match(service,/Prepared encounter changed in another session/);
  assert.match(library,/queryPreparedEncounterLibrary/);
  assert.match(library,/run\('duplicate',plan\)/);
  assert.match(library,/run\('archive',plan\)/);
  assert.match(library,/Preview/);
  assert.doesNotMatch(styles,/!\s*important|@import\b/i);
});
