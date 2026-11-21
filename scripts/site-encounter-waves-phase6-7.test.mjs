import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validatePreparedEncounterInput,normalizePreparedEncounters,
  preparedEncounterRoster
} from '../src/state/preparedEncounterModel.mjs';
import {
  ENCOUNTER_MAX_WAVES,ENCOUNTER_MAX_EVENTS,validatePreparedWaves,
  validatePreparedEvents,stageEncounterSchedule,encounterScheduleForGM,
  releaseEncounterWave,triggerEncounterEvent
} from '../src/state/encounterWaveModel.mjs';
import {validateCombatCommand,projectCombat}
  from '../frontend/src/combat/combatModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const enemy={name:'Frost Wolf',type:'Creature',hp:[15,15],
  sp:[10,10],xpReward:25,ac:12,initiative:4};
const waves=[{id:'wave-reinforcements',name:'Second Pack',
  notes:'Arrive from the northern ridge',round:3,enemies:[
    {...enemy,name:'Alpha Wolf',spawn:{x:45,y:55}}
  ]}];
const events=[{id:'event-storm',name:'Snowstorm',
  notes:'Describe reduced visibility; GM adjudicates any actual rule effect',
  type:'environment',round:2,announce:true}];
const template={id:'prepared-frost',revision:2,name:'Frost Valley',
  notes:'',mapId:'map-frost',folder:'',tags:[],archived:false,
  enemies:[enemy],waves,events};
test('6.7: validate and retain typed wave and event schedules',()=>{
  const data=validatePreparedEncounterInput(template);
  assert.deepEqual(data.waves[0].enemies[0].spawn,{x:45,y:55});
  assert.equal(data.waves[0].round,3);
  assert.equal(data.events[0].announce,true);
  const normalized=normalizePreparedEncounters([template]);
  assert.deepEqual(normalized[0].waves,data.waves);
  assert.deepEqual(normalized[0].events,data.events);
  const roster=preparedEncounterRoster(normalized[0],[],'request-1');
  assert.equal(roster.length,1,'only the initial enemy wave is staged');
  assert.equal(ENCOUNTER_MAX_WAVES,8);
  assert.equal(ENCOUNTER_MAX_EVENTS,16);
});
test('6.7: validate IDs, bounds, names, map placements, total enemy counts',()=>{
  const invalid=(patch,regex)=>assert.throws(
    ()=>validatePreparedEncounterInput({...template,...patch}),regex);
  invalid({waves:[...waves,...waves]},/distinct valid ID/);
  invalid({events:[...events,...events]},/distinct valid ID/);
  invalid({waves:[{...waves[0],round:0}]},/round reminders/);
  invalid({events:[{...events[0],round:1000}]},/round reminders/);
  invalid({waves:[{...waves[0],name:''}]},/Wave names/);
  invalid({events:[{...events[0],name:''}]},/event names/);
  invalid({waves:[{...waves[0],enemies:[]}]},/between 1 and 20/);
  invalid({waves:[{...waves[0],enemies:Array(21).fill(enemy)}]},/between 1 and 20/);
  invalid({waves:Array.from({length:9},(_,i)=>({...waves[0],
    id:'wave-'+i}))},/eight encounter waves/);
  invalid({events:Array.from({length:17},(_,i)=>({...events[0],
    id:'event-'+i}))},/sixteen encounter events/);
  invalid({events:[{...events[0],type:'fireball'}]},/supported event type/);
  invalid({waves:[{...waves[0],enemies:[{...enemy,spawn:{
    x:101,y:10}}]}]},/map positions/);
  invalid({mapId:''},/battle map before positioning/);
  assert.throws(()=>validatePreparedWaves(waves,null),/validator is required/);
  assert.deepEqual(validatePreparedEvents([]),[]);
});
test('6.7: scheduled content is a frozen-in-time clone, not a live template lookup',()=>{
  const snapshot=stageEncounterSchedule(template,1700000000000);
  assert.equal(snapshot.preparedId,'prepared-frost');
  assert.equal(snapshot.preparedRevision,2);
  assert.equal(snapshot.waves[0].status,'ready');
  assert.equal(snapshot.events[0].status,'ready');
  template.waves[0].enemies[0].name='Mutated in editor';
  assert.equal(snapshot.waves[0].enemies[0].name,'Alpha Wolf');
  template.waves[0].enemies[0].name='Alpha Wolf';
});
test('6.7: releasing a wave is one-time and leaves saved template unchanged',()=>{
  const state=stageEncounterSchedule(template,1700000000000);
  const result=releaseEncounterWave(state,'wave-reinforcements','request-new',
    1700000001000,4);
  assert.equal(result.enemies.length,1);
  assert.equal(result.enemies[0].id,'enemy-request-new-1');
  assert.equal(result.enemies[0].spawn.x,45);
  assert.equal(result.updated.waves[0].status,'released');
  assert.equal(result.updated.waves[0].triggerRound,4);
  assert.equal(state.waves[0].status,'ready');
  assert.equal(template.waves[0].enemies[0].id,undefined);
  assert.throws(()=>releaseEncounterWave(result.updated,'wave-reinforcements',
    'request-another',1700000002000,5),/already released/);
  assert.throws(()=>releaseEncounterWave(state,'wave-absent',
    'request-new',1700000002000,4),/not in the loaded encounter/);
});
test('6.7: events record completion once, without combat resource mutation',()=>{
  const state=stageEncounterSchedule(template,1700000000000);
  const result=triggerEncounterEvent(state,'event-storm',1700000001000,2);
  assert.equal(result.event.type,'environment');
  assert.equal(result.updated.events[0].status,'triggered');
  assert.equal(result.updated.events[0].triggerRound,2);
  assert.equal(state.events[0].status,'ready');
  assert.throws(()=>triggerEncounterEvent(result.updated,'event-storm',
    1700000002000,3),/already triggered/);
  assert.throws(()=>triggerEncounterEvent(state,'event-unknown',
    1700000002000,3),/not part of the loaded encounter/);
});
test('6.7: safe GM schedule projection and player-only announced event',()=>{
  const state=stageEncounterSchedule(template,1700000000000);
  const gm=encounterScheduleForGM({encounterSchedule:state});
  assert.equal(gm.waves[0].enemies[0].name,'Alpha Wolf');
  assert.equal(gm.events[0].notes,events[0].notes);
  assert.equal(encounterScheduleForGM({}),null);
  const raw={status:'active',round:2,turnIndex:0,combat:{
    version:1,revision:2,participants:{}
  },combatants:[{id:'enemy-1',name:'Wolf',kind:'enemy',hp:[12,15]}],
  publicEvent:{name:'Snowstorm',notes:'Private event note',
    type:'environment',round:2}};
  const session={status:'active',editable:true,expiresAt:4102444800000};
  const player=projectCombat(raw,session,{role:'player'});
  assert.equal(player.publicEvent.name,'Snowstorm');
  assert.equal(player.publicEvent.notes,undefined);
  assert.equal(player.encounterSchedule,undefined);
  assert.equal(player.waves,undefined);
});
test('6.7: new GM-only actions validate exact confirmation and no arbitrary wave data',()=>{
  for(const data of [
    {operation:'release-wave',waveId:'wave-second',confirmation:'release-wave',revision:2},
    {operation:'trigger-event',eventId:'event-storm',confirmation:'trigger-event',revision:2}
  ])assert.equal(validateCombatCommand('gm','encounter',data).operation,data.operation);
  assert.throws(()=>validateCombatCommand('player','player-one',{
    operation:'release-wave',waveId:'wave-second',confirmation:'release-wave',revision:2
  }),/unavailable/);
  assert.throws(()=>validateCombatCommand('gm','encounter',{
    operation:'release-wave',waveId:'wave-second',confirmation:'sure',revision:2
  }),/confirm/);
  assert.throws(()=>validateCombatCommand('gm','encounter',{
    operation:'trigger-event',eventId:'../secret',confirmation:'trigger-event',revision:2
  }),/valid encounter event/);
});
test('6.7: code integration reuses the private GM workspace and map-token transaction',()=>{
  const server=read('functions/combatCommands.mjs');
  const adapter=read('frontend/src/combat/firebaseCombatService.mjs');
  const builder=read('frontend/src/combat/PreparedEncounterLibrary.jsx');
  const combat=read('frontend/src/combat/CombatWorkspace.jsx');
  const control=read('frontend/src/combat/GMEncounterWavesPanel.jsx');
  assert.match(server,/privateState\.encounterSchedule=stageEncounterSchedule/);
  assert.match(server,/releaseEncounterWave/);
  assert.match(server,/triggerEncounterEvent/);
  assert.match(server,/noPending\(\)/);
  assert.match(server,/synchronizeCombatMapTokens\(boundMap,encounter/);
  assert.match(server,/encounter\.turnIndex=encounter\.combatants\.findIndex/);
  assert.match(server,/tx\.set\(encounterRef/);
  assert.match(adapter,/encounterSchedule:encounterScheduleForGM/);
  assert.match(builder,/PreparedEncounterScheduleEditor/);
  assert.match(combat,/<GMEncounterWavesPanel/);
  assert.match(control,/confirmation:'release-wave'/);
  assert.match(control,/confirmation:'trigger-event'/);
  assert.doesNotMatch(control,/firebase\/firestore|httpsCallable|updateDoc|setDoc/);
});
