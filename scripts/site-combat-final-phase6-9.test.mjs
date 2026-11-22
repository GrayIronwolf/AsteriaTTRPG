import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validateCombatCommand,projectCombat
} from '../src/dashboards/combat/combatModel.mjs';
import {
  defaultCombatWorkspaceLayout,editCombatWindow,normalizeCombatWorkspace,
  saveCombatPreset,applyCombatPreset,COMBAT_PANEL_IDS
} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
import {
  captureEncounterCompletion,assertApprovedEncounterDelivery,encounterDeliveryPatch,
  validateEncounterCompletionAction
} from '../src/state/encounterCompletionModel.mjs';
import {createEncounterCompletionCommands} from '../functions/encounterCompletionCommands.mjs';
import {stageEncounterSchedule,releaseEncounterWave,triggerEncounterEvent}
  from '../src/state/encounterWaveModel.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const campaignId='campaign-phase69',gmUid='gm-phase69';
const session={status:'active',id:'session-69',expiresAt:4102444800000};
const prepared={
  id:'prepared-frost',revision:1,name:'Frost Attack',mapId:'',
  waves:[{id:'wave-2',name:'Reinforcements',notes:'GM only',
    round:3,enemies:[{name:'Frost Wolf',hp:[12,12],xpReward:75}]}],
  events:[{id:'event-3',name:'Blizzard',notes:'Secret encounter instruction',
    type:'environment',round:2,announce:true}]
};
const encounter={
  status:'active',combatId:'combat-phase69',round:4,turnIndex:0,
  combatants:[
    {id:'player-one',characterId:'hero-1',name:'Alara',
      kind:'player',initiative:16},
    {id:'enemy-one',kind:'enemy',name:'Frost Beast',
      initiative:12,defeated:true,xpReward:100,hp:[0,20]}
  ],
  combat:{version:1,revision:4,participants:{
    'player-one':{ap:2,bonus:true},'enemy-one':{ap:0,bonus:false}
  },log:[{id:'action-1',message:'Hero attacked',at:1000,
    gmSecret:'not public'}]}
};
const characters=new Map([['hero-1',{hp:[12,20],sp:[4,10],mp:[3,8]}]]);

test('6.9: complete a wave/event encounter into GM-only immutable review data',()=>{
  const staged=stageEncounterSchedule(prepared,1000);
  const resultWave=releaseEncounterWave(staged,'wave-2','request-wave',2000,3);
  const resultEvent=triggerEncounterEvent(resultWave.updated,'event-3',3000,4);
  const state={encounterSchedule:resultEvent.updated};
  const before=JSON.stringify(encounter);
  const history=captureEncounterCompletion(encounter,state,characters,{
    endedAt:4000,endedBy:gmUid,sessionId:'session-69'
  });
  assert.equal(history.status,'pending-review');
  assert.equal(history.xpSuggested,100);
  assert.deepEqual(history.summary,{players:1,enemies:1,
    defeatedEnemies:1,downedPlayers:0});
  assert.equal(history.waves[0].status,'released');
  assert.equal(history.events[0].status,'triggered');
  assert.equal(history.waves[0].enemies,undefined);
  assert.equal(history.events[0].notes,undefined);
  assert.equal(history.actions[0].gmSecret,undefined);
  assert.deepEqual(history.participants[0].hp,[12,20]);
  assert.equal(JSON.stringify(encounter),before);
  prepared.waves[0].name='Modified reusable template';
  assert.equal(history.waves[0].name,'Reinforcements');
});

test('6.9: GM/player view boundaries survive combat completion',()=>{
  const player=projectCombat(encounter,session,{
    role:'player',characterId:'hero-1',party:[...characters.values()]
  });
  const gm=projectCombat(encounter,session,{role:'gm'});
  assert.equal(player.isActive,true);
  assert.equal(gm.log[0].message,'Hero attacked');
  assert.equal('log' in player,false);
  assert.equal('encounterHistory' in player,false);
  assert.equal('preparedEncounters' in player,false);
  assert.equal('battleMapId' in player,false);
  assert.equal('hp' in player.combatants.find(row=>row.id==='enemy-one'),false);
  assert.throws(()=>validateCombatCommand('player','player-one',{
    operation:'end',revision:4
  }),/unavailable/);
  for(const operation of ['release-wave','trigger-event','clear','start'])
    assert.throws(()=>validateCombatCommand('player','player-one',{
      operation,revision:4
    }),/unavailable/);
});

test('6.9: History is a movable window without overwriting saved GM layouts',()=>{
  const state=defaultCombatWorkspaceLayout();
  assert.ok(COMBAT_PANEL_IDS.includes('history'));
  assert.deepEqual(Object.keys(state.freeform.positions),COMBAT_PANEL_IDS);
  const moved=editCombatWindow(state,'controls','move',{x:10,y:3100});
  assert.notEqual(moved,state,'the original drag-and-snap acceptance remains valid');
  const original=state.freeform.positions.history;
  const positioned=editCombatWindow(state,'history','move',{x:510,y:3400});
  assert.notEqual(positioned,state);
  assert.deepEqual(state.freeform.positions.history,original);
  const preset=saveCombatPreset(state,'Combat before history','layout-combat');
  const imported=normalizeCombatWorkspace(preset);
  assert.equal(imported.savedWorkspaces.length,1);
  assert.equal(applyCombatPreset(imported,'layout-combat').freeform.positions.history.x,
    original.x);
  assert.equal('combat' in imported,false);
});

function actionsHarness({gm=true}={}){
  const path='campaigns/'+campaignId+'/encounterHistory/combat-phase69';
  const sample=captureEncounterCompletion(encounter,{
    encounterSchedule:stageEncounterSchedule(prepared,1000)
  },characters,{endedAt:4000,endedBy:gmUid});
  const store=new Map([[path,sample]]),writes=[];
  const ref=(_db,...parts)=>parts.join('/');
  const tx={
    get:async p=>({exists:()=>store.has(p),data:()=>store.get(p)}),
    update:(p,patch)=>{writes.push([p,patch]);store.set(p,{...store.get(p),...patch});}
  };
  const context={
    db:{},doc:ref,currentUser:{uid:gmUid},serverTimestamp:()=>5000,
    runTransaction:async(_db,action)=>action(tx)
  };
  const commands=createEncounterCompletionCommands(context,{
    requireCampaignGM:async()=>{if(!gm)throw Error('GM permission revoked');}
  });
  return {store,writes,path,
    submit:input=>commands.manageEncounterCompletion(campaignId,'encounter',input)};
}

test('6.9: review is GM-only, revision guarded and never awards resources',async()=>{
  const f=actionsHarness();
  const bad=actionsHarness({gm:false});
  const review={type:'review',encounterId:'combat-phase69',expectedRevision:1,
    outcome:'victory',notes:'The party survived',rewards:[{
      characterId:'hero-1',xp:100,
      currency:{key:'gold',amount:2},items:[{name:'Silver Ring',qty:1}]
    }]};
  assert.deepEqual(validateEncounterCompletionAction(review).rewards[0].items,
    [{name:'Silver Ring',qty:1}]);
  assert.match((await bad.submit(review)).error,/GM permission revoked/);
  assert.equal(bad.writes.length,0);
  const saved=await f.submit(review);
  assert.equal(saved.ok,true,saved.error);
  assert.equal(f.store.get(f.path).outcome,'victory');
  assert.equal(f.store.get(f.path).status,'pending-review');
  assert.equal(f.writes.some(([p])=>/characters|events|partyLoot/.test(p)),false);
  assert.match((await f.submit(review)).error,/changed/);
  assert.match((await f.submit({...review,expectedRevision:2,
    rewards:[{characterId:'intruder',xp:1,items:[]}]})).error,/linked/);
  const approved=await f.submit({
    type:'approve',encounterId:'combat-phase69',expectedRevision:2,
    confirmation:'approve-rewards'
  });
  assert.equal(approved.ok,true,approved.error);
  const state=f.store.get(f.path);
  assert.equal(state.status,'approved');
  assert.equal(approved.distributed,false);
  assert.match((await f.submit({
    type:'approve',encounterId:'combat-phase69',expectedRevision:3,
    confirmation:'approve-rewards'
  })).error,/already been approved/);
});

test('6.9: XP and bundle delivery receipts reject duplicates or changed amounts',()=>{
  const history={
    ...captureEncounterCompletion(encounter,{},characters,{
      endedAt:4000,endedBy:gmUid
    }),status:'approved',rewards:[{
      characterId:'hero-1',xp:100,
      currency:{key:'gold',amount:2},items:[{name:'Silver Ring',qty:1}]
    }]
  };
  const bundle={items:[{name:'Silver Ring',qty:1}],
    currency:{key:'gold',amount:2}};
  assert.doesNotThrow(()=>assertApprovedEncounterDelivery(history,
    'hero-1','xp',100));
  assert.doesNotThrow(()=>assertApprovedEncounterDelivery(history,
    'hero-1','bundle',bundle));
  assert.throws(()=>assertApprovedEncounterDelivery(history,
    'hero-1','xp',999),/differs/);
  assert.throws(()=>assertApprovedEncounterDelivery(history,
    'hero-1','bundle',{...bundle,currency:{key:'gold',amount:9}}),/differ/);
  const receipt=encounterDeliveryPatch(history,'hero-1','xp',
    'receipt-phase69',5000,gmUid);
  assert.throws(()=>assertApprovedEncounterDelivery({...history,...receipt},
    'hero-1','xp',100),/already been delivered/);
  assert.doesNotThrow(()=>assertApprovedEncounterDelivery({...history,...receipt},
    'hero-1','bundle',bundle),'independent bundle can still be delivered');
});

test('6.9: all browser-visible combat writes use authenticated canonical services',()=>{
  const service=source('src/dashboards/combat/firebaseCombatService.mjs');
  const server=source('functions/combatCommands.mjs');
  const rewards=source('functions/commands.mjs');
  const history=source('functions/encounterCompletionCommands.mjs');
  const rules=source('firestore.rules');
  const workspace=source('src/dashboards/combat/CombatWorkspace.jsx');
  const panel=source('src/dashboards/combat/GMEncounterHistoryPanel.jsx');
  assert.match(service,/watchGMHistory/);
  assert.match(service,/commandGM:.*command/);
  assert.match(service,/action:'manageEncounterCompletion'/);
  assert.match(server,/captureEncounterCompletion/);
  assert.match(server,/tx\.set\(historyRef/);
  assert.match(rewards,/assertApprovedEncounterDelivery/);
  assert.match(rewards,/encounterDeliveryPatch/);
  assert.match(history,/requireCampaignGM/);
  assert.match(rules,/match \/encounterHistory\/\{encounterId\}/);
  assert.match(workspace,/<GMEncounterHistoryPanel/);
  assert.match(panel,/Save Review/);
  assert.match(panel,/Approve Saved Plan/);
  assert.match(panel,/Deliver XP/);
  assert.match(panel,/Deliver items\/currency/);
  assert.doesNotMatch(panel,/setDoc\(|updateDoc\(|firebase\/firestore/);
});
