import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  captureEncounterCompletion,validateEncounterCompletionAction,
  assertApprovedEncounterDelivery,encounterDeliveryPatch,hasEncounterBundle
} from '../src/state/encounterCompletionModel.mjs';
import {validateCombatCommand} from '../src/dashboards/combat/combatModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sample={
  status:'active',combatId:'combat-123',round:5,
  preparedEncounterId:'prepared-dragons',
  combat:{log:[{id:'action-1',at:1700000000000,message:'Wolf defeated',
    gmSecret:'NOT-SAFE'}]},
  combatants:[
    {id:'player-1',characterId:'character-1',name:'Aria',
      initiative:18,kind:'player'},
    {id:'wolf-1',name:'Wolf',kind:'enemy',defeated:true,
      xpReward:120,hp:[0,20]},
    {id:'wolf-2',name:'Wolf Scout',kind:'enemy',xpReward:80,
      hp:[11,20]}
  ]
};
const privateState={encounterSchedule:{
  waves:[{id:'wave-1',name:'Ambush',status:'released',triggerRound:3,
    enemies:[{notes:'Hidden monster stat block'}]}],
  events:[{id:'event-1',name:'Storm',type:'environment',
    status:'triggered',triggerRound:4,notes:'SECRET'}]
}};
const characters=new Map([['character-1',{name:'Aria',hp:[7,20],
  sp:[10,15],mp:[4,10],downed:{dead:false}}]]);
const build=()=>captureEncounterCompletion(sample,privateState,characters,{
  endedAt:1700000005000,endedBy:'gm-1',sessionId:'session-1'
});
test('6.8: snapshot original encounter without resource edits or leaking private schedule',()=>{
  const history=build();
  assert.equal(history.id,'combat-123');
  assert.equal(history.status,'pending-review');
  assert.equal(history.rounds,5);
  assert.equal(history.xpSuggested,120);
  assert.equal(history.summary.defeatedEnemies,1);
  assert.equal(history.rewards[0].characterId,'character-1');
  assert.equal(history.rewards[0].xp,0);
  assert.deepEqual(history.participants[0].hp,[7,20]);
  assert.equal(history.actions[0].gmSecret,undefined);
  assert.equal(history.waves[0].enemies,undefined);
  assert.equal(history.events[0].notes,undefined);
  assert.equal(sample.status,'active');
  assert.equal(sample.combatants[1].hp[0],0);
});
test('6.8: require active identifiable encounter, valid GM, bounded participants',()=>{
  assert.throws(()=>captureEncounterCompletion({...sample,status:'ended'},
    {},characters,{endedAt:1700000005000,endedBy:'gm-1'}),/active encounter/);
  assert.throws(()=>captureEncounterCompletion(sample,{},characters,{
    endedAt:1700000005000,endedBy:'../bad'}),/active encounter/);
});
test('6.8: review accepts complete XP-only, currency and no-reward proposals',()=>{
  const review=validateEncounterCompletionAction({
    type:'review',encounterId:'combat-123',expectedRevision:1,
    outcome:'victory',notes:'Party rescued the village',
    rewards:[{characterId:'character-1',xp:120,
      currency:{key:'gold',amount:15},items:[]},
      {characterId:'character-2',xp:0,
        currency:{key:'copper',amount:0},items:[]}]
  });
  assert.equal(review.rewards[0].currency.amount,15);
  assert.equal(review.rewards[1].xp,0);
  assert.equal(hasEncounterBundle(review.rewards[1]),false);
  assert.throws(()=>validateEncounterCompletionAction({...review,outcome:'secret'}),
    /outcome/);
  assert.throws(()=>validateEncounterCompletionAction({...review,
    rewards:[review.rewards[0],review.rewards[0]]}),/distinct/);
  assert.throws(()=>validateEncounterCompletionAction({...review,
    rewards:[{characterId:'character-1',xp:1000001,items:[]}]}),/XP/);
  assert.throws(()=>validateEncounterCompletionAction({...review,
    rewards:[{characterId:'character-1',xp:50,items:[
      {name:'Sword',qty:-1}]}]}),/quantity/);
  assert.throws(()=>validateEncounterCompletionAction({
    type:'approve',encounterId:'combat-123',expectedRevision:2,
    confirmation:'yes'}),/confirm/);
});
test('6.8: approved rewards match exact recipients and prevent re-delivery',()=>{
  const history={...build(),status:'approved',rewards:[
    {characterId:'character-1',xp:120,currency:{key:'gold',amount:15},
      items:[{name:'Frost Gem',qty:1}]}
  ]};
  assert.equal(assertApprovedEncounterDelivery(history,'character-1','xp',120).xp,120);
  assert.ok(assertApprovedEncounterDelivery(history,'character-1','bundle',{
    items:[{name:'Frost Gem',qty:1}],currency:{key:'gold',amount:15}
  }));
  assert.throws(()=>assertApprovedEncounterDelivery({...history,status:'pending-review'},
    'character-1','xp',120),/approve/);
  assert.throws(()=>assertApprovedEncounterDelivery(history,'character-2','xp',120),
    /not in the approved/);
  assert.throws(()=>assertApprovedEncounterDelivery(history,'character-1','xp',80),
    /differs/);
  const patch=encounterDeliveryPatch(history,'character-1','xp',
    'request-1',1700000000000,'gm-1');
  assert.equal(patch.deliveries['character-1'].xp.requestId,'request-1');
  assert.throws(()=>assertApprovedEncounterDelivery({...history,...patch},
    'character-1','xp',120),/already been delivered/);
  assert.throws(()=>assertApprovedEncounterDelivery(history,'character-1',
    'bundle',{items:[],currency:{key:'gold',amount:15}}),/differ/);
});
test('6.8: history is GM-only, archived atomically, and delivery uses canonical actions',()=>{
  const server=read('functions/combatCommands.mjs');
  const commands=read('functions/commands.mjs');
  const service=read('src/dashboards/combat/firebaseCombatService.mjs');
  const rules=read('firestore.rules');
  const panel=read('src/dashboards/combat/GMEncounterHistoryPanel.jsx');
  const workspace=read('src/dashboards/combat/CombatWorkspace.jsx');
  assert.match(server,/captureEncounterCompletion/);
  assert.match(server,/tx\.set\(historyRef/);
  assert.match(server,/tx\.set\(encounterRef/);
  assert.match(rules,/match \/encounterHistory\/\{encounterId\} \{[\s\S]*?allow get, list: if isCampaignGM\(campaignId\);[\s\S]*?allow create, update, delete: if false;/);
  assert.match(commands,/assertApprovedEncounterDelivery/);
  assert.match(commands,/encounterDeliveryPatch/);
  assert.match(commands,/createEncounterCompletionCommands/);
  assert.match(commands,/createEncounterCompletionCommands/);
  assert.match(service,/watchGMHistory/);
  assert.match(service,/grantCharacterXP/);
  assert.match(service,/grantGMRewardBundle/);
  assert.match(panel,/Confirm delivery/);
  assert.match(workspace,/<GMEncounterHistoryPanel/);
  assert.doesNotMatch(panel,/updateDoc|setDoc|firebase\/firestore/);
  assert.throws(()=>validateCombatCommand('player','encounter',{
    operation:'end',revision:1
  }),/unavailable/);
});
